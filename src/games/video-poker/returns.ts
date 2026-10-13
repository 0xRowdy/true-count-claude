/**
 * Exact return to player of a pay table under perfect play.
 *
 * This is the audit behind every "99.54%" the app prints. It is computed from first
 * principles — every possible deal, every possible hold, every possible draw — with an
 * algorithm that shares nothing with `holds.ts` except the hand evaluator, so the two
 * cross-check each other (`returns.test.ts`).
 *
 * ## Algorithm: subset sums + inclusion–exclusion
 *
 *  1. For every one of the C(52,5) = 2,598,960 final hands, add its pay to a running sum for
 *     each of its 32 subsets. `S(T)` is then the total pay of all final hands containing `T`.
 *  2. For a deal D and a hold H (discarding X = D \ H), the final hands are the ones that
 *     contain H and none of X. By inclusion–exclusion their total pay is
 *     Σ over Y ⊆ X of (−1)^|Y| · S(H ∪ Y), so every hold of every deal costs at most 32
 *     lookups — 243 per deal for all 32 holds.
 *  3. Deals that differ only by a permutation of suits play identically. The 2,598,960 deals
 *     collapse to 134,459 suit-isomorphism classes, keyed by the sorted per-suit rank masks.
 *  4. Return = Σ over classes of (class size × best hold EV) / C(52,5).
 *
 * Sums are integers held exactly in doubles, so the only rounding is the final division.
 * It takes a few seconds and ~25 MB, so it is meant for tests and tooling, not for a
 * screen — screens show `PayTable.publishedReturn`, which the tests pin to this.
 */

import { BINOMIAL, choose, DEUCE } from "./cards";
import { evaluateCounts, type VideoPokerGame } from "./evaluate";
import { MAX_COINS, payVector, type PayTable } from "./paytables";

/** C(n, k) as a plain lookup — the colex rank of a k-subset of 0..51 is Σ C(c_i, i). */
function binom(n: number, k: number): number {
  return (BINOMIAL[n] as readonly number[])[k] as number;
}

/** Positions (0..4) of each subset of a five-card hand, for the 32 masks. */
const SUBSET_POSITIONS: readonly (readonly number[])[] = Array.from({ length: 32 }, (_, mask) =>
  [0, 1, 2, 3, 4].filter((i) => mask & (1 << i)),
);

/** Colex rank of the subset `mask` of the sorted five cards `cards`. */
function subsetIndex(cards: ArrayLike<number>, mask: number): number {
  let index = 0;
  const positions = SUBSET_POSITIONS[mask] as readonly number[];
  for (let i = 0; i < positions.length; i++) {
    index += binom(cards[positions[i] as number] as number, i + 1);
  }
  return index;
}

/** Calls `visit` with every five-card hand of the 52-card deck, as sorted card codes. */
function forEachHand(visit: (cards: Int32Array) => void): void {
  const cards = new Int32Array(5);
  for (let a = 0; a < 52; a++) {
    cards[0] = a;
    for (let b = a + 1; b < 52; b++) {
      cards[1] = b;
      for (let c = b + 1; c < 52; c++) {
        cards[2] = c;
        for (let d = c + 1; d < 52; d++) {
          cards[3] = d;
          for (let e = d + 1; e < 52; e++) {
            cards[4] = e;
            visit(cards);
          }
        }
      }
    }
  }
}

/** Hand-rank code of five card codes, without allocating. */
function evaluateInto(game: VideoPokerGame, counts: Int8Array, cards: ArrayLike<number>): number {
  const wild = game === "deuces-wild";
  let suit = -1;
  let suited = true;
  for (let i = 0; i < 5; i++) {
    const code = cards[i] as number;
    const rank = code >> 2;
    counts[rank] = (counts[rank] as number) + 1;
    if (wild && rank === DEUCE) continue;
    if (suit === -1) suit = code & 3;
    else if ((code & 3) !== suit) suited = false;
  }
  const result = evaluateCounts(game, counts, suited);
  for (let i = 0; i < 5; i++) {
    const rank = (cards[i] as number) >> 2;
    counts[rank] = (counts[rank] as number) - 1;
  }
  return result;
}

/** `sums[k][colex(T)]` = total per-coin pay of every final hand containing the k-set T. */
export type SubsetSums = readonly Float64Array[];

export function subsetSums(table: PayTable, coins: number = MAX_COINS): SubsetSums {
  const pays = payVector(table, coins);
  const sums = [0, 1, 2, 3, 4, 5].map((k) => new Float64Array(binom(52, k)));
  const counts = new Int8Array(13);
  forEachHand((cards) => {
    const pay = pays[evaluateInto(table.game, counts, cards)] as number;
    if (pay === 0) return;
    for (let mask = 0; mask < 32; mask++) {
      const size = (SUBSET_POSITIONS[mask] as readonly number[]).length;
      const bucket = sums[size] as Float64Array;
      const index = subsetIndex(cards, mask);
      bucket[index] = (bucket[index] as number) + pay;
    }
  });
  return sums;
}

/**
 * Exact per-coin EV of each of the 32 holds (indexed by mask over the sorted `cards`) by
 * inclusion–exclusion over `sums`.
 */
export function holdEvsBySubsetSums(sums: SubsetSums, cards: ArrayLike<number>): Float64Array {
  const subsetTotal = new Float64Array(32);
  for (let mask = 0; mask < 32; mask++) {
    const size = (SUBSET_POSITIONS[mask] as readonly number[]).length;
    subsetTotal[mask] = (sums[size] as Float64Array)[subsetIndex(cards, mask)] as number;
  }
  const evs = new Float64Array(32);
  for (let hold = 0; hold < 32; hold++) {
    const discards = ~hold & 31;
    let total = 0;
    for (let extra = discards; ; extra = (extra - 1) & discards) {
      const sign = (SUBSET_POSITIONS[extra] as readonly number[]).length % 2 === 0 ? 1 : -1;
      total += sign * (subsetTotal[hold | extra] as number);
      if (extra === 0) break;
    }
    evs[hold] = total / choose(47, 5 - (SUBSET_POSITIONS[hold] as readonly number[]).length);
  }
  return evs;
}

export interface DealClasses {
  /** One representative deal per class: five sorted card codes per class, flattened. */
  readonly representatives: Int32Array;
  /** How many of the 2,598,960 deals each class stands for. */
  readonly sizes: Int32Array;
  readonly length: number;
}

/** The suit-isomorphism classes of five-card deals (134,459 of them). Game-independent. */
export function dealClasses(): DealClasses {
  const index = new Map<number, number>();
  const representatives: number[] = [];
  const sizes: number[] = [];
  const masks = [0, 0, 0, 0];
  forEachHand((cards) => {
    masks[0] = masks[1] = masks[2] = masks[3] = 0;
    for (let i = 0; i < 5; i++) {
      const code = cards[i] as number;
      masks[code & 3] = (masks[code & 3] as number) | (1 << (code >> 2));
    }
    masks.sort((x, y) => y - x);
    const key =
      (((masks[0] as number) * 8192 + (masks[1] as number)) * 8192 + (masks[2] as number)) * 8192 +
      (masks[3] as number);
    const existing = index.get(key);
    if (existing !== undefined) {
      sizes[existing] = (sizes[existing] as number) + 1;
      return;
    }
    index.set(key, sizes.length);
    sizes.push(1);
    for (let i = 0; i < 5; i++) representatives.push(cards[i] as number);
  });
  return {
    representatives: Int32Array.from(representatives),
    sizes: Int32Array.from(sizes),
    length: sizes.length,
  };
}

export interface ReturnReport {
  /** Long-run return per unit bet under perfect play (0.995439 = 99.5439%). */
  readonly returnRate: number;
  /** Number of suit-isomorphism classes evaluated (134,459). */
  readonly distinctDeals: number;
}

/** Exact return of perfect play for a pay table and bet size. */
export function exactReturn(
  table: PayTable,
  coins: number = MAX_COINS,
  classes: DealClasses = dealClasses(),
): ReturnReport {
  const sums = subsetSums(table, coins);
  let total = 0;
  for (let c = 0; c < classes.length; c++) {
    const cards = classes.representatives.subarray(c * 5, c * 5 + 5);
    const evs = holdEvsBySubsetSums(sums, cards);
    let best = 0;
    for (let hold = 0; hold < 32; hold++) {
      if ((evs[hold] as number) > best) best = evs[hold] as number;
    }
    total += best * (classes.sizes[c] as number);
  }
  return { returnRate: total / binom(52, 5), distinctDeals: classes.length };
}
