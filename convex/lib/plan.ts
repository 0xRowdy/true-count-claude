/**
 * An Account's Plan, resolved from everything any store says it has bought (ADR-0007).
 *
 * Stripe sells on the web; the App Store and Google Play sell in the apps (through
 * RevenueCat). Each writes Entitlements in one shape, and this is the only place that decides
 * what they add up to, so every surface (web, iOS, Android) reads the same answer.
 *
 * Pure: no Convex, no clock. `now` comes from the caller.
 */

export type Source = "stripe" | "app_store" | "play_store" | "promotional";

export type PaidPlan = "plus" | "lifetime";
export type PlanId = "free" | PaidPlan;

/**
 * - `trialing` / `active`: entitled until `expiresAt`.
 * - `past_due`: a renewal failed and the store is retrying. Still entitled: a card that
 *   bounced once is not a reason to take the trainer away mid-practice.
 * - `ended`: canceled, expired, refunded or never paid. Not entitled.
 */
export type EntitlementStatus = "trialing" | "active" | "past_due" | "ended";

export type Interval = "month" | "year";

export interface Entitlement {
  readonly source: Source;
  readonly plan: PaidPlan;
  readonly status: EntitlementStatus;
  /** Epoch ms when access ends unless renewed; null for Lifetime. */
  readonly expiresAt: number | null;
  /** False once the player has canceled (access runs to `expiresAt`, then stops). */
  readonly willRenew: boolean;
  readonly interval: Interval | null;
}

export interface ResolvedPlan {
  readonly plan: PlanId;
  /** Where the plan was bought, which is where it is managed; null on Free. */
  readonly source: Source | null;
  readonly status: EntitlementStatus | null;
  readonly expiresAt: number | null;
  readonly willRenew: boolean;
  readonly interval: Interval | null;
  /**
   * Other stores still billing for Plus besides the one shown: the player is paying twice
   * and should cancel one. Empty almost always.
   */
  readonly alsoRenewing: Source[];
}

export const FREE: ResolvedPlan = {
  plan: "free",
  source: null,
  status: null,
  expiresAt: null,
  willRenew: false,
  interval: null,
  alsoRenewing: [],
};

/** Whether an Entitlement grants access at `now`. */
export function isLive(e: Entitlement, now: number): boolean {
  if (e.status === "ended") return false;
  // A failed renewal keeps access while the store retries; it ends with an `ended` status.
  if (e.status === "past_due") return true;
  return e.expiresAt === null || e.expiresAt > now;
}

const STATUS_RANK: Readonly<Record<EntitlementStatus, number>> = {
  active: 3,
  trialing: 2,
  past_due: 1,
  ended: 0,
};

/**
 * Lifetime beats Plus. Between Plus subscriptions, a healthy one beats a failing one, and then
 * the one that lasts longest wins (so the plan shown is the one that matters most).
 */
function better(a: Entitlement, b: Entitlement): boolean {
  if (a.plan !== b.plan) return a.plan === "lifetime";
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
    return STATUS_RANK[a.status] > STATUS_RANK[b.status];
  }
  return (a.expiresAt ?? Infinity) > (b.expiresAt ?? Infinity);
}

export function resolvePlan(entitlements: readonly Entitlement[], now: number): ResolvedPlan {
  const live = entitlements.filter((e) => isLive(e, now));
  if (live.length === 0) return FREE;
  const best = live.reduce((a, b) => (better(b, a) ? b : a));
  const alsoRenewing = live
    .filter((e) => e !== best && e.plan === "plus" && e.willRenew)
    .map((e) => e.source);
  return {
    plan: best.plan,
    source: best.source,
    status: best.status,
    expiresAt: best.expiresAt,
    willRenew: best.willRenew,
    interval: best.interval,
    alsoRenewing: [...new Set(alsoRenewing)],
  };
}
