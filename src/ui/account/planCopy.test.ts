import { describe, expect, it } from "vitest";
import { FREE, type ResolvedPlan } from "../../../convex/lib/plan";
import {
  BILLED_BY,
  billingErrorMessage,
  doubleBillingWarning,
  planStatus,
  shortDate,
  storesToCancelFirst,
  webSubscriptionRenewing,
} from "./planCopy";

// Local noon, so the calendar day is the same in every time zone the suite runs in.
const NOV_25 = new Date(2026, 10, 25, 12).getTime();

const plus = (over: Partial<ResolvedPlan> = {}): ResolvedPlan => ({
  plan: "plus",
  source: "stripe",
  status: "active",
  expiresAt: NOV_25,
  willRenew: true,
  interval: "year",
  alsoRenewing: [],
  ...over,
});

describe("planCopy", () => {
  it("dates in the device calendar", () => {
    expect(shortDate(NOV_25)).toBe("Nov 25");
  });

  it("says what happens next", () => {
    expect(planStatus(FREE)).toMatch(/free for good/);
    expect(planStatus(plus())).toBe("Renews Nov 25 · yearly");
    expect(planStatus(plus({ willRenew: false }))).toBe("Canceled · Plus until Nov 25");
    expect(planStatus(plus({ status: "trialing", interval: "month" }))).toBe(
      "Free trial · first charge Nov 25 · monthly",
    );
    expect(planStatus(plus({ status: "trialing", willRenew: false }))).toBe(
      "Free trial · ends Nov 25",
    );
    expect(planStatus(plus({ status: "past_due" }))).toMatch(/Update your card/);
    expect(planStatus({ ...FREE, plan: "lifetime", source: "stripe" })).toMatch(/Paid once/);
  });

  it("names where the plan is billed", () => {
    expect(BILLED_BY.app_store).toBe("Billed by the App Store");
    expect(BILLED_BY.play_store).toBe("Billed by Google Play");
  });

  it("warns only when another store is still billing", () => {
    expect(doubleBillingWarning(plus())).toBeNull();
    expect(doubleBillingWarning(plus({ alsoRenewing: ["app_store"] }))).toMatch(
      /on the App Store as well/,
    );
    expect(
      doubleBillingWarning({ ...plus(), plan: "lifetime", alsoRenewing: ["play_store"] }),
    ).toMatch(/Lifetime, but a Plus subscription on Google Play/);
  });
});

describe("before deleting an Account", () => {
  it("names every store still billing, not just the plan shown", () => {
    expect(storesToCancelFirst(plus())).toBeNull();
    expect(storesToCancelFirst(plus({ source: "app_store" }))).toBe("the App Store");
    expect(storesToCancelFirst(plus({ source: "app_store", willRenew: false }))).toBeNull();
    const lifetime: ResolvedPlan = {
      ...plus({ alsoRenewing: ["app_store", "play_store"] }),
      plan: "lifetime",
      willRenew: false,
    };
    expect(storesToCancelFirst(lifetime)).toBe("the App Store and Google Play");
  });

  it("knows a web subscription is renewing even when another plan is shown", () => {
    expect(webSubscriptionRenewing(plus())).toBe(true);
    expect(webSubscriptionRenewing(plus({ willRenew: false }))).toBe(false);
    expect(webSubscriptionRenewing(plus({ source: "app_store", alsoRenewing: ["stripe"] }))).toBe(
      true,
    );
  });
});

describe("billingErrorMessage", () => {
  it("names checkout by default, and whatever the caller was doing otherwise", () => {
    expect(billingErrorMessage(undefined)).toMatch(/checkout/);
    expect(billingErrorMessage(undefined, "We couldn't open billing.")).toBe(
      "We couldn't open billing.",
    );
    expect(billingErrorMessage("already-lifetime", "We couldn't open billing.")).toMatch(
      /Lifetime/,
    );
  });
});
