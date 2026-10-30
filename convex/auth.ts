import { expo } from "@better-auth/expo";
import { type AuthFunctions, createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

/**
 * Accounts (ADR-0007): optional, and only ever Google or Apple. Nothing in the trainer needs
 * one (invariant 8); an Account exists to hold a Plan across devices.
 *
 * Deployment env (docs/accounts-and-billing.md):
 * - SITE_URL: the web app's origin, where web sign-in returns.
 * - BETTER_AUTH_SECRET: signs sessions.
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: a Google "Web application" OAuth client.
 * - APPLE_SERVICE_ID, APPLE_CLIENT_SECRET: the Services ID and its client-secret JWT, for the
 *   web and Android flow. APPLE_BUNDLE_ID: the iOS app, whose native sign-in sends an identity
 *   token addressed to it.
 * - TRUSTED_ORIGINS (optional): extra comma-separated origins, e.g. `exp://` for Expo Go.
 *
 * A provider without its credentials is left out, so a deployment mid-setup still serves the
 * other one; signing in with the missing one fails with a clear error instead.
 */

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      // Same transaction as the delete (account deletion, App Store guideline 5.1.1(v)).
      onDelete: async (ctx, user) => {
        const rows = await ctx.db
          .query("entitlements")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
        for (const row of rows) await ctx.db.delete(row._id);
        // A web subscription must not outlive its Account and keep billing nobody.
        await ctx.scheduler.runAfter(0, internal.billing.cancelStripeForDeletedUser, {
          userId: user._id,
        });
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

/** The app's URL scheme (app.json `scheme`): native sign-in returns to `truecount://`. */
const APP_SCHEME = "truecount://";

function socialProviders(): BetterAuthOptions["socialProviders"] {
  const env = process.env;
  return {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(env.APPLE_SERVICE_ID
      ? {
          apple: {
            clientId: env.APPLE_SERVICE_ID,
            // Only the redirect flow (web, Android) needs it; native iOS sends an identity token.
            clientSecret: env.APPLE_CLIENT_SECRET ?? "",
            // Native identity tokens are addressed to the app, not to the Services ID.
            ...(env.APPLE_BUNDLE_ID ? { appBundleIdentifier: env.APPLE_BUNDLE_ID } : {}),
          },
        }
      : {}),
  };
}

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL!;
  const extra = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    baseURL: process.env.CONVEX_SITE_URL,
    // Apple returns to the callback with a form POST from its own origin.
    trustedOrigins: [siteUrl, APP_SCHEME, "https://appleid.apple.com", ...extra],
    database: authComponent.adapter(ctx),
    socialProviders: socialProviders(),
    account: {
      // The same verified email from Google and from Apple is one Account. (An Apple
      // "Hide My Email" relay address matches nothing, so that sign-in is its own Account.)
      accountLinking: { enabled: true, trustedProviders: ["google", "apple"] },
    },
    user: { deleteUser: { enabled: true } },
    // Practice is often a week or two apart: stay signed in for 60 days of absence.
    session: { expiresIn: 60 * 60 * 24 * 60 },
    plugins: [expo(), convex({ authConfig }), crossDomain({ siteUrl })],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
