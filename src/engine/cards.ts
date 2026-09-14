/**
 * Card primitives. Pure data — see ADR-0002.
 */

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ["s", "h", "d", "c"] as const;
export type Suit = (typeof SUITS)[number];

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

/** Ranks that count as ten. Kept separate because counting systems tag them as a group. */
const TEN_RANKS = new Set<Rank>(["10", "J", "Q", "K"]);

export function isTen(rank: Rank): boolean {
  return TEN_RANKS.has(rank);
}

export function isAce(rank: Rank): boolean {
  return rank === "A";
}

/**
 * Blackjack value of a rank. Aces return 11; the soft-to-hard demotion is handled
 * by hand evaluation, not here.
 */
export function rankValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (isTen(rank)) return 10;
  return Number(rank);
}

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

/** One full 52-card deck in a fixed, deterministic order. */
export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}
