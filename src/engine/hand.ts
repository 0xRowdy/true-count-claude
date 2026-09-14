/**
 * Hand evaluation and legal actions.
 *
 * Invariant 7 (CONTEXT.md): a legal action is never disabled in the UI. `legalActions`
 * is therefore the single source of truth for what the player may do, and the UI renders
 * every entry it returns.
 */

import { type Card, isAce, isTen, rankValue } from "./cards";
import type { RuleSet } from "./rules";

export type Action = "hit" | "stand" | "double" | "split" | "surrender";

export interface HandValue {
  /** Best total that does not bust, or the minimum total if the hand has busted. */
  readonly total: number;
  /** True when an ace is still being counted as 11. */
  readonly soft: boolean;
  readonly busted: boolean;
}

export interface Hand {
  readonly cards: readonly Card[];
  /** Hands created by splitting are restricted: no blackjack, and often one card only. */
  readonly fromSplit: boolean;
  readonly doubled: boolean;
  readonly surrendered: boolean;
  readonly bet: number;
}

export function createHand(cards: readonly Card[], bet: number, fromSplit = false): Hand {
  return { cards, fromSplit, doubled: false, surrendered: false, bet };
}

/**
 * Evaluates a hand, counting at most one ace as 11. Counting two aces as 11 always
 * busts, so a single demotion check is sufficient regardless of ace count.
 */
export function evaluate(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += rankValue(card.rank);
    if (isAce(card.rank)) aces++;
  }

  // Demote aces from 11 to 1 while the hand is over 21.
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return { total, soft: aces > 0, busted: total > 21 };
}

/** A natural: exactly two cards totalling 21, and not the product of a split. */
export function isBlackjack(hand: Hand): boolean {
  if (hand.cards.length !== 2 || hand.fromSplit) return false;
  const [first, second] = hand.cards;
  if (!first || !second) return false;
  return (
    (isAce(first.rank) && isTen(second.rank)) || (isTen(first.rank) && isAce(second.rank))
  );
}

/** True when the hand is a pair eligible for splitting. Ranks that both count ten pair up. */
export function isSplittablePair(hand: Hand): boolean {
  if (hand.cards.length !== 2) return false;
  const [first, second] = hand.cards;
  if (!first || !second) return false;
  if (first.rank === second.rank) return true;
  return isTen(first.rank) && isTen(second.rank);
}

export interface LegalActionContext {
  readonly hand: Hand;
  readonly rules: RuleSet;
  /** How many hands the player currently holds, for the resplit limit. */
  readonly handCount: number;
  readonly bankroll: number;
}

/**
 * Every action the player may legally take. The UI renders exactly this set —
 * it never greys out an entry, because doing so corrupts the user's accuracy
 * statistics (invariant 7, and a repeated competitor complaint).
 */
export function legalActions(context: LegalActionContext): Action[] {
  const { hand, rules, handCount, bankroll } = context;
  const value = evaluate(hand.cards);

  if (value.busted || hand.surrendered || hand.doubled) return [];
  if (isBlackjack(hand)) return [];

  const isFirstDecision = hand.cards.length === 2;
  const canAfford = bankroll >= hand.bet;
  const holdingAces = isAce(hand.cards[0]?.rank ?? "2");

  const canSplit =
    isFirstDecision &&
    canAfford &&
    isSplittablePair(hand) &&
    handCount < rules.maxSplitHands &&
    (!hand.fromSplit || !holdingAces || rules.resplitAces);

  // Split aces normally receive exactly one card and cannot act again. A second ace is the
  // exception: `oneCardToSplitAces` and `resplitAces` are independent rules, and plenty of
  // tables run both — one card to each split ace, but an ace among them may be split again.
  // So the re-split is checked *before* the freeze, or `resplitAces` would be unreachable
  // under the default rule set. Declining leaves the hand standing, exactly as at the table;
  // offering `split` alone would force the player's hand (invariant 6, never a dead end).
  const isSplitAce = hand.fromSplit && holdingAces;
  if (isSplitAce && rules.oneCardToSplitAces && hand.cards.length >= 2) {
    return canSplit ? ["stand", "split"] : [];
  }

  const actions: Action[] = ["hit", "stand"];

  if (isFirstDecision && canAfford && allowsDouble(value.total, rules)) {
    if (!hand.fromSplit || rules.doubleAfterSplit) actions.push("double");
  }

  if (canSplit) actions.push("split");

  if (isFirstDecision && !hand.fromSplit && rules.surrender !== "none") {
    actions.push("surrender");
  }

  return actions;
}

function allowsDouble(total: number, rules: RuleSet): boolean {
  switch (rules.doubleRule) {
    case "any":
      return true;
    case "9-11":
      return total >= 9 && total <= 11;
    case "10-11":
      return total >= 10 && total <= 11;
  }
}
