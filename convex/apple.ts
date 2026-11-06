import { symmetricDecrypt } from "better-auth/crypto";
import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { runCleanup } from "./cleanup";
import { appleClientSecret, isStoredEncrypted } from "./lib/appleSecret";

/**
 * Sign in with Apple beyond the sign-in itself (#62): the client secrets, and revoking the
 * player's Apple sign-in when their Account is deleted, as App Store guideline 5.1.1(v) asks.
 *
 * Deployment env (docs/accounts-and-billing.md): APPLE_TEAM_ID, APPLE_KEY_ID and
 * APPLE_PRIVATE_KEY (the Sign in with Apple key's `.p8` text). The secrets are signed here, so
 * none of them expires.
 *
 * A token belongs to the client id that obtained it: native iOS sign-ins to the app's bundle
 * id, web and Android ones to the Services ID (APPLE_SERVICE_ID).
 */

/** ios.bundleIdentifier in app.json. */
export const APP_BUNDLE_ID = "com.truecount.app";

const SECRET_TTL_SECONDS = 86_400;
const secrets = new Map<string, { secret: string; renewAt: number }>();

/** A client secret for `clientId`, or undefined while the key isn't set. */
export function clientSecret(clientId: string): string | undefined {
  const { APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId, APPLE_PRIVATE_KEY: key } = process.env;
  if (!teamId || !keyId || !key) return undefined;
  const now = Date.now();
  const cached = secrets.get(clientId);
  if (cached && cached.renewAt > now) return cached.secret;
  const secret = appleClientSecret({
    teamId,
    keyId,
    privateKey: key,
    clientId,
    now,
    ttlSeconds: SECRET_TTL_SECONDS,
  });
  // Renewed at half its life, so a cached one never reaches Apple about to expire.
  secrets.set(clientId, { secret, renewAt: now + (SECRET_TTL_SECONDS * 1000) / 2 });
  return secret;
}

function requireSecret(clientId: string): string {
  const secret = clientSecret(clientId);
  if (!secret) throw new Error("APPLE_TEAM_ID, APPLE_KEY_ID or APPLE_PRIVATE_KEY isn't set");
  return secret;
}

async function postToApple(path: "token" | "revoke", form: Record<string, string>) {
  const res = await fetch(`https://appleid.apple.com/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  if (!res.ok) throw new Error(`Apple /auth/${path} answered ${res.status}: ${await res.text()}`);
  return res;
}

const tokenType = v.union(v.literal("refresh_token"), v.literal("access_token"));

/**
 * iOS, right after the Account is deleted. Native sign-in keeps no Apple token, so the app asks
 * for Apple's sheet once more before deleting and sends its fresh authorization code here. It
 * is swapped for a token at once (a code lasts five minutes) and the token is revoked.
 *
 * No sign-in needed (the Account is gone by now): a code can only revoke the Apple ID that just
 * approved it, for this app.
 */
export const revokeFromDevice = action({
  args: { authorizationCode: v.string() },
  returns: v.null(),
  handler: async (ctx, { authorizationCode }) => {
    const res = await postToApple("token", {
      client_id: APP_BUNDLE_ID,
      client_secret: requireSecret(APP_BUNDLE_ID),
      code: authorizationCode,
      grant_type: "authorization_code",
    });
    const { refresh_token, access_token } = (await res.json()) as {
      refresh_token?: string;
      access_token?: string;
    };
    const token = refresh_token ?? access_token;
    if (!token) throw new Error("Apple /auth/token answered without a token");
    await ctx.runMutation(internal.apple.startRevoke, {
      clientId: APP_BUNDLE_ID,
      token,
      tokenType: refresh_token ? "refresh_token" : "access_token",
      whose: "a deleted Account's iOS sign-in",
    });
    return null;
  },
});

/**
 * Hands a revoke to the retrier. The `account` delete trigger (auth.ts) calls it for a web or
 * Android sign-in's stored token. `whose` names it in the log if every try fails.
 */
export async function revokeLater(
  ctx: MutationCtx,
  r: { clientId: string; token: string; tokenType: Infer<typeof tokenType>; whose: string },
): Promise<void> {
  await runCleanup(
    ctx,
    internal.apple.revoke,
    { clientId: r.clientId, token: r.token, tokenType: r.tokenType },
    `revoke the Sign in with Apple token of ${r.whose} (client ${r.clientId}); without the token it can't be done by hand, but the player can remove Tableside in Settings → their name → Sign-In & Security → Sign in with Apple`,
  );
}

export const startRevoke = internalMutation({
  args: { clientId: v.string(), token: v.string(), tokenType, whose: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await revokeLater(ctx, args);
    return null;
  },
});

/** Revokes one token. Run under the retrier; revoking twice is harmless. */
export const revoke = internalAction({
  args: { clientId: v.string(), token: v.string(), tokenType },
  returns: v.null(),
  handler: async (_ctx, { clientId, token, tokenType }) => {
    // Tokens Better Auth stored are encrypted with its secret (`encryptOAuthTokens`).
    const plain = isStoredEncrypted(token)
      ? await symmetricDecrypt({ key: process.env.BETTER_AUTH_SECRET!, data: token })
      : token;
    await postToApple("revoke", {
      client_id: clientId,
      client_secret: requireSecret(clientId),
      token: plain,
      token_type_hint: tokenType,
    });
    return null;
  },
});
