/**
 * Optimal hold: the exact expected value of all 32 ways to hold a dealt hand.
 *
 * ## Why not just enumerate the draws
 *
 * Summed over all 32 holds, a dealt hand has 2,598,960 possible final hands (every five-card
 * hand from the deck is reachable from exactly one hold-and-draw). Evaluating each is fine
 * once, but too slow to run on every deal in a browser. Instead each hold is computed by
 * **rank-count combinatorics**:
 *
 *  1. Walk every *rank multiset* the draw could produce, weighted by the number of card
 *     subsets that realise it (∏ C(available of rank r, drawn of rank r)). For a five-card
 *     draw that is 6,175 multisets instead of 1,533,939 card subsets. Each is evaluated as
 *     if it were unsuited.
 *  2. Correct for suits. A hand only differs from its unsuited reading when it is a flush
 *     (in Deuces Wild: when every natural card shares a suit). Those draws are enumerated
 *     card by card, per compatible suit, and each moves its weight from the unsuited result
 *     to the suited one.
 *
 * The result is the exact count of every final hand for every hold — no sampling, no
 * approximation — in a few milliseconds. `holds.test.ts` checks it against brute-force
 * enumeration, and `returns.ts` cross-checks it against an independent inclusion–exclusion
 * algorithm across every distinct deal.
 */

import type { Card } from "../../engine/cards";
import { DEUCE, choose, decodeCard, encodeHand, popcount } from "./cards";
import {
  HAND_RANKS,
  HAND_RANK_COUNT,
  evaluateCounts,
  type HandRank,
  type VideoPokerGame,
} from "./evaluate";
import { MAX_COINS, payVector, type PayTable } from "./paytables";

/** All 32 hold masks. Bit i set ⇒ card i of the dealt hand is held. */
export const HOLD_MASKS: readonly number[] = Array.from({ length: 32 }, (_, i) => i);

/**
 * Exact count of every final hand for one hold, indexed by hand-rank code. Counts are over
 * the C(47, 5 − held) equally likely draws.
 */
export function holdOutcomeCounts(
  game: VideoPokerGame,
  dealt: readonly number[],
  mask: number,
): Float64Array {
  const wild = game === "deuces-wild";
  const out = new Float64Array(HAND_RANK_COUNT);

  // What is left in the 47-card stub: per-rank counts, and per-suit masks of ranks.
  const available = new Int8Array(13).fill(4);
  const suitRanks = [0x1fff, 0x1fff, 0x1fff, 0x1fff];
  for (const code of dealt) {
    const rank = code >> 2;
    available[rank] = (available[rank] as number) - 1;
    suitRanks[code & 3] = (suitRanks[code & 3] as number) & ~(1 << rank);
  }

  const counts = new Int8Array(13);
  let heldSuit = -1;
  let mixedSuits = false;
  let held = 0;
  dealt.forEach((code, i) => {
    if (!(mask & (1 << i))) return;
    held++;
    const rank = code >> 2;
    counts[rank] = (counts[rank] as number) + 1;
    if (wild && rank === DEUCE) return;
    const suit = code & 3;
    if (heldSuit === -1) heldSuit = suit;
    else if (heldSuit !== suit) mixedSuits = true;
  });
  const toDraw = 5 - held;

  // 1. Every rank multiset of the draw, read as unsuited.
  const walkRanks = (rank: number, left: number, weight: number): void => {
    if (left === 0) {
      const code = evaluateCounts(game, counts, false);
      out[code] = (out[code] as number) + weight;
      return;
    }
    if (rank === 13) return;
    const avail = available[rank] as number;
    const most = avail < left ? avail : left;
    for (let k = 0; k <= most; k++) {
      counts[rank] = (counts[rank] as number) + k;
      walkRanks(rank + 1, left - k, weight * choose(avail, k));
      counts[rank] = (counts[rank] as number) - k;
    }
  };
  walkRanks(0, toDraw, 1);

  // 2. Suit correction: move every suited draw from its unsuited reading to its real one.
  if (mixedSuits) return out;
  const suits = heldSuit === -1 ? [0, 1, 2, 3] : [heldSuit];
  const wildsAvailable = wild ? (available[DEUCE] as number) : 0;

  for (const suit of suits) {
    // Naturals of this suit still in the stub (in Deuces Wild a deuce is not a natural).
    const naturalRanks = (suitRanks[suit] as number) & (wild ? ~(1 << DEUCE) : 0x1fff);
    for (let wilds = 0; wilds <= Math.min(wildsAvailable, toDraw); wilds++) {
      const weight = choose(wildsAvailable, wilds);
      counts[DEUCE] = (counts[DEUCE] as number) + wilds;
      const walkSuit = (from: number, left: number): void => {
        if (left === 0) {
          const suited = evaluateCounts(game, counts, true);
          const unsuited = evaluateCounts(game, counts, false);
          if (suited !== unsuited) {
            out[suited] = (out[suited] as number) + weight;
            out[unsuited] = (out[unsuited] as number) - weight;
          }
          return;
        }
        for (let rank = from; rank < 13; rank++) {
          if (!(naturalRanks & (1 << rank))) continue;
          counts[rank] = (counts[rank] as number) + 1;
          walkSuit(rank + 1, left - 1);
          counts[rank] = (counts[rank] as number) - 1;
        }
      };
      walkSuit(0, toDraw - wilds);
      counts[DEUCE] = (counts[DEUCE] as number) - wilds;
    }
  }
  return out;
}

export interface HandOutcome {
  readonly hand: HandRank;
  /** Number of the equally likely draws that end in this hand. */
  readonly count: number;
  readonly probability: number;
}

export interface HoldOption {
  /** Bit i set ⇒ card i of the dealt hand is held. */
  readonly mask: number;
  /** Positions held, ascending. */
  readonly indices: readonly number[];
  readonly held: readonly Card[];
  /**
   * Expected return per coin bet (0.8237 ⇒ a five-coin bet gets 4.12 coins back on average).
   * This is return, not profit: the bet itself is never refunded in video poker.
   */
  readonly ev: number;
  /** Number of equally likely draws, C(47, 5 − held). */
  readonly draws: number;
  /** Every final hand this hold can end in, with its exact count. Best hand first. */
  readonly outcomes: readonly HandOutcome[];
}

export interface HoldAnalysis {
  readonly hand: readonly Card[];
  readonly table: PayTable;
  readonly coins: number;
  /** All 32 holds, best first. Ties keep the hold with fewer cards first, then by mask. */
  readonly options: readonly HoldOption[];
  readonly best: HoldOption;
}

const EPSILON = 1e-12;

/** Whether two holds are worth the same, to floating-point noise. */
export function sameEv(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Exact EV of all 32 holds for a dealt hand under a pay table, ranked best first. `coins`
 * matters only for the royal: at five coins it pays 800 per coin, otherwise 250.
 */
export function analyzeHolds(
  hand: readonly Card[],
  table: PayTable,
  coins: number = MAX_COINS,
): HoldAnalysis {
  const dealt = encodeHand(hand);
  const pays = payVector(table, coins);

  const options: HoldOption[] = HOLD_MASKS.map((mask) => {
    const counts = holdOutcomeCounts(table.game, dealt, mask);
    const draws = choose(47, 5 - popcount(mask));
    let total = 0;
    const outcomes: HandOutcome[] = [];
    counts.forEach((count, code) => {
      if (count === 0) return;
      total += count * (pays[code] as number);
      outcomes.push({ hand: HAND_RANKS[code] as HandRank, count, probability: count / draws });
    });
    const indices = [0, 1, 2, 3, 4].filter((i) => mask & (1 << i));
    return {
      mask,
      indices,
      held: indices.map((i) => decodeCard(dealt[i] as number)),
      ev: total / draws,
      draws,
      outcomes,
    };
  });

  options.sort((a, b) => {
    if (!sameEv(a.ev, b.ev)) return b.ev - a.ev;
    const size = a.indices.length - b.indices.length;
    return size !== 0 ? size : a.mask - b.mask;
  });

  return { hand: [...hand], table, coins, options, best: options[0] as HoldOption };
}

/** Convert a held-flags array (one per card) to a hold mask. */
export function holdMask(held: readonly boolean[]): number {
  if (held.length !== 5) throw new RangeError(`Expected 5 hold flags, got ${held.length}`);
  return held.reduce((mask, h, i) => (h ? mask | (1 << i) : mask), 0);
}

/** Convert a hold mask to held-flags (one per card). */
export function holdFlags(mask: number): boolean[] {
  return [0, 1, 2, 3, 4].map((i) => (mask & (1 << i)) !== 0);
}

export function optionForMask(analysis: HoldAnalysis, mask: number): HoldOption {
  const option = analysis.options.find((o) => o.mask === mask);
  if (!option) throw new RangeError(`Not a hold mask: ${mask}`);
  return option;
}

/** True if `mask` is worth as much as the best hold (ties are all correct). */
export function isOptimalHold(analysis: HoldAnalysis, mask: number): boolean {
  return sameEv(optionForMask(analysis, mask).ev, analysis.best.ev);
}

/**
 * The final hand that contributes most of a hold's EV — what the hold is "drawing to". The
 * design highlights this line of the pay table (Flush, for four hearts).
 */
export function drawTarget(option: HoldOption, table: PayTable, coins: number): HandRank | null {
  const pays = payVector(table, coins);
  let best: HandRank | null = null;
  let bestValue = 0;
  for (const outcome of option.outcomes) {
    const value = outcome.probability * (pays[HAND_RANKS.indexOf(outcome.hand)] as number);
    if (value > bestValue) {
      bestValue = value;
      best = outcome.hand;
    }
  }
  return best;
}
