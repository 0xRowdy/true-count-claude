/**
 * The Counting drill.
 *
 * Cards come off a real seeded shoe at a speed the user picks; the user keeps the Running
 * Count in their head, hides the app's copy of it, and checks themselves whenever they
 * like. It works with all six systems, which is the product's wedge — the category leader
 * ships one unnamed count and no named system at all.
 *
 * **No clock lives here.** The drill holds an elapsed time and the caller advances it:
 * `advanceTo(drill, elapsedMs)` deals every card that is due by then. That keeps the whole
 * module pure and testable in plain Node — a speed test does not need a timer, it needs
 * arithmetic — and it means a screen can drive the same drill from a `requestAnimationFrame`
 * loop, a step button, or a replay without the drill knowing the difference.
 *
 * **Two counting subtleties are handled here rather than at the call sites**, because each
 * of them shows the user a number that is quietly false if it is missed:
 *
 *  - KO and Red 7 are unbalanced: the count the player holds starts at a deck-dependent
 *    initial running count, so the truth is `currentRunningCount`, never `runningCount`.
 *  - Red 7 is suit-sensitive. A red seven counts +1 and a black seven 0, so the per-rank
 *    summary below reports `null` for a rank whose tag depends on the suit rather than
 *    printing one of the two values as if it were the rule.
 *
 * **The Explanation is the tag trail.** Telling a user their count is off by two teaches
 * nothing; showing them the cards since their last check, each with its tag and the running
 * total after it, shows them where they slipped. The per-rank roll-up alongside it is what
 * catches a systematic error — someone tagging 7s as low, or forgetting that an ace is a
 * high card.
 */

import {
  type Card,
  type CountingSystem,
  type Rank,
  type Shoe,
  type TrueCountRounding,
  DEFAULT_RULES,
  DEFAULT_TRUE_COUNT_ROUNDING,
  HI_LO,
  RANKS,
  cardsRemaining,
  createShoe,
  currentRunningCount,
  deal,
  dealtCards,
  initialRunningCount,
  isCutCardReached,
  tagFor,
} from "@/engine";
import { type CountContext, buildCountContext } from "./explanation";
import {
  type ScoreTally,
  type Undoable,
  EMPTY_TALLY,
  beginUndoable,
  recordVerdict,
  replace,
  step,
} from "./progress";
import type { Verdict } from "./types";

/** Named speeds, in cards per minute. Data, so a screen renders the list rather than inventing one. */
export interface CountingSpeed {
  readonly id: string;
  readonly name: string;
  readonly cardsPerMinute: number;
}

/**
 * The ladder runs from "slower than any table" up to well past one.
 *
 * A busy six-deck table with a full box deals somewhere around 90-120 cards a minute, so
 * `dealer` is the realistic rung and everything above it is deliberate overspeed practice.
 */
export const COUNTING_SPEEDS: readonly CountingSpeed[] = [
  { id: "learning", name: "Learning", cardsPerMinute: 30 },
  { id: "steady", name: "Steady", cardsPerMinute: 60 },
  { id: "dealer", name: "Dealer pace", cardsPerMinute: 100 },
  { id: "fast", name: "Fast", cardsPerMinute: 150 },
  { id: "flat-out", name: "Flat out", cardsPerMinute: 240 },
];

export interface CountingDrillConfig {
  readonly system: CountingSystem;
  readonly decks: number;
  /** Fraction of the shoe dealt before the cut card. The drill ends there. */
  readonly penetration: number;
  readonly cardsPerMinute: number;
  /** Cards revealed at once. Two is what a table actually throws; one is easier to learn on. */
  readonly cardsPerStep: number;
  /** Start with the app's copy of the count hidden. The default, because that is the drill. */
  readonly startHidden: boolean;
}

export const DEFAULT_COUNTING_CONFIG: CountingDrillConfig = {
  system: HI_LO,
  decks: DEFAULT_RULES.decks,
  penetration: DEFAULT_RULES.penetration,
  cardsPerMinute: 60,
  cardsPerStep: 1,
  startHidden: true,
};

/** One count check, reduced to what a report needs. */
export interface CountCheckAttempt {
  readonly statedRunningCount: number;
  readonly actualRunningCount: number;
  /** `stated - actual`. Zero on a correct check. */
  readonly off: number;
  readonly cardsSeen: number;
  readonly verdict: Verdict;
  readonly at: number;
}

export interface CountingDrillState {
  readonly config: CountingDrillConfig;
  readonly seed: number;
  readonly shoe: Shoe;
  /** Milliseconds since the run began, as the caller reckons them. */
  readonly elapsedMs: number;
  /**
   * Where the current pace started: the clock reading and the card count at the moment the
   * speed was last set.
   *
   * Without this, changing speed mid-run would recompute "cards due" from time zero at the
   * new rate — so slowing down after sixty cards would stall the deal for two minutes while
   * the slower clock caught up to cards the user has already seen. The pace applies from
   * the change onward, which is what a dealer changing tempo actually does.
   */
  readonly paceFromMs: number;
  readonly paceFromCards: number;
  /** True while the app's copy of the count is hidden — the self-test position. */
  readonly countHidden: boolean;
  /** How many times the count was revealed. Counted, because peeking is part of the record. */
  readonly reveals: number;
  readonly tally: ScoreTally;
  readonly checks: readonly CountCheckAttempt[];
  readonly lastResult: CountCheckResult | null;
}

export type CountingDrill = Undoable<CountingDrillState>;

export function startCountingDrill(
  config: CountingDrillConfig = DEFAULT_COUNTING_CONFIG,
  seed = 1,
): CountingDrill {
  if (config.cardsPerMinute <= 0) {
    throw new Error(`Counting drill speed must be positive, got ${config.cardsPerMinute}.`);
  }
  if (!Number.isInteger(config.cardsPerStep) || config.cardsPerStep < 1) {
    throw new Error(`Cards per step must be a positive integer, got ${config.cardsPerStep}.`);
  }

  return beginUndoable<CountingDrillState>({
    config,
    seed,
    shoe: createShoe(
      { ...DEFAULT_RULES, decks: config.decks, penetration: config.penetration },
      seed,
    ),
    elapsedMs: 0,
    paceFromMs: 0,
    paceFromCards: 0,
    countHidden: config.startHidden,
    reveals: 0,
    tally: EMPTY_TALLY,
    checks: [],
    lastResult: null,
  });
}

// --- Pace ------------------------------------------------------------------------------

export function msPerCard(config: CountingDrillConfig): number {
  return 60_000 / config.cardsPerMinute;
}

/** How long one reveal takes. Two cards at 60 a minute is one pair every two seconds. */
export function msPerStep(config: CountingDrillConfig): number {
  return msPerCard(config) * config.cardsPerStep;
}

/**
 * How many cards should be face up at `elapsedMs`, capped at the cut card.
 *
 * Whole steps only: a pair arrives together or not at all, which is what a table does and
 * what keeps the count the user is holding a count of cards they have actually seen.
 */
export function cardsDueAt(config: CountingDrillConfig, elapsedMs: number): number {
  if (elapsedMs < 0) return 0;
  const steps = Math.floor(elapsedMs / msPerStep(config));
  return steps * config.cardsPerStep;
}

/** The last card of the run — the cut card position. */
export function totalCards(state: CountingDrillState): number {
  return state.shoe.cutIndex;
}

export function countingDrillFinished(state: CountingDrillState): boolean {
  return isCutCardReached(state.shoe);
}

// --- Transitions ----------------------------------------------------------------------

/**
 * Advances the run's clock and deals every card that has come due.
 *
 * Not an undo point: the clock is not an answer. Time only moves forward — an `elapsedMs`
 * behind the one already recorded is ignored rather than rewinding the shoe, because a
 * frame callback arriving out of order must not un-deal a card the user has already counted.
 */
export function advanceTo(drill: CountingDrill, elapsedMs: number): CountingDrill {
  const state = drill.current;
  if (elapsedMs <= state.elapsedMs) return drill;

  const due = state.paceFromCards + cardsDueAt(state.config, elapsedMs - state.paceFromMs);
  const target = Math.min(due, state.shoe.cutIndex);
  return replace(drill, {
    ...state,
    elapsedMs,
    shoe: dealTo(state.shoe, target),
  });
}

/** Deals the next step by hand, and moves the clock on by exactly one step's worth. */
export function dealNextStep(drill: CountingDrill): CountingDrill {
  const state = drill.current;
  const target = Math.min(
    state.shoe.dealtCount + state.config.cardsPerStep,
    state.shoe.cutIndex,
  );
  return replace(drill, {
    ...state,
    elapsedMs: state.elapsedMs + msPerStep(state.config),
    shoe: dealTo(state.shoe, target),
  });
}

function dealTo(shoe: Shoe, target: number): Shoe {
  let next = shoe;
  while (next.dealtCount < target) next = deal(next).shoe;
  return next;
}

/** Shows the app's copy of the count. Counted in `reveals`. */
export function revealCount(drill: CountingDrill): CountingDrill {
  const state = drill.current;
  if (!state.countHidden) return drill;
  return replace(drill, { ...state, countHidden: false, reveals: state.reveals + 1 });
}

/** Hides the count again — back to the self-test position. */
export function hideCount(drill: CountingDrill): CountingDrill {
  const state = drill.current;
  if (state.countHidden) return drill;
  return replace(drill, { ...state, countHidden: true });
}

export function toggleCount(drill: CountingDrill): CountingDrill {
  return drill.current.countHidden ? revealCount(drill) : hideCount(drill);
}

/**
 * Changes the deal speed mid-run without disturbing the shoe or the score.
 *
 * The new pace runs from here, not from the start of the run: the clock and the card count
 * are rebased so that slowing down pauses the deal rather than stalling it until a slower
 * clock has caught up with cards the user already counted.
 */
export function setSpeed(drill: CountingDrill, cardsPerMinute: number): CountingDrill {
  if (cardsPerMinute <= 0) {
    throw new Error(`Counting drill speed must be positive, got ${cardsPerMinute}.`);
  }
  const state = drill.current;
  return replace(drill, {
    ...state,
    config: { ...state.config, cardsPerMinute },
    paceFromMs: state.elapsedMs,
    paceFromCards: state.shoe.dealtCount,
  });
}

// --- The count ------------------------------------------------------------------------

/** The cards the user has seen. Every card in this drill is face up. */
export function countedCards(state: CountingDrillState): readonly Card[] {
  return dealtCards(state.shoe);
}

/** The truth: the Running Count the player should be holding, and its True Count. */
export function countingReadout(state: CountingDrillState): CountContext {
  return buildCountContext({
    system: state.config.system,
    decks: state.config.decks,
    runningCount: currentRunningCount(countedCards(state), state.config.system, state.config.decks),
    cardsRemaining: cardsRemaining(state.shoe),
    rounding: DEFAULT_TRUE_COUNT_ROUNDING,
  });
}

// --- Scoring --------------------------------------------------------------------------

/** One card of the trail: what it was, what it was worth, and the total after it. */
export interface CountStep {
  /** Position in the run, zero-based. */
  readonly ordinal: number;
  readonly card: Card;
  readonly tag: number;
  /** The Running Count the player should have been holding after this card. */
  readonly runningCount: number;
}

/** What one rank contributed over the checked span. */
export interface RankContribution {
  readonly rank: Rank;
  readonly seen: number;
  /** The rank's tag, or `null` when the system reads it off the suit — Red 7's sevens. */
  readonly tag: number | null;
  readonly contribution: number;
}

/**
 * Why a count check was right or wrong.
 *
 * The trail covers the cards since the *previous* check rather than the whole run, because
 * that is the span the error is in: a user whose last check was right and whose next one is
 * off by two slipped somewhere in between, and showing them the whole shoe would bury it.
 */
export interface CountExplanation {
  readonly kind: "count";
  readonly system: string;
  readonly systemName: string;
  readonly balanced: boolean;
  readonly statedRunningCount: number;
  readonly actualRunningCount: number;
  /** `stated - actual`. Positive means the user was running high. */
  readonly off: number;
  /** Where an unbalanced system's count starts. Zero for the four balanced ones. */
  readonly initialRunningCount: number;
  readonly cardsSeen: number;
  readonly count: CountContext;
  /** The Running Count at the start of the checked span. */
  readonly spanStartRunningCount: number;
  /** The span's own tag sum: `actualRunningCount - spanStartRunningCount`. */
  readonly spanTagSum: number;
  /** The cards of the span, each with its tag and the total after it. */
  readonly trail: readonly CountStep[];
  /** True when the span was too long to show in full and `trail` holds only its tail. */
  readonly trailTruncated: boolean;
  /** What each rank contributed over the span — where a systematic slip shows up. */
  readonly byRank: readonly RankContribution[];
}

/** How many cards of the trail are kept. Long enough to find a slip, short enough to render. */
export const MAX_TRAIL_CARDS = 80;

export interface CountCheckResult {
  readonly kind: "count-check";
  readonly verdict: Verdict;
  readonly statedRunningCount: number;
  readonly actualRunningCount: number;
  readonly off: number;
  readonly explanation: CountExplanation;
  readonly at: number;
}

/** Everything a count check can be scored and explained from, with no drill state attached. */
export interface CountCheckSituation {
  readonly system: CountingSystem;
  readonly decks: number;
  /** Every card seen this run, in order. */
  readonly seen: readonly Card[];
  /** How many cards had been seen at the previous check. The trail starts here. */
  readonly spanStart: number;
  readonly cardsRemaining: number;
  readonly rounding?: TrueCountRounding;
}

/**
 * Grades a stated Running Count. Pure and synchronous — callable the instant the user
 * commits a number, with the cards still on screen (invariant 3).
 *
 * A correct check is explained exactly as fully as a wrong one. Confirming that your count
 * came from the cards you think it did is the whole reason a self-test is worth taking.
 */
export function scoreCountCheck(
  situation: CountCheckSituation,
  statedRunningCount: number,
  at: number,
): CountCheckResult {
  const { system, decks, seen } = situation;
  const spanStart = clamp(situation.spanStart, 0, seen.length);

  const actual = currentRunningCount(seen, system, decks);
  const spanStartRunningCount = currentRunningCount(seen.slice(0, spanStart), system, decks);

  const trailStart = Math.max(spanStart, seen.length - MAX_TRAIL_CARDS);
  const trail: CountStep[] = [];
  let running = currentRunningCount(seen.slice(0, trailStart), system, decks);
  for (let i = trailStart; i < seen.length; i++) {
    const card = seen[i] as Card;
    const tag = tagFor(card, system);
    running += tag;
    trail.push({ ordinal: i, card, tag, runningCount: running });
  }

  const verdict: Verdict = statedRunningCount === actual ? "correct" : "incorrect";

  return {
    kind: "count-check",
    verdict,
    statedRunningCount,
    actualRunningCount: actual,
    off: statedRunningCount - actual,
    at,
    explanation: {
      kind: "count",
      system: system.id,
      systemName: system.name,
      balanced: system.balanced,
      statedRunningCount,
      actualRunningCount: actual,
      off: statedRunningCount - actual,
      initialRunningCount: initialRunningCount(system, decks),
      cardsSeen: seen.length,
      count: buildCountContext({
        system,
        decks,
        runningCount: actual,
        cardsRemaining: situation.cardsRemaining,
        rounding: situation.rounding ?? DEFAULT_TRUE_COUNT_ROUNDING,
      }),
      spanStartRunningCount,
      spanTagSum: actual - spanStartRunningCount,
      trail,
      trailTruncated: trailStart > spanStart,
      byRank: contributionsByRank(seen.slice(spanStart), system),
    },
  };
}

function contributionsByRank(
  cards: readonly Card[],
  system: CountingSystem,
): readonly RankContribution[] {
  const seen = new Map<Rank, number>();
  const contribution = new Map<Rank, number>();
  for (const card of cards) {
    seen.set(card.rank, (seen.get(card.rank) ?? 0) + 1);
    contribution.set(card.rank, (contribution.get(card.rank) ?? 0) + tagFor(card, system));
  }

  return RANKS.filter((rank) => (seen.get(rank) ?? 0) > 0).map((rank) => ({
    rank,
    seen: seen.get(rank) ?? 0,
    // A suit-sensitive rank has no single tag. Reporting one of the two values as "the"
    // tag would teach Red 7 wrong; `null` says "it depends on the suit" out loud.
    tag: system.suitedTags?.[rank] === undefined ? system.tags[rank] : null,
    contribution: contribution.get(rank) ?? 0,
  }));
}

/** The check the drill would grade right now, as plain data a `score` function can take. */
export function currentCheckSituation(state: CountingDrillState): CountCheckSituation {
  const lastCheck = state.checks[state.checks.length - 1];
  return {
    system: state.config.system,
    decks: state.config.decks,
    seen: countedCards(state),
    spanStart: lastCheck?.cardsSeen ?? 0,
    cardsRemaining: cardsRemaining(state.shoe),
  };
}

/** Grades a stated Running Count and records it. An undo point — this is an answer. */
export function submitCountCheck(
  drill: CountingDrill,
  statedRunningCount: number,
  at: number,
): CountingDrill {
  const state = drill.current;
  const result = scoreCountCheck(currentCheckSituation(state), statedRunningCount, at);

  return step(drill, {
    ...state,
    tally: recordVerdict(state.tally, result.verdict),
    checks: [
      ...state.checks,
      {
        statedRunningCount: result.statedRunningCount,
        actualRunningCount: result.actualRunningCount,
        off: result.off,
        cardsSeen: result.explanation.cardsSeen,
        verdict: result.verdict,
        at,
      },
    ],
    lastResult: result,
  });
}

// --- Reporting ------------------------------------------------------------------------

export interface CountingReport {
  readonly tally: ScoreTally;
  readonly checks: readonly CountCheckAttempt[];
  readonly cardsSeen: number;
  readonly cardsRemaining: number;
  readonly reveals: number;
  readonly undone: number;
  readonly cardsPerMinute: number;
  readonly finished: boolean;
  /**
   * Mean absolute error across every check, in count points. `null` with no checks —
   * a fresh run has no error, not an error of zero.
   */
  readonly meanAbsoluteError: number | null;
  /**
   * Mean signed error. Separate from the absolute one on purpose: a user who is reliably
   * two high has a different problem from one who is two out in random directions, and
   * averaging the signs away would hide the first case entirely.
   */
  readonly meanSignedError: number | null;
  /** The worst single miss, in count points. `null` with no checks. */
  readonly worstError: number | null;
}

export function countingReport(drill: CountingDrill): CountingReport {
  const state = drill.current;
  const checks = state.checks;

  return {
    tally: state.tally,
    checks,
    cardsSeen: state.shoe.dealtCount,
    cardsRemaining: cardsRemaining(state.shoe),
    reveals: state.reveals,
    undone: drill.undone,
    cardsPerMinute: state.config.cardsPerMinute,
    finished: countingDrillFinished(state),
    meanAbsoluteError:
      checks.length === 0
        ? null
        : checks.reduce((sum, check) => sum + Math.abs(check.off), 0) / checks.length,
    meanSignedError:
      checks.length === 0
        ? null
        : checks.reduce((sum, check) => sum + check.off, 0) / checks.length,
    worstError:
      checks.length === 0
        ? null
        : checks.reduce((worst, check) => Math.max(worst, Math.abs(check.off)), 0),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
