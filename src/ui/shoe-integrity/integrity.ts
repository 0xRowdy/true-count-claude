/**
 * The arithmetic behind the Shoe Integrity Panel.
 *
 * ADR-0004: "We cannot argue a user out of believing the shoe is rigged. We can let them
 * check." Everything in this file exists to turn a claim the user must believe into a
 * check the user can watch happen.
 *
 * Deliberately free of React and React Native so it runs under the engine's own test
 * runner: the panel's promises are asserted in CI, not just rendered.
 *
 * This module derives; it never decides. All counting and shoe logic comes from
 * `src/engine` — if this file recomputed a Running Count of its own, the panel could
 * agree with itself while disagreeing with the game, which is the exact failure mode it
 * exists to catch.
 */

import { type Card, type Rank, RANKS, cardId } from "@/engine/cards";
import {
  type CountingSystem,
  currentRunningCount,
  deckTagSum,
  initialRunningCount,
  runningCount,
  tagFor,
  verifyBalance,
} from "@/engine/counting";
import type { RuleSet } from "@/engine/rules";
import {
  type RankComposition,
  type Shoe,
  cardsRemaining,
  dealtCards,
  decksRemaining,
  isCutCardReached,
  remainingComposition,
  verifyComposition,
} from "@/engine/shoe";

/**
 * Collapses negative zero. `-0` renders as "-0", and a count display reading "-0" is
 * exactly the kind of small wrongness that makes a user doubt the large rightness.
 */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

// ---------------------------------------------------------------------------
// The zero-sum check
// ---------------------------------------------------------------------------

/**
 * The reconciliation at the heart of the panel.
 *
 * A competitor shipped a count that did not return to zero at the end of a balanced shoe,
 * and a *user* found it. The naive way to answer that is to deal 312 cards and show a zero
 * at the end — a claim about the future, checkable only once per Shoe.
 *
 * The stronger form, and the one this type encodes, holds at **every** point in the Shoe:
 *
 *     count the player holds now  +  tags of the cards still undealt  =  the finish
 *
 * For a balanced Counting System the finish is zero, by definition. For KO and Red 7 it is
 * the system's pivot, because those start at an offset (`initialRunningCount`) chosen so
 * that a fully dealt Shoe lands there. Because `currentRunningCount` already folds in that
 * offset, one statement covers all six systems with no special case.
 */
export interface ZeroSumCheck {
  readonly systemId: CountingSystem["id"];
  readonly systemName: string;
  readonly balanced: boolean;
  /** The Running Count the player is holding right now. */
  readonly countNow: number;
  /** Tag sum of every card still undealt. The Shoe's unspent count. */
  readonly countRemaining: number;
  /** `countNow + countRemaining`. Must equal `finish`, always. */
  readonly reconciled: number;
  /** Where the Running Count must land: 0 for a balanced system, the pivot otherwise. */
  readonly finish: number;
  /** The Running Count this system starts a Shoe of this size at. Zero when balanced. */
  readonly start: number;
  /** Tag sum over one full 52-card deck: 0 when balanced, +4 for KO, +2 for Red 7. */
  readonly tagsPerDeck: number;
  /** `system.balanced` recomputed from the tag table rather than taken on trust. */
  readonly balanceClaimVerified: boolean;
  readonly cardsRemaining: number;
  /** True once every card has been dealt — the moment the count must read `finish`. */
  readonly shoeComplete: boolean;
  /** The whole point. False is a bug, loudly. */
  readonly holds: boolean;
}

export function zeroSumCheck(shoe: Shoe, system: CountingSystem): ZeroSumCheck {
  const dealt = dealtCards(shoe);
  const undealt = shoe.cards.slice(shoe.dealtCount);

  const countNow = currentRunningCount(dealt, system, shoe.decks);
  const countRemaining = runningCount(undealt, system);
  const reconciled = normalizeZero(countNow + countRemaining);
  const finish = system.pivot;

  return {
    systemId: system.id,
    systemName: system.name,
    balanced: system.balanced,
    countNow,
    countRemaining,
    reconciled,
    finish,
    start: initialRunningCount(system, shoe.decks),
    tagsPerDeck: deckTagSum(system),
    balanceClaimVerified: verifyBalance(system),
    cardsRemaining: cardsRemaining(shoe),
    shoeComplete: shoe.dealtCount >= shoe.cards.length,
    holds: reconciled === finish,
  };
}

// ---------------------------------------------------------------------------
// The count trace
// ---------------------------------------------------------------------------

/** One sampled point on the Running Count's path through the Shoe. */
export interface TracePoint {
  /** Cards dealt at this point. */
  readonly index: number;
  /** The Running Count the player held after that many cards. */
  readonly count: number;
}

/**
 * The Running Count's path across the cards dealt so far.
 *
 * Only the dealt prefix is traced. Plotting the undealt tail would spoil the Shoe, and a
 * panel that proves fairness by revealing the next card has solved the wrong problem.
 *
 * Downsampled to `maxPoints` so a 416-card eight-deck Shoe costs the same to draw as a
 * single deck. The first and last points are always exact: the start of the Shoe and the
 * count as it stands now, which are the two values the user checks against the readouts.
 */
export function countTrace(shoe: Shoe, system: CountingSystem, maxPoints = 96): TracePoint[] {
  const start = initialRunningCount(system, shoe.decks);
  const points: TracePoint[] = [{ index: 0, count: start }];

  const dealt = dealtCards(shoe);
  if (dealt.length === 0) return points;

  const stride = Math.max(1, Math.ceil(dealt.length / Math.max(1, maxPoints - 1)));
  let count = start;
  for (let i = 0; i < dealt.length; i++) {
    const card = dealt[i];
    if (!card) continue;
    count = normalizeZero(count + tagFor(card, system));
    if ((i + 1) % stride === 0) points.push({ index: i + 1, count });
  }

  const last = points[points.length - 1];
  if (!last || last.index !== dealt.length) points.push({ index: dealt.length, count });
  return points;
}

/** The vertical window a trace is drawn in, centred on the line the count must come home to. */
export interface TraceRange {
  /** The value drawn dead centre — the finish the count is heading for. */
  readonly home: number;
  /** Half the window height, in count units. Always at least `minSpan`. */
  readonly span: number;
}

/**
 * Centres the plot on the finish rather than on zero. For a balanced system those are the
 * same line; for KO at six decks the count starts at -20 and climbs to +4, and centring on
 * the finish is what makes "the line comes home" legible for every system at once.
 */
export function traceRange(points: readonly TracePoint[], home: number, minSpan = 4): TraceRange {
  let reach = minSpan;
  for (const point of points) reach = Math.max(reach, Math.abs(point.count - home));
  return { home, span: Math.ceil(reach) };
}

// ---------------------------------------------------------------------------
// Results vs. expectation
// ---------------------------------------------------------------------------

/**
 * A bounded run of Play or Drill, reduced to the two numbers a downswing argument needs.
 * The Session store does not exist yet; until it does the panel takes these from the user,
 * which is also what lets someone check a session they played somewhere else.
 */
export interface SessionResult {
  readonly hands: number;
  /** Net result in betting units. Negative is a loss. */
  readonly netUnits: number;
}

/**
 * House edge per hand, in units, for flat-betting Basic Strategy at the default Rule Set
 * (six decks, H17, 3:2, DAS, late surrender). Roughly 0.55%.
 */
export const DEFAULT_EDGE_PER_HAND = 0.0055;

/**
 * Standard deviation of one flat-bet hand, in units. ~1.14 for a shoe game — the spread
 * comes from blackjacks, doubles and splits, not from the small mean.
 *
 * This number is the entire reason the panel exists: over 500 hands the expected loss is
 * under 3 units while one standard deviation is over 25. A user who is 40 units down is
 * inside ordinary noise, and no amount of insisting will convince them of that. Arithmetic
 * might.
 */
export const DEFAULT_SD_PER_HAND = 1.14;

export type ExpectationVerdict = "ordinary" | "uncommon" | "report-it";

export interface ExpectationBand {
  readonly hands: number;
  readonly netUnits: number;
  readonly edgePerHand: number;
  readonly sdPerHand: number;
  /** Where a fair game centres: `-edgePerHand x hands`. */
  readonly expected: number;
  /** One standard deviation over this many hands, in units. */
  readonly sd: number;
  /** Standard deviations from expectation. Negative is a downswing. */
  readonly z: number;
  /** Probability a fair game lands at or below this result. */
  readonly percentile: number;
  /** Probability of a result at least this far from expectation, in this direction. */
  readonly tailProbability: number;
  /** `tailProbability` as "about 1 session in N". Infinite when the tail rounds to zero. */
  readonly oneInSessions: number;
  readonly verdict: ExpectationVerdict;
}

/**
 * Where a result sits in the distribution a fair game would produce.
 *
 * A normal approximation, which is sound past a few dozen hands and stated as an
 * approximation in the UI. Claiming more precision than the model has would be its own
 * small dishonesty in a panel whose only asset is credibility.
 */
export function expectationBand(
  result: SessionResult,
  edgePerHand: number = DEFAULT_EDGE_PER_HAND,
  sdPerHand: number = DEFAULT_SD_PER_HAND,
): ExpectationBand {
  const hands = Math.max(0, Math.floor(result.hands));
  const expected = -edgePerHand * hands;
  const sd = sdPerHand * Math.sqrt(hands);

  const z = sd > 0 ? (result.netUnits - expected) / sd : 0;
  const percentile = normalCdf(z);
  const tailProbability = sd > 0 ? (z <= 0 ? percentile : 1 - percentile) : 1;
  const magnitude = Math.abs(z);

  return {
    hands,
    netUnits: result.netUnits,
    edgePerHand,
    sdPerHand,
    expected: normalizeZero(expected),
    sd,
    z: normalizeZero(z),
    percentile,
    tailProbability,
    oneInSessions: tailProbability > 0 ? 1 / tailProbability : Number.POSITIVE_INFINITY,
    verdict: magnitude < 2 ? "ordinary" : magnitude < 3 ? "uncommon" : "report-it",
  };
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Abramowitz & Stegun 7.1.26. Absolute error below 1.5e-7 — far tighter than the model. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const value = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * value);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
    t;
  return sign * (1 - poly * Math.exp(-value * value));
}

/** The downswing, in a sentence a user can act on. */
export function describeExpectation(band: ExpectationBand): string {
  if (band.hands < 1) return "Enter a Session's hands and net result to place it in the band.";

  const direction = band.netUnits < band.expected ? "badly" : "well";
  const frequency = Number.isFinite(band.oneInSessions)
    ? `about 1 Session in ${formatOneIn(band.oneInSessions)}`
    : "vanishingly rare";
  const run = `Doing this ${direction} or worse over ${band.hands} hands happens in ${frequency}.`;

  switch (band.verdict) {
    case "ordinary":
      return `${run} That is ordinary variance, not a broken Shoe.`;
    case "uncommon":
      return `${run} Uncommon, but well inside what a fair Shoe produces.`;
    case "report-it":
      return `${run} Far enough out to be worth reporting — export this report and send it to us with the seed.`;
  }
}

function formatOneIn(value: number): string {
  if (value < 10) return value.toFixed(1);
  if (value < 1000) return String(Math.round(value));
  return `${Math.round(value / 1000)},000`;
}

// ---------------------------------------------------------------------------
// The exportable report
// ---------------------------------------------------------------------------

/** Tallies the dealt cards by rank, so a report shows both halves of the conservation sum. */
export function dealtComposition(shoe: Shoe): RankComposition {
  const counts = Object.fromEntries(RANKS.map((rank) => [rank, 0])) as Record<Rank, number>;
  for (const card of dealtCards(shoe)) counts[card.rank]++;
  return counts;
}

export interface IntegrityReportInput {
  readonly shoe: Shoe;
  readonly rules: RuleSet;
  readonly system: CountingSystem;
  /** ISO timestamp. Passed in rather than read, so this module stays deterministic. */
  readonly generatedAt: string;
  readonly appVersion: string;
  readonly session?: SessionResult;
}

/**
 * Everything needed to reproduce a Shoe and re-run every check in this panel.
 *
 * Invariant 10 asks for bug reports that capture state. ADR-0004 makes a seed plus a card
 * index a complete repro, so this is deliberately small: the seed and the Rule Set
 * regenerate the cards exactly, and the rest is the evidence the user was looking at when
 * they decided something was wrong.
 */
export interface IntegrityReport {
  readonly schema: "true-count.shoe-integrity.v1";
  readonly generatedAt: string;
  readonly appVersion: string;
  readonly rules: RuleSet;
  readonly shoe: {
    readonly seed: number;
    readonly decks: number;
    readonly totalCards: number;
    readonly dealtCount: number;
    readonly cardsRemaining: number;
    readonly decksRemaining: number;
    readonly cutIndex: number;
    readonly cutCardReached: boolean;
  };
  readonly countingSystem: {
    readonly id: CountingSystem["id"];
    readonly name: string;
    readonly level: number;
    readonly balanced: boolean;
    readonly source: string;
    readonly tags: Readonly<Record<Rank, number>>;
  };
  readonly checks: {
    /** `verifyComposition`: the Shoe holds exactly `decks x 4` of every rank. */
    readonly compositionIntact: boolean;
    readonly expectedPerRank: number;
    readonly zeroSum: ZeroSumCheck;
  };
  readonly remainingByRank: RankComposition;
  readonly dealtByRank: RankComposition;
  /** The full dealt-card history, in order, as `rank + suit`. */
  readonly dealtCards: readonly string[];
  readonly session?: {
    readonly result: SessionResult;
    readonly expectation: ExpectationBand;
  };
}

export function buildIntegrityReport(input: IntegrityReportInput): IntegrityReport {
  const { shoe, rules, system, session } = input;

  return {
    schema: "true-count.shoe-integrity.v1",
    generatedAt: input.generatedAt,
    appVersion: input.appVersion,
    rules,
    shoe: {
      seed: shoe.seed,
      decks: shoe.decks,
      totalCards: shoe.cards.length,
      dealtCount: shoe.dealtCount,
      cardsRemaining: cardsRemaining(shoe),
      decksRemaining: decksRemaining(shoe),
      cutIndex: shoe.cutIndex,
      cutCardReached: isCutCardReached(shoe),
    },
    countingSystem: {
      id: system.id,
      name: system.name,
      level: system.level,
      balanced: system.balanced,
      source: system.source,
      tags: system.tags,
    },
    checks: {
      compositionIntact: verifyComposition(shoe),
      expectedPerRank: shoe.decks * 4,
      zeroSum: zeroSumCheck(shoe, system),
    },
    remainingByRank: remainingComposition(shoe),
    dealtByRank: dealtComposition(shoe),
    dealtCards: dealtCards(shoe).map(cardId),
    ...(session ? { session: { result: session, expectation: expectationBand(session) } } : {}),
  };
}

export function formatIntegrityReport(report: IntegrityReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Named for the Shoe rather than the clock: two exports of the same Shoe at the same point
 * collide by design, and a filename carrying the seed is already half a bug report.
 */
export function integrityReportFileName(shoe: Shoe): string {
  return `true-count-shoe-${shoe.seed}-${shoe.dealtCount}of${shoe.cards.length}.json`;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const SUIT_GLYPHS = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;

export function suitGlyph(card: Card): string {
  return SUIT_GLYPHS[card.suit];
}

export function isRedSuit(card: Card): boolean {
  return card.suit === "h" || card.suit === "d";
}

/** Signed, so `+3` reads as a count rather than as a quantity. Halves survive intact. */
export function formatSigned(value: number): string {
  const magnitude = Math.abs(value) % 1 === 0 ? String(Math.abs(value)) : Math.abs(value).toFixed(1);
  if (value > 0) return `+${magnitude}`;
  if (value < 0) return `−${magnitude}`;
  return "0";
}

/** Units, to one decimal, signed. Used for bankroll results rather than counts. */
export function formatUnits(value: number): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  if (rounded < 0) return `−${Math.abs(rounded).toFixed(1)}`;
  return "0.0";
}
