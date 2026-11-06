import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { resolvePlan } from "./plan";
import {
  fromRevenueCat,
  fromStripeSubscription,
  isLatestRead,
  rcEventUserIds,
  retryDelay,
  stripeStatus,
} from "./stores";

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

  it("ends at a cancellation scheduled inside the period", () => {
    const cancelAt = Math.floor((NOW + 5 * DAY) / 1000);
    expect(fromStripeSubscription(stripeSub({ cancel_at: cancelAt })).expiresAt).toBe(
      cancelAt * 1000,
    );
  });

  it("runs a failed renewal's grace from the renewal date, not the new period's end", () => {
    // Stripe moves the period on when it tries to renew, so the failed one is the current one.
    const sub = stripeSub({ status: "past_due" }, "month");
    sub.items.data[0]!.current_period_start = (NOW - 2 * DAY) / 1000;
    sub.items.data[0]!.current_period_end = (NOW + 28 * DAY) / 1000;
    const e = fromStripeSubscription(sub);
    expect(e.expiresAt).toBe(NOW - 2 * DAY);
    expect(resolvePlan([e], NOW + 20 * DAY)).toMatchObject({ plan: "plus", status: "past_due" });
    expect(resolvePlan([e], NOW + 29 * DAY).plan).toBe("free");
  });

  it("is Free once the first payment never landed", () => {
    const e = fromStripeSubscription(stripeSub({ status: "incomplete" }));
    expect(resolvePlan([e], NOW).plan).toBe("free");
  });
});

describe("Stripe writes", () => {
  // Each handler fetches from Stripe, then commits. Two close together can commit in either
  // order; the row must end up holding the later fetch.
  const commit = (
    row: { syncedAt?: number; status: string },
    w: { syncedAt: number; status: string },
  ) => (isLatestRead(row.syncedAt, w.syncedAt) ? w : row);

  it("keeps the later fetch when two commit in reverse order", () => {
    const trialing = { syncedAt: NOW, status: "trialing" };
    const canceled = { syncedAt: NOW + 50, status: "ended" };
    expect([canceled, trialing].reduce(commit, { status: "none" })).toEqual(canceled);
    expect([trialing, canceled].reduce(commit, { status: "none" })).toEqual(canceled);
  });

  it("writes over a row from before the stamp existed, and repeats the same fetch", () => {
    expect(isLatestRead(undefined, NOW)).toBe(true);
    expect(isLatestRead(NOW, NOW)).toBe(true);
  });
});

describe("retryDelay", () => {
  it("backs off over about 15 hours, then gives up", () => {
    const delays = [0, 1, 2, 3, 4, 5].map(retryDelay);
    expect(delays).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000, null]);
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

  it("drops a refunded one-time purchase, keeping any that wasn't refunded", () => {
    const refunded = { store: "app_store", refunded_at: iso(NOW) };
    expect(fromRevenueCat({ non_subscriptions: { lifetime: [refunded] } })).toEqual([]);
    const rebought = fromRevenueCat({
      non_subscriptions: { lifetime: [{ store: "app_store" }, refunded] },
    });
    expect(rebought.map((e) => e.plan)).toEqual(["lifetime"]);
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
    expect(e?.willRenew).toBe(false);
  });

  it("counts Test Store purchases only where the deployment allows them", () => {
    const subscriber = {
      subscriptions: { monthly: { store: "test_store", expires_date: iso(NOW + DAY) } },
      non_subscriptions: { lifetime: [{ store: "TEST_STORE" }] },
    };
    expect(fromRevenueCat(subscriber)).toEqual([]);
    const allowed = fromRevenueCat(subscriber, { testStore: true });
    expect(allowed.map((e) => [e.source, e.plan])).toEqual([
      ["test_store", "plus"],
      ["test_store", "lifetime"],
    ]);
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

  it("ignores a dashboard test event, whose customer is made up", () => {
    expect(rcEventUserIds({ type: "TEST", app_user_id: "not-an-account-id" })).toEqual([]);
  });
});
