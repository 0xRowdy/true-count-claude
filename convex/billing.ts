import { StripeSubscriptions, type StripeEventHandlers } from "@convex-dev/stripe";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { TRIAL_DAYS } from "../src/ui/pricing/pricing";
import { api, components, internal } from "./_generated/api";
import { action, internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import {
  type RcSubscriber,
  fromRevenueCat,
  fromStripeSubscription,
  isLatestRead,
  retryDelay,
} from "./lib/stores";
import { entitlementFields } from "./schema";

/** What the helpers below need: our own actions' ctx and the Stripe webhook handlers' both fit. */
type AnyActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runQuery" | "runMutation">;

/**
 * Billing (ADR-0007). Stripe sells on the web; the App Store and Google Play sell in the apps
 * through RevenueCat. Both land in the `entitlements` table, and the Plan every surface shows
 * is `resolvePlan` over it.
 *
 * Deployment env (docs/accounts-and-billing.md): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 * STRIPE_PRICE_PLUS_MONTHLY, STRIPE_PRICE_PLUS_YEARLY, STRIPE_PRICE_LIFETIME, SITE_URL;
 * REVENUECAT_SECRET_KEY, REVENUECAT_WEBHOOK_AUTH; REVENUECAT_ALLOW_TEST_STORE=true on dev only.
 *
 * Errors the app shows are `ConvexError`s carrying a `BillingErrorCode`.
 */

export type BillingErrorCode =
  | "signed-out"
  | "not-configured"
  | "already-lifetime"
  | "already-subscribed";

const fail = (code: BillingErrorCode): never => {
  throw new ConvexError({ code });
};

const stripeComponent = new StripeSubscriptions(components.stripe, {});

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return fail("not-configured");
  return new Stripe(key);
}

function siteUrl(): string {
  return process.env.SITE_URL ?? fail("not-configured");
}

// ---------------------------------------------------------------------------------------------
// Web: Stripe Checkout and the customer portal
// ---------------------------------------------------------------------------------------------

/**
 * A Stripe Checkout page for Plus (monthly or yearly, with the free trial on the first
 * subscription only) or Lifetime. Refuses a purchase the Account already has, wherever it was
 * bought: no paying twice for the same thing.
 */
export const startCheckout = action({
  args: {
    plan: v.union(v.literal("plus"), v.literal("lifetime")),
    billing: v.union(v.literal("monthly"), v.literal("yearly")),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, { plan, billing }) => {
    // The caller's own Account and Plan (runQuery carries the caller's sign-in).
    const me = (await ctx.runQuery(api.account.me, {})) ?? fail("signed-out");
    if (me.plan.plan === "lifetime") fail("already-lifetime");
    if (plan === "plus" && me.plan.plan === "plus") fail("already-subscribed");

    const priceId =
      plan === "lifetime"
        ? process.env.STRIPE_PRICE_LIFETIME
        : billing === "yearly"
          ? process.env.STRIPE_PRICE_PLUS_YEARLY
          : process.env.STRIPE_PRICE_PLUS_MONTHLY;
    if (!priceId || !process.env.STRIPE_SECRET_KEY) fail("not-configured");
    const site = siteUrl();

    const { customerId } = await stripeComponent.getOrCreateCustomer(ctx, {
      userId: me.id,
      email: me.email,
      name: me.name,
    });
    const trial = plan === "plus" && !me.trialUsed;
    const session = await stripeComponent.createCheckoutSession(ctx, {
      priceId: priceId!,
      customerId,
      mode: plan === "plus" ? "subscription" : "payment",
      successUrl: `${site}/account?checkout=success`,
      cancelUrl: `${site}/pricing?plan=${plan}&billing=${billing}`,
      // Read back by the webhooks below to find the Account.
      metadata: { userId: me.id, plan },
      subscriptionMetadata: { userId: me.id },
      params: {
        allow_promotion_codes: true,
        ...(trial
          ? {
              subscription_data: {
                trial_period_days: TRIAL_DAYS,
                // A trial whose card has gone missing ends rather than lingering unpaid.
                trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
              },
            }
          : {}),
      },
    });
    if (!session.url) throw new Error("Stripe returned a Checkout session without a URL");
    return { url: session.url };
  },
});

/** Stripe's customer portal: change card, switch monthly/yearly, cancel, invoices. */
export const openBillingPortal = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const user = (await authComponent.safeGetAuthUser(ctx)) ?? fail("signed-out");
    if (!process.env.STRIPE_SECRET_KEY) fail("not-configured");
    const { customerId } = await stripeComponent.getOrCreateCustomer(ctx, {
      userId: user._id,
      email: user.email,
      name: user.name,
    });
    return stripeComponent.createCustomerPortalSession(ctx, {
      customerId,
      returnUrl: `${siteUrl()}/account`,
    });
  },
});

// ---------------------------------------------------------------------------------------------
// Writing Entitlements
// ---------------------------------------------------------------------------------------------

const entitlement = v.object(entitlementFields);

/**
 * Checked in the same transaction as each write: a deleted Account's purchases still send
 * webhooks (deletion itself cancels the web subscription), and none may write its rows back.
 */
async function accountExists(ctx: MutationCtx, userId: string): Promise<boolean> {
  return (await authComponent.getAnyUserById(ctx, userId)) !== null;
}

/**
 * Upserts one Stripe purchase (a subscription, or a Lifetime payment) by its Stripe id.
 * `syncedAt` is when the caller fetched it from Stripe, taken before the fetch: a row already
 * holding a later fetch is left alone.
 */
export const applyStripe = internalMutation({
  args: { userId: v.string(), entitlement, syncedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, entitlement, syncedAt }) => {
    if (!(await accountExists(ctx, userId))) return null;
    const existing = await ctx.db
      .query("entitlements")
      .withIndex("by_external", (q) =>
        q.eq("source", "stripe").eq("externalId", entitlement.externalId),
      )
      .unique();
    if (!existing) await ctx.db.insert("entitlements", { userId, ...entitlement, syncedAt });
    else if (isLatestRead(existing.syncedAt, syncedAt)) {
      await ctx.db.patch(existing._id, { userId, ...entitlement, syncedAt });
    }
    return null;
  },
});

/**
 * A refunded Lifetime payment stops granting Lifetime. Stamped now, so a Lifetime grant that
 * read the payment before the refund can't write it back.
 */
export const endStripePayment = internalMutation({
  args: { paymentIntentId: v.string() },
  returns: v.null(),
  handler: async (ctx, { paymentIntentId }) => {
    const row = await ctx.db
      .query("entitlements")
      .withIndex("by_external", (q) => q.eq("source", "stripe").eq("externalId", paymentIntentId))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { status: "ended", willRenew: false, syncedAt: Date.now() });
    }
    return null;
  },
});

/**
 * Replaces an Account's App Store, Google Play and promotional rows with RevenueCat's current
 * view. Whole-set replacement makes every sync idempotent and order-free.
 */
export const replaceStoreEntitlements = internalMutation({
  args: { userId: v.string(), entitlements: v.array(entitlement) },
  returns: v.null(),
  handler: async (ctx, { userId, entitlements }) => {
    if (!(await accountExists(ctx, userId))) return null;
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) if (row.source !== "stripe") await ctx.db.delete(row._id);
    for (const e of entitlements) await ctx.db.insert("entitlements", { userId, ...e });
    return null;
  },
});

// ---------------------------------------------------------------------------------------------
// Stripe webhooks (registered in http.ts, after the component's own signature check and sync)
// ---------------------------------------------------------------------------------------------

/** Re-reads the subscription from Stripe so late or out-of-order events still land right. */
async function syncSubscription(ctx: AnyActionCtx, subscriptionId: string) {
  const syncedAt = Date.now();
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const userId = sub.metadata.userId;
  if (!userId) return; // Not created by this app's Checkout.
  await ctx.runMutation(internal.billing.applyStripe, {
    userId,
    entitlement: fromStripeSubscription(sub),
    syncedAt,
  });
}

/**
 * Every subscription Stripe has for a customer, read live. The Stripe component's tables fill
 * from webhooks, so they miss a subscription whose event hasn't landed yet.
 */
function liveSubscriptions(customerId: string) {
  return stripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
}

/** A paid Lifetime Checkout: grant it, and stop any Plus subscription still renewing on the web. */
async function lifetimePaid(ctx: AnyActionCtx, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (session.metadata?.plan !== "lifetime" || session.payment_status !== "paid") return;
  if (!userId || !paymentIntent) return;
  // Re-read: with a delayed payment method, the refund's webhook can land before this one.
  const syncedAt = Date.now();
  const { latest_charge: charge } = await stripe().paymentIntents.retrieve(paymentIntent, {
    expand: ["latest_charge"],
  });
  if (typeof charge === "object" && charge?.refunded) return;
  await ctx.runMutation(internal.billing.applyStripe, {
    userId,
    entitlement: {
      source: "stripe",
      externalId: paymentIntent,
      plan: "lifetime",
      status: "active",
      expiresAt: null,
      willRenew: false,
      interval: null,
    },
    syncedAt,
  });
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customer) return;
  for await (const sub of liveSubscriptions(customer)) {
    if (sub.status === "past_due") {
      // Canceling stops Stripe collecting the failed invoice; a period-end cancel would not.
      await stripe().subscriptions.cancel(sub.id);
    } else if (
      (sub.status === "active" || sub.status === "trialing") &&
      !sub.cancel_at_period_end
    ) {
      await stripe().subscriptions.update(sub.id, { cancel_at_period_end: true });
    }
  }
}

export const stripeEvents: StripeEventHandlers = {
  "customer.subscription.created": (ctx, e) => syncSubscription(ctx, e.data.object.id),
  "customer.subscription.updated": (ctx, e) => syncSubscription(ctx, e.data.object.id),
  "customer.subscription.deleted": (ctx, e) => syncSubscription(ctx, e.data.object.id),
  "checkout.session.completed": (ctx, e) => lifetimePaid(ctx, e.data.object),
  // Delayed payment methods settle after the session completes.
  "checkout.session.async_payment_succeeded": (ctx, e) => lifetimePaid(ctx, e.data.object),
  "charge.refunded": async (ctx, e) => {
    const charge = e.data.object;
    const paymentIntent =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (charge.refunded && paymentIntent) {
      await ctx.runMutation(internal.billing.endStripePayment, { paymentIntentId: paymentIntent });
    }
  },
};

/**
 * After account deletion: end every web subscription now, so nobody is billed for nothing.
 * Nobody is left to notice a failure, so it retries with backoff (`retryDelay`), and logs an
 * error naming the customer if Stripe still refuses.
 */
export const cancelStripeForDeletedUser = internalAction({
  args: { userId: v.string(), stripeCustomerId: v.string(), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { userId, stripeCustomerId, attempt = 0 }) => {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    try {
      for await (const sub of liveSubscriptions(stripeCustomerId)) {
        if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
          await stripe().subscriptions.cancel(sub.id);
        }
      }
    } catch (e) {
      const delay = retryDelay(attempt);
      if (delay === null) {
        console.error(
          `GAVE UP canceling Stripe subscriptions for deleted Account ${userId} (customer ${stripeCustomerId}) after ${attempt + 1} tries; cancel them in the Stripe Dashboard`,
          e,
        );
        throw e;
      }
      console.warn(`Canceling Stripe for deleted Account ${userId} failed; retrying`, e);
      await ctx.scheduler.runAfter(delay, internal.billing.cancelStripeForDeletedUser, {
        userId,
        stripeCustomerId,
        attempt: attempt + 1,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------------------------
// App Store and Google Play, through RevenueCat
// ---------------------------------------------------------------------------------------------

/** Fetches the RevenueCat subscriber (the store's current truth) and stores it. */
export async function syncRevenueCat(ctx: AnyActionCtx, userId: string): Promise<void> {
  const key = process.env.REVENUECAT_SECRET_KEY ?? fail("not-configured");
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`RevenueCat GET /subscribers answered ${res.status}`);
  const { subscriber } = (await res.json()) as { subscriber?: RcSubscriber };
  // Replacing with nothing would take away every store purchase: fail, so the webhook retries.
  if (!subscriber) throw new Error("RevenueCat GET /subscribers answered without a subscriber");
  await ctx.runMutation(internal.billing.replaceStoreEntitlements, {
    userId,
    entitlements: fromRevenueCat(subscriber, {
      testStore: process.env.REVENUECAT_ALLOW_TEST_STORE === "true",
    }),
  });
}

/**
 * Called by the app right after an in-app purchase or a restore, so the Plan updates now rather
 * than when RevenueCat's webhook arrives (usually within a minute).
 */
export const syncStorePurchases = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = (await authComponent.safeGetAuthUser(ctx)) ?? fail("signed-out");
    await syncRevenueCat(ctx, user._id);
    return null;
  },
});
