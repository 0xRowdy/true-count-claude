/**
 * Published Basic Strategy reference tables — test fixture data, not engine code.
 *
 * Invariant 4 (CONTEXT.md) says CI asserts the whole chart against reference tables for
 * every Rule Set permutation. These are those tables: transcribed by hand from published
 * sources, independently of `strategy.ts`, so that `strategy.test.ts` compares the
 * generated chart against something the generator did not produce.
 *
 * ## Sources
 *
 * Each table below is the intersection of two long-standing public references that agree
 * with one another cell for cell. Anything a future reader wants to re-verify can be
 * re-verified from either:
 *
 *  1. **Wizard of Odds — "Blackjack Basic Strategy"**, charts and text-form rules for
 *     1 deck, 2 decks, and 4-8 decks, plus the dedicated surrender page.
 *     https://wizardofodds.com/games/blackjack/strategy/4-decks/
 *     https://wizardofodds.com/games/blackjack/strategy/2-decks/
 *     https://wizardofodds.com/games/blackjack/strategy/1-deck/
 *     https://wizardofodds.com/games/blackjack/surrender/
 *  2. **BlackjackInfo — Basic Strategy Engine** (Kenneth R Smith), which generates a
 *     chart for an arbitrary rule set.
 *     https://www.blackjackinfo.com/blackjack-basic-strategy-engine/
 *
 * Two Wizard of Odds rules worth quoting, because they are the cells competitors get
 * wrong and the ones this file is most load-bearing about:
 *
 *  - 4-8 decks, dealer stands on soft 17: *"Surrender hard 16 (but not a pair of 8s) vs.
 *    dealer 9, 10, or A, and hard 15 vs. dealer 10."* and *"Split 9s against a dealer 2-6
 *    or 8-9."*
 *  - Dealer hits on soft 17, on top of the above: *"Surrender 15, a pair of 8s, and 17 vs.
 *    dealer A. Double 11 vs. dealer A. Double soft 18 vs. dealer 2. Double soft 19 vs.
 *    dealer 6."*
 *
 * ## Notation
 *
 * Ten cells per row, in printed-chart column order: dealer 2,3,4,5,6,7,8,9,10,A.
 *
 * | Symbol | Meaning |
 * | --- | --- |
 * | `H` | hit |
 * | `S` | stand |
 * | `D` | double, else hit |
 * | `d` | double, else stand (printed "Ds") |
 * | `P` | split |
 * | `R` | surrender, else hit (printed "Rh") |
 * | `r` | surrender, else stand (printed "Rs") |
 * | `p` | surrender, else split (printed "Rp") |
 */

import { DEFAULT_RULES, type RuleSet } from "./rules";

export interface ReferenceChart {
  /** The table shorthand a player would recognise, e.g. "6D H17 DAS LS". */
  readonly name: string;
  readonly rules: RuleSet;
  /** Keyed by hard total. 18 stands in for the published "17+" / "18+" row. */
  readonly hard: Readonly<Record<number, string>>;
  /** Keyed by soft total: 13 is the published "A,2" row, 20 is "A,9". */
  readonly soft: Readonly<Record<number, string>>;
  /** Keyed by pair rank, as the published rows "2,2" ... "A,A". */
  readonly pairs: Readonly<Record<string, string>>;
}

/**
 * Six decks, dealer hits soft 17, double any two cards, DAS, late surrender, dealer peeks.
 * The most common shoe game on the Las Vegas Strip, and `DEFAULT_RULES`.
 */
export const SIX_DECK_H17_DAS_LS: ReferenceChart = {
  name: "6D H17 DAS LS",
  rules: DEFAULT_RULES,
  hard: {
    //    2  3  4  5  6  7  8  9  10 A
    5: "HHHHHHHHHH",
    6: "HHHHHHHHHH",
    7: "HHHHHHHHHH",
    8: "HHHHHHHHHH",
    9: "HDDDDHHHHH",
    10: "DDDDDDDDHH",
    11: "DDDDDDDDDD",
    12: "HHSSSHHHHH",
    13: "SSSSSHHHHH",
    14: "SSSSSHHHHH",
    15: "SSSSSHHHRR",
    16: "SSSSSHHRRR",
    17: "SSSSSSSSSr",
    18: "SSSSSSSSSS",
  },
  soft: {
    //     2  3  4  5  6  7  8  9  10 A
    13: "HHHDDHHHHH", // A,2
    14: "HHHDDHHHHH", // A,3
    15: "HHDDDHHHHH", // A,4
    16: "HHDDDHHHHH", // A,5
    17: "HDDDDHHHHH", // A,6
    18: "dddddSSHHH", // A,7
    19: "SSSSdSSSSS", // A,8
    20: "SSSSSSSSSS", // A,9
  },
  pairs: {
    //         2  3  4  5  6  7  8  9  10 A
    "2": "PPPPPPHHHH",
    "3": "PPPPPPHHHH",
    "4": "HHHPPHHHHH",
    "5": "DDDDDDDDHH",
    "6": "PPPPPHHHHH",
    "7": "PPPPPPHHHH",
    "8": "PPPPPPPPPp",
    "9": "PPPPPSPPSS",
    "10": "SSSSSSSSSS",
    A: "PPPPPPPPPP",
  },
};

/**
 * Six decks, dealer stands on soft 17, double any two cards, DAS, late surrender.
 * Differs from the H17 table in exactly six cells: hard 11 vs A, hard 15 vs A, hard 17
 * vs A, soft 18 vs 2, soft 19 vs 6, and 8,8 vs A.
 */
export const SIX_DECK_S17_DAS_LS: ReferenceChart = {
  name: "6D S17 DAS LS",
  rules: { ...DEFAULT_RULES, dealerSoft17: "stand" },
  hard: {
    //    2  3  4  5  6  7  8  9  10 A
    5: "HHHHHHHHHH",
    6: "HHHHHHHHHH",
    7: "HHHHHHHHHH",
    8: "HHHHHHHHHH",
    9: "HDDDDHHHHH",
    10: "DDDDDDDDHH",
    11: "DDDDDDDDDH",
    12: "HHSSSHHHHH",
    13: "SSSSSHHHHH",
    14: "SSSSSHHHHH",
    15: "SSSSSHHHRH",
    16: "SSSSSHHRRR",
    17: "SSSSSSSSSS",
    18: "SSSSSSSSSS",
  },
  soft: {
    //     2  3  4  5  6  7  8  9  10 A
    13: "HHHDDHHHHH", // A,2
    14: "HHHDDHHHHH", // A,3
    15: "HHDDDHHHHH", // A,4
    16: "HHDDDHHHHH", // A,5
    17: "HDDDDHHHHH", // A,6
    18: "SddddSSHHH", // A,7
    19: "SSSSSSSSSS", // A,8
    20: "SSSSSSSSSS", // A,9
  },
  pairs: {
    //         2  3  4  5  6  7  8  9  10 A
    "2": "PPPPPPHHHH",
    "3": "PPPPPPHHHH",
    "4": "HHHPPHHHHH",
    "5": "DDDDDDDDHH",
    "6": "PPPPPHHHHH",
    "7": "PPPPPPHHHH",
    "8": "PPPPPPPPPP",
    "9": "PPPPPSPPSS",
    "10": "SSSSSSSSSS",
    A: "PPPPPPPPPP",
  },
};

/**
 * Two decks, dealer hits soft 17, double any two cards, DAS, no surrender.
 * The short shoe moves hard 9 vs 2, soft 14 vs 4, 6,6 vs 7 and 7,7 vs 8.
 */
export const TWO_DECK_H17_DAS: ReferenceChart = {
  name: "2D H17 DAS",
  rules: { ...DEFAULT_RULES, decks: 2, surrender: "none" },
  hard: {
    //    2  3  4  5  6  7  8  9  10 A
    5: "HHHHHHHHHH",
    6: "HHHHHHHHHH",
    7: "HHHHHHHHHH",
    8: "HHHHHHHHHH",
    9: "DDDDDHHHHH",
    10: "DDDDDDDDHH",
    11: "DDDDDDDDDD",
    12: "HHSSSHHHHH",
    13: "SSSSSHHHHH",
    14: "SSSSSHHHHH",
    15: "SSSSSHHHHH",
    16: "SSSSSHHHHH",
    17: "SSSSSSSSSS",
    18: "SSSSSSSSSS",
  },
  soft: {
    //     2  3  4  5  6  7  8  9  10 A
    13: "HHHDDHHHHH", // A,2
    14: "HHDDDHHHHH", // A,3
    15: "HHDDDHHHHH", // A,4
    16: "HHDDDHHHHH", // A,5
    17: "HDDDDHHHHH", // A,6
    18: "dddddSSHHH", // A,7
    19: "SSSSdSSSSS", // A,8
    20: "SSSSSSSSSS", // A,9
  },
  pairs: {
    //         2  3  4  5  6  7  8  9  10 A
    "2": "PPPPPPHHHH",
    "3": "PPPPPPHHHH",
    "4": "HHHPPHHHHH",
    "5": "DDDDDDDDHH",
    "6": "PPPPPPHHHH",
    "7": "PPPPPPPHHH",
    "8": "PPPPPPPPPP",
    "9": "PPPPPSPPSS",
    "10": "SSSSSSSSSS",
    A: "PPPPPPPPPP",
  },
};

/**
 * Single deck, dealer stands on soft 17, double any two cards, DAS, no surrender.
 * The single-deck specials all show up here: hard 8 doubles vs 5-6, soft 17 doubles vs 2,
 * soft 18 stands vs an ace, soft 19 doubles vs 6, 3,3 splits vs 8, and 7,7 stands vs 10.
 */
export const ONE_DECK_S17_DAS: ReferenceChart = {
  name: "1D S17 DAS",
  rules: { ...DEFAULT_RULES, decks: 1, dealerSoft17: "stand", surrender: "none" },
  hard: {
    //    2  3  4  5  6  7  8  9  10 A
    5: "HHHHHHHHHH",
    6: "HHHHHHHHHH",
    7: "HHHHHHHHHH",
    8: "HHHDDHHHHH",
    9: "DDDDDHHHHH",
    10: "DDDDDDDDHH",
    11: "DDDDDDDDDD",
    12: "HHSSSHHHHH",
    13: "SSSSSHHHHH",
    14: "SSSSSHHHHH",
    15: "SSSSSHHHHH",
    16: "SSSSSHHHHH",
    17: "SSSSSSSSSS",
    18: "SSSSSSSSSS",
  },
  soft: {
    //     2  3  4  5  6  7  8  9  10 A
    13: "HHDDDHHHHH", // A,2
    14: "HHDDDHHHHH", // A,3
    15: "HHDDDHHHHH", // A,4
    16: "HHDDDHHHHH", // A,5
    17: "DDDDDHHHHH", // A,6
    18: "SddddSSHHS", // A,7
    19: "SSSSdSSSSS", // A,8
    20: "SSSSSSSSSS", // A,9
  },
  pairs: {
    //         2  3  4  5  6  7  8  9  10 A
    "2": "PPPPPPHHHH",
    "3": "PPPPPPPHHH",
    "4": "HHPPPHHHHH",
    "5": "DDDDDDDDHH",
    "6": "PPPPPPHHHH",
    "7": "PPPPPPPHSH",
    "8": "PPPPPPPPPP",
    "9": "PPPPPSPPSS",
    "10": "SSSSSSSSSS",
    A: "PPPPPPPPPP",
  },
};

export const REFERENCE_CHARTS: readonly ReferenceChart[] = [
  SIX_DECK_H17_DAS_LS,
  SIX_DECK_S17_DAS_LS,
  TWO_DECK_H17_DAS,
  ONE_DECK_S17_DAS,
];
