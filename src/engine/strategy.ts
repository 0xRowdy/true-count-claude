/**
 * Basic Strategy — the count-independent optimal play for a Rule Set.
 *
 * Invariant 4 (CONTEXT.md): the strategy engine is auditable. Two things follow from
 * that, and they shape this whole module.
 *
 * First, `strategyChart` returns the entire hard / soft / pairs chart *as data*, not just
 * a verdict, so the Explanation surface can render the chart and highlight the governing
 * cell (ADR-0005). `governingCell` names that cell for any hand, and `basicStrategy` is a
 * thin read of its `action`.
 *
 * Second, every cell is derived from published reference tables rather than from a
 * hand-rolled expected-value search, and `strategy.reference.ts` asserts the generated
 * charts back against those tables cell by cell. The rule-by-rule derivations below are
 * the two long-standing public sources that agree with each other:
 *
 *   - Wizard of Odds, "Blackjack Basic Strategy" (4-8 / 2 / 1 deck charts plus the
 *     text-form rules and the surrender page). https://wizardofodds.com/games/blackjack/
 *   - BlackjackInfo Basic Strategy Engine (Kenneth R Smith), which generates a chart per
 *     rule set. https://www.blackjackinfo.com/blackjack-basic-strategy-engine/
 *
 * Where a cell is a rule-driven exception rather than the obvious play, the comment on
 * that row says which rule moves it. A reader with the published chart in the other hand
 * should be able to walk this file top to bottom and check every entry.
 */

import { type Card, rankValue } from "./cards";
import {
  type Action,
  type Hand,
  evaluate,
  isSplittablePair,
  legalActions,
} from "./hand";
import type { RuleSet } from "./rules";

/** A dealer upcard as a chart column. 11 is an ace; all ten-ranks are 10. */
export type DealerUpcard = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Chart columns in published order. Every `ChartRow` is indexed by these. */
export const DEALER_UPCARDS: readonly DealerUpcard[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function upcardOf(card: Card): DealerUpcard {
  return rankValue(card.rank) as DealerUpcard;
}

/**
 * What a chart cell prescribes, in the notation published tables use.
 *
 * The composite codes exist because a chart row is a *total*, and a total can arrive on
 * three cards or on a hand the rules have already restricted — at which point doubling,
 * splitting, and surrendering are no longer legal and the cell needs a second choice.
 * `resolve` applies that fallback against `legalActions`. The single-choice codes carry
 * no published alternative, so `resolve` backstops those too — which together is why
 * `basicStrategy` can never name an action the player may not take.
 */
export type ChartCode =
  /** Hit. */
  | "H"
  /** Stand. */
  | "S"
  /** Double, else hit. */
  | "D"
  /** Double, else stand. */
  | "Ds"
  /** Split. */
  | "P"
  /** Surrender, else hit. */
  | "Rh"
  /** Surrender, else stand. */
  | "Rs"
  /** Surrender, else split. */
  | "Rp";

/** Hard totals a player can hold. 4 is an unsplittable 2,2; above 21 the hand has busted. */
export type HardTotal = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;

/** Soft totals a player can hold. 12 is an unsplittable A,A; 21 is a soft 21. */
export type SoftTotal = 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;

/** The rank a pair is made of. All ten-ranks pair as "10". */
export type PairRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

export const PAIR_RANKS: readonly PairRank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

export type ChartRow = Readonly<Record<DealerUpcard, ChartCode>>;

/**
 * The full chart for one Rule Set. Published tables print hard 5 through "17+", soft A,2
 * through A,9, and the ten pairs; the extra rows here (hard 4, hard 18-21, soft 12 and
 * soft 21) exist so that a lookup can never miss, and they are all trivially stand or hit.
 */
export interface StrategyChart {
  readonly rules: RuleSet;
  readonly hard: Readonly<Record<HardTotal, ChartRow>>;
  readonly soft: Readonly<Record<SoftTotal, ChartRow>>;
  readonly pairs: Readonly<Record<PairRank, ChartRow>>;
}

/** Which of the three charts a decision came from. */
export type ChartSection = "hard" | "soft" | "pairs";

/** The chart cell behind one Decision — the payload the Explanation panel highlights. */
export interface GoverningCell {
  /** The play, already reconciled with `legalActions`. */
  readonly action: Action;
  readonly section: ChartSection;
  /** The row as published tables label it: "16", "A,7", "8,8". */
  readonly row: string;
  readonly upcard: DealerUpcard;
  readonly code: ChartCode;
  /**
   * True when the cell's first choice was not legal for this hand and its published
   * fallback was used — doubling a three-card total, or surrendering after a split.
   */
  readonly usedFallback: boolean;
}

/** Everything `legalActions` needs that a hand does not carry itself. */
export interface StrategyContext {
  /** How many hands the player currently holds, for the resplit limit. Defaults to 1. */
  readonly handCount?: number;
  /** Defaults to unlimited, so a chart lookup is not quietly changed by a short bankroll. */
  readonly bankroll?: number;
}

// ---------------------------------------------------------------------------
// Chart generation
// ---------------------------------------------------------------------------

const SYMBOLS: Readonly<Record<string, ChartCode>> = {
  H: "H",
  S: "S",
  D: "D",
  d: "Ds",
  P: "P",
  R: "Rh",
  r: "Rs",
  p: "Rp",
};

/**
 * Ten cells in published column order — 2,3,4,5,6,7,8,9,10,A — written the way a printed
 * chart reads. Lower case marks the "stand"/"split" fallbacks: `d` is Ds, `r` is Rs,
 * `p` is Rp.
 */
function row(cells: string): ChartRow {
  if (cells.length !== DEALER_UPCARDS.length) {
    throw new Error(`strategy chart row must have ${DEALER_UPCARDS.length} cells: "${cells}"`);
  }
  const built = {} as Record<DealerUpcard, ChartCode>;
  DEALER_UPCARDS.forEach((upcard, index) => {
    const code = SYMBOLS[cells[index] ?? ""];
    if (!code) throw new Error(`unknown strategy symbol "${cells[index]}" in "${cells}"`);
    built[upcard] = code;
  });
  return built;
}

const ALL_STAND = "SSSSSSSSSS";
const ALL_HIT = "HHHHHHHHHH";

/**
 * Generates the Basic Strategy chart for a Rule Set.
 *
 * Pure and cheap — no memoisation here, because callers that need it (the Explanation
 * path, per ADR-0002) can cache on the Rule Set themselves.
 */
export function strategyChart(rules: RuleSet): StrategyChart {
  const decks = rules.decks;
  const single = decks === 1;
  const singleOrDouble = decks <= 2;
  const h17 = rules.dealerSoft17 === "hit";
  const peek = rules.dealerPeek;
  const das = rules.doubleAfterSplit;
  /** Doubling is unrestricted, so soft hands and low hard totals may be doubled. */
  const doubleAny = rules.doubleRule === "any";
  /** Hard 9 is inside the doubling range under "any" and "9-11", but not "10-11". */
  const doubleNine = rules.doubleRule !== "10-11";
  const late = rules.surrender === "late";
  const early = rules.surrender === "early";
  const surrenders = rules.surrender !== "none";

  // Hard 5-7 (and an unsplittable hard 4) are always hit; early surrender gives them up
  // against an ace, because an unpeeked dealer blackjack is still live.
  const lowHard = "HHHHHHHHH" + (early ? "R" : "H");

  const hard: Record<HardTotal, ChartRow> = {
    4: row(lowHard),
    5: row(lowHard),
    6: row(lowHard),
    7: row(lowHard),
    // Hard 8 doubles vs 5-6 in single deck only, and only with unrestricted doubling.
    8: row(
      "HHH" +
        (single && doubleAny ? "DD" : "HH") +
        "HHHH" +
        (early && singleOrDouble && h17 ? "R" : "H"),
    ),
    // Hard 9 doubles vs 3-6, and vs 2 as well in single and double deck.
    9: row(
      (singleOrDouble && doubleNine ? "D" : "H") + (doubleNine ? "DDDD" : "HHHH") + "HHHHH",
    ),
    10: row("DDDDDDDDHH"),
    // Hard 11 doubles across the board, except vs an ace in a multi-deck S17 game.
    // Without a peek the extra bet is exposed to a dealer blackjack, so 11 just hits
    // against both ten and ace.
    11: row(
      "DDDDDDDD" +
        (peek ? "D" : "H") +
        ((!h17 && decks >= 3) || !peek ? "H" : "D"),
    ),
    // The stiffs. Hard 12 is the classic exception: it hits vs 2 and 3.
    12: row("HHSSSHHHH" + (early ? "R" : "H")),
    13: row("SSSSSHHHH" + (early ? "R" : "H")),
    14: row("SSSSSHHH" + (early && !single ? "R" : "H") + (early ? "R" : "H")),
    // Hard 15 surrenders vs 10 (late surrender, two decks or more) and vs an ace under H17.
    15: row(
      "SSSSSHHH" +
        ((late && !single) || early ? "R" : "H") +
        (early || (late && h17) ? "R" : "H"),
    ),
    // Hard 16 surrenders vs 9 only from four decks up; vs 10 and ace at every deck count.
    16: row("SSSSSHH" + (surrenders && decks > 3 ? "R" : "H") + (surrenders ? "RR" : "HH")),
    // Hard 17 surrenders vs an ace under H17 — the one place a made 17 is given up.
    17: row("SSSSSSSSS" + (late ? (h17 ? "r" : "S") : early ? "r" : "S")),
    18: row(ALL_STAND),
    19: row(ALL_STAND),
    20: row(ALL_STAND),
    21: row(ALL_STAND),
  };

  const soft: Record<SoftTotal, ChartRow> = {
    // An unsplittable A,A is soft 12 and cannot bust, so it always draws.
    12: row(ALL_HIT),
    // Soft 13-14 double vs 5-6; single deck adds 4, and double-deck H17 adds 4 for A,3.
    13: row("HH" + (doubleAny && single ? "D" : "H") + (doubleAny ? "DD" : "HH") + "HHHHH"),
    14: row(
      "HH" +
        (doubleAny && (single || (decks === 2 && h17)) ? "D" : "H") +
        (doubleAny ? "DD" : "HH") +
        "HHHHH",
    ),
    // Soft 15-16 double vs 4-6.
    15: row("HH" + (doubleAny ? "DDD" : "HHH") + "HHHHH"),
    16: row("HH" + (doubleAny ? "DDD" : "HHH") + "HHHHH"),
    // Soft 17 doubles vs 3-6, and vs 2 as well in single deck.
    17: row((doubleAny && single ? "D" : "H") + (doubleAny ? "DDDD" : "HHHH") + "HHHHH"),
    // Soft 18 is the cell competitors get wrong: it is *not* a stand against 9, 10 or an
    // ace. It doubles-or-stands vs 3-6, stands vs 2 (vs 2 it doubles under multi-deck
    // H17), stands vs 7-8, and hits vs 9-A — the single exception being single-deck S17,
    // where soft 18 stands against an ace.
    18: row(
      (doubleAny && !single && h17 ? "d" : "S") +
        (doubleAny ? "dddd" : "SSSS") +
        "SSHH" +
        (single && !h17 ? "S" : "H"),
    ),
    // Soft 19 doubles vs 6 under H17, and in single-deck S17.
    19: row("SSSS" + (doubleAny && (single || h17) ? "d" : "S") + "SSSSS"),
    20: row(ALL_STAND),
    21: row(ALL_STAND),
  };

  // 8,8 vs 10 and vs an ace is the most rule-sensitive cell on the chart, so it is built
  // in the open. With a peek it splits, except that H17 late surrender gives it up
  // against an ace from three decks (or two without DAS) upward; without a peek the
  // split money is exposed to a dealer blackjack, so it surrenders or hits instead.
  let eights = "PPPPPPPP";
  eights += peek ? (early ? (single && das ? "P" : "p") : "P") : surrenders ? "R" : "H";
  if (!surrenders) eights += peek ? "P" : "H";
  else if (early) eights += peek ? "p" : "R";
  else if (!peek) eights += "R";
  else eights += !h17 || single || (decks === 2 && das) ? "P" : "p";

  const pairs: Record<PairRank, ChartRow> = {
    // Always split aces — two hands starting at 11 beat one soft 12. Without a peek the
    // second bet is exposed to a dealer blackjack, so A,A hits instead.
    A: row("PPPPPPPPP" + (peek ? "P" : "H")),
    // 2,2 and 3,3 split vs 4-7, and vs 2-3 as well with DAS.
    "2": row(
      (das ? "P" : "H") +
        (das || single ? "P" : "H") +
        "PPPP" +
        "HHH" +
        (early && (single || h17) ? "R" : "H"),
    ),
    "3": row((das ? "PP" : "HH") + "PPPP" + (das && single ? "P" : "H") + "HH" + (early ? "R" : "H")),
    // 4,4 splits only with DAS, vs 5-6 (single deck adds 4). Without DAS it is hard 8.
    "4": row(
      "HH" +
        (das && single ? "P" : "H") +
        (das ? "PP" : single && doubleAny ? "DD" : "HH") +
        "HHHH" +
        (early && single && h17 ? "R" : "H"),
    ),
    // Never split 5s — a pair of 5s is hard 10 and wants the double.
    "5": row("DDDDDDDDHH"),
    // 6,6 splits vs 3-6, plus vs 2 with DAS or a short shoe, plus vs 7 in single/double
    // deck with DAS.
    "6": row(
      (singleOrDouble || das ? "P" : "H") +
        "PPPP" +
        (singleOrDouble && das ? "P" : "H") +
        "HHH" +
        (early ? "R" : "H"),
    ),
    // 7,7 splits vs 2-7 (vs 8 too in single/double deck with DAS). Against a 10 in single
    // deck it stands: two of the four 7s are already in the player's hand.
    "7": row(
      "PPPPPP" +
        (singleOrDouble && das ? "P" : "H") +
        "H" +
        (single ? (surrenders ? "r" : "S") : early ? "R" : "H") +
        (early || (late && h17 && single) ? "R" : "H"),
    ),
    "8": row(eights),
    // 9,9 is the other cell competitors get wrong: it is *not* "always stand". It splits
    // vs 2-6 and vs 8-9, and stands only vs 7, 10 and ace.
    "9": row("PPPPPSPPS" + (single && das && h17 && peek ? "P" : "S")),
    // Never split tens.
    "10": row(ALL_STAND),
  };

  return { rules, hard, soft, pairs };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * The chart cell that governs this Decision, together with the play it resolves to.
 *
 * This is the payload behind "show me the cell" in the Explanation panel (ADR-0005):
 * `section` and `row` locate the cell, `code` is what the printed chart says there, and
 * `action` is what that means once `legalActions` has had its say.
 */
export function governingCell(
  hand: Hand,
  dealerUpcard: Card,
  rules: RuleSet,
  context: StrategyContext = {},
): GoverningCell {
  const chart = strategyChart(rules);
  const upcard = upcardOf(dealerUpcard);
  const legal = legalActions({
    hand,
    rules,
    handCount: context.handCount ?? 1,
    bankroll: context.bankroll ?? Number.POSITIVE_INFINITY,
  });

  // The pairs chart only applies while splitting is actually on the table. At the resplit
  // limit, or on a short bankroll, published charts say to read the pair as its total —
  // which is exactly what falling through to the hard/soft rows does.
  if (isSplittablePair(hand) && legal.includes("split")) {
    const rank = pairRankOf(hand);
    const code = chart.pairs[rank][upcard];
    return { ...resolve(code, legal), section: "pairs", row: `${rank},${rank}`, upcard, code };
  }

  const value = evaluate(hand.cards);
  if (value.soft) {
    const total = clamp(value.total, 12, 21) as SoftTotal;
    const code = chart.soft[total][upcard];
    return { ...resolve(code, legal), section: "soft", row: softRowLabel(total), upcard, code };
  }

  const total = clamp(value.total, 4, 21) as HardTotal;
  const code = chart.hard[total][upcard];
  return { ...resolve(code, legal), section: "hard", row: String(total), upcard, code };
}

/**
 * The correct Basic Strategy play for this hand against this upcard under these rules.
 *
 * The returned action is always one `legalActions` offers. The one exception is a hand
 * with no legal actions at all — busted, a natural, or a split ace that has taken its one
 * card — where there is nothing left to decide and the result is `"stand"`.
 */
export function basicStrategy(
  hand: Hand,
  dealerUpcard: Card,
  rules: RuleSet,
  context: StrategyContext = {},
): Action {
  return governingCell(hand, dealerUpcard, rules, context).action;
}

/**
 * Each cell code as the sequence of plays it names, best first.
 *
 * This is just the published notation spelled out: `Ds` is "double, else stand", so it
 * reads `["double", "stand"]`. The single-choice codes are one-element chains — a printed
 * `H` offers no alternative, which is the whole reason `resolve` needs a floor beneath
 * these chains as well.
 */
const FALLBACK_CHAINS: Readonly<Record<ChartCode, readonly Action[]>> = {
  H: ["hit"],
  S: ["stand"],
  D: ["double", "hit"],
  Ds: ["double", "stand"],
  P: ["split"],
  Rh: ["surrender", "hit"],
  Rs: ["surrender", "stand"],
  Rp: ["surrender", "split"],
};

/**
 * The play to take when a cell's own chain names nothing the hand may do.
 *
 * Standing first is not an arbitrary tie-break: every chain that runs out does so because
 * the rules have taken plays off the table, and the passive play is the only one that
 * cannot commit money the published cell was not asking to commit. Hitting comes next
 * because it is the other no-extra-bet action; the wagering plays are last and are only
 * ever reached when nothing else is on offer.
 */
const LAST_RESORT: readonly Action[] = ["stand", "hit", "split", "double", "surrender"];

/**
 * Turns a chart cell into the play the player may actually make.
 *
 * Invariant 7 (CONTEXT.md): `legalActions` is the single source of truth for what is on
 * offer, so this function never returns anything outside it. A printed cell can name a
 * play the hand has lost — a three-card total cannot double, a split hand cannot
 * surrender — and the composite codes carry the published second choice for exactly that.
 *
 * The chains are not enough on their own, though. A rule set can strip *every* play a
 * cell names: a no-peek table publishes `"H"` for A,A vs an ace, and under `resplitAces`
 * with `oneCardToSplitAces` a split ace holding a second ace may only stand or split
 * (#17). `H` has no published fallback, so the chain runs dry and `LAST_RESORT` takes
 * over. The chart cell is still reported unchanged — `usedFallback` is what tells the
 * Explanation panel the printed play was not available (ADR-0005).
 */
function resolve(
  code: ChartCode,
  legal: readonly Action[],
): { action: Action; usedFallback: boolean } {
  // A hand with no legal actions is already resolved — busted, a natural, or a split ace
  // that has taken its one card. The cell is still reported so the Explanation panel has
  // something to highlight, but the play is the no-op.
  if (legal.length === 0) return { action: "stand", usedFallback: code !== "S" };

  const chain = FALLBACK_CHAINS[code];
  for (const [index, action] of chain.entries()) {
    if (legal.includes(action)) return { action, usedFallback: index > 0 };
  }

  for (const action of LAST_RESORT) {
    if (legal.includes(action)) return { action, usedFallback: true };
  }

  // Unreachable: `legal` is non-empty here and `LAST_RESORT` lists every `Action`.
  return { action: "stand", usedFallback: true };
}

function pairRankOf(hand: Hand): PairRank {
  const value = rankValue(hand.cards[0]?.rank ?? "2");
  if (value === 11) return "A";
  return String(value) as PairRank;
}

/** Published tables label soft rows by the non-ace card: soft 18 is "A,7". */
function softRowLabel(total: SoftTotal): string {
  if (total >= 13 && total <= 20) return `A,${total - 11}`;
  return `soft ${total}`;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
