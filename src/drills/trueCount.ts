/**
 * The True Count drill: a Running Count and a shoe state in, a True Count out.
 *
 * The product is named after this conversion, and it is the step players actually drop.
 * Two failure modes get drilled deliberately rather than left to chance, because random
 * shoe states produce them too rarely to practise:
 *
 *  - **Negative counts.** Dividing a negative Running Count is where two perfectly
 *    reasonable roundings disagree, and the disagreement is a whole point. `-7 / 2` is
 *    `-3.5`: truncation toward zero gives `-3`, flooring gives `-4`. The engine ships four
 *    explicit rounding modes for this reason and defaults to truncation as the only
 *    symmetric one (`counting.ts`), and `#3`'s merge note records that the original spec
 *    conflated the two operations — "they differ precisely on negatives, which is where
 *    users fail".
 *  - **Two-digit counts.** A deep shoe turns a large Running Count into a very large True
 *    Count, and the arithmetic stops being automatic exactly when the bet is biggest.
 *
 * The mix is data (`DEFAULT_TRUE_COUNT_MIX`), so the emphasis is a number a reviewer can
 * argue with rather than a bias hidden in the generator.
 *
 * **The Explanation shows the division and every rounding.** A user who answers `-4` to
 * `-7 ÷ 2` has not failed at arithmetic; they have used floor where this drill uses
 * truncation. Telling them "wrong" teaches nothing. `correctUnderRounding` names the mode
 * their answer *was* right under, which is the difference between a correction and a lesson.
 *
 * Questions are generated from the run's seed and the question's index, so a run is
 * reproducible and an undo lands back on exactly the question it came from.
 */

import {
  type CountingSystem,
  type CountingSystemId,
  type TrueCountRounding,
  DEFAULT_RULES,
  DEFAULT_TRUE_COUNT_ROUNDING,
  HI_LO,
  RANKS,
  type Rng,
  createRng,
  trueCount,
} from "@/engine";
import {
  type ScoreTally,
  type Undoable,
  EMPTY_TALLY,
  beginUndoable,
  rate,
  recordVerdict,
  replace,
  step,
} from "./progress";
import type { Verdict } from "./types";

/**
 * What a generated question is aiming at. A question can satisfy more than one of these —
 * a deep shoe is where two-digit true counts come from — so the focus records what the
 * generator was *trying* to produce and `traits` records what it actually did.
 */
export type TrueCountFocus =
  /** A count and a shoe a player meets constantly. The baseline. */
  | "ordinary"
  /** A negative Running Count, where rounding modes disagree. */
  | "negative"
  /** A Running Count of ten or more in absolute value. */
  | "two-digit-running"
  /** A True Count of ten or more in absolute value. */
  | "two-digit-true"
  /** Under a deck and a half left, where the divisor is small and the count swings. */
  | "deep-shoe";

export const TRUE_COUNT_FOCUSES: readonly TrueCountFocus[] = [
  "ordinary",
  "negative",
  "two-digit-running",
  "two-digit-true",
  "deep-shoe",
];

/**
 * Relative weights. Eight parts in eleven aim at a documented failure mode, which is the
 * whole point of drilling rather than simulating: a real shoe serves up an ordinary count
 * nine times out of ten and never gets round to the hard ones.
 */
export const DEFAULT_TRUE_COUNT_MIX: Readonly<Record<TrueCountFocus, number>> = {
  ordinary: 3,
  negative: 3,
  "two-digit-running": 2,
  "two-digit-true": 2,
  "deep-shoe": 1,
};

export interface TrueCountDrillConfig {
  readonly system: CountingSystem;
  readonly decks: number;
  readonly rounding: TrueCountRounding;
  readonly mix: Readonly<Record<TrueCountFocus, number>>;
  /** The smallest shoe remnant a question may use. Half a deck by default. */
  readonly minCardsRemaining: number;
}

export const DEFAULT_TRUE_COUNT_CONFIG: TrueCountDrillConfig = {
  system: HI_LO,
  decks: DEFAULT_RULES.decks,
  rounding: DEFAULT_TRUE_COUNT_ROUNDING,
  mix: DEFAULT_TRUE_COUNT_MIX,
  minCardsRemaining: 26,
};

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export interface TrueCountDrillAvailability {
  readonly available: boolean;
  readonly system: CountingSystemId;
  readonly note: string | null;
  /** The systems this drill can be run with. */
  readonly supportedSystems: readonly CountingSystemId[];
}

const BALANCED_SYSTEMS: readonly CountingSystemId[] = ["hi-lo", "omega-ii", "wong-halves", "zen"];

/**
 * Whether the True Count conversion is the right thing to drill for a system.
 *
 * KO and Red 7 are unbalanced, and *not converting* is their entire design: their player
 * reads the Running Count against a pivot that is the same number at any deck count. A
 * drill that taught them to divide would be teaching the wrong procedure, so it declines
 * and says why rather than quietly accepting the system and producing arithmetic nobody
 * should be doing. Same refusal as the ace side count in `counting.ts`.
 */
export function trueCountDrillAvailability(system: CountingSystem): TrueCountDrillAvailability {
  if (system.balanced) {
    return { available: true, system: system.id, note: null, supportedSystems: BALANCED_SYSTEMS };
  }
  return {
    available: false,
    system: system.id,
    note:
      `${system.name} is unbalanced: it is played off the Running Count against a pivot of ` +
      `${system.pivot}, with no true-count conversion at all. There is nothing here to drill — ` +
      `practise the Running Count instead, or switch to a balanced system.`,
    supportedSystems: BALANCED_SYSTEMS,
  };
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/** What makes a question hard, recorded on the question itself so a report can group by it. */
export interface TrueCountTraits {
  readonly negativeRunningCount: boolean;
  readonly negativeTrueCount: boolean;
  /** `|runningCount| >= 10`. */
  readonly twoDigitRunningCount: boolean;
  /** `|trueCount| >= 10`. */
  readonly twoDigitTrueCount: boolean;
  /** The divisor is not a whole number of decks. */
  readonly fractionalDecks: boolean;
  /** Under one deck left — the divisor is below 1 and the count multiplies. */
  readonly deepShoe: boolean;
  /** The exact quotient is not a whole number, so the rounding step actually bites. */
  readonly roundingMatters: boolean;
}

export interface TrueCountQuestion {
  /** Position in the run. With the run's seed, this reproduces the question exactly. */
  readonly index: number;
  readonly system: CountingSystemId;
  readonly systemName: string;
  readonly decks: number;
  readonly runningCount: number;
  readonly cardsRemaining: number;
  readonly decksRemaining: number;
  readonly rounding: TrueCountRounding;
  readonly focus: TrueCountFocus;
  /** The graded answer, under the drill's rounding mode. */
  readonly answer: number;
  /** The unrounded quotient. */
  readonly exact: number;
  readonly traits: TrueCountTraits;
}

/**
 * The seed for one question: the run's seed mixed with the question's index.
 *
 * Mixed rather than counted so neighbouring questions are not neighbouring shoes, and
 * derived rather than stored so an undo lands on the same question it left.
 */
export function questionSeed(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The Running Count's granularity. Wong Halves keeps fractional tags — they are exact
 * binary fractions and the published indices are quoted against that scale — so its player
 * really does hold counts like +7.5, and the drill poses them.
 */
function runningCountStep(system: CountingSystem): number {
  return RANKS.some((rank) => !Number.isInteger(system.tags[rank])) ? 0.5 : 1;
}

/** Quarter-deck granularity: what a player actually estimates off a discard tray. */
const CARDS_PER_QUARTER_DECK = 13;

export function trueCountQuestion(
  config: TrueCountDrillConfig,
  seed: number,
  index: number,
): TrueCountQuestion {
  const rng = createRng(questionSeed(seed, index));
  const focus = pickFocus(config.mix, rng);
  return trueCountQuestionFrom(config, { ...draw(config, focus, rng), focus, index });
}

export interface ExplicitTrueCountQuestion {
  readonly runningCount: number;
  readonly cardsRemaining: number;
  readonly focus?: TrueCountFocus;
  readonly index?: number;
}

/**
 * A question posed from an exact Running Count and shoe remnant.
 *
 * The generator is one caller; a screen offering "drill this conversion again" is another,
 * and so is a test that needs the `-7 ÷ 2` case rather than whatever a seed happens to give.
 */
export function trueCountQuestionFrom(
  config: TrueCountDrillConfig,
  input: ExplicitTrueCountQuestion,
): TrueCountQuestion {
  const { runningCount, cardsRemaining } = input;
  if (cardsRemaining <= 0) {
    throw new Error(
      `A True Count question needs cards left to divide by; got ${cardsRemaining}. ` +
        `The conversion is undefined at the end of a shoe.`,
    );
  }

  const index = input.index ?? 0;
  const focus = input.focus ?? "ordinary";
  const decksRemaining = cardsRemaining / 52;
  const exact = trueCount(runningCount, decksRemaining, "exact");
  const answer = trueCount(runningCount, decksRemaining, config.rounding);

  return {
    index,
    system: config.system.id,
    systemName: config.system.name,
    decks: config.decks,
    runningCount,
    cardsRemaining,
    decksRemaining,
    rounding: config.rounding,
    focus,
    answer,
    exact,
    traits: {
      negativeRunningCount: runningCount < 0,
      negativeTrueCount: answer < 0,
      twoDigitRunningCount: Math.abs(runningCount) >= 10,
      twoDigitTrueCount: Math.abs(answer) >= 10,
      fractionalDecks: !Number.isInteger(decksRemaining),
      deepShoe: decksRemaining < 1,
      roundingMatters: !Number.isInteger(exact),
    },
  };
}

function pickFocus(
  mix: Readonly<Record<TrueCountFocus, number>>,
  rng: Rng,
): TrueCountFocus {
  const total = TRUE_COUNT_FOCUSES.reduce((sum, focus) => sum + Math.max(0, mix[focus]), 0);
  if (total <= 0) return "ordinary";

  let roll = rng.next() * total;
  for (const focus of TRUE_COUNT_FOCUSES) {
    roll -= Math.max(0, mix[focus]);
    if (roll < 0) return focus;
  }
  return "ordinary";
}

interface Draw {
  readonly runningCount: number;
  readonly cardsRemaining: number;
}

function draw(config: TrueCountDrillConfig, focus: TrueCountFocus, rng: Rng): Draw {
  const maxQuarters = config.decks * 4;
  const minQuarters = Math.max(
    1,
    Math.ceil(config.minCardsRemaining / CARDS_PER_QUARTER_DECK),
  );
  const quartersIn = (low: number, high: number): number =>
    clampInt(
      low + rng.nextInt(Math.max(1, Math.min(high, maxQuarters) - low + 1)),
      minQuarters,
      maxQuarters,
    );

  switch (focus) {
    case "ordinary": {
      const quarters = quartersIn(Math.max(minQuarters, 4), maxQuarters);
      return finish(config, signedMagnitude(rng, 1, 9), quarters, rng);
    }
    case "negative": {
      const quarters = quartersIn(minQuarters, maxQuarters);
      return finish(config, -magnitude(rng, 1, 18), quarters, rng);
    }
    case "two-digit-running": {
      const quarters = quartersIn(minQuarters, maxQuarters);
      return finish(config, signedMagnitude(rng, 10, 26), quarters, rng);
    }
    case "two-digit-true": {
      // A two-digit True Count needs a small divisor and a big count, so this picks the
      // shallow end of the shoe first and then works backwards from the answer it wants.
      const quarters = quartersIn(minQuarters, Math.max(minQuarters, 6));
      const decksLeft = (quarters * CARDS_PER_QUARTER_DECK) / 52;
      const target = magnitude(rng, 10, 16) * (rng.next() < 0.5 ? -1 : 1);
      return finish(config, Math.round(target * decksLeft), quarters, rng);
    }
    case "deep-shoe": {
      const quarters = quartersIn(minQuarters, Math.max(minQuarters, 4));
      return finish(config, signedMagnitude(rng, 1, 12), quarters, rng);
    }
  }
}

function magnitude(rng: Rng, low: number, high: number): number {
  return low + rng.nextInt(high - low + 1);
}

function signedMagnitude(rng: Rng, low: number, high: number): number {
  return magnitude(rng, low, high) * (rng.next() < 0.5 ? -1 : 1);
}

/**
 * Finishes a draw: snaps the Running Count to the system's own granularity and clamps it to
 * a count the shoe could actually hold.
 *
 * The clamp is not cosmetic. A one-deck shoe holds twenty low cards, so a Running Count of
 * +26 is not a hard question, it is an impossible one — and a trainer posing impossible
 * states is the "wrong math" complaint in a new costume.
 */
function finish(
  config: TrueCountDrillConfig,
  runningCount: number,
  quarters: number,
  rng: Rng,
): Draw {
  const cardsRemaining = quarters * CARDS_PER_QUARTER_DECK;
  const granularity = runningCountStep(config.system);
  // Wong Halves really does leave its player holding +7.5, so half the questions for a
  // fractional system are posed on the half. Every other system snaps to whole points.
  const raw =
    granularity < 1 && rng.next() < 0.5
      ? runningCount + granularity * (runningCount < 0 ? -1 : 1)
      : runningCount;
  const snapped = Math.round(raw / granularity) * granularity;

  const dealt = config.decks * 52 - cardsRemaining;
  // The largest count a balanced level-1 shoe can reach is one point per low card, of which
  // there are twenty per deck. Higher-level systems reach further, so this is scaled by the
  // system's own biggest tag rather than assumed.
  const maxTag = RANKS.reduce((best, rank) => Math.max(best, Math.abs(config.system.tags[rank])), 1);
  const ceiling = Math.min(dealt, 20 * config.decks * maxTag);

  const clamped = Math.max(-ceiling, Math.min(ceiling, snapped));
  // Never hand back a question whose answer is zero by accident of clamping to an empty
  // shoe; a count of zero is a legitimate question, a count of zero forced by a clamp is not.
  return { runningCount: clamped === 0 ? 0 : clamped, cardsRemaining };
}

function clampInt(value: number, low: number, high: number): number {
  return Math.min(Math.max(Math.round(value), low), high);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface TrueCountExplanation {
  readonly kind: "true-count";
  readonly system: CountingSystemId;
  readonly systemName: string;
  readonly runningCount: number;
  readonly cardsRemaining: number;
  readonly decksRemaining: number;
  /** The unrounded quotient: the division, before anything is done to it. */
  readonly exact: number;
  readonly rounding: TrueCountRounding;
  readonly answer: number;
  readonly stated: number;
  /** `stated - answer`. */
  readonly off: number;
  /** What every rounding mode makes of this division. */
  readonly byRounding: Readonly<Record<TrueCountRounding, number>>;
  /**
   * The rounding mode the user's answer would have been correct under, or `null`.
   *
   * This is the lesson for negative counts: `-7 ÷ 2` is `-3.5`, and a user who says `-4`
   * has floored rather than truncated. They did arithmetic, not a blunder.
   */
  readonly correctUnderRounding: TrueCountRounding | null;
  /** Right magnitude, wrong sign — the other classic negative-count slip. */
  readonly signError: boolean;
  readonly traits: TrueCountTraits;
}

export interface TrueCountResult {
  readonly kind: "true-count";
  readonly verdict: Verdict;
  readonly question: TrueCountQuestion;
  readonly stated: number;
  readonly answer: number;
  readonly off: number;
  readonly explanation: TrueCountExplanation;
  readonly at: number;
}

const ROUNDING_MODES: readonly TrueCountRounding[] = ["exact", "truncate", "floor", "round"];

/**
 * Grades a stated True Count. Pure, synchronous, and explained whether it was right or
 * wrong — a user who got `-3` right still wants to see that floor would have said `-4`.
 */
export function scoreTrueCount(
  question: TrueCountQuestion,
  stated: number,
  at: number,
): TrueCountResult {
  const byRounding = Object.fromEntries(
    ROUNDING_MODES.map((mode) => [
      mode,
      trueCount(question.runningCount, question.decksRemaining, mode),
    ]),
  ) as Record<TrueCountRounding, number>;

  const correctUnderRounding =
    stated === question.answer
      ? null
      : (ROUNDING_MODES.find(
          (mode) => mode !== question.rounding && byRounding[mode] === stated,
        ) ?? null);

  return {
    kind: "true-count",
    verdict: stated === question.answer ? "correct" : "incorrect",
    question,
    stated,
    answer: question.answer,
    off: stated - question.answer,
    at,
    explanation: {
      kind: "true-count",
      system: question.system,
      systemName: question.systemName,
      runningCount: question.runningCount,
      cardsRemaining: question.cardsRemaining,
      decksRemaining: question.decksRemaining,
      exact: question.exact,
      rounding: question.rounding,
      answer: question.answer,
      stated,
      off: stated - question.answer,
      byRounding,
      correctUnderRounding,
      signError:
        stated !== question.answer &&
        stated !== 0 &&
        question.answer !== 0 &&
        Math.abs(stated) === Math.abs(question.answer),
      traits: question.traits,
    },
  };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** One answered question, reduced to what a report needs. */
export interface TrueCountAttempt {
  readonly questionIndex: number;
  readonly focus: TrueCountFocus;
  readonly traits: TrueCountTraits;
  readonly stated: number;
  readonly answer: number;
  readonly off: number;
  readonly verdict: Verdict;
  /** The mode the answer was right under, when it was right under one. */
  readonly correctUnderRounding: TrueCountRounding | null;
  readonly signError: boolean;
  readonly at: number;
}

export interface TrueCountDrillState {
  readonly config: TrueCountDrillConfig;
  readonly seed: number;
  readonly question: TrueCountQuestion;
  readonly tally: ScoreTally;
  readonly attempts: readonly TrueCountAttempt[];
  /** The verdict on the question still on screen, or `null` before it is answered. */
  readonly lastResult: TrueCountResult | null;
}

export type TrueCountDrill = Undoable<TrueCountDrillState>;

export function startTrueCountDrill(
  config: TrueCountDrillConfig = DEFAULT_TRUE_COUNT_CONFIG,
  seed = 1,
): TrueCountDrill {
  const availability = trueCountDrillAvailability(config.system);
  if (!availability.available) {
    throw new Error(availability.note ?? `${config.system.name} does not convert to a True Count.`);
  }

  return beginUndoable<TrueCountDrillState>({
    config,
    seed,
    question: trueCountQuestion(config, seed, 0),
    tally: EMPTY_TALLY,
    attempts: [],
    lastResult: null,
  });
}

/**
 * Grades the question on screen and leaves it there.
 *
 * The question is *not* advanced: the answer and its Explanation are read against the
 * numbers that produced them, and moving on is a separate, deliberate call (invariant 3).
 * A second submission for the same question is a no-op rather than an error, so a
 * double-tapped button cannot double-count an answer.
 */
export function submitTrueCount(
  drill: TrueCountDrill,
  stated: number,
  at: number,
): TrueCountDrill {
  const state = drill.current;
  if (state.lastResult !== null) return drill;

  const result = scoreTrueCount(state.question, stated, at);
  return step(drill, {
    ...state,
    tally: recordVerdict(state.tally, result.verdict),
    attempts: [
      ...state.attempts,
      {
        questionIndex: state.question.index,
        focus: state.question.focus,
        traits: state.question.traits,
        stated,
        answer: result.answer,
        off: result.off,
        verdict: result.verdict,
        correctUnderRounding: result.explanation.correctUnderRounding,
        signError: result.explanation.signError,
        at,
      },
    ],
    lastResult: result,
  });
}

/** Moves to the next question. Not an undo point — undo takes back an *answer*. */
export function nextTrueCountQuestion(drill: TrueCountDrill): TrueCountDrill {
  const state = drill.current;
  const index = state.question.index + 1;
  return replace(drill, {
    ...state,
    question: trueCountQuestion(state.config, state.seed, index),
    lastResult: null,
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface TrueCountSlice {
  readonly label: string;
  readonly attempts: number;
  readonly correct: number;
  readonly accuracy: number | null;
}

export interface TrueCountReport {
  readonly tally: ScoreTally;
  readonly attempts: readonly TrueCountAttempt[];
  readonly undone: number;
  /** Accuracy per generation focus. */
  readonly byFocus: readonly (TrueCountSlice & { readonly focus: TrueCountFocus })[];
  /**
   * The two slices this drill exists for, against their complements. A single accuracy
   * number hides the whole point: a user can be at 95% on positive counts and 40% on
   * negative ones and still read "82% correct".
   */
  readonly negativeTrueCounts: TrueCountSlice;
  readonly positiveTrueCounts: TrueCountSlice;
  readonly twoDigitCounts: TrueCountSlice;
  readonly singleDigitCounts: TrueCountSlice;
  /** Wrong answers that were right under a different rounding mode. */
  readonly roundingErrors: number;
  /** Wrong answers with the right magnitude and the wrong sign. */
  readonly signErrors: number;
  readonly meanAbsoluteError: number | null;
}

export function trueCountReport(drill: TrueCountDrill): TrueCountReport {
  const state = drill.current;
  const attempts = state.attempts;

  const slice = (label: string, of: (a: TrueCountAttempt) => boolean): TrueCountSlice => {
    const members = attempts.filter(of);
    const correct = members.filter((a) => a.verdict === "correct").length;
    return { label, attempts: members.length, correct, accuracy: rate(correct, members.length) };
  };

  return {
    tally: state.tally,
    attempts,
    undone: drill.undone,
    byFocus: TRUE_COUNT_FOCUSES.map((focus) => ({
      focus,
      ...slice(focus, (a) => a.focus === focus),
    })),
    negativeTrueCounts: slice("Negative true counts", (a) => a.traits.negativeTrueCount),
    positiveTrueCounts: slice("Zero or positive true counts", (a) => !a.traits.negativeTrueCount),
    twoDigitCounts: slice(
      "Two-digit counts",
      (a) => a.traits.twoDigitTrueCount || a.traits.twoDigitRunningCount,
    ),
    singleDigitCounts: slice(
      "Single-digit counts",
      (a) => !a.traits.twoDigitTrueCount && !a.traits.twoDigitRunningCount,
    ),
    roundingErrors: attempts.filter((a) => a.correctUnderRounding !== null).length,
    signErrors: attempts.filter((a) => a.signError).length,
    meanAbsoluteError:
      attempts.length === 0
        ? null
        : attempts.reduce((sum, a) => sum + Math.abs(a.off), 0) / attempts.length,
  };
}
