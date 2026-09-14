/**
 * Preset tables — the real games, in one tap.
 *
 * "No customization" is 12% of category low-star reviews, but a screen with thirteen
 * controls is its own kind of failure: a user who knows they play the double-decker at the
 * El Cortez should not have to know what "one card to split aces" means before they can
 * train for it. The presets carry that knowledge so they do not have to.
 *
 * Each preset is a real game, not a rounded-off idea of one, and each says out loud what
 * makes it interesting. `presets.test.ts` asserts that every one of them is valid per
 * `validateRules` and that its house edge lands where the published figure for that game
 * says it should — which is also a check on `houseEdge.ts` from the outside.
 *
 * Penetration and table limits are the one part of a preset that is a reasonable
 * representative rather than a fact: they vary table to table and shift shift. They are
 * there so a preset lands the user on a complete, playable table, and they are the first
 * two things a user should change once they know their own.
 */

import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";

export interface RulePreset {
  readonly id: string;
  /** The game as a player would name it. */
  readonly name: string;
  /** Where it is dealt, in four or five words. */
  readonly where: string;
  /** What this table teaches or costs — the reason it is on the list. */
  readonly note: string;
  readonly rules: RuleSet;
}

export const RULE_PRESETS: readonly RulePreset[] = [
  {
    id: "vegas-6d-h17",
    name: "Vegas 6-deck H17",
    where: "The Strip, most tables",
    note: "The default American shoe game. If you have not checked, this is probably what you are playing.",
    // Deliberately identical to `DEFAULT_RULES`, asserted in `presets.test.ts`: a user who
    // has changed nothing should see their table named rather than shown as "no match".
    rules: DEFAULT_RULES,
  },
  {
    id: "vegas-6d-s17",
    name: "Vegas 6-deck S17",
    where: "Higher-limit pits",
    note: "The same game with the dealer standing on soft 17. One rule, a fifth of a percent, usually a higher minimum.",
    rules: {
      decks: 6,
      dealerSoft17: "stand",
      blackjackPayout: "3:2",
      doubleAfterSplit: true,
      doubleRule: "any",
      surrender: "late",
      maxSplitHands: 4,
      resplitAces: true,
      oneCardToSplitAces: true,
      dealerPeek: true,
      penetration: 0.75,
      minBet: 100,
      maxBet: 5000,
    },
  },
  {
    id: "downtown-2d-h17",
    name: "Downtown double deck",
    where: "Downtown Las Vegas, Reno",
    note: "Two decks, hand-shuffled, low minimums. Fewer decks means a faster-moving count — the classic counter's game.",
    rules: {
      decks: 2,
      dealerSoft17: "hit",
      blackjackPayout: "3:2",
      doubleAfterSplit: true,
      doubleRule: "any",
      surrender: "none",
      maxSplitHands: 4,
      resplitAces: false,
      oneCardToSplitAces: true,
      dealerPeek: true,
      penetration: 0.7,
      minBet: 10,
      maxBet: 1000,
    },
  },
  {
    id: "single-deck-6-5",
    name: "Single deck 6:5",
    where: "Everywhere, unfortunately",
    note: "Marketed as a single-deck game, which sounds generous. The 6:5 payout costs more than every other rule on this screen combined. Set it and watch the number.",
    rules: {
      decks: 1,
      dealerSoft17: "hit",
      blackjackPayout: "6:5",
      doubleAfterSplit: false,
      doubleRule: "any",
      surrender: "none",
      maxSplitHands: 2,
      resplitAces: false,
      oneCardToSplitAces: true,
      dealerPeek: true,
      penetration: 0.6,
      minBet: 10,
      maxBet: 500,
    },
  },
  {
    id: "single-deck-classic",
    name: "Single deck 3:2",
    where: "Rare, and worth travelling for",
    note: "Single deck paying 3:2 with the dealer standing on soft 17. Basic strategy alone is ahead of the house here before a single card is counted.",
    rules: {
      decks: 1,
      dealerSoft17: "stand",
      blackjackPayout: "3:2",
      doubleAfterSplit: true,
      doubleRule: "any",
      surrender: "none",
      maxSplitHands: 4,
      resplitAces: false,
      oneCardToSplitAces: true,
      dealerPeek: true,
      penetration: 0.65,
      minBet: 25,
      maxBet: 1000,
    },
  },
  {
    id: "atlantic-city-8d",
    name: "Atlantic City 8-deck",
    where: "New Jersey boardwalk",
    note: "Eight decks and late surrender, dealer stands on soft 17. Deep shoes, slow count, but the rules themselves are good.",
    rules: {
      decks: 8,
      dealerSoft17: "stand",
      blackjackPayout: "3:2",
      doubleAfterSplit: true,
      doubleRule: "any",
      surrender: "late",
      maxSplitHands: 4,
      resplitAces: false,
      oneCardToSplitAces: true,
      dealerPeek: true,
      penetration: 0.8,
      minBet: 15,
      maxBet: 2000,
    },
  },
  {
    id: "european-no-hole-card",
    name: "European no hole card",
    where: "Most of Europe, much of Asia",
    note: "The dealer takes no hole card, so a double or a split is exposed to a dealer blackjack. Watch hard 11, A,A and 8,8 move on the chart when you turn the peek off.",
    rules: {
      decks: 6,
      dealerSoft17: "stand",
      blackjackPayout: "3:2",
      doubleAfterSplit: true,
      doubleRule: "9-11",
      surrender: "none",
      maxSplitHands: 4,
      resplitAces: false,
      oneCardToSplitAces: true,
      dealerPeek: false,
      penetration: 0.75,
      minBet: 10,
      maxBet: 1000,
    },
  },
];

/** Deep equality on the thirteen fields, so the screen can mark the active preset. */
export function sameRules(a: RuleSet, b: RuleSet): boolean {
  return (
    a.decks === b.decks &&
    a.dealerSoft17 === b.dealerSoft17 &&
    a.blackjackPayout === b.blackjackPayout &&
    a.doubleAfterSplit === b.doubleAfterSplit &&
    a.doubleRule === b.doubleRule &&
    a.surrender === b.surrender &&
    a.maxSplitHands === b.maxSplitHands &&
    a.resplitAces === b.resplitAces &&
    a.oneCardToSplitAces === b.oneCardToSplitAces &&
    a.dealerPeek === b.dealerPeek &&
    a.penetration === b.penetration &&
    a.minBet === b.minBet &&
    a.maxBet === b.maxBet
  );
}

/**
 * The preset a Rule Set currently matches, if any.
 *
 * Exact match only. A near-match reported as a match would tell the user they are training
 * for the Strip game when they are training for something else.
 */
export function matchingPreset(rules: RuleSet): RulePreset | undefined {
  return RULE_PRESETS.find((preset) => sameRules(preset.rules, rules));
}
