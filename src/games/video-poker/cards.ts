/**
 * Video poker card codes.
 *
 * The public API speaks the engine's `Card` (src/engine/cards.ts). Internally every card is
 * a small integer so the hold enumerator and the exact-return calculator can work on typed
 * arrays: `code = rankIndex * 4 + suitIndex`, where `rankIndex` runs in **poker order**
 * (2 = 0 … A = 12) and `suitIndex` follows the engine's `SUITS` order.
 */

import { SUITS, type Card, type Rank, type Suit } from "../../engine/cards";

/** Ranks in poker order, low to high. Ace is high here; the wheel (A-2-3-4-5) is special-cased. */
export const POKER_RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const satisfies readonly Rank[];

const RANK_INDEX: Record<Rank, number> = {
  "2": 0,
  "3": 1,
  "4": 2,
  "5": 3,
  "6": 4,
  "7": 5,
  "8": 6,
  "9": 7,
  "10": 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
};

const SUIT_INDEX: Record<Suit, number> = { s: 0, h: 1, d: 2, c: 3 };

/** Poker-order index of a rank: 2 → 0 … A → 12. */
export function pokerRankIndex(rank: Rank): number {
  return RANK_INDEX[rank];
}

export function suitIndex(suit: Suit): number {
  return SUIT_INDEX[suit];
}

/** Rank index of the Jack — the lowest rank a qualifying "Jacks or Better" pair can have. */
export const JACK = 9;
export const ACE = 12;
/** The deuce, which is wild in Deuces Wild. */
export const DEUCE = 0;

export function encodeCard(card: Card): number {
  return RANK_INDEX[card.rank] * 4 + SUIT_INDEX[card.suit];
}

export function decodeCard(code: number): Card {
  const rank = POKER_RANKS[code >> 2];
  const suit = SUITS[code & 3];
  if (rank === undefined || suit === undefined) {
    throw new RangeError(`Not a card code: ${code}`);
  }
  return { rank, suit };
}

/**
 * Validates a five-card video poker hand: exactly five cards, no duplicates. A duplicated card
 * would silently corrupt every probability downstream, so it is an error rather than a quirk.
 */
export function encodeHand(cards: readonly Card[]): number[] {
  if (cards.length !== 5) {
    throw new RangeError(`A video poker hand has 5 cards, got ${cards.length}`);
  }
  const codes = cards.map(encodeCard);
  if (new Set(codes).size !== 5) {
    throw new RangeError("A video poker hand cannot hold the same card twice");
  }
  return codes;
}

/** Binomial coefficients C(n, k) for n ≤ 52, k ≤ 5 — everything a five-card game needs. */
export const BINOMIAL: readonly (readonly number[])[] = (() => {
  const table: number[][] = [];
  for (let n = 0; n <= 52; n++) {
    const row: number[] = [];
    for (let k = 0; k <= 5; k++) {
      if (k === 0) row.push(1);
      else if (n === 0) row.push(0);
      else row.push((table[n - 1]?.[k - 1] ?? 0) + (table[n - 1]?.[k] ?? 0));
    }
    table.push(row);
  }
  return table;
})();

export function choose(n: number, k: number): number {
  return BINOMIAL[n]?.[k] ?? 0;
}

/** Number of set bits in a 5-bit hold mask (or any small mask). */
export function popcount(mask: number): number {
  let n = 0;
  for (let m = mask; m !== 0; m &= m - 1) n++;
  return n;
}
