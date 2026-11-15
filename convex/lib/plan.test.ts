import { describe, expect, it } from "vitest";
import { FREE, type Entitlement, hasHadPlus, isLive, resolvePlan, PAST_DUE_GRACE_MS } from "./plan";

const NOW = Date.UTC(2026, 9, 25);
const DAY = 86_400_000;

const plus = (over: Partial<Entitlement> = {}): Entitlement => ({
  source: "stripe",
  plan: "plus",
  status: "active",
  expiresAt: NOW + 30 * DAY,
  willRenew: true,
  interval: "month",
  ...over,
});

const lifetime = (over: Partial<Entitlement> = {}): Entitlement => ({
  source: "stripe",
  plan: "lifetime",
  status: "active",
  expiresAt: null,
  willRenew: false,
  interval: null,
  ...over,
});

describe("resolvePlan", () => {
  it("is Free with nothing bought", () => {
    expect(resolvePlan([], NOW)).toEqual(FREE);
  });

  it("is Plus during a trial, with the trial's end as the expiry", () => {
    const r = resolvePlan([plus({ status: "trialing", expiresAt: NOW + 7 * DAY })], NOW);
    expect(r).toMatchObject({ plan: "plus", status: "trialing", expiresAt: NOW + 7 * DAY });
  });

  it("keeps a canceled subscription until its period ends, then drops it", () => {
    const canceled = plus({ willRenew: false, expiresAt: NOW + DAY });
    expect(resolvePlan([canceled], NOW)).toMatchObject({ plan: "plus", willRenew: false });
    expect(resolvePlan([canceled], NOW + 2 * DAY)).toEqual(FREE);
  });

  it("does not grant an ended entitlement, even before its expiry (refund, revoke)", () => {
    expect(resolvePlan([plus({ status: "ended" })], NOW)).toEqual(FREE);
    expect(resolvePlan([lifetime({ status: "ended" })], NOW)).toEqual(FREE);
  });

  it("keeps Plus while a failed renewal is retried, past the period end", () => {
    const failing = plus({ status: "past_due", expiresAt: NOW - DAY });
    expect(resolvePlan([failing], NOW)).toMatchObject({ plan: "plus", status: "past_due" });
  });

  it("leaves a failing store renewal to the store's own grace period", () => {
    const failing = plus({ source: "app_store", status: "past_due", expiresAt: NOW - DAY });
    expect(resolvePlan([failing], NOW)).toEqual(FREE);
  });

  it("ends a failed renewal after the grace period, even if no webhook ever says so", () => {
    const failing = plus({ status: "past_due", expiresAt: NOW - PAST_DUE_GRACE_MS });
    expect(resolvePlan([failing], NOW)).toMatchObject({ plan: "free" });
  });

  it("prefers Lifetime over any subscription, wherever each was bought", () => {
    const r = resolvePlan([plus({ source: "app_store" }), lifetime()], NOW);
    expect(r).toMatchObject({ plan: "lifetime", source: "stripe", expiresAt: null });
  });

  it("reports a second store still billing for Plus (paying twice)", () => {
    const r = resolvePlan(
      [plus({ source: "stripe" }), plus({ source: "app_store", expiresAt: NOW + 300 * DAY })],
      NOW,
    );
    expect(r.source).toBe("app_store");
    expect(r.alsoRenewing).toEqual(["stripe"]);
  });

  it("flags a renewing subscription left running under Lifetime", () => {
    const r = resolvePlan([lifetime(), plus({ source: "play_store" })], NOW);
    expect(r.alsoRenewing).toEqual(["play_store"]);
  });

  it("does not flag a subscription that is already canceled", () => {
    const r = resolvePlan([lifetime(), plus({ willRenew: false })], NOW);
    expect(r.alsoRenewing).toEqual([]);
  });

  it("prefers a healthy subscription over a failing one", () => {
    const r = resolvePlan(
      [
        plus({ source: "stripe", status: "past_due", expiresAt: NOW + 90 * DAY }),
        plus({ source: "app_store", expiresAt: NOW + 10 * DAY }),
      ],
      NOW,
    );
    expect(r).toMatchObject({ source: "app_store", status: "active" });
  });
});

describe("isLive", () => {
  it("treats the expiry instant itself as ended", () => {
    expect(isLive(plus({ expiresAt: NOW }), NOW)).toBe(false);
  });
});

describe("hasHadPlus (no second web trial)", () => {
  const none = { stripeSubscriptions: 0, entitlements: [], earlierAccount: false };

  it("is false for a new Account with nothing bought", () => {
    expect(hasHadPlus(none)).toBe(false);
  });

  it("is true once the Account has had a Stripe subscription, even an ended one", () => {
    expect(hasHadPlus({ ...none, stripeSubscriptions: 1 })).toBe(true);
  });

  it("is true for a store Plus, but not for a gift or for Lifetime", () => {
    expect(hasHadPlus({ ...none, entitlements: [plus({ source: "app_store" })] })).toBe(true);
    expect(hasHadPlus({ ...none, entitlements: [plus({ source: "promotional" })] })).toBe(false);
    expect(hasHadPlus({ ...none, entitlements: [lifetime()] })).toBe(false);
  });

  it("is true when an earlier, deleted Account with the same email had a Stripe subscription", () => {
    expect(hasHadPlus({ ...none, earlierAccount: true })).toBe(true);
  });
});
