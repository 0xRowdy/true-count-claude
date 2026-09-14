/**
 * Rule Set — the table configuration.
 *
 * Basic Strategy is a *function of* the Rule Set (see CONTEXT.md), so every strategy,
 * EV, and deviation lookup takes one of these. There is no global "current rules".
 */

export type DealerSoft17 = "stand" | "hit";
export type BlackjackPayout = "3:2" | "6:5";
export type SurrenderRule = "none" | "late" | "early";
export type DoubleRule = "any" | "9-11" | "10-11";

export interface RuleSet {
  /** Number of 52-card decks in the shoe. */
  readonly decks: number;
  /** Whether the dealer hits or stands on soft 17. */
  readonly dealerSoft17: DealerSoft17;
  readonly blackjackPayout: BlackjackPayout;
  /** Double after split allowed. */
  readonly doubleAfterSplit: boolean;
  readonly doubleRule: DoubleRule;
  readonly surrender: SurrenderRule;
  /** Maximum hands a player may split to, including the original. */
  readonly maxSplitHands: number;
  /** Whether split aces may be re-split. */
  readonly resplitAces: boolean;
  /** Whether split aces receive only one card each. */
  readonly oneCardToSplitAces: boolean;
  /** Dealer checks for blackjack on a ten or ace upcard before players act. */
  readonly dealerPeek: boolean;
  /** Fraction of the shoe dealt before the cut card, 0–1. */
  readonly penetration: number;
  readonly minBet: number;
  readonly maxBet: number;
}

/**
 * A common Las Vegas six-deck shoe game. Deliberately not the most player-favourable
 * set — the default should look like a table you would actually sit at.
 */
export const DEFAULT_RULES: RuleSet = {
  decks: 6,
  dealerSoft17: "hit",
  blackjackPayout: "3:2",
  doubleAfterSplit: true,
  doubleRule: "any",
  surrender: "late",
  maxSplitHands: 4,
  resplitAces: false,
  oneCardToSplitAces: true,
  dealerPeek: true,
  penetration: 0.75,
  minBet: 10,
  maxBet: 1000,
};

/** Returns the reasons a rule set is invalid, or an empty array if it is sound. */
export function validateRules(rules: RuleSet): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(rules.decks) || rules.decks < 1 || rules.decks > 8) {
    problems.push("decks must be an integer from 1 to 8");
  }
  if (rules.penetration <= 0 || rules.penetration > 1) {
    problems.push("penetration must be greater than 0 and at most 1");
  }
  if (!Number.isInteger(rules.maxSplitHands) || rules.maxSplitHands < 1) {
    problems.push("maxSplitHands must be a positive integer");
  }
  if (rules.minBet <= 0) problems.push("minBet must be positive");
  if (rules.maxBet < rules.minBet) problems.push("maxBet must be at least minBet");
  return problems;
}

/**
 * A one-line summary of the table, in the shorthand a player would recognise.
 *
 * Every rule that moves a Basic Strategy cell appears here, because two tables that play
 * differently must not read identically — a no-hole-card game and a peeked one shift four
 * cells between them. Rules at their common value are left out to keep the line short:
 * their absence is the information.
 */
export function describeRules(rules: RuleSet): string {
  const parts = [
    `${rules.decks}D`,
    rules.dealerSoft17 === "stand" ? "S17" : "H17",
    rules.blackjackPayout,
    rules.doubleAfterSplit ? "DAS" : "NDAS",
  ];

  if (rules.doubleRule !== "any") parts.push(`D${rules.doubleRule}`);
  if (rules.surrender !== "none") parts.push(rules.surrender === "early" ? "ES" : "LS");
  if (!rules.dealerPeek) parts.push("NHC");
  if (rules.resplitAces) parts.push("RSA");
  if (!rules.oneCardToSplitAces) parts.push("DSA");
  if (rules.maxSplitHands !== 4) parts.push(`SP${rules.maxSplitHands}`);

  parts.push(`${Math.round(rules.penetration * 100)}% pen`);
  return parts.join(" · ");
}
