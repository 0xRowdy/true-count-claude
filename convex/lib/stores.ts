/**
 * What each store's own record of a purchase means as an Entitlement (ADR-0007).
 *
 * Every mapping here reads the store's *current* state (a Stripe subscription fetched fresh,
 * a RevenueCat subscriber fetched fresh), never a webhook's payload, so events that arrive
 * late, twice or out of order still leave the right answer behind.
 *
 * Pure: no Convex, no network, no clock.
 */

import type Stripe from "stripe";
import type { Entitlement, EntitlementStatus, Source } from "./plan";

export interface StoreEntitlement extends Entitlement {
  /** The store's id for the purchase: a Stripe subscription or payment, a store product. */
  readonly externalId: string;
}

// ---------------------------------------------------------------------------------------------
// Stripe (web). Plus is a subscription; Lifetime is a one-time Checkout payment.
// ---------------------------------------------------------------------------------------------

const LIVE_STATUSES: readonly string[] = ["trialing", "active", "past_due"];

/**
 * `incomplete` (first payment not made), `incomplete_expired`, `unpaid` (retries exhausted),
 * `paused` (trial ended with no card) and `canceled` all mean no access.
 */
export function stripeStatus(status: Stripe.Subscription.Status): EntitlementStatus {
  return LIVE_STATUSES.includes(status) ? (status as EntitlementStatus) : "ended";
}

export function fromStripeSubscription(sub: Stripe.Subscription): StoreEntitlement {
  const item = sub.items.data[0];
  const status = stripeStatus(sub.status);
  const interval = item?.price.recurring?.interval;
  // The period lives on the item since API 2025-03-31; while trialing its end is the trial end.
  // Past due, Stripe has already moved the period on to the one it failed to charge for, so
  // the paid-for access ended at that period's start: the grace in `isLive` runs from there.
  const paidUntil = item
    ? (status === "past_due" ? item.current_period_start : item.current_period_end) * 1000
    : 0;
  return {
    source: "stripe",
    externalId: sub.id,
    plan: "plus",
    status,
    // A cancellation scheduled inside the period ends access sooner than the period does.
    expiresAt: sub.cancel_at === null ? paidUntil : Math.min(paidUntil, sub.cancel_at * 1000),
    willRenew: status !== "ended" && !sub.cancel_at_period_end && sub.cancel_at === null,
    interval: interval === "month" ? "month" : interval === "year" ? "year" : null,
  };
}

/**
 * Whether a Stripe read fetched at `fetchedAt` (epoch ms) may overwrite a row holding the read
 * fetched at `stored`. Each handler fetches, then commits, so two close together can commit in
 * the wrong order; the earlier fetch must not win. The same stamp is the same read, retried.
 */
export function isLatestRead(stored: number | undefined, fetchedAt: number): boolean {
  return stored === undefined || fetchedAt >= stored;
}

const RETRY_MINUTES = [1, 5, 30, 120, 720];

/** How long to wait before retry `attempt` (0-based) of a Stripe call, or null to give up. */
export function retryDelay(attempt: number): number | null {
  const minutes = RETRY_MINUTES[attempt];
  return minutes === undefined ? null : minutes * 60_000;
}

// ---------------------------------------------------------------------------------------------
// RevenueCat (App Store, Google Play). GET /v1/subscribers/{app_user_id}.
// https://www.revenuecat.com/docs/api-v1/customer-info-model
// ---------------------------------------------------------------------------------------------

interface RcSubscription {
  store?: string;
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  period_type?: string;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
}

interface RcPurchase {
  store?: string;
  purchase_date?: string;
  refunded_at?: string | null;
}

export interface RcSubscriber {
  subscriptions?: Record<string, RcSubscription>;
  non_subscriptions?: Record<string, RcPurchase[]>;
}

/**
 * Stores RevenueCat reports that we sell through it. Web purchases come from Stripe directly,
 * so a Stripe or RevenueCat Billing record seen here is skipped rather than counted twice.
 * Promotional grants (comped from the RevenueCat dashboard) count. Test Store purchases count
 * only where `testStore` is on (a dev deployment): its key lives in debug builds, which anyone
 * holding one could use to buy Plus for free.
 */
function rcSource(store: string | undefined, testStore: boolean): Source | null {
  switch (store?.toLowerCase()) {
    case "app_store":
    case "mac_app_store":
      return "app_store";
    case "play_store":
      return "play_store";
    case "promotional":
      return "promotional";
    case "test_store":
      return testStore ? "test_store" : null;
    default:
      return null;
  }
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Every Plus subscription and Lifetime purchase on a RevenueCat subscriber. The app sells only
 * those two, so each subscription is Plus and each one-time purchase is Lifetime.
 *
 * RevenueCat keeps expired subscriptions in the response, so access is always bounded by the
 * expiry (or the store's grace period): a billing problem never becomes open-ended access.
 */
export function fromRevenueCat(
  subscriber: RcSubscriber,
  { testStore = false }: { testStore?: boolean } = {},
): StoreEntitlement[] {
  const out: StoreEntitlement[] = [];
  for (const [product, sub] of Object.entries(subscriber.subscriptions ?? {})) {
    const source = rcSource(sub.store, testStore);
    const expiresAt = ms(sub.grace_period_expires_date) ?? ms(sub.expires_date);
    if (!source || expiresAt === null) continue;
    const status: EntitlementStatus = sub.refunded_at
      ? "ended"
      : sub.period_type === "trial"
        ? "trialing"
        : "active";
    out.push({
      source,
      externalId: product,
      plan: "plus",
      status,
      expiresAt,
      // A promotional grant simply ends: RevenueCat reports nothing that says it won't renew.
      willRenew:
        source !== "promotional" &&
        status !== "ended" &&
        !sub.unsubscribe_detected_at &&
        !sub.billing_issues_detected_at,
      interval: null,
    });
  }
  for (const [product, purchases] of Object.entries(subscriber.non_subscriptions ?? {})) {
    const paid = purchases.filter((p) => !p.refunded_at);
    const source = rcSource(paid[paid.length - 1]?.store, testStore);
    if (!source) continue;
    out.push({
      source,
      externalId: product,
      plan: "lifetime",
      status: "active",
      expiresAt: null,
      willRenew: false,
      interval: null,
    });
  }
  return out;
}

/**
 * The app user ids a RevenueCat webhook is about: the purchaser, plus both sides of a
 * TRANSFER (a store receipt moving from one account to another). A dashboard test event names
 * a made-up customer, which isn't even a valid id to look up, so it is about nobody.
 * https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 */
export function rcEventUserIds(event: {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
}): string[] {
  if (event.type === "TEST") return [];
  // `$RCAnonymousID:` is a device that never signed in: never one of our users.
  const ids = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ].filter((id): id is string => !!id && !id.startsWith("$RCAnonymousID:"));
  return [...new Set(ids)];
}
