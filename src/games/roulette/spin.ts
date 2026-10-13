/**
 * Placing bets, spinning, settling, and the spin history.
 *
 * Randomness enters only through an injected `Rng` (ADR-0004). A session is reproducible
 * from its seed: spin `i` is drawn from an Rng derived from `(seed, i)`, so a seed plus the
 * recorded bets replays a session exactly and any single spin can be re-derived on its own.
 *
 * Settlement works in exact, unrounded chips. La Partage can return half of an odd chip
 * amount; rounding that for display is a presentation concern.
 */

import { type Rng, createRng } from "../../engine/rng";
import { type BetSpot, getLayout, getSpot, isEvenMoneyBet, isInsideBet } from "./layout";
import { type Pocket, type RouletteRules, isZero } from "./wheel";

/** Chips on one spot. Serialisable: the spot is referenced by id. */
export interface Bet {
  readonly spotId: string;
  readonly amount: number;
}

/** Total staked across a set of bets. */
export function totalStake(bets: readonly Bet[]): number {
  return bets.reduce((sum, b) => sum + b.amount, 0);
}

/** Add chips to a spot, merging with chips already there. Returns a new bet list. */
export function addChips(bets: readonly Bet[], spotId: string, amount: number): Bet[] {
  const existing = bets.find((b) => b.spotId === spotId);
  if (!existing) return [...bets, { spotId, amount }];
  return bets.map((b) => (b.spotId === spotId ? { spotId, amount: b.amount + amount } : b));
}

/** Remove up to `amount` chips from a spot; the spot disappears when it reaches zero. */
export function removeChips(bets: readonly Bet[], spotId: string, amount: number): Bet[] {
  return bets
    .map((b) => (b.spotId === spotId ? { spotId, amount: b.amount - amount } : b))
    .filter((b) => b.amount > 0);
}

/** Merge duplicate spots into one bet each, preserving first-placed order. */
export function normalizeBets(bets: readonly Bet[]): Bet[] {
  let out: Bet[] = [];
  for (const b of bets) out = addChips(out, b.spotId, b.amount);
  return out.filter((b) => b.amount > 0);
}

/** Scale every bet by a factor (progressions, or adapting a layout to a new budget). */
export function scaleBets(bets: readonly Bet[], factor: number): Bet[] {
  return bets.map((b) => ({ spotId: b.spotId, amount: b.amount * factor }));
}

export type BetIssueCode =
  | "unknown-spot"
  | "non-positive"
  | "below-inside-min"
  | "below-table-min"
  | "above-table-max";

export interface BetIssue {
  readonly code: BetIssueCode;
  /** The offending spot; absent for the combined inside-minimum check. */
  readonly spotId?: string;
  readonly message: string;
}

/**
 * Check a set of bets against the layout and the table limits. Empty means the bets can be
 * spun. Limits are casino-standard: each outside bet must meet the table minimum, the inside
 * bets together must meet the inside minimum, and no single spot may exceed the maximum.
 */
export function validateBets(rules: RouletteRules, bets: readonly Bet[]): BetIssue[] {
  const issues: BetIssue[] = [];
  const { min, max, insideMin } = rules.limits;
  let insideTotal = 0;
  let merged: Bet[] = [];
  for (const b of bets) merged = addChips(merged, b.spotId, b.amount);
  for (const bet of merged) {
    const spot = getSpot(rules, bet.spotId);
    if (!spot) {
      issues.push({
        code: "unknown-spot",
        spotId: bet.spotId,
        message: `${bet.spotId} is not a bet on this layout.`,
      });
      continue;
    }
    if (!(bet.amount > 0) || !Number.isFinite(bet.amount)) {
      issues.push({
        code: "non-positive",
        spotId: bet.spotId,
        message: `The bet on ${spot.label} must be a positive amount.`,
      });
      continue;
    }
    if (bet.amount > max) {
      issues.push({
        code: "above-table-max",
        spotId: bet.spotId,
        message: `${spot.label} is over the $${max} table maximum.`,
      });
    }
    if (isInsideBet(spot.type)) {
      insideTotal += bet.amount;
    } else if (bet.amount < min) {
      issues.push({
        code: "below-table-min",
        spotId: bet.spotId,
        message: `${spot.label} is under the $${min} minimum for outside bets.`,
      });
    }
  }
  if (insideTotal > 0 && insideTotal < insideMin) {
    issues.push({
      code: "below-inside-min",
      message: `Inside bets total $${insideTotal}, under the $${insideMin} inside minimum.`,
    });
  }
  return issues;
}

/** Spin the wheel once. Each pocket is equally likely. */
export function spinWheel(rules: RouletteRules, rng: Rng): Pocket {
  const pockets = getLayout(rules).pockets;
  return pockets[rng.nextInt(pockets.length)] as Pocket;
}

/**
 * The Rng for spin `index` of a session seeded with `seed`. Mixing the index in with a
 * golden-ratio stride gives every spin its own well-separated mulberry32 stream.
 */
export function spinRng(seed: number, index: number): Rng {
  return createRng((seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
}

/** The pocket spin `index` of a session seeded with `seed` lands on. */
export function spinPocket(rules: RouletteRules, seed: number, index: number): Pocket {
  return spinWheel(rules, spinRng(seed, index));
}

export type BetOutcome = "win" | "lose" | "halfBack";

export interface BetResult {
  readonly spotId: string;
  readonly amount: number;
  readonly outcome: BetOutcome;
  /** Chips returned to the bankroll, stake included. */
  readonly returned: number;
  /** `returned - amount`. */
  readonly net: number;
}

export interface SpinSettlement {
  readonly pocket: Pocket;
  readonly results: readonly BetResult[];
  readonly staked: number;
  readonly returned: number;
  readonly net: number;
}

/** Settle one bet spot against a pocket. */
export function settleSpot(
  rules: RouletteRules,
  spot: BetSpot,
  amount: number,
  pocket: Pocket,
): BetResult {
  if (spot.pockets.includes(pocket)) {
    const returned = amount * (spot.payout + 1);
    return { spotId: spot.id, amount, outcome: "win", returned, net: returned - amount };
  }
  if (rules.laPartage && isZero(pocket) && isEvenMoneyBet(spot.type)) {
    const returned = amount / 2;
    return { spotId: spot.id, amount, outcome: "halfBack", returned, net: returned - amount };
  }
  return { spotId: spot.id, amount, outcome: "lose", returned: 0, net: -amount };
}

/** Settle a set of bets against the pocket the ball landed in. Unknown spots throw. */
export function settleBets(
  rules: RouletteRules,
  bets: readonly Bet[],
  pocket: Pocket,
): SpinSettlement {
  const results = bets.map((bet) => {
    const spot = getSpot(rules, bet.spotId);
    if (!spot) throw new Error(`Unknown bet spot "${bet.spotId}" on a ${rules.wheel} layout.`);
    return settleSpot(rules, spot, bet.amount, pocket);
  });
  const staked = totalStake(bets);
  const returned = results.reduce((sum, r) => sum + r.returned, 0);
  return { pocket, results, staked, returned, net: returned - staked };
}

// ---------------------------------------------------------------------------------------------
// Session: bankroll + spin history
// ---------------------------------------------------------------------------------------------

export interface SpinRecord {
  /** 0-based spin number within the session. */
  readonly index: number;
  readonly pocket: Pocket;
  readonly bets: readonly Bet[];
  readonly settlement: SpinSettlement;
  /** Bankroll after the spin settled. */
  readonly bankrollAfter: number;
}

export interface RouletteSession {
  readonly rules: RouletteRules;
  readonly seed: number;
  readonly startingBankroll: number;
  readonly bankroll: number;
  /** Oldest first. */
  readonly history: readonly SpinRecord[];
}

export function createRouletteSession(options: {
  rules: RouletteRules;
  seed: number;
  bankroll: number;
}): RouletteSession {
  return {
    rules: options.rules,
    seed: options.seed >>> 0,
    startingBankroll: options.bankroll,
    bankroll: options.bankroll,
    history: [],
  };
}

/**
 * Spin once with `bets` on the felt. Throws when the bets break the layout or the limits, or
 * when they exceed the bankroll — the UI validates first, so reaching here is a bug.
 * A spin with no bets is allowed (watching the wheel) and still enters the history.
 */
export function playSpin(session: RouletteSession, bets: readonly Bet[]): RouletteSession {
  const issues = validateBets(session.rules, bets);
  if (issues.length > 0) throw new Error(issues.map((i) => i.message).join(" "));
  const placed = normalizeBets(bets);
  const staked = totalStake(placed);
  if (staked > session.bankroll) {
    throw new Error(`Bets total $${staked}, more than the $${session.bankroll} bankroll.`);
  }
  const index = session.history.length;
  const pocket = spinPocket(session.rules, session.seed, index);
  const settlement = settleBets(session.rules, placed, pocket);
  const bankrollAfter = session.bankroll + settlement.net;
  return {
    ...session,
    bankroll: bankrollAfter,
    history: [...session.history, { index, pocket, bets: placed, settlement, bankrollAfter }],
  };
}

/** The most recent pockets, newest first — the "LAST" strip above the felt. */
export function recentPockets(session: RouletteSession, count = 8): Pocket[] {
  return session.history
    .slice(-count)
    .map((r) => r.pocket)
    .reverse();
}

/** Net result across the whole session. */
export function sessionNet(session: RouletteSession): number {
  return session.bankroll - session.startingBankroll;
}
