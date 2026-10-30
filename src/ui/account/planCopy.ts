/**
 * How a Plan reads on screen. Pure (no React, no clock): dates come in as epoch ms and are
 * shown in the device's local calendar, which is only ever read after mount (hydration).
 */

import type { BillingErrorCode } from "../../../convex/billing";
import type { PlanId, ResolvedPlan, Source } from "../../../convex/lib/plan";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 25" in the device's calendar. */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export const PLAN_NAMES: Readonly<Record<PlanId, string>> = {
  free: "Free",
  plus: "Tableside Plus",
  lifetime: "Tableside Lifetime",
};

/** One line under the plan name: where it stands and what happens next. */
export function planStatus(p: ResolvedPlan): string {
  if (p.plan === "free") return "Every game and the coach, free for good";
  if (p.plan === "lifetime") return "Paid once. Yours on every device";
  const per = p.interval === "year" ? " · yearly" : p.interval === "month" ? " · monthly" : "";
  if (p.status === "past_due")
    return "Your last payment didn't go through. Update your card to keep Plus";
  if (p.expiresAt === null) return `Active${per}`;
  const when = shortDate(p.expiresAt);
  if (p.status === "trialing") {
    return p.willRenew ? `Free trial · first charge ${when}${per}` : `Free trial · ends ${when}`;
  }
  return p.willRenew ? `Renews ${when}${per}` : `Canceled · Plus until ${when}`;
}

/** Where the plan is billed, which is where it is changed or canceled. */
export const BILLED_BY: Readonly<Record<Source, string>> = {
  stripe: "Billed through tableside on the web",
  app_store: "Billed by the App Store",
  play_store: "Billed by Google Play",
  promotional: "A gift from Tableside",
};

const STORE_NAMES: Readonly<Record<Source, string>> = {
  stripe: "the web",
  app_store: "the App Store",
  play_store: "Google Play",
  promotional: "Tableside",
};

/** The player is paying for Plus twice: say where, so they can cancel one. */
export function doubleBillingWarning(p: ResolvedPlan): string | null {
  if (p.alsoRenewing.length === 0) return null;
  const others = p.alsoRenewing.map((s) => STORE_NAMES[s]).join(" and ");
  return p.plan === "lifetime"
    ? `You have Lifetime, but a Plus subscription on ${others} is still renewing. Cancel it there so you aren't charged again.`
    : `You're subscribed to Plus on ${others} as well. Cancel one so you aren't charged twice.`;
}

export function billingErrorMessage(code: BillingErrorCode | undefined): string {
  switch (code) {
    case "signed-out":
      return "Sign in first, so the purchase belongs to your account on every device.";
    case "already-lifetime":
      return "You already have Lifetime: there's nothing more to buy.";
    case "already-subscribed":
      return "You already have Plus. Manage it from your account.";
    case "not-configured":
      return "Purchases aren't set up on this server yet. Nothing was charged.";
    default:
      return "Something went wrong starting checkout. Nothing was charged; please try again.";
  }
}
