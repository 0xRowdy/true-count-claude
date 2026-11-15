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
  if (!res.ok)
    throw new AppleAnswered(
      res.status,
      `Apple /auth/${path} answered ${res.status}: ${await res.text()}`,
    );
  return res;
}

/** Apple answered the request, but not with success. A failed `fetch` throws its own error. */
class AppleAnswered extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Waits between tries of the code exchange, well inside the code's five minutes. */
const EXCHANGE_RETRY_DELAYS_MS = [1_000, 4_000];

/**
 * Swaps an authorization code for tokens. A code works only once, so a 4xx (spent, expired or
 * wrong) is final. No answer, or a 5xx, may mean Apple never used it: those are tried again.
 */
async function exchangeCode(code: string): Promise<Response> {
  const form = {
    client_id: APP_BUNDLE_ID,
    client_secret: requireSecret(APP_BUNDLE_ID),
    code,
    grant_type: "authorization_code",
  };
  for (let attempt = 0; ; attempt++) {
    try {
      return await postToApple("token", form);
    } catch (e) {
      const final = e instanceof AppleAnswered && e.status < 500;
      const delay = EXCHANGE_RETRY_DELAYS_MS[attempt];
      if (final || delay === undefined) throw e;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

const tokenType = v.union(v.literal("refresh_token"), v.literal("access_token"));

/**
 * The token to revoke for a sign-in: the refresh token, which outlives the access token, else
 * the access token. `null` when Apple gave neither.
 */
export function revocableToken(
  refreshToken: string | null | undefined,
  accessToken: string | null | undefined,
): { token: string; tokenType: Infer<typeof tokenType> } | null {
  if (refreshToken) return { token: refreshToken, tokenType: "refresh_token" };
  if (accessToken) return { token: accessToken, tokenType: "access_token" };
  return null;
}

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
    let res: Response;
    try {
      res = await exchangeCode(authorizationCode);
    } catch (e) {
      // The Account is already gone, and only the app could get another code.
      console.error(
        "GAVE UP revoking a deleted Account's iOS Sign in with Apple: the code couldn't be exchanged. The player can remove Tableside in Settings → their name → Sign-In & Security → Sign in with Apple.",
        e,
      );
      throw e;
    }
    const { refresh_token, access_token } = (await res.json()) as {
      refresh_token?: string;
      access_token?: string;
    };
    const revocable = revocableToken(refresh_token, access_token);
    if (!revocable) throw new Error("Apple /auth/token answered without a token");
    await ctx.runMutation(internal.apple.startRevoke, {
      clientId: APP_BUNDLE_ID,
      ...revocable,
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

/** `revokeLater` for an action, which has no mutation ctx of its own. */
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
