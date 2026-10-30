import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { resolvePlan } from "./plan";
import { fromRevenueCat, fromStripeSubscription, rcEventUserIds, stripeStatus } from "./stores";

const NOW = Date.UTC(2026, 9, 25);
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

function stripeSub(
  over: Partial<Stripe.Subscription> = {},
  interval = "year",
): Stripe.Subscription {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    items: {
      data: [{ current_period_end: (NOW + 300 * DAY) / 1000, price: { recurring: { interval } } }],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("Stripe", () => {
  it("maps statuses: trialing, active and past_due keep access; the rest end it", () => {
    expect(stripeStatus("trialing")).toBe("trialing");
    expect(stripeStatus("active")).toBe("active");
    expect(stripeStatus("past_due")).toBe("past_due");
    for (const s of ["incomplete", "incomplete_expired", "unpaid", "paused", "canceled"] as const) {
      expect(stripeStatus(s)).toBe("ended");
    }
  });

  it("reads the period end from the subscription item, in ms", () => {
    const e = fromStripeSubscription(stripeSub());
    expect(e).toMatchObject({
      source: "stripe",
      externalId: "sub_1",
      plan: "plus",
      status: "active",
      expiresAt: NOW + 300 * DAY,
      willRenew: true,
      interval: "year",
    });
  });

  it("does not renew once canceled, either at period end or on a date", () => {
    expect(fromStripeSubscription(stripeSub({ cancel_at_period_end: true })).willRenew).toBe(false);
    expect(fromStripeSubscription(stripeSub({ cancel_at: NOW / 1000 + 5 })).willRenew).toBe(false);
  });

  it("is Free once the first payment never landed", () => {
    const e = fromStripeSubscription(stripeSub({ status: "incomplete" }));
    expect(resolvePlan([e], NOW).plan).toBe("free");
  });
});

describe("RevenueCat", () => {
  it("maps an App Store trial to Plus, trialing, until the trial ends", () => {
    const [e] = fromRevenueCat({
      subscriptions: {
        tableside_plus_yearly: {
          store: "app_store",
          expires_date: iso(NOW + 7 * DAY),
          period_type: "trial",
        },
      },
    });
    expect(e).toMatchObject({
      source: "app_store",
      externalId: "tableside_plus_yearly",
      plan: "plus",
      status: "trialing",
      expiresAt: NOW + 7 * DAY,
      willRenew: true,
    });
  });

  it("drops an expired subscription (RevenueCat keeps it in the response)", () => {
    const entitlements = fromRevenueCat({
      subscriptions: { monthly: { store: "play_store", expires_date: iso(NOW - DAY) } },
    });
    expect(resolvePlan(entitlements, NOW).plan).toBe("free");
  });

  it("keeps access through the store's grace period, and no longer", () => {
    const entitlements = fromRevenueCat({
      subscriptions: {
        monthly: {
          store: "app_store",
          expires_date: iso(NOW - DAY),
          grace_period_expires_date: iso(NOW + 3 * DAY),
          billing_issues_detected_at: iso(NOW - DAY),
        },
      },
    });
    expect(resolvePlan(entitlements, NOW)).toMatchObject({ plan: "plus", willRenew: false });
    expect(resolvePlan(entitlements, NOW + 4 * DAY).plan).toBe("free");
  });

  it("ends a refunded subscription at once", () => {
    const entitlements = fromRevenueCat({
      subscriptions: {
        yearly: { store: "app_store", expires_date: iso(NOW + 300 * DAY), refunded_at: iso(NOW) },
      },
    });
    expect(resolvePlan(entitlements, NOW).plan).toBe("free");
  });

  it("maps a one-time store purchase to Lifetime", () => {
    const entitlements = fromRevenueCat({
      non_subscriptions: { tableside_lifetime: [{ store: "play_store" }] },
    });
    expect(resolvePlan(entitlements, NOW)).toMatchObject({
      plan: "lifetime",
      source: "play_store",
      expiresAt: null,
    });
  });

  it("skips web purchases it reports, which Stripe already told us about", () => {
    expect(
      fromRevenueCat({
        subscriptions: { web: { store: "stripe", expires_date: iso(NOW + DAY) } },
        non_subscriptions: { life: [{ store: "rc_billing" }] },
      }),
    ).toEqual([]);
  });

  it("counts promotional grants from the RevenueCat dashboard", () => {
    const [e] = fromRevenueCat({
      subscriptions: {
        rc_promo_plus_monthly: { store: "promotional", expires_date: iso(NOW + 30 * DAY) },
      },
    });
    expect(e?.source).toBe("promotional");
  });
});

describe("rcEventUserIds", () => {
  it("collects the purchaser and aliases, without anonymous ids or repeats", () => {
    expect(
      rcEventUserIds({
        app_user_id: "user_a",
        original_app_user_id: "$RCAnonymousID:abc",
        aliases: ["user_a", "$RCAnonymousID:abc"],
      }),
    ).toEqual(["user_a"]);
  });

  it("collects both sides of a TRANSFER", () => {
    expect(rcEventUserIds({ transferred_from: ["user_a"], transferred_to: ["user_b"] })).toEqual([
      "user_a",
      "user_b",
    ]);
  });
});
