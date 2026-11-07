import { expo } from "@better-auth/expo";
import { type AuthFunctions, createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { APP_BUNDLE_ID, clientSecret, revokeLater } from "./apple";
import authConfig from "./auth.config";
import { runCleanup } from "./cleanup";

/**
 * Accounts (ADR-0007): optional, and only ever Google or Apple. Nothing in the trainer needs
 * one (invariant 8); an Account exists to hold a Plan across devices.
 *
 * Deployment env (docs/accounts-and-billing.md):
 * - SITE_URL: the web app's origin, where web sign-in returns.
 * - BETTER_AUTH_SECRET: signs sessions.
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: a Google "Web application" OAuth client.
 * - APPLE_SERVICE_ID: the Services ID, for the web and Android flow. APPLE_TEAM_ID,
 *   APPLE_KEY_ID, APPLE_PRIVATE_KEY: the Sign in with Apple key, which signs the client
 *   secrets (`apple.ts`).
 * - TRUSTED_ORIGINS (optional): extra comma-separated origins, e.g. `exp://` for Expo Go.
 *
 * A provider without its credentials is left out, so a deployment mid-setup still serves the
 * other one; signing in with the missing one fails with a clear error instead.
 */

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    // Deleting the Account (or unlinking Apple) deletes this row. A web or Android Apple
    // sign-in stored its token here: revoke it (#62). Native iOS stores none; the app revokes
    // that sign-in itself (`apple.revokeFromDevice`).
    account: {
      onDelete: async (ctx, account) => {
        const token = account.refreshToken ?? account.accessToken;
        const clientId = process.env.APPLE_SERVICE_ID;
        if (account.providerId !== "apple" || !token || !clientId) return;
        await revokeLater(ctx, {
          clientId,
          token,
          tokenType: account.refreshToken ? "refresh_token" : "access_token",
          whose: `Account ${account.userId}'s web or Android sign-in`,
        });
      },
    },
    user: {
      // A new Account with an email that subscribed on the web before gets no second trial.
      onCreate: async (ctx, user) => {
        await ctx.scheduler.runAfter(0, internal.billing.checkEarlierPlus, {
          userId: user._id,
          email: user.email,
        });
      },
      // Same transaction as the delete (account deletion, App Store guideline 5.1.1(v)).
      onDelete: async (ctx, user) => {
        for (const table of ["entitlements", "earlierPlus", "storeReads"] as const) {
          const rows = await ctx.db
            .query(table)
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
          for (const row of rows) await ctx.db.delete(row._id);
        }
        // The Stripe component's copy of the customer holds the email and name: clear them, as
        // Stripe's own customer.deleted webhook would. Its subscription, payment and invoice
        // rows hold only ids, statuses and amounts.
        const customer = await ctx.runQuery(components.stripe.public.getCustomerByUserId, {
          userId: user._id,
        });
        if (customer) {
          await ctx.runMutation(components.stripe.private.handleCustomerDeleted, {
            stripeCustomerId: customer.stripeCustomerId,
          });
        }
        // A web subscription must not outlive its Account and keep billing nobody. Checkout
        // runs only on this customer, the Account's own (`ownCustomer` in billing.ts), so it
        // is found here even before any subscription webhook lands; a subscription row naming
        // another customer adds that one. Stripe itself is listed for each (the component's
        // subscription rows can lag).
        const subs = await ctx.runQuery(components.stripe.public.listSubscriptionsByUserId, {
          userId: user._id,
        });
        const stripeCustomerIds = [
          ...new Set([
            ...(customer ? [customer.stripeCustomerId] : []),
            ...subs.map((s) => s.stripeCustomerId),
          ]),
        ];
        if (stripeCustomerIds.length > 0) {
          await runCleanup(
            ctx,
            internal.billing.cancelStripeForDeletedUser,
            { stripeCustomerIds },
            `cancel the Stripe subscriptions of deleted Account ${user._id} (customers ${stripeCustomerIds.join(", ")}) in the Stripe Dashboard`,
          );
        }
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
            clientSecret: clientSecret(env.APPLE_SERVICE_ID) ?? "",
            // Native identity tokens are addressed to the app, not to the Services ID.
            appBundleIdentifier: APP_BUNDLE_ID,
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
      // Sign-in tokens are stored encrypted with BETTER_AUTH_SECRET (`apple.revoke` reads them).
      encryptOAuthTokens: true,
    },
    user: { deleteUser: { enabled: true } },
    // Practice is often a week or two apart: stay signed in for 60 days of absence.
    session: { expiresIn: 60 * 60 * 24 * 60 },
    plugins: [expo(), convex({ authConfig }), crossDomain({ siteUrl })],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
