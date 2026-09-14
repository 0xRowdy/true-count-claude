/**
 * The Shoe — the sole source of randomness in the engine (ADR-0004).
 *
 * Every shoe is built from a seed, so it is reproducible: a seed plus a card index is a
 * complete bug report, and the Shoe Integrity Panel can prove fairness to the user rather
 * than asking them to take it on faith.
 */

import { type Card, type Rank, RANKS, freshDeck } from "./cards";
import { createRng, shuffleInPlace } from "./rng";
import type { RuleSet } from "./rules";

export interface Shoe {
  readonly seed: number;
  readonly decks: number;
  /** All cards in dealt order. Fixed at construction; dealing only advances `dealtCount`. */
  readonly cards: readonly Card[];
  /** Index of the next card to be dealt. */
  readonly dealtCount: number;
  /** Card index at which the shoe is reshuffled. */
  readonly cutIndex: number;
}

export function createShoe(rules: RuleSet, seed: number): Shoe {
  const cards: Card[] = [];
  for (let i = 0; i < rules.decks; i++) cards.push(...freshDeck());
  shuffleInPlace(cards, createRng(seed));

  return {
    seed,
    decks: rules.decks,
    cards,
    dealtCount: 0,
    cutIndex: Math.floor(cards.length * rules.penetration),
  };
}

export function cardsRemaining(shoe: Shoe): number {
  return shoe.cards.length - shoe.dealtCount;
}

/** Decks remaining, used for the true-count conversion. */
export function decksRemaining(shoe: Shoe): number {
  return cardsRemaining(shoe) / 52;
}

/** True once the cut card is reached — the shoe should be reshuffled after this round. */
export function isCutCardReached(shoe: Shoe): boolean {
  return shoe.dealtCount >= shoe.cutIndex;
}

/** True when the shoe is physically exhausted. Reaching this is a bug in round handling. */
export function isExhausted(shoe: Shoe): boolean {
  return shoe.dealtCount >= shoe.cards.length;
}

export interface DealResult {
  readonly card: Card;
  readonly shoe: Shoe;
}

/**
 * Deals the next card. Returns a new Shoe rather than mutating, which keeps the engine
 * pure and makes a Session's decision log trivially replayable.
 */
export function deal(shoe: Shoe): DealResult {
  const card = shoe.cards[shoe.dealtCount];
  if (!card) {
    throw new Error(
      `Shoe exhausted: attempted to deal card ${shoe.dealtCount + 1} of ${shoe.cards.length}. ` +
        `The round loop should reshuffle at the cut card.`,
    );
  }
  return { card, shoe: { ...shoe, dealtCount: shoe.dealtCount + 1 } };
}

/** The cards already dealt, in order. Powers the Shoe Integrity Panel's history export. */
export function dealtCards(shoe: Shoe): readonly Card[] {
  return shoe.cards.slice(0, shoe.dealtCount);
}

export type RankComposition = Readonly<Record<Rank, number>>;

/**
 * How many of each rank remain undealt. This is the user-facing proof in the Shoe
 * Integrity Panel that the shoe holds exactly what it should — a competitor shipped a
 * double-deck game containing more than twelve 2s, and a user caught it.
 */
export function remainingComposition(shoe: Shoe): RankComposition {
  const counts = Object.fromEntries(RANKS.map((rank) => [rank, 0])) as Record<Rank, number>;
  for (let i = shoe.dealtCount; i < shoe.cards.length; i++) {
    const card = shoe.cards[i];
    if (card) counts[card.rank]++;
  }
  return counts;
}

/**
 * Verifies the shoe holds exactly `decks × 4` of every rank across dealt and undealt cards.
 * Asserted in CI, and surfaced to the user as a check they can run themselves (ADR-0004).
 */
export function verifyComposition(shoe: Shoe): boolean {
  const expected = shoe.decks * 4;
  const counts = Object.fromEntries(RANKS.map((rank) => [rank, 0])) as Record<Rank, number>;
  for (const card of shoe.cards) counts[card.rank]++;
  return RANKS.every((rank) => counts[rank] === expected);
}
