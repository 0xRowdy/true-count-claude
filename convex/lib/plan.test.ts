import { describe, expect, it } from "vitest";
import { FREE, type Entitlement, isLive, resolvePlan } from "./plan";

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
