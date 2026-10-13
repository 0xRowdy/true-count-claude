/**
 * Video poker hand evaluation for Jacks or Better, Deuces Wild and Double Double Bonus.
 *
 * The core evaluator works on a **rank-count vector** (13 counts in poker order) plus one
 * flag saying whether the hand is suited. That shape is deliberate: the hold enumerator in
 * `holds.ts` walks rank multisets rather than card subsets, so it needs an evaluator that
 * never looks at individual suits. For a natural game the flag means "all five cards share
 * a suit"; in Deuces Wild it means "every non-deuce card shares a suit".
 */

import type { Card } from "../../engine/cards";
import { ACE, DEUCE, JACK, encodeHand } from "./cards";

export type VideoPokerGame = "jacks-or-better" | "deuces-wild" | "double-double-bonus";

/**
 * Every final hand any supported game recognises, best-first within each game. A given game
 * uses a subset (Deuces Wild has no "two pair" line; Double Double Bonus splits quads).
 */
export const HAND_RANKS = [
  "royal-flush",
  "four-deuces",
  "wild-royal-flush",
  "five-of-a-kind",
  "four-aces-with-kicker",
  "four-2-4-with-kicker",
  "four-aces",
  "four-2-4",
  "four-5-k",
  "straight-flush",
  "four-of-a-kind",
  "full-house",
  "flush",
  "straight",
  "three-of-a-kind",
  "two-pair",
  "jacks-or-better",
  "nothing",
] as const;

export type HandRank = (typeof HAND_RANKS)[number];

export const HAND_RANK_COUNT = HAND_RANKS.length;

/** Integer codes for `HAND_RANKS`, used on the hot paths. */
export const HR = {
  royalFlush: 0,
  fourDeuces: 1,
  wildRoyalFlush: 2,
  fiveOfAKind: 3,
  fourAcesWithKicker: 4,
  four2to4WithKicker: 5,
  fourAces: 6,
  four2to4: 7,
  four5toK: 8,
  straightFlush: 9,
  fourOfAKind: 10,
  fullHouse: 11,
  flush: 12,
  straight: 13,
  threeOfAKind: 14,
  twoPair: 15,
  jacksOrBetter: 16,
  nothing: 17,
} as const;

export function handRankFromCode(code: number): HandRank {
  const rank = HAND_RANKS[code];
  if (rank === undefined) throw new RangeError(`Not a hand-rank code: ${code}`);
  return rank;
}

const ROYAL_MASK = 0b1111100000000; // 10, J, Q, K, A
const WHEEL_MASK = (1 << ACE) | 0b1111; // A, 2, 3, 4, 5

/** The ten five-rank windows a straight can occupy, wheel included. */
const STRAIGHT_WINDOWS: readonly number[] = [
  WHEEL_MASK,
  ...Array.from({ length: 9 }, (_, i) => 0b11111 << i),
];

/** `IS_STRAIGHT[mask]` — the five distinct ranks in `mask` form a straight. */
const IS_STRAIGHT = new Uint8Array(1 << 13);
/** `FITS_STRAIGHT[mask]` — the ranks in `mask` all fit inside one straight window (wilds fill the rest). */
const FITS_STRAIGHT = new Uint8Array(1 << 13);
for (const window of STRAIGHT_WINDOWS) IS_STRAIGHT[window] = 1;
for (let mask = 0; mask < 1 << 13; mask++) {
  for (const window of STRAIGHT_WINDOWS) {
    if ((mask & ~window) === 0) {
      FITS_STRAIGHT[mask] = 1;
      break;
    }
  }
}

/** Whether the ranks in `mask` fit in a single straight window. Exposed for the coach. */
export function fitsStraight(mask: number): boolean {
  return FITS_STRAIGHT[mask & 0x1fff] === 1;
}

/** Natural-card games: Jacks or Better and Double Double Bonus. */
function evaluateNatural(
  counts: ArrayLike<number>,
  suited: boolean,
  doubleDoubleBonus: boolean,
): number {
  let mask = 0;
  let distinct = 0;
  let pairs = 0;
  let highPair = -1;
  let trips = -1;
  let quad = -1;
  for (let r = 0; r < 13; r++) {
    const c = counts[r] as number;
    if (c === 0) continue;
    mask |= 1 << r;
    distinct++;
    if (c === 2) {
      pairs++;
      highPair = r;
    } else if (c === 3) trips = r;
    else if (c === 4) quad = r;
  }

  if (distinct === 5) {
    const straight = IS_STRAIGHT[mask] === 1;
    if (suited && straight) return mask === ROYAL_MASK ? HR.royalFlush : HR.straightFlush;
    if (suited) return HR.flush;
    if (straight) return HR.straight;
    return HR.nothing;
  }

  if (quad >= 0) {
    if (!doubleDoubleBonus) return HR.fourOfAKind;
    const kickerMask = mask & ~(1 << quad);
    if (quad === ACE) {
      // Kicker 2, 3 or 4.
      return kickerMask & 0b111 ? HR.fourAcesWithKicker : HR.fourAces;
    }
    if (quad <= 2) {
      // Quad 2s, 3s or 4s with an A, 2, 3 or 4 kicker.
      return kickerMask & ((1 << ACE) | 0b111) ? HR.four2to4WithKicker : HR.four2to4;
    }
    return HR.four5toK;
  }
  if (trips >= 0) return pairs === 1 ? HR.fullHouse : HR.threeOfAKind;
  if (pairs === 2) return HR.twoPair;
  if (pairs === 1 && highPair >= JACK) return HR.jacksOrBetter;
  return HR.nothing;
}

/** Deuces Wild. `suited` means every natural (non-deuce) card shares a suit. */
function evaluateDeucesWild(counts: ArrayLike<number>, suited: boolean): number {
  const wilds = counts[DEUCE] as number;
  if (wilds === 4) return HR.fourDeuces;

  let mask = 0;
  let distinct = 0;
  let pairs = 0;
  let maxCount = 0;
  for (let r = 1; r < 13; r++) {
    const c = counts[r] as number;
    if (c === 0) continue;
    mask |= 1 << r;
    distinct++;
    if (c === 2) pairs++;
    if (c > maxCount) maxCount = c;
  }
  const naturals = 5 - wilds;
  const allDistinct = distinct === naturals;

  if (wilds === 0 && suited && mask === ROYAL_MASK) return HR.royalFlush;
  if (maxCount + wilds >= 5) return HR.fiveOfAKind;
  if (wilds > 0 && suited && allDistinct && (mask & ~ROYAL_MASK) === 0) return HR.wildRoyalFlush;
  const straight = allDistinct && FITS_STRAIGHT[mask] === 1;
  if (suited && straight) return HR.straightFlush;
  if (maxCount + wilds >= 4) return HR.fourOfAKind;
  if ((wilds === 0 && maxCount === 3 && pairs === 1) || (wilds === 1 && pairs === 2)) {
    return HR.fullHouse;
  }
  if (suited) return HR.flush;
  if (straight) return HR.straight;
  if (maxCount + wilds >= 3) return HR.threeOfAKind;
  return HR.nothing;
}

/**
 * Hand-rank code for a five-card rank-count vector. Hot path: no allocation, no validation.
 * `counts` must sum to 5 and hold at most four of any rank.
 */
export function evaluateCounts(
  game: VideoPokerGame,
  counts: ArrayLike<number>,
  suited: boolean,
): number {
  switch (game) {
    case "jacks-or-better":
      return evaluateNatural(counts, suited, false);
    case "double-double-bonus":
      return evaluateNatural(counts, suited, true);
    case "deuces-wild":
      return evaluateDeucesWild(counts, suited);
  }
}

/** Hand-rank code for five card codes. */
export function evaluateCodes(game: VideoPokerGame, codes: readonly number[]): number {
  const counts = new Int8Array(13);
  let suit = -1;
  let suited = true;
  const wild = game === "deuces-wild";
  for (const code of codes) {
    const rank = code >> 2;
    counts[rank] = (counts[rank] as number) + 1;
    if (wild && rank === DEUCE) continue;
    const s = code & 3;
    if (suit === -1) suit = s;
    else if (s !== suit) suited = false;
  }
  return evaluateCounts(game, counts, suited);
}

/** The final hand a five-card hand makes under a game's rules. */
export function evaluateHand(cards: readonly Card[], game: VideoPokerGame): HandRank {
  return handRankFromCode(evaluateCodes(game, encodeHand(cards)));
}
