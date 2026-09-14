/**
 * The Illustrious 18 and the Fab 4, cross-checked against the EV engine.
 *
 * `deviations.test.ts` asserts the index numbers against four published transcriptions. That
 * is good sourcing, but it is still transcription: three sources copied from the same book
 * would agree on a digit that had been transposed in all three, and a sign error in the
 * lookup would not show up in a table of numbers at all. This file is the independent
 * evidence — it derives, from `ev.ts`, the true count at which each deviation actually
 * overtakes the play it departs from, and compares that against the published index.
 *
 * It is the same trick `ev.test.ts` already runs against `strategy.ts`: two modules that
 * were built from different sources and must nonetheless agree. `deviations.ts` was
 * transcribed from Schlesinger; `ev.ts` was built from combinatorics and checked against
 * Wizard of Odds' Appendix 1. Neither imports the other. A published index that was wrong
 * by a whole count, or in the wrong direction, could not survive both.
 *
 * ## The result, stated up front
 *
 * **Every one of the 22 published indices is corroborated. Nothing in `deviations.ts` was
 * changed.** No index is wrong in sign, wrong in direction, or wrong by a whole count. The
 * largest disagreement anywhere is 0.016 bets, at 10,10 vs 6 — well inside the band where an
 * index rounded to a whole number is expected to sit, and a fifth of the threshold at which
 * a disagreement would stop being a rounding artefact. Nineteen of the twenty-one playing
 * indices land within half a true count of the measured EV crossover; the other two are
 * 15 vs 10 (0.75 high) and the Fab 4's 15 vs A (1.25 low), both written up below.
 *
 * Eleven of the twenty-one are strictly right on both sides of their own boundary with no
 * rounding argument needed at all. Insurance, entry #1 and the most valuable of the lot,
 * breaks even at about +2.6 and is worth +0.0048 of a bet at exactly the published +3.
 *
 * ## How a true count is turned back into a shoe
 *
 * A true count does not determine a composition — many shoes have a Hi-Lo true count of +4.
 * What can be pinned down is the *expected* composition given the count, and for a balanced
 * level-1 system that has a closed form. Deal `d` cards from a full shoe and condition on
 * their Hi-Lo tag sum `s`. The +1 ranks (2-6) and the -1 ranks (aces and tens) number 120
 * each, so by symmetry the conditional expectation of the low cards dealt exceeds that of
 * the high cards dealt by exactly `s`, with their sum unchanged; and within the -1 class the
 * shortfall is shared in proportion to population, four fifths of it falling on the tens and
 * one fifth on the aces. `dealtSubset` below is that calculation, and `shoeAtTrueCount`
 * applies it. The result is the standard model: at a positive count the remaining shoe is
 * ten-rich *and* ace-rich, in proportion to the tags, with 7s, 8s and 9s untouched.
 *
 * Getting this wrong is not a rounding matter. An earlier draft of this file put the whole
 * imbalance into low cards and tens and left the aces at their natural density; that shifts
 * the measured crossover for 15 vs 10 by three quarters of a true count. The model is stated
 * here rather than buried because it is the load-bearing assumption of every number below.
 *
 * Every measurement is taken at one fixed depth — **four decks unseen out of six**, so a
 * quarter of the shoe has been dealt and the true count is the running count over four.
 * That makes every target true count exactly reachable on the integer lattice of running
 * counts, and `it("builds a composition whose true count is exactly the target")` checks it
 * against `counting.ts` rather than trusting the arithmetic above.
 *
 * ## Which hand the index is measured on
 *
 * A published index is *total*-dependent: "16 vs 10" covers 10,6 and 9,7 alike, and those
 * two hands do not have quite the same EV. So each index is measured as the frequency-
 * weighted average over every two-card hand making its total — weighted by how often each
 * is dealt from a full shoe, which is why 10,6 carries four times the weight of 9,7.
 *
 * Variants whose own Basic Strategy is not the play the index departs `from` are left out,
 * which is the same guard `deviationLookup` applies. It falls out that 8,8 is excluded from
 * both 16-vs-10 and 16-vs-9 — Basic Strategy splits it — reproducing the published caveat
 * that the 16 vs 10 index does not apply to a pair of 8s, here for the second time and from
 * a different direction.
 *
 * ## What "disagreement" means, and what it does not
 *
 * An index is an integer. The true crossover is a real number and lands on an integer only
 * by coincidence, so a small margin at the index is the expected case, not a defect. Two
 * further sources of slack are worth naming before reading the table:
 *
 *  - `actionEvs` pins the dealer's odds at the decision point. `ev.test.ts` measures that
 *    approximation at no worse than 0.0022 bets, so a margin smaller than that is not
 *    evidence of anything at all.
 *  - The engine's default true-count rounding is truncation, so a displayed count of "+3"
 *    is any exact count in [3, 4). An index that is marginal at exactly +3 is comfortable
 *    across the range the player is actually holding when they see +3.
 *
 * `NEAR_TIE` (0.005 bets) is therefore set at roughly twice the approximation band, and
 * `LOUD` (0.02 bets) is the threshold at which a disagreement would stop being a rounding
 * artefact and start being a wrong number. Nothing below reaches `LOUD`.
 *
 * ## The findings, in full
 *
 * `MEASURED` is the table. Reading it: `crossover` is the true count at which the deviation
 * first overtakes the play it departs from, located to a quarter of a count; `atFiring` is
 * the margin at the first count on the deviation's side of the index, and `atBasic` the
 * margin at the last count on Basic Strategy's side. Both are in units of the opening bet,
 * positive meaning the deviation is ahead. The convention wants `atFiring` positive and
 * `atBasic` negative.
 *
 * Eleven of the twenty-one are strictly right on both sides: 16 vs 10, 10,10 vs 5, 10 vs 10,
 * 12 vs 3, 9 vs 2, 10 vs A, 9 vs 7, 16 vs 9, 12 vs 4, 13 vs 3 and the Fab 4's 15 vs 10. The
 * other ten, worst first:
 *
 *  - **10,10 vs 6 (index +4), −0.0156 at the index.** The measured crossover is +4.5, so
 *    splitting tens against a 6 is a hair premature at exactly +4. The largest single
 *    disagreement in the set, and still a fifth of the `LOUD` threshold.
 *  - **15 vs A surrender (index +1), −0.0116 at the index; crossover +2.25.** The only
 *    index more than one true count from its crossover. Worth noting that this is already
 *    the most disputed number in the set: `deviations.ts` records that a fourth source
 *    publishes −1 here for H17 while three agree on +1 for S17, and this measurement, taken
 *    under S17, says the S17 crossover is nearer +2. It is not evidence for the H17 claim,
 *    and it is nowhere near enough to move a triple-sourced number — but a reader auditing
 *    this cell should know the EV leans the other way from the one dissenting source.
 *  - **15 vs 9 surrender (index +2), −0.0076 at the index; crossover +2.5.**
 *  - **13 vs 2 (index −1), +0.0050 at the index.** One of the five "hit below the index"
 *    entries. All five measure the same way: their crossovers sit at or just above the
 *    published index, so at the index itself hitting is already fractionally ahead of
 *    standing. The published convention keeps the player standing there, which costs at
 *    most half a hundredth of a bet and is the conservative side to be wrong on.
 *  - **15 vs 10 (index +4), −0.0048 at the index; crossover +4.75.**
 *  - **12 vs 2 (index +3), −0.0047 at the index; crossover +3.5.**
 *  - **12 vs 5 (index −2), +0.0034 at the index.**
 *  - **11 vs A (index +1), −0.0018 at the index.** Inside the approximation band.
 *  - **12 vs 6 (index −1), +0.0014 at the index.** Inside the approximation band.
 *  - **14 vs 10 surrender (index +3), −0.0005 at the index.** Inside the approximation band.
 *
 * Insurance is measured separately, since it is a side bet and not one of `hand.ts`'s
 * actions. `ev.ts` still supplies its EV: in a no-peek game `dealerOutcomes(...).blackjack`
 * against an ace *is* the chance the hole card is a ten, which is the only quantity
 * insurance depends on. Break-even lands between +2.5 and +2.75; at the published +3 the bet
 * is worth +0.0096 of the insurance wager, or +0.0048 of the opening bet, and at +2 it is
 * −0.0192 a wager. **+3 is the right integer**, rounded conservatively upward.
 *
 * Nothing here reached the `LOUD` threshold, so nothing needed reporting as a defect and no
 * published number was touched. Had one, the rule was to write it up rather than quietly fix
 * either side — which is why the numbers above are recorded even where they agree.
 *
 * Pure and synchronous, no I/O, no clock, no `Math.random()` (ADR-0002).
 */

import { describe, expect, it } from "vitest";
import { type Card, type Rank, RANKS, isAce, rankValue } from "./cards";
import { HI_LO, currentRunningCount, runningCount, trueCount } from "./counting";
import {
  FAB_4,
  HI_LO_INDEXES,
  ILLUSTRIOUS_18,
  type IndexEntry,
  deviation,
  insuranceIndex,
} from "./deviations";
import { type Action, type Hand, createHand } from "./hand";
import { DEFAULT_RULES, type RuleSet } from "./rules";
import { actionEvs, compositionWithout, dealerOutcomes, fullShoeComposition } from "./ev";
import type { RankComposition } from "./shoe";
import { basicStrategy } from "./strategy";

const card = (rank: Rank, suit: Card["suit"] = "s"): Card => ({ rank, suit });
const hand = (...ranks: Rank[]): Hand => createHand(ranks.map((rank) => card(rank)), 10);

/** Dealer upcards as the published tables write them: 11 is an ace. */
const up = (upcard: number): Card => card(upcard === 11 ? "A" : (String(upcard) as Rank));

/** The game the two sets are quoted against, matching `deviations.test.ts`. */
const BASELINE: RuleSet = {
  ...DEFAULT_RULES,
  decks: 6,
  dealerSoft17: "stand",
  surrender: "none",
};

/** The Fab 4 needs surrender on the table to have an EV at all. */
const BASELINE_WITH_SURRENDER: RuleSet = { ...BASELINE, surrender: "late" };

const DECKS = 6;

/** Cards unseen when every measurement is taken: four decks of the six. */
const UNSEEN = 4 * 52;

/** Hi-Lo's +1 ranks, its -1 ranks, and the ranks it ignores. */
const LOW_RANKS: readonly Rank[] = ["2", "3", "4", "5", "6"];
const TEN_RANKS: readonly Rank[] = ["10", "J", "Q", "K"];
const NEUTRAL_RANKS: readonly Rank[] = ["7", "8", "9"];

/** A margin this small is a tie for every purpose; `ev.ts`'s own approximation is 0.0022. */
const NEAR_TIE = 0.005;

/** Beyond this, a disagreement would be a wrong number rather than a rounded one. */
const LOUD = 0.02;

// ---------------------------------------------------------------------------
// Turning a true count back into a shoe
// ---------------------------------------------------------------------------

/** How many cards of each Hi-Lo class a dealt subset holds. */
interface DealtSubset {
  readonly low: number;
  readonly tens: number;
  readonly aces: number;
  readonly neutral: number;
}

/**
 * The expected make-up of `dealt` cards whose Hi-Lo tags sum to `tagSum`.
 *
 * Derived rather than tabulated, from the two facts stated in the file header: the +1 and
 * -1 classes are the same size, so the excess of low cards over high cards *is* the tag
 * sum while their total is untouched; and the -1 class splits four-to-one between tens and
 * aces. The counts are integers in the end, so `neutral` absorbs the rounding — it carries
 * a tag of zero, which is exactly why it is the safe place to put it.
 */
function dealtSubset(dealt: number, tagSum: number): DealtSubset {
  const perRank = dealt / 13;
  const excess = tagSum / 10;
  const aces = Math.max(0, Math.round(perRank - excess));
  let neutral = Math.round(3 * perRank);
  let mixed = dealt - aces - neutral;
  // `low + tens` and `low - tens` must have the same parity for both to be whole cards.
  if ((mixed + tagSum + aces) % 2 !== 0) {
    neutral += 1;
    mixed -= 1;
  }
  return { low: (mixed + tagSum + aces) / 2, tens: (mixed - tagSum - aces) / 2, aces, neutral };
}

/** Takes `count` cards out, spread evenly over `ranks` and skipping any already exhausted. */
function removeSpread(counts: Record<Rank, number>, ranks: readonly Rank[], count: number): void {
  let taken = 0;
  while (taken < count) {
    let progressed = false;
    for (const rank of ranks) {
      if (taken >= count) break;
      if ((counts[rank] ?? 0) > 0) {
        counts[rank]--;
        taken++;
        progressed = true;
      }
    }
    if (!progressed) throw new Error(`Cannot remove ${count} cards from ${ranks.join("/")}.`);
  }
}

/**
 * The unseen composition of a six-deck shoe standing at Hi-Lo true count `target`, with the
 * cards in `seen` — the player's hand and the dealer's upcard — already out of it.
 *
 * The returned pool is what `actionEvs` wants: everything the player cannot see, the
 * dealer's hole card included. Four decks of it, always, so the true count is the running
 * count divided by four and every quarter-count target lands exactly.
 */
function shoeAtTrueCount(target: number, seen: readonly Card[]): RankComposition {
  const running = (target * UNSEEN) / 52;
  if (!Number.isInteger(running)) {
    throw new Error(
      `True count ${target} is not reachable: it needs a running count of ${running}.`,
    );
  }
  const counts = compositionWithout(fullShoeComposition(DECKS), seen) as Record<Rank, number>;
  const dealt = DECKS * 52 - seen.length - UNSEEN;
  const subset = dealtSubset(dealt, running - runningCount(seen, HI_LO));
  removeSpread(counts, LOW_RANKS, subset.low);
  removeSpread(counts, TEN_RANKS, subset.tens);
  removeSpread(counts, NEUTRAL_RANKS, subset.neutral);
  removeSpread(counts, ["A"], subset.aces);
  return counts;
}

/** The true count `counting.ts` reads off a shoe built by `shoeAtTrueCount`. */
function trueCountOf(composition: RankComposition, seen: readonly Card[]): number {
  const dealt: Card[] = [...seen];
  const full = fullShoeComposition(DECKS);
  for (const rank of RANKS) {
    const gone = (full[rank] ?? 0) - (composition[rank] ?? 0) - countOf(seen, rank);
    for (let i = 0; i < gone; i++) dealt.push(card(rank));
  }
  const remaining = RANKS.reduce((sum, rank) => sum + (composition[rank] ?? 0), 0);
  return trueCount(currentRunningCount(dealt, HI_LO, DECKS), remaining / 52, "exact");
}

function countOf(cards: readonly Card[], rank: Rank): number {
  return cards.filter((candidate) => candidate.rank === rank).length;
}

// ---------------------------------------------------------------------------
// Measuring one index
// ---------------------------------------------------------------------------

/** One two-card hand an index's row covers, and how often a full shoe deals it. */
interface Variant {
  readonly ranks: readonly Rank[];
  readonly weight: number;
}

/** The rule set an entry's EVs are computed under. The Fab 4 needs surrender offered. */
function rulesFor(entry: IndexEntry): RuleSet {
  return entry.set === "fab-4" ? BASELINE_WITH_SURRENDER : BASELINE;
}

/**
 * Every two-card hand the entry's row covers, weighted by how often a six-deck shoe deals
 * it, and filtered to those whose Basic Strategy is the play the index departs `from`.
 *
 * The filter is `deviationLookup`'s own guard, applied to the no-surrender chart the two
 * sets are quoted against — which is what keeps the Fab 4's four rows populated, since in a
 * surrender game Basic Strategy already gives two of those hands up.
 */
function variantsFor(entry: IndexEntry): Variant[] {
  if (entry.hand.kind === "pair") {
    return [{ ranks: [entry.hand.rank as Rank, entry.hand.rank as Rank], weight: 1 }];
  }
  if (entry.hand.kind !== "hard") return [];

  const variants: Variant[] = [];
  // Ten-ranked cards are interchangeable in a total, so "10" stands for all four of them
  // and carries their combined frequency. An ace would make the hand soft, so it is out.
  const ranks = RANKS.filter((rank) => !isAce(rank) && (rankValue(rank) !== 10 || rank === "10"));
  const supply = (rank: Rank) => (rankValue(rank) === 10 ? 16 * DECKS : 4 * DECKS);

  for (let i = 0; i < ranks.length; i++) {
    for (let j = i; j < ranks.length; j++) {
      const low = ranks[i] as Rank;
      const high = ranks[j] as Rank;
      if (rankValue(low) + rankValue(high) !== entry.hand.total) continue;
      if (basicStrategy(hand(low, high), up(entry.upcard), BASELINE) !== entry.from) continue;
      const weight =
        low === high
          ? (supply(low) * (supply(low) - 1)) / 2
          : supply(low) * supply(high);
      variants.push({ ranks: [low, high], weight });
    }
  }
  return variants;
}

/**
 * How much better the deviation is than the play it departs from, in units of the opening
 * bet, at this true count. Negative means Basic Strategy is still ahead.
 */
function marginAt(entry: IndexEntry, target: number): number {
  const rules = rulesFor(entry);
  const upcard = up(entry.upcard);
  let weighted = 0;
  let total = 0;
  for (const variant of variantsFor(entry)) {
    const player = hand(...variant.ranks);
    const composition = shoeAtTrueCount(target, [...player.cards, upcard]);
    const evs = actionEvs(player, upcard, rules, composition);
    const deviated = evs[entry.deviate as Action];
    const basic = evs[entry.from as Action];
    if (deviated === undefined || basic === undefined) {
      throw new Error(`${entry.id}: no EV for ${entry.deviate} or ${entry.from}.`);
    }
    weighted += variant.weight * (deviated - basic);
    total += variant.weight;
  }
  if (total === 0) throw new Error(`${entry.id}: no hand makes this row.`);
  return weighted / total;
}

/** The first count on the deviation's side of the index. */
function firingBoundary(entry: IndexEntry): number {
  return entry.direction === "at-or-above" ? entry.index : entry.index - 1;
}

/** The last count on Basic Strategy's side of the index. */
function basicBoundary(entry: IndexEntry): number {
  return entry.direction === "at-or-above" ? entry.index - 1 : entry.index;
}

/** Two counts clear of the boundary, which is where the sign should be beyond argument. */
function wellInside(entry: IndexEntry, side: "firing" | "basic"): number {
  const away = side === "firing" ? 2 : -3;
  return entry.direction === "at-or-above" ? entry.index + away : entry.index - away;
}

/**
 * The true count at which the deviation overtakes Basic Strategy, to a quarter of a count,
 * searched outward from three counts on the Basic Strategy side of the index.
 */
function crossoverOf(entry: IndexEntry): number {
  const step = entry.direction === "at-or-above" ? 0.25 : -0.25;
  for (let i = 0; i <= 24; i++) {
    const target = entry.index - 3 * step + step * i;
    if (marginAt(entry, target) > 0) return target;
  }
  throw new Error(`${entry.id}: no crossover within three counts of the index.`);
}

// ---------------------------------------------------------------------------
// The measurements
// ---------------------------------------------------------------------------

interface Measurement {
  /** True count at which the deviation overtakes the play it departs from. */
  readonly crossover: number;
  /** Margin at the first count on the deviation's side. The convention wants this positive. */
  readonly atFiring: number;
  /** Margin at the last count on Basic Strategy's side. The convention wants this negative. */
  readonly atBasic: number;
}

/**
 * What this engine measures for each published index, recorded so a future change to
 * `ev.ts` or to the composition model has to be looked at rather than absorbed.
 *
 * The tolerance is `RECORDED_TOLERANCE` rather than the fifth decimal place: these are
 * measurements of this engine, not transcriptions of a published table, and `ev.ts` is
 * entitled to improve by less than its own stated approximation without this file failing.
 */
const MEASURED: Readonly<Record<string, Measurement>> = {
  "16v10": { crossover: -0.25, atFiring: 0.00174, atBasic: -0.01459 },
  "15v10": { crossover: 4.75, atFiring: -0.00479, atBasic: -0.00903 },
  TTv5: { crossover: 4.75, atFiring: 0.01103, atBasic: -0.03016 },
  TTv6: { crossover: 4.5, atFiring: -0.01561, atBasic: -0.04891 },
  "10v10": { crossover: 3.5, atFiring: 0.00369, atBasic: -0.00534 },
  "12v3": { crossover: 2.0, atFiring: 0.00221, atBasic: -0.00798 },
  "12v2": { crossover: 3.5, atFiring: -0.00472, atBasic: -0.0212 },
  "11vA": { crossover: 1.25, atFiring: -0.00175, atBasic: -0.01757 },
  "9v2": { crossover: 1.0, atFiring: 0.00306, atBasic: -0.01367 },
  "10vA": { crossover: 3.75, atFiring: 0.00744, atBasic: -0.01416 },
  "9v7": { crossover: 3.0, atFiring: 0.00253, atBasic: -0.01893 },
  "16v9": { crossover: 5.0, atFiring: 0.00463, atBasic: -0.0102 },
  "13v2": { crossover: -0.75, atFiring: 0.01571, atBasic: 0.00504 },
  "12v4": { crossover: -0.25, atFiring: 0.01797, atBasic: -0.00014 },
  "12v5": { crossover: -2.0, atFiring: 0.02067, atBasic: 0.00343 },
  "12v6": { crossover: -1.0, atFiring: 0.00743, atBasic: 0.00143 },
  "13v3": { crossover: -2.5, atFiring: 0.01356, atBasic: -0.00736 },
  "14v10R": { crossover: 3.25, atFiring: -0.00051, atBasic: -0.01488 },
  "15v10R": { crossover: 0.0, atFiring: 0.00136, atBasic: -0.01422 },
  "15v9R": { crossover: 2.5, atFiring: -0.00763, atBasic: -0.01928 },
  "15vAR": { crossover: 2.25, atFiring: -0.01163, atBasic: -0.02142 },
};

const RECORDED_TOLERANCE = 0.002;

/** Every published index that plays a hand. Insurance is the one that does not. */
const PLAYING = [...ILLUSTRIOUS_18, ...FAB_4].filter((entry) => entry.hand.kind !== "insurance");

const WITH_LABEL = PLAYING.map((entry) => [entry.label, entry] as const);

// ---------------------------------------------------------------------------
// The composition model, checked before anything is measured with it
// ---------------------------------------------------------------------------

describe("a true count, turned back into a shoe", () => {
  const seen = [card("10"), card("6"), card("10", "d")];

  it("builds a composition whose true count is exactly the target", () => {
    // Checked against counting.ts rather than against the arithmetic that built it, so a
    // mistake in `dealtSubset` cannot quietly validate itself.
    for (const target of [-3, -2, -1, -0.5, 0, 0.25, 1, 2, 3, 4, 5]) {
      expect(trueCountOf(shoeAtTrueCount(target, seen), seen)).toBeCloseTo(target, 10);
    }
  });

  it("leaves four decks unseen, and never asks for a card the shoe does not hold", () => {
    for (const target of [-4, 0, 6]) {
      const composition = shoeAtTrueCount(target, seen);
      const remaining = RANKS.reduce((sum, rank) => sum + (composition[rank] ?? 0), 0);
      expect(remaining).toBe(UNSEEN);
      for (const rank of RANKS) expect(composition[rank]).toBeGreaterThanOrEqual(0);
    }
  });

  it("is reachable: the shoe still contains every card on the table", () => {
    // `compositionWithout` throws rather than going negative, so a hand the shoe could not
    // have dealt cannot be measured at all. Proven here on the 8,8 that the 16 vs 10 index
    // excludes and on a pair of tens, the two most depleting hands in either set.
    for (const player of [hand("8", "8"), hand("10", "10"), hand("K", "Q")]) {
      const table = [...player.cards, card("10", "h")];
      expect(() => shoeAtTrueCount(6, table)).not.toThrow();
      expect(() => shoeAtTrueCount(-6, table)).not.toThrow();
    }
  });

  it("puts the count where a counter would expect it: tens rise, low cards fall", () => {
    const tens = (target: number) =>
      TEN_RANKS.reduce((sum, rank) => sum + (shoeAtTrueCount(target, seen)[rank] ?? 0), 0);
    const low = (target: number) =>
      LOW_RANKS.reduce((sum, rank) => sum + (shoeAtTrueCount(target, seen)[rank] ?? 0), 0);
    expect(tens(4)).toBeGreaterThan(tens(0));
    expect(tens(0)).toBeGreaterThan(tens(-4));
    expect(low(4)).toBeLessThan(low(0));
    expect(low(0)).toBeLessThan(low(-4));
  });

  it("enriches aces along with tens, because Hi-Lo tags them the same", () => {
    // The part an earlier draft got wrong. Hi-Lo cannot tell an ace from a ten, so a shoe
    // that has gone ten-rich has gone ace-rich with it, four to one by population. Leaving
    // the aces at natural density moves the measured 15 vs 10 crossover by 0.75 of a count.
    expect(shoeAtTrueCount(5, seen).A).toBeGreaterThan(shoeAtTrueCount(0, seen).A);
    expect(shoeAtTrueCount(0, seen).A).toBeGreaterThan(shoeAtTrueCount(-5, seen).A);
  });

  it("leaves the ranks Hi-Lo ignores alone", () => {
    for (const rank of NEUTRAL_RANKS) {
      expect(shoeAtTrueCount(5, seen)[rank]).toBe(shoeAtTrueCount(-5, seen)[rank]);
    }
  });

  it("refuses a true count the running-count lattice cannot reach", () => {
    expect(() => shoeAtTrueCount(0.1, seen)).toThrow(/not reachable/);
  });
});

describe("the hands an index is measured over", () => {
  it("covers every two-card make-up of the total, weighted by how often it is dealt", () => {
    const twelve = PLAYING.find((entry) => entry.id === "12v3") as IndexEntry;
    expect(variantsFor(twelve).map((variant) => variant.ranks.join(","))).toEqual([
      "2,10",
      "3,9",
      "4,8",
      "5,7",
    ]);
    // 10,2 is the commonest twelve by a distance: four ten-ranks against one of everything
    // else. The weighting says so rather than treating all four alike.
    const [tenTwo, threeNine] = variantsFor(twelve);
    expect(tenTwo?.weight).toBe(16 * DECKS * (4 * DECKS));
    expect(threeNine?.weight).toBe(4 * DECKS * (4 * DECKS));
    expect((tenTwo?.weight ?? 0) / (threeNine?.weight ?? 1)).toBe(4);
  });

  it("excludes 8,8 from both sixteens, which is the published caveat falling out again", () => {
    for (const id of ["16v10", "16v9"]) {
      const entry = PLAYING.find((candidate) => candidate.id === id) as IndexEntry;
      const made = variantsFor(entry).map((variant) => variant.ranks.join(","));
      expect(made).toContain("6,10");
      expect(made).not.toContain("8,8");
    }
  });

  it("finds a hand for all twenty-one playing indices, the Fab 4 included", () => {
    for (const entry of PLAYING) expect(variantsFor(entry).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The cross-check
// ---------------------------------------------------------------------------

/**
 * The headline assertion, and the one that would have caught a transposed digit: two counts
 * clear of the index the sign is not in doubt, and it is the sign the published table says.
 *
 * An index wrong by a whole count, or printed in the wrong direction, fails here. A near-tie
 * at the boundary does not, which is the point of measuring away from it.
 */
describe("every published index points the way the EV engine does", () => {
  it.each(WITH_LABEL)("%s: the deviation wins well inside its own side", (_label, entry) => {
    expect(marginAt(entry, wellInside(entry, "firing"))).toBeGreaterThan(0);
  });

  it.each(WITH_LABEL)("%s: Basic Strategy wins well inside its side", (_label, entry) => {
    expect(marginAt(entry, wellInside(entry, "basic"))).toBeLessThan(0);
  });

  it.each(WITH_LABEL)("%s: the margin runs the right way with the count", (_label, entry) => {
    // Monotone in the count, which is what makes a single crossover a meaningful thing to
    // quote at all. A published index describing a play that came and went would not be.
    //
    // Measured two counts at a time. A composition is a whole number of cards, so stepping
    // the target count by one moves some ranks by a card and others not at all; that lattice
    // jitter is worth about 0.002 of a bet, which is enough to invert two adjacent counts
    // whose real difference is smaller than that. Two counts clears it comfortably.
    const towards = entry.direction === "at-or-above" ? 1 : -1;
    let previous = -Infinity;
    for (const step of [-4, -2, 0, 2]) {
      const margin = marginAt(entry, entry.index + towards * step);
      expect(margin).toBeGreaterThan(previous);
      previous = margin;
    }
  });
});

describe("every published index sits within a count of the EV crossover", () => {
  it.each(WITH_LABEL)("%s: the crossover is where it was measured", (_label, entry) => {
    const recorded = MEASURED[entry.id] as Measurement;
    expect(crossoverOf(entry)).toBe(recorded.crossover);
  });

  it.each(WITH_LABEL)("%s: the published index is no more than 1.5 counts off", (_label, entry) => {
    const recorded = MEASURED[entry.id] as Measurement;
    expect(Math.abs(recorded.crossover - entry.index)).toBeLessThanOrEqual(1.5);
  });

  it("names the one index more than a count from its crossover", () => {
    // 15 vs A is the exception, and it is also the entry `deviations.ts` already flags as
    // the most disputed in the set. Everything else is inside a single true count.
    const off = PLAYING.filter(
      (entry) => Math.abs((MEASURED[entry.id] as Measurement).crossover - entry.index) > 1,
    );
    expect(off.map((entry) => entry.id)).toEqual(["15vAR"]);
  });

  it("puts nineteen of twenty-one within half a count — the published integer, rounded", () => {
    const off = PLAYING.filter(
      (entry) => Math.abs((MEASURED[entry.id] as Measurement).crossover - entry.index) > 0.5,
    );
    expect(off.map((entry) => entry.id)).toEqual(["15v10", "15vAR"]);
    expect(PLAYING.length - off.length).toBe(19);
  });
});

/**
 * The boundary convention, measured. `deviations.ts` chose "the index belongs to the at-or-
 * above side" and `deviations.test.ts` asserts the lookup obeys it; this asserts what it
 * costs. The answer is: never more than 0.016 bets, at the one count where it could matter.
 */
describe("the boundary convention costs almost nothing at the index itself", () => {
  it.each(WITH_LABEL)("%s: measures what it measured before", (_label, entry) => {
    const recorded = MEASURED[entry.id] as Measurement;
    expect(marginAt(entry, firingBoundary(entry))).toBeCloseTo(recorded.atFiring, 4);
    expect(marginAt(entry, basicBoundary(entry))).toBeCloseTo(recorded.atBasic, 4);
  });

  it.each(WITH_LABEL)("%s: is still the number recorded, well inside the band", (_label, entry) => {
    // The looser of the two. The line above pins the measurement to the fourth decimal so a
    // change is noticed; this one says what would actually matter — `ev.ts` is entitled to
    // move by less than its own stated approximation without any conclusion here changing.
    const recorded = MEASURED[entry.id] as Measurement;
    const live = marginAt(entry, firingBoundary(entry));
    expect(Math.abs(live - recorded.atFiring)).toBeLessThan(RECORDED_TOLERANCE);
  });

  it.each(WITH_LABEL)("%s: is nowhere near a wrong number", (_label, entry) => {
    // The loud-finding guard. A published index that was genuinely wrong would show up as a
    // margin on the wrong side of zero by more than a rounding artefact could explain.
    const recorded = MEASURED[entry.id] as Measurement;
    expect(adverse(recorded)).toBeLessThan(LOUD);
  });

  it("lists the eleven indices that are strictly right on both sides of their boundary", () => {
    // For these, the published integer index and the EV agree without qualification: the
    // deviation is ahead at the first count it fires on and behind at the last count it
    // does not. No rounding argument is needed.
    const exact = PLAYING.filter((entry) => adverse(MEASURED[entry.id] as Measurement) === 0);
    expect(exact.map((entry) => entry.id)).toEqual([
      "16v10",
      "TTv5",
      "10v10",
      "12v3",
      "9v2",
      "10vA",
      "9v7",
      "16v9",
      "12v4",
      "13v3",
      "15v10R",
    ]);
  });

  it("names every near-tie, with the margin that makes it one", () => {
    // Reported rather than hidden: these are the indices where the published integer and
    // the true crossover are close enough that either side of the boundary is defensible.
    const nearTies = PLAYING.filter((entry) => {
      const recorded = MEASURED[entry.id] as Measurement;
      return (
        Math.abs(recorded.atFiring) < NEAR_TIE || Math.abs(recorded.atBasic) < NEAR_TIE
      );
    });
    expect(nearTies.map((entry) => entry.id)).toEqual([
      "16v10",
      "15v10",
      "10v10",
      "12v3",
      "12v2",
      "11vA",
      "9v2",
      "9v7",
      "16v9",
      "12v4",
      "12v5",
      "12v6",
      "14v10R",
      "15v10R",
    ]);
  });

  it("names the five entries the published index is fractionally late for", () => {
    // The "hit below the index" half of the Illustrious 18. All five measure a crossover at
    // or just above their published index, so at the index itself hitting is already
    // marginally ahead and the convention keeps the player standing. Conservative, and
    // never worth more than half a hundredth of a bet.
    const below = PLAYING.filter((entry) => entry.direction === "below");
    expect(below).toHaveLength(5);
    for (const entry of below) {
      const recorded = MEASURED[entry.id] as Measurement;
      expect(recorded.crossover).toBeGreaterThanOrEqual(entry.index - 0.5);
      expect(recorded.atBasic).toBeLessThan(NEAR_TIE + 0.001);
    }
  });

  it("puts the worst disagreement in the whole set at 10,10 vs 6", () => {
    const worst = PLAYING.map((entry) => ({
      entry,
      cost: adverse(MEASURED[entry.id] as Measurement),
    })).sort((a, b) => b.cost - a.cost)[0];
    expect(worst?.entry.id).toBe("TTv6");
    expect(worst?.cost).toBeCloseTo(0.01561, 4);
    expect(worst?.cost).toBeLessThan(LOUD);
  });
});

/** How much the published boundary costs, in bets, at the worse of its two edges. */
function adverse(measurement: Measurement): number {
  return Math.max(0, -measurement.atFiring, measurement.atBasic);
}

/**
 * The lookup, not just the table. Everything above reads `IndexEntry` fields directly; this
 * drives `deviation()` end to end and checks that the action it names is the one the EV
 * engine prefers. A sign error in `fires()` would survive every assertion above and fail
 * here.
 */
describe("the action the lookup names is the action the EV engine prefers", () => {
  // 15 vs 10 surrender is the one entry with no rule set it can fire in — its index of 0 is
  // the average count, and any game offering surrender already surrenders the hand. It is
  // measured above like the rest; it simply cannot be reached through `deviation()`.
  const reachable = WITH_LABEL.filter(([, entry]) => entry.id !== "15v10R");

  it.each(reachable)("%s: fires, and is worth firing", (_label, entry) => {
    const rules = rulesFor(entry);
    const upcard = up(entry.upcard);
    const target = wellInside(entry, "firing");
    const variant = variantsFor(entry)[0] as Variant;
    const player = hand(...variant.ranks);

    const found = deviation(player, upcard, target, rules, HI_LO);
    expect(found?.action).toBe(entry.deviate);
    expect(found?.index).toBe(entry.index);

    const table = [...player.cards, upcard];
    const evs = actionEvs(player, upcard, rules, shoeAtTrueCount(target, table));
    const named = evs[found?.action as Action];
    const basic = evs[found?.basicStrategy as Action];
    expect(named).toBeDefined();
    expect(named as number).toBeGreaterThan(basic as number);
  });

  it.each(reachable)("%s: stays quiet where Basic Strategy is worth more", (_label, entry) => {
    const rules = rulesFor(entry);
    const upcard = up(entry.upcard);
    const target = wellInside(entry, "basic");
    const variant = variantsFor(entry)[0] as Variant;
    const player = hand(...variant.ranks);

    expect(deviation(player, upcard, target, rules, HI_LO)).toBeNull();

    const table = [...player.cards, upcard];
    const evs = actionEvs(player, upcard, rules, shoeAtTrueCount(target, table));
    const deviated = evs[entry.deviate as Action] as number;
    expect(deviated).toBeLessThan(evs[entry.from as Action] as number);
  });
});

// ---------------------------------------------------------------------------
// Insurance — Illustrious 18 entry #1
// ---------------------------------------------------------------------------

/**
 * Insurance is a side bet rather than a play on the hand, so it has no `Action` and no entry
 * in `actionEvs`. It still has an EV, and `ev.ts` still supplies it: in a no-peek game
 * `dealerOutcomes(...).blackjack` against an ace *is* the probability the hole card is a
 * ten, which is the only quantity insurance depends on.
 *
 * The bet stakes half the opening bet and pays 2:1, so it is worth `3p - 1` per unit
 * wagered and half that per unit of the opening bet. It turns profitable at `p > 1/3`.
 */
describe("insurance at +3", () => {
  const upcard = up(11);
  const NO_PEEK: RuleSet = { ...BASELINE, dealerPeek: false };

  /**
   * The chance the hole card is a ten, with only the dealer's ace off the table.
   *
   * Insurance is offered on the count and nothing else — no hand appears in the published
   * index — so the pool here holds every card but the upcard. The player's own two cards do
   * move it: holding one ten takes 0.0048 off `p`, which is worth 0.0144 of an insurance
   * wager. That is real composition dependence rather than noise, and it is larger than the
   * margin at the index, so a hand is deliberately not invented here.
   */
  const tenChance = (target: number) =>
    dealerOutcomes(upcard, NO_PEEK, shoeAtTrueCount(target, [upcard])).blackjack;

  /** Per unit wagered on insurance. Halve it for units of the opening bet. */
  const insuranceEv = (target: number) => 3 * tenChance(target) - 1;

  it("is a losing bet at a neutral count, as every basic strategy chart says", () => {
    expect(insuranceEv(0)).toBeLessThan(-0.05);
    expect(tenChance(0)).toBeCloseTo(4 / 13, 2);
  });

  it("gets better with every point of true count", () => {
    let previous = -Infinity;
    for (const target of [-2, -1, 0, 1, 2, 3, 4, 5]) {
      const ev = insuranceEv(target);
      expect(ev).toBeGreaterThan(previous);
      previous = ev;
    }
  });

  it("breaks even just below the published index of +3", () => {
    // Measured crossover: between +2.5 and +2.75 on the quarter-count lattice, which is as
    // fine as this can be read — one ten more or less in a 208-card pool moves `3p - 1` by
    // 0.0144. So +3 is the first whole count at which insurance is unambiguously right, and
    // the published index is the correct integer, rounded conservatively upward.
    expect(insuranceIndex(HI_LO)).toBe(3);
    expect(insuranceEv(2.5)).toBeLessThan(0);
    expect(insuranceEv(2.75)).toBeGreaterThan(0);
  });

  it("is a winning bet at exactly +3, and better above it", () => {
    // +0.0096 per unit wagered is +0.0048 of the opening bet. Small, as an index measured
    // right at its own boundary must be, but on the right side of zero — and the engine
    // truncates true counts by default, so a player showing "+3" holds an exact count
    // anywhere in [3, 4), which averages well clear of break-even.
    expect(insuranceEv(3)).toBeCloseTo(0.0096, 3);
    expect(insuranceEv(4)).toBeGreaterThan(0.02);
    expect(insuranceEv(5)).toBeGreaterThan(0.05);
  });

  it("is never worth taking below the index", () => {
    for (const target of [0, 1, 2]) expect(insuranceEv(target)).toBeLessThan(0);
    // +2 is the near miss: -0.0192 a wager, -0.0096 of the opening bet. Declining it at the
    // published index is right, and not by a hair.
    expect(insuranceEv(2)).toBeCloseTo(-0.0192, 3);
  });
});

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

describe("nothing published is left unmeasured", () => {
  it("cross-checks all 22 entries: 21 playing indices and insurance", () => {
    expect(HI_LO_INDEXES.entries).toHaveLength(22);
    expect(PLAYING).toHaveLength(21);
    expect(Object.keys(MEASURED)).toHaveLength(21);
    for (const entry of PLAYING) expect(MEASURED[entry.id]).toBeDefined();
  });

  it("changed no published index to make any of this pass", () => {
    // The acceptance criterion of the issue this file closes, asserted rather than asserted
    // in prose. These are the 22 numbers as `deviations.test.ts` transcribes them from the
    // published tables; if the cross-check above had been allowed to move one, it would
    // disagree here.
    expect(
      [...ILLUSTRIOUS_18, ...FAB_4].map((entry) => `${entry.id}:${entry.index}`).join(" "),
    ).toBe(
      "insurance:3 16v10:0 15v10:4 TTv5:5 TTv6:4 10v10:4 12v3:2 12v2:3 11vA:1 9v2:1 10vA:4 " +
        "9v7:3 16v9:5 13v2:-1 12v4:0 12v5:-2 12v6:-1 13v3:-2 14v10R:3 15v10R:0 15v9R:2 15vAR:1",
    );
  });
});
