/**
 * Index Play — departures from Basic Strategy triggered when the True Count crosses an
 * index number (CONTEXT.md glossary: "Deviation / Index Play").
 *
 * The category leader ships no index play at all (`docs/research/competitive-landscape.md`).
 * Together with the six named counting systems in `counting.ts`, this file is the product's
 * wedge, so it is built the same way: **the index sets are data, the lookup is generic.**
 * A second system's indices are a new `IndexSet` in `INDEX_SETS` and nothing else — there is
 * no Hi-Lo special case anywhere below `HI_LO_INDEXES`.
 *
 * ## Sources
 *
 * The Illustrious 18 and the Fab 4 both originate with **Don Schlesinger** — the Illustrious
 * 18 first in *Blackjack Forum* (1986), both in *Blackjack Attack: Playing the Pros' Way*
 * (3rd edition), where the Fab 4 is the surrender companion to the I18. Neither set is
 * reproduced here from memory. Every number below was cross-checked against four independent
 * public transcriptions, three of which agree with each other on all 22 values:
 *
 *  1. **Wizard of Odds — "High-Low Card Counting"**, which republishes Schlesinger's two
 *     tables *with his permission*. This is the primary transcription used here.
 *     https://wizardofodds.com/games/blackjack/card-counting/high-low/
 *  2. **CountingEdge — "The Illustrious 18 Card Counting Indices"**, which gives the same
 *     two tables with the action spelled out per row and names the baseline as a six-deck
 *     S17 game with DAS and surrender.
 *     https://www.countingedge.com/blackjack-players/don-schlesinger/the-illustrious-18-card-counting-indices/
 *  3. **GamblingCalc — Blackjack Deviations Calculator**, which additionally prints the
 *     *Basic Strategy* column each index departs from — the `from` field below — and states
 *     the baseline as "the standard multi-deck Hi-Lo S17 baseline".
 *     https://gamblingcalc.com/casino/blackjack-deviations-calculator/
 *  4. **The Encyclopedia of Blackjack — "F is for the Fab 4"** (blackjackreview.com), for
 *     the attribution and the membership of the Fab 4.
 *     https://www.blackjackreview.com/wp/encyclopedia/f/
 *
 * Wizard of Odds states the boundary convention in one sentence, and it is the convention
 * this file implements: *"The player should stand/double/split if the True Count equals or
 * exceeds the Index Number, otherwise hit."*
 *
 * ## Where the sources disagree
 *
 * Invariant 4 says the math is auditable. Silently picking a side of a disagreement is the
 * "wrong math" failure this engine exists to prevent (21% of category low-star reviews), so
 * the disagreements are recorded rather than resolved:
 *
 *  - **blackjacktrainer.fyi** (https://www.blackjacktrainer.fyi/charts/deviations) publishes a
 *    separate H17 column that differs from the three agreeing sources at four values:
 *    11 vs A (-1 rather than +1), 10 vs A (+3 rather than +4), 12 vs 6 (-3 rather than -1),
 *    and the Fab 4's 15 vs A (-1 rather than +1). Only its 11 vs A claim is corroborated
 *    elsewhere — GamblingCalc makes the same point in prose, that under H17 doubling 11 vs A
 *    *is* Basic Strategy so the index has nothing to depart from. This file ships the three
 *    agreeing sources' single-column values and relies on the `from` guard (below) to decline
 *    rather than guess when a rule set has moved the cell. The two entries that guard bites
 *    on under H17 — 11 vs A and 15 vs A — are exactly the two whose H17 values are disputed.
 *    The same source also lists a fifth surrender, 16 vs 8 at +4; no other source counts that
 *    as part of the Fab 4, and it is not included.
 *  - **casinoguardian.co.uk** (https://www.casinoguardian.co.uk/blackjack/blackjack-illustrious-18/)
 *    prints entry 8 as "12 vs. 4" and entry 15 as "12 vs. 4" again. The other three sources
 *    give entry 8 as 12 vs 2 at +3. This is a transcription error rather than a genuine
 *    disagreement, and is noted only so a future reader who finds that page is not misled.
 *
 * ## The boundary convention, stated once
 *
 * **The index is inclusive on the "at or above" side.** An entry with `direction`
 * `"at-or-above"` fires at `trueCount >= index` and not below it; an entry with `"below"`
 * fires at `trueCount < index` and not at it. 16 vs 10 has index 0, so it stands at a true
 * count of exactly 0. 13 vs 2 has index -1, so it stands at exactly -1 and hits at -2.
 * The index value itself always belongs to the "at or above" side, in both directions.
 *
 * ## Why a departure can be declined
 *
 * A published index departs from a specific Basic Strategy play. The I18's 16 vs 10 says
 * "stand instead of hitting"; in a late-surrender game Basic Strategy surrenders that hand
 * instead, and no source consulted publishes a Hi-Lo index for standing rather than
 * surrendering a two-card 16 vs 10. Rather than invent one, every entry records the play it
 * departs `from`, and a departure is indicated only when the Rule Set's actual Basic Strategy
 * play is that play. When it is not, `deviationLookup` reports
 * `"outside-published-rules"` and the player is left on Basic Strategy — which is a known
 * conservative answer rather than a guessed one. The same guard reproduces, for free, the
 * published caveat that the 16 vs 10 index does **not** apply to a pair of 8s: Basic Strategy
 * splits that hand, so the hard-16 index has nothing to depart from.
 *
 * ## What this deliberately does not do
 *
 * An index only ever fires in the one direction its published table names. Some entries are
 * printed two-sided — the Fab 4's 15 vs 10 reads "surrender at 0 or higher, otherwise hit" —
 * and in a late-surrender game Basic Strategy already surrenders that hand, so the only
 * departure left is the reverse one: hit below 0. That departure is **not** made here.
 * Applying the reverse side generally would also have the engine hitting 15 vs A at a true
 * count of 0 under H17 (where the correct index is disputed, see above) and hitting 9 vs 2 at
 * 0 in a double-deck game (where Basic Strategy already doubles and the multi-deck index does
 * not apply). Firing one direction only means the engine never names a play that contradicts
 * a value we can point at in print. The reverse-side indices are worth adding once they are
 * double-sourced per rule set; until then this file behaves like `aceSideCount` in
 * `counting.ts` and declines to invent them.
 *
 * Pure and synchronous, no I/O, no clock, no `Math.random()` (ADR-0002).
 */

import type { Card } from "./cards";
import { type Action, type Hand, evaluate, isSplittablePair, legalActions } from "./hand";
import type { CountingSystem, CountingSystemId } from "./counting";
import type { RuleSet } from "./rules";
import {
  type DealerUpcard,
  type HardTotal,
  type PairRank,
  type SoftTotal,
  type StrategyContext,
  governingCell,
  upcardOf,
} from "./strategy";

/**
 * What an index entry can prescribe. Insurance is a side bet rather than a play on the hand,
 * so it is not one of `hand.ts`'s `Action`s, but it is Illustrious 18 entry #1 and belongs in
 * the same table — see `insuranceDeviation`.
 */
export type DeviationAction = Action | "insurance" | "decline-insurance";

/** Which side of its index an entry fires on. See "The boundary convention" above. */
export type IndexDirection = "at-or-above" | "below";

/** The two published sets. Named so the Explanation panel can say which one it came from. */
export type IndexSetName = "illustrious-18" | "fab-4";

/**
 * The chart coordinate an index entry applies to, in the same terms `strategy.ts` uses so a
 * lookup lands on the same row the Explanation panel highlights. `"insurance"` has no hand.
 */
export type IndexHand =
  | { readonly kind: "hard"; readonly total: HardTotal }
  | { readonly kind: "soft"; readonly total: SoftTotal }
  | { readonly kind: "pair"; readonly rank: PairRank }
  | { readonly kind: "insurance" };

export interface IndexEntry {
  /** Stable id, in the notation published tables use: "16v10", "TTv5", "insurance". */
  readonly id: string;
  readonly set: IndexSetName;
  /** Position in the published set, which is its rank by expected gain. 1 is the best. */
  readonly rank: number;
  /** The row label a printed table uses: "16 vs 10". Shown to the user. */
  readonly label: string;
  readonly hand: IndexHand;
  /** 11 is an ace, as in `strategy.ts`. Insurance is always offered against an ace. */
  readonly upcard: DealerUpcard;
  readonly index: number;
  readonly direction: IndexDirection;
  /** The play indicated on the firing side of the index. */
  readonly deviate: DeviationAction;
  /** The Basic Strategy play this index departs from, per the published table. */
  readonly from: DeviationAction;
  /** Anything a reader checking this row against the book needs to know. */
  readonly note?: string;
}

/**
 * One counting system's index numbers. Indices are quoted against a system's own true-count
 * scale and are not transferable — Hi-Lo's +3 insurance index means nothing in Zen — so a
 * set names the system it belongs to and the lookup refuses to apply it to any other.
 */
export interface IndexSet {
  readonly system: CountingSystemId;
  readonly name: string;
  /** The game the published indices were computed against. Read with `from`, above. */
  readonly baseline: string;
  /** Where these numbers were transcribed from. Invariant 4: the math is auditable. */
  readonly source: string;
  readonly entries: readonly IndexEntry[];
}

// ---------------------------------------------------------------------------
// Hi-Lo: the Illustrious 18 and the Fab 4
// ---------------------------------------------------------------------------

const hard = (total: HardTotal): IndexHand => ({ kind: "hard", total });
const pair = (rank: PairRank): IndexHand => ({ kind: "pair", rank });

/**
 * The Illustrious 18, in published order — which is order of expected gain, so entry 1 is
 * worth more than entries 10-18 combined in most games. Read the table as Wizard of Odds
 * states it: stand / double / split at or above the index, otherwise hit.
 *
 * Entries 14-18 are the other direction: their published action *is* Basic Strategy, and the
 * departure is to hit below the index. They carry `direction: "below"` and `deviate: "hit"`
 * for that reason, and the index still belongs to the stand side — 13 vs 2 stands at exactly
 * -1 and hits at -2.
 */
const ILLUSTRIOUS_18_ENTRIES: readonly IndexEntry[] = [
  // 1. The single most valuable deviation in blackjack, and the reason insurance is in a
  //    file about playing decisions at all. Hi-Lo insures at a true count of +3 or higher;
  //    all four sources agree, with no rule-set qualifier.
  {
    id: "insurance",
    set: "illustrious-18",
    rank: 1,
    label: "Insurance",
    hand: { kind: "insurance" },
    upcard: 11,
    index: 3,
    direction: "at-or-above",
    deviate: "insurance",
    from: "decline-insurance",
    note: "Insurance is never a Basic Strategy play; it becomes +EV only once the shoe is ten-rich.",
  },
  // 2. 16 vs 10 — the most frequent index decision on the table. Published as "but not a
  //    pair of 8s"; the `from: hit` guard enforces that, since Basic Strategy splits 8,8.
  {
    id: "16v10",
    set: "illustrious-18",
    rank: 2,
    label: "16 vs 10",
    hand: hard(16),
    upcard: 10,
    index: 0,
    direction: "at-or-above",
    deviate: "stand",
    from: "hit",
    note: "Stands at exactly 0. Does not apply to 8,8, which Basic Strategy splits.",
  },
  { id: "15v10", set: "illustrious-18", rank: 3, label: "15 vs 10", hand: hard(15), upcard: 10, index: 4, direction: "at-or-above", deviate: "stand", from: "hit" },
  // 4-5. Splitting tens. Correct, and the plays most likely to attract attention at a table.
  { id: "TTv5", set: "illustrious-18", rank: 4, label: "10,10 vs 5", hand: pair("10"), upcard: 5, index: 5, direction: "at-or-above", deviate: "split", from: "stand" },
  { id: "TTv6", set: "illustrious-18", rank: 5, label: "10,10 vs 6", hand: pair("10"), upcard: 6, index: 4, direction: "at-or-above", deviate: "split", from: "stand" },
  { id: "10v10", set: "illustrious-18", rank: 6, label: "10 vs 10", hand: hard(10), upcard: 10, index: 4, direction: "at-or-above", deviate: "double", from: "hit" },
  { id: "12v3", set: "illustrious-18", rank: 7, label: "12 vs 3", hand: hard(12), upcard: 3, index: 2, direction: "at-or-above", deviate: "stand", from: "hit" },
  { id: "12v2", set: "illustrious-18", rank: 8, label: "12 vs 2", hand: hard(12), upcard: 2, index: 3, direction: "at-or-above", deviate: "stand", from: "hit" },
  // 9. Quoted against an S17 game, where Basic Strategy hits 11 vs A. Under H17 Basic
  //    Strategy already doubles, so there is nothing to depart from and the guard declines.
  //    One source puts the H17 index at -1; see "Where the sources disagree" above.
  {
    id: "11vA",
    set: "illustrious-18",
    rank: 9,
    label: "11 vs A",
    hand: hard(11),
    upcard: 11,
    index: 1,
    direction: "at-or-above",
    deviate: "double",
    from: "hit",
    note: "S17 index. Under H17 doubling 11 vs A is already Basic Strategy, so no index applies.",
  },
  { id: "9v2", set: "illustrious-18", rank: 10, label: "9 vs 2", hand: hard(9), upcard: 2, index: 1, direction: "at-or-above", deviate: "double", from: "hit" },
  {
    id: "10vA",
    set: "illustrious-18",
    rank: 11,
    label: "10 vs A",
    hand: hard(10),
    upcard: 11,
    index: 4,
    direction: "at-or-above",
    deviate: "double",
    from: "hit",
    note: "Three sources give +4 with no rule qualifier; one publishes +3 for H17. +4 shipped.",
  },
  { id: "9v7", set: "illustrious-18", rank: 12, label: "9 vs 7", hand: hard(9), upcard: 7, index: 3, direction: "at-or-above", deviate: "double", from: "hit" },
  { id: "16v9", set: "illustrious-18", rank: 13, label: "16 vs 9", hand: hard(16), upcard: 9, index: 5, direction: "at-or-above", deviate: "stand", from: "hit" },
  // 14-18. The negative half of the set: Basic Strategy stands, and the departure is to hit
  //        once the shoe has gone low-card-rich. Hitting a stiff is the deviation users most
  //        often get backwards, which is why the direction is explicit in the data.
  { id: "13v2", set: "illustrious-18", rank: 14, label: "13 vs 2", hand: hard(13), upcard: 2, index: -1, direction: "below", deviate: "hit", from: "stand" },
  { id: "12v4", set: "illustrious-18", rank: 15, label: "12 vs 4", hand: hard(12), upcard: 4, index: 0, direction: "below", deviate: "hit", from: "stand" },
  { id: "12v5", set: "illustrious-18", rank: 16, label: "12 vs 5", hand: hard(12), upcard: 5, index: -2, direction: "below", deviate: "hit", from: "stand" },
  {
    id: "12v6",
    set: "illustrious-18",
    rank: 17,
    label: "12 vs 6",
    hand: hard(12),
    upcard: 6,
    index: -1,
    direction: "below",
    deviate: "hit",
    from: "stand",
    note: "Three sources give -1 with no rule qualifier; one publishes -3 for H17. -1 shipped.",
  },
  { id: "13v3", set: "illustrious-18", rank: 18, label: "13 vs 3", hand: hard(13), upcard: 3, index: -2, direction: "below", deviate: "hit", from: "stand" },
];

/**
 * The Fab 4 — Schlesinger's four most valuable *late* surrender departures, worth more than
 * Illustrious 18 entries 10 through 18 combined when surrender is offered.
 *
 * All four depart from hitting, because the set is quoted against a chart with no surrender
 * in it. Where a Rule Set's own Basic Strategy already surrenders the hand (15 vs 10 under
 * any late-surrender game, 15 vs A under H17) there is nothing to depart from and the guard
 * declines — which is the right answer for 15 vs 10, whose index of 0 says surrender is
 * correct at the average count, and the honest answer for 15 vs A, whose H17 index is
 * disputed. See "Where the sources disagree" above.
 */
const FAB_4_ENTRIES: readonly IndexEntry[] = [
  { id: "14v10R", set: "fab-4", rank: 1, label: "14 vs 10", hand: hard(14), upcard: 10, index: 3, direction: "at-or-above", deviate: "surrender", from: "hit" },
  { id: "15v10R", set: "fab-4", rank: 2, label: "15 vs 10", hand: hard(15), upcard: 10, index: 0, direction: "at-or-above", deviate: "surrender", from: "hit" },
  { id: "15v9R", set: "fab-4", rank: 3, label: "15 vs 9", hand: hard(15), upcard: 9, index: 2, direction: "at-or-above", deviate: "surrender", from: "hit" },
  {
    id: "15vAR",
    set: "fab-4",
    rank: 4,
    label: "15 vs A",
    hand: hard(15),
    upcard: 11,
    index: 1,
    direction: "at-or-above",
    deviate: "surrender",
    from: "hit",
    note: "S17 index. Under H17 surrendering 15 vs A is already Basic Strategy; one source puts the H17 index at -1.",
  },
];

/** The Illustrious 18, as data, in published order. */
export const ILLUSTRIOUS_18: readonly IndexEntry[] = ILLUSTRIOUS_18_ENTRIES;

/** The Fab 4, as data, in published order. */
export const FAB_4: readonly IndexEntry[] = FAB_4_ENTRIES;

export const HI_LO_INDEXES: IndexSet = {
  system: "hi-lo",
  name: "Illustrious 18 + Fab 4",
  baseline:
    "Multi-deck shoe, dealer stands on soft 17, DAS. Entries 9 and 11 and the Fab 4's 15 vs A are the rule-sensitive ones.",
  source:
    "Schlesinger, Blackjack Attack (3rd ed.), as republished with permission by Wizard of Odds; cross-checked against CountingEdge and GamblingCalc",
  entries: [...ILLUSTRIOUS_18_ENTRIES, ...FAB_4_ENTRIES],
};

/**
 * Every index set the engine ships. Hi-Lo is the only system with published indices today;
 * a second system is one entry here and no change to anything below.
 */
export const INDEX_SETS: readonly IndexSet[] = [HI_LO_INDEXES];

/**
 * The index set for a counting system, or `undefined` when none has been transcribed for it.
 *
 * `undefined` rather than a Hi-Lo fallback on purpose: Hi-Lo's indices are quoted against
 * Hi-Lo's true-count scale, and lending them to Zen or Wong Halves would be exactly the
 * invented math this engine refuses to ship (see `aceSideCount` in `counting.ts`).
 */
export function getIndexSet(system: CountingSystem): IndexSet | undefined {
  return INDEX_SETS.find((set) => set.system === system.id);
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** A departure from Basic Strategy, with the index that triggered it. */
export interface Deviation {
  /** The play to make. Always an `Action` for a hand; `"insurance"` for the side bet. */
  readonly action: DeviationAction;
  /** The index number that triggered it — the Explanation panel needs this, not just the play. */
  readonly index: number;
  /** Which side of the index fired. */
  readonly direction: IndexDirection;
  /** The true count that was compared against the index. */
  readonly trueCount: number;
  /** What Basic Strategy would have said, so the Explanation can show both. */
  readonly basicStrategy: DeviationAction;
  /** The published entry, carrying its set, rank, label and any sourcing note. */
  readonly entry: IndexEntry;
  /** Ready-made prose: "stand at +0 or higher; the count is +2". */
  readonly explanation: string;
}

/** Why no departure was indicated. Every one of these is a reason worth showing a user. */
export type DeviationSkipReason =
  /** The active counting system publishes no index set. */
  | "no-index-set"
  /** No published index covers this hand against this upcard. */
  | "no-entry"
  /** An index covers it, but the count has not crossed it. */
  | "count-on-basic-side"
  /** The count has crossed it, but the Rule Set does not allow the indicated action. */
  | "action-not-legal"
  /** The Rule Set's Basic Strategy is not the play this index departs from. */
  | "outside-published-rules";

/**
 * The full result of an index lookup, including the near misses.
 *
 * Invariant 4 (auditable math) and invariant 2 (every verdict carries an Explanation) both
 * need the reasons, not just the answer: "you were right to stand, but only because the
 * count is +1 and the index is +2" is the sentence the Explanation panel wants to write.
 * `deviation` is the thin read of `.deviation`.
 */
export interface DeviationLookup {
  /** The index entry covering this hand and upcard, if the active system publishes one. */
  readonly entry: IndexEntry | null;
  /** The departure to make, or `null` when Basic Strategy stands. */
  readonly deviation: Deviation | null;
  /** Why there is no departure. `null` when there is one. */
  readonly skipped: DeviationSkipReason | null;
  /** The Basic Strategy play for this Rule Set — what a departure would depart from. */
  readonly basicStrategy: Action;
}

/**
 * The indicated departure from Basic Strategy, or `null` when Basic Strategy stands.
 *
 * `trueCount` is taken already converted and already rounded, because rounding mode is the
 * caller's decision (`TrueCountRounding` in `counting.ts`) and `trueCount()` throws at zero
 * decks remaining rather than returning a number this function could compare. For an
 * unbalanced system the number to pass is the one the system's own index set is quoted
 * against; no unbalanced set ships today, so `getIndexSet` returns `undefined` for KO and
 * Red 7 and this returns `null`.
 */
export function deviation(
  hand: Hand,
  dealerUpcard: Card,
  trueCount: number,
  rules: RuleSet,
  system: CountingSystem,
  context: StrategyContext = {},
): Deviation | null {
  return deviationLookup(hand, dealerUpcard, trueCount, rules, system, context).deviation;
}

/** `deviation`, plus the reason when there is no departure. */
export function deviationLookup(
  hand: Hand,
  dealerUpcard: Card,
  trueCount: number,
  rules: RuleSet,
  system: CountingSystem,
  context: StrategyContext = {},
): DeviationLookup {
  const cell = governingCell(hand, dealerUpcard, rules, context);
  const basicStrategy = cell.action;
  const legal = legalActions({
    hand,
    rules,
    handCount: context.handCount ?? 1,
    bankroll: context.bankroll ?? Number.POSITIVE_INFINITY,
  });

  const set = getIndexSet(system);
  if (!set) return { entry: null, deviation: null, skipped: "no-index-set", basicStrategy };

  // A hand can be covered by more than one entry — hard 15 vs 10 is both Illustrious 18 #3
  // (stand at +4) and Fab 4 #2 (surrender at 0). They are evaluated surrender-first, which
  // is the order the plays are actually made at a table and the order the two sets compose
  // in: decide whether to give the hand up, then decide how to play what is left.
  const candidates = findEntries(set, hand, upcardOf(dealerUpcard), legal);
  if (candidates.length === 0) {
    return { entry: null, deviation: null, skipped: "no-entry", basicStrategy };
  }

  const declined: DeviationLookup[] = [];
  for (const entry of candidates) {
    const skip = (reason: DeviationSkipReason): DeviationLookup => ({
      entry,
      deviation: null,
      skipped: reason,
      basicStrategy,
    });

    // The guard that keeps a published index inside the game it was published for. See
    // "Why a departure can be declined" in the file header.
    if (basicStrategy !== entry.from) {
      declined.push(skip("outside-published-rules"));
      continue;
    }
    // Insurance is a side bet rather than a play on the hand, so an insurance entry can
    // never be reached through a hand lookup — it carries no chart coordinate. The check is
    // here so a future set carrying a side-bet index cannot leak one into a playing decision.
    if (!isHandAction(entry.deviate) || !legal.includes(entry.deviate)) {
      declined.push(skip("action-not-legal"));
      continue;
    }
    if (!fires(trueCount, entry)) {
      declined.push(skip("count-on-basic-side"));
      continue;
    }

    return {
      entry,
      deviation: buildDeviation(entry, trueCount, basicStrategy),
      skipped: null,
      basicStrategy,
    };
  }

  // Report the most informative near miss: an index the count simply has not crossed tells
  // the user more than one this Rule Set has moved out of scope.
  return (
    declined.find((result) => result.skipped === "count-on-basic-side") ??
    declined.find((result) => result.skipped === "action-not-legal") ??
    (declined[0] as DeviationLookup)
  );
}

/**
 * Insurance — Illustrious 18 entry #1, and the single most valuable deviation in the game.
 *
 * Kept separate from `deviation` because insurance is a side bet offered against an ace
 * before anyone plays a hand, so it takes no hand and no Rule Set: the index is a property
 * of the counting system alone. Hi-Lo insures at a true count of **+3 or higher**.
 */
export function insuranceDeviation(trueCount: number, system: CountingSystem): Deviation | null {
  const entry = insuranceEntry(system);
  if (!entry || !fires(trueCount, entry)) return null;
  return buildDeviation(entry, trueCount, entry.from);
}

/** Whether to take insurance at this count. `false` whenever the system publishes no index. */
export function shouldTakeInsurance(trueCount: number, system: CountingSystem): boolean {
  return insuranceDeviation(trueCount, system) !== null;
}

/** The system's published insurance index, or `undefined` if it has none. +3 for Hi-Lo. */
export function insuranceIndex(system: CountingSystem): number | undefined {
  return insuranceEntry(system)?.index;
}

function insuranceEntry(system: CountingSystem): IndexEntry | undefined {
  return getIndexSet(system)?.entries.find((candidate) => candidate.hand.kind === "insurance");
}

function isHandAction(action: DeviationAction): action is Action {
  return action !== "insurance" && action !== "decline-insurance";
}

/** The boundary convention, in one expression: the index belongs to the "at or above" side. */
function fires(trueCount: number, entry: IndexEntry): boolean {
  return entry.direction === "at-or-above" ? trueCount >= entry.index : trueCount < entry.index;
}

/**
 * Every entry covering this hand against this upcard, surrender indices first.
 *
 * A pair is tried as a pair first and then as its total, in that order, which is what lets
 * 10,10 vs 5 find the split index while 5,5 vs 10 still finds the hard-10 double index.
 * Matching as a total is safe for 8,8 vs 10 because the `from` guard rejects it afterwards:
 * Basic Strategy splits that hand, and the hard-16 index departs from hitting.
 */
function findEntries(
  set: IndexSet,
  hand: Hand,
  upcard: DealerUpcard,
  legal: readonly Action[],
): IndexEntry[] {
  const matches: IndexEntry[] = [];
  for (const coordinate of coordinatesFor(hand, legal)) {
    for (const entry of set.entries) {
      if (entry.upcard === upcard && sameCoordinate(entry.hand, coordinate)) matches.push(entry);
    }
    if (matches.length > 0) break;
  }
  return matches.sort((a, b) => surrenderFirst(a) - surrenderFirst(b));
}

function surrenderFirst(entry: IndexEntry): number {
  return entry.deviate === "surrender" ? 0 : 1;
}

/** The chart coordinates this hand could be read as, most specific first. */
function coordinatesFor(hand: Hand, legal: readonly Action[]): IndexHand[] {
  const coordinates: IndexHand[] = [];

  // Same rule `governingCell` uses: the pairs chart applies only while splitting is on the
  // table. At the resplit limit a pair is read as its total, and so is its index.
  if (isSplittablePair(hand) && legal.includes("split")) {
    coordinates.push({ kind: "pair", rank: pairRankOf(hand) });
  }

  const value = evaluate(hand.cards);
  if (value.busted) return coordinates;
  if (value.soft) {
    coordinates.push({ kind: "soft", total: clamp(value.total, 12, 21) as SoftTotal });
  } else {
    coordinates.push({ kind: "hard", total: clamp(value.total, 4, 21) as HardTotal });
  }
  return coordinates;
}

function sameCoordinate(a: IndexHand, b: IndexHand): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "pair" && b.kind === "pair") return a.rank === b.rank;
  if (a.kind === "insurance" || b.kind === "insurance") return false;
  return "total" in a && "total" in b && a.total === b.total;
}

function pairRankOf(hand: Hand): PairRank {
  const rank = hand.cards[0]?.rank ?? "2";
  if (rank === "A") return "A";
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return "10";
  return rank as PairRank;
}

function buildDeviation(
  entry: IndexEntry,
  trueCount: number,
  basicStrategy: DeviationAction,
): Deviation {
  return {
    action: entry.deviate,
    index: entry.index,
    direction: entry.direction,
    trueCount,
    basicStrategy,
    entry,
    explanation: explain(entry, trueCount),
  };
}

/**
 * The sentence the Explanation panel shows: "stand at +0 or higher; the count is +2"
 * (invariant 2 — a verdict without a reason is not shippable).
 */
function explain(entry: IndexEntry, trueCount: number): string {
  const threshold =
    entry.direction === "at-or-above"
      ? `at ${signed(entry.index)} or higher`
      : `below ${signed(entry.index)}`;
  return `${verb(entry.deviate)} ${threshold}; the count is ${signed(trueCount)}`;
}

function verb(action: DeviationAction): string {
  switch (action) {
    case "insurance":
      return "take insurance";
    case "decline-insurance":
      return "decline insurance";
    default:
      return action;
  }
}

/** Counts are always shown with an explicit sign, including zero: "+0", "+2", "-1". */
export function signed(count: number): string {
  return count < 0 ? String(count) : `+${count}`;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
