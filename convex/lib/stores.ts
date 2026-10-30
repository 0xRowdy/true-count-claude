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
  return {
    source: "stripe",
    externalId: sub.id,
    plan: "plus",
    status,
    // The period end lives on the item since API 2025-03-31; while trialing it is the trial end.
    expiresAt: item ? item.current_period_end * 1000 : 0,
    willRenew: status !== "ended" && !sub.cancel_at_period_end && sub.cancel_at === null,
    interval: interval === "month" ? "month" : interval === "year" ? "year" : null,
  };
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
}

export interface RcSubscriber {
  subscriptions?: Record<string, RcSubscription>;
  non_subscriptions?: Record<string, RcPurchase[]>;
}

/**
 * Stores RevenueCat reports that we sell through it. Web purchases come from Stripe directly,
 * so a Stripe or RevenueCat Billing record seen here is skipped rather than counted twice.
 * Promotional grants (comped from the RevenueCat dashboard) count.
 */
function rcSource(store: string | undefined): Source | null {
  switch (store) {
    case "app_store":
    case "mac_app_store":
      return "app_store";
    case "play_store":
      return "play_store";
    case "promotional":
      return "promotional";
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
export function fromRevenueCat(subscriber: RcSubscriber): StoreEntitlement[] {
  const out: StoreEntitlement[] = [];
  for (const [product, sub] of Object.entries(subscriber.subscriptions ?? {})) {
    const source = rcSource(sub.store);
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
      willRenew:
        status !== "ended" && !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at,
      interval: null,
    });
  }
  for (const [product, purchases] of Object.entries(subscriber.non_subscriptions ?? {})) {
    const last = purchases[purchases.length - 1];
    const source = rcSource(last?.store);
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
 * TRANSFER (a store receipt moving from one account to another).
 * https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 */
export function rcEventUserIds(event: {
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
}): string[] {
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
