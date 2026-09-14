/**
 * Turning `SessionStats` into things a screen can render, without lying on the way.
 *
 * One rule governs this whole file: **a rate with a zero denominator is `null`, and `null`
 * renders as an em dash, never as 0%.** A fresh Session has no accuracy; it does not have
 * 0% accuracy. "Wrong math" is 21% of the category's low-star reviews (CONTEXT.md), and a
 * statistics panel that reports a number it does not have is that complaint in a new place.
 * `src/state/stats.ts` is careful about this, and coercing its nulls here would throw the
 * care away at the last step.
 */

import { DEFAULT_RULES } from "@/engine/rules";
import type { SessionResult } from "@/ui/shoe-integrity/integrity";
import { type Session, type SessionStats, computeStats } from "@/state";

/**
 * The Session that does not exist yet, and the statistics of nothing.
 *
 * Every rate on `EMPTY_STATS` is `null`, which is what a screen shows before the first deal.
 * It is derived through `computeStats` rather than hand-written so it can never drift from
 * what a real empty Session produces.
 */
export const EMPTY_SESSION: Session = {
  id: "",
  mode: "play",
  drillId: null,
  rules: DEFAULT_RULES,
  countingSystem: "",
  seed: 0,
  startedAt: 0,
  endedAt: null,
  endReason: null,
  startingBankroll: 0,
  bankroll: 0,
  shoes: [],
  decisions: [],
  countChecks: [],
  rounds: [],
};

export const EMPTY_STATS: SessionStats = computeStats(EMPTY_SESSION);

/** What a statistic with no denominator renders as. An em dash, not a zero. */
export const NO_VALUE = "—";

/** A rate as a percentage to one decimal, or `NO_VALUE` when there is nothing to divide. */
export function formatRate(rate: number | null): string {
  if (rate === null) return NO_VALUE;
  return `${(rate * 100).toFixed(1)}%`;
}

/** `4 of 7` — the raw counts behind a rate, so a user can recheck the division themselves. */
export function formatRatio(numerator: number, denominator: number): string {
  if (denominator === 0) return NO_VALUE;
  return `${numerator} of ${denominator}`;
}

/** A per-hand chip result, signed, or `NO_VALUE` with no hands played. */
export function formatPerHand(value: number | null): string {
  if (value === null) return NO_VALUE;
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  if (rounded === 0) return "$0.00";
  return `${rounded > 0 ? "+" : "-"}$${Math.abs(rounded).toFixed(2)}`;
}

/** How long a Session ran, in the coarsest unit that still says something. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return NO_VALUE;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/**
 * The mean amount staked on a hand — the betting unit the expectation band is quoted in.
 *
 * `null` with no hands played, because there is no unit to speak of yet. Doubles are part of
 * the stake, so a run with a lot of doubling carries a slightly larger unit than its opening
 * bet; the band is an approximation and says so, and showing the unit on screen is what lets
 * a user judge that for themselves.
 */
export function bettingUnit(stats: SessionStats): number | null {
  if (stats.handsPlayed === 0 || stats.wagered === 0) return null;
  return stats.wagered / stats.handsPlayed;
}

/**
 * The Session reduced to the two numbers the expectation band needs: hands, and net in
 * betting units. `null` before a single hand has resolved — there is no result to place.
 */
export function sessionResultFor(stats: SessionStats): SessionResult | null {
  const unit = bettingUnit(stats);
  if (unit === null) return null;
  return { hands: stats.handsPlayed, netUnits: stats.netResult / unit };
}

/**
 * True when the bankroll has been topped up since the Session began.
 *
 * Invariant 6 puts a one-tap reset in front of a broke player and keeps the Session open, so
 * the bankroll stops reconciling against the net result from that moment on. Both numbers
 * stay true — the ruin is still in `netResult`, which is the pedagogically useful half — and
 * the panel says which is which rather than letting the two look like a contradiction.
 */
export function bankrollWasReset(session: Session, stats: SessionStats): boolean {
  return session.startingBankroll + stats.netResult !== session.bankroll;
}

/** The chips a Session has been topped up by, in total. Zero when it never ran dry. */
export function bankrollTopUp(session: Session, stats: SessionStats): number {
  return session.bankroll - (session.startingBankroll + stats.netResult);
}

/** How a Session ended, in words. */
export function describeEndReason(session: Session): string {
  switch (session.endReason) {
    case "user":
      return "Ended by you";
    case "drill-complete":
      return "Drill complete";
    case "bankroll-exhausted":
      return "Ended out of chips";
    case "discarded":
      return "Discarded";
    case null:
      return "In progress";
  }
}
