/**
 * The Basic Strategy drill.
 *
 * Hands are dealt from a real, seeded shoe through the engine's round lifecycle, and every
 * decision is graded against `basicStrategy` for the active Rule Set. The accuracy
 * percentage is the least interesting thing it produces: the per-chart-cell breakdown in
 * `chart.ts` is the output worth having, because "you are fine everywhere except soft 18"
 * is something a user can act on and "82%" is not.
 *
 * Three decisions in here are load-bearing, and all three are invariants rather than taste.
 *
 * **The bankroll is topped up before every hand.** `legalActions` withholds `double` and
 * `split` when the player cannot cover the extra bet — correct at a table, and ruinous in a
 * drill, because a cell the user was never offered cannot be scored and a run of short
 * stacks would quietly distort their accuracy. Invariant 7 says a legal action is never
 * removed; in a scored drill the only way to keep that promise is to make sure the chips
 * are always there. Money is not a score here, so nothing is lost by it.
 *
 * **Grading happens before the action is applied.** `submitDecision` scores the situation
 * as it stands and only then hands the action to the engine, so the Explanation describes
 * the hand the user was looking at rather than whatever the table did next (invariant 3).
 * The full hand snapshot travels with the result, so a screen can keep the cards on screen
 * through a split, a bust, or a settlement.
 *
 * **Undo restores the whole run.** `undo` from `progress.ts` puts back the previous state —
 * shoe position included, so the same cards come out again — which means a mis-tap cannot
 * silently cost a streak or leave a phantom entry in the cell breakdown.
 *
 * Pure and synchronous throughout: no clock, no `Math.random()`, no I/O. Timestamps are
 * passed in by the caller.
 */

import {
  type Card,
  type CountingSystem,
  type RoundState,
  type RuleSet,
  type Shoe,
  type TrueCountRounding,
  DEFAULT_RULES,
  DEFAULT_TRUE_COUNT_ROUNDING,
  HI_LO,
  applyAction,
  cardsRemaining,
  createShoe,
  currentLegalActions,
  currentRunningCount,
  dealerUpcard,
  dealtCards,
  isCutCardReached,
  startRound,
  unseenComposition,
} from "@/engine";
import type { Action } from "@/engine";
import {
  type ChartBreakdown,
  type CellAttempt,
  type CellStat,
  type RowStat,
  chartBreakdown,
  weakestCells,
  weakestRows,
} from "./chart";
import {
  type CountContext,
  type DecisionSituation,
  type InsuranceSituation,
  buildCountContext,
  snapshotHand,
} from "./explanation";
import {
  type ScoreTally,
  type Undoable,
  EMPTY_TALLY,
  beginUndoable,
  recordVerdict,
  replace,
  step,
} from "./progress";
import {
  type DecisionResult,
  type DrillDecisionResult,
  type InsuranceResult,
  scoreAgainstBasicStrategy,
  scoreInsuranceAgainstBasicStrategy,
} from "./scoring";

export interface BasicStrategyDrillConfig {
  readonly rules: RuleSet;
  /** The system whose count is shown in Explanations. It does not affect the grading. */
  readonly system: CountingSystem;
  readonly rounding: TrueCountRounding;
  readonly bet: number;
  /**
   * Chips handed to the player at the start of every hand. Large on purpose — see the
   * module comment: a short stack removes legal actions and corrupts accuracy.
   */
  readonly bankroll: number;
}

export const DEFAULT_BASIC_STRATEGY_CONFIG: BasicStrategyDrillConfig = {
  rules: DEFAULT_RULES,
  system: HI_LO,
  rounding: DEFAULT_TRUE_COUNT_ROUNDING,
  bet: DEFAULT_RULES.minBet,
  bankroll: 1_000_000,
};

export interface BasicStrategyDrillState {
  readonly config: BasicStrategyDrillConfig;
  readonly seed: number;
  /** How many shoes this run has opened. The current shoe is the last of them. */
  readonly shoeIndex: number;
  /** The shoe between rounds. While a round is live, `round.shoe` is further along. */
  readonly shoe: Shoe;
  readonly round: RoundState | null;
  /** Every graded decision of the run, plays and insurance alike. */
  readonly tally: ScoreTally;
  /** Insurance decisions only, so a screen can report the two surfaces separately. */
  readonly insuranceTally: ScoreTally;
  /** One record per graded play, in order. The chart breakdown is derived from these. */
  readonly chartAttempts: readonly CellAttempt[];
  /** The decision on screen, with its Explanation. Cleared when the next hand is dealt. */
  readonly lastResult: DrillDecisionResult | null;
  readonly roundsDealt: number;
  readonly shuffles: number;
}

export type BasicStrategyDrill = Undoable<BasicStrategyDrillState>;

export function startBasicStrategyDrill(
  config: BasicStrategyDrillConfig = DEFAULT_BASIC_STRATEGY_CONFIG,
  seed = 1,
): BasicStrategyDrill {
  assertBetIsPlayable(config);
  return beginUndoable<BasicStrategyDrillState>({
    config,
    seed,
    shoeIndex: 0,
    shoe: createShoe(config.rules, shoeSeed(seed, 0)),
    round: null,
    tally: EMPTY_TALLY,
    insuranceTally: EMPTY_TALLY,
    chartAttempts: [],
    lastResult: null,
    roundsDealt: 0,
    shuffles: 0,
  });
}

function assertBetIsPlayable(config: BasicStrategyDrillConfig): void {
  const { bet, rules, bankroll } = config;
  if (bet < rules.minBet || bet > rules.maxBet) {
    throw new Error(
      `Drill bet ${bet} is outside the table limits of ${rules.minBet}-${rules.maxBet}.`,
    );
  }
  if (bankroll < bet) {
    throw new Error(`Drill bankroll ${bankroll} cannot cover a bet of ${bet}.`);
  }
}

/**
 * Each shoe's seed is derived from the run's seed and the shoe's index, so a whole drill
 * reproduces from one number (ADR-0004) while no two shoes in it deal the same cards.
 */
function shoeSeed(seed: number, shoeIndex: number): number {
  return (Math.imul(seed ^ (shoeIndex + 1), 2654435761) >>> 0) || 1;
}

// --- Derived views --------------------------------------------------------------------

/** The shoe as it stands right now — the live round's shoe while one is running. */
export function currentShoe(state: BasicStrategyDrillState): Shoe {
  return state.round?.shoe ?? state.shoe;
}

/**
 * The dealer's hole card while it is still face down, or `null` once it is turned up.
 *
 * `deal` hands back the very object stored in the shoe, which is what makes the identity
 * comparison in `seenCards` exact even in a six-deck shoe full of duplicate rank-and-suit
 * pairs.
 */
function hiddenHoleCard(state: BasicStrategyDrillState): Card | null {
  const round = state.round;
  if (!round || round.dealerHoleCardRevealed) return null;
  return round.dealerHand.cards[1] ?? null;
}

/** Every card the player has actually seen leave the shoe. The hole card is not one of them. */
export function seenCards(state: BasicStrategyDrillState): readonly Card[] {
  const dealt = dealtCards(currentShoe(state));
  const hole = hiddenHoleCard(state);
  return hole === null ? dealt : dealt.filter((card) => card !== hole);
}

/** The count as the player holds it, with the division that produced the True Count visible. */
export function countContext(state: BasicStrategyDrillState): CountContext {
  const shoe = currentShoe(state);
  return buildCountContext({
    system: state.config.system,
    decks: state.config.rules.decks,
    runningCount: currentRunningCount(
      seenCards(state),
      state.config.system,
      state.config.rules.decks,
    ),
    cardsRemaining: cardsRemaining(shoe),
    rounding: state.config.rounding,
  });
}

/** True when the drill is waiting on a hand action. */
export function awaitingDecision(state: BasicStrategyDrillState): boolean {
  return state.round?.phase === "player" && currentLegalActions(state.round).length > 0;
}

/** True when the drill is waiting on an insurance decision. */
export function awaitingInsurance(state: BasicStrategyDrillState): boolean {
  return state.round?.phase === "insurance";
}

/** True when the round is over and the next hand can be dealt. */
export function betweenRounds(state: BasicStrategyDrillState): boolean {
  return state.round === null || state.round.phase === "settled";
}

/**
 * The decision in front of the player, as plain data a `score` function can be handed.
 *
 * A screen may call this and grade a candidate action *before* applying it — which is what
 * makes a hint, an "are you sure", or a graded tap all the same operation.
 */
export function currentSituation(state: BasicStrategyDrillState): DecisionSituation | null {
  const round = state.round;
  if (!round || round.phase !== "player") return null;
  const hand = round.playerHands[round.activeHandIndex];
  if (!hand) return null;

  const hole = hiddenHoleCard(state);
  return {
    rules: state.config.rules,
    system: state.config.system,
    hand,
    handIndex: round.activeHandIndex,
    handCount: round.playerHands.length,
    dealerUpcard: dealerUpcard(round),
    bankroll: round.bankroll,
    composition: unseenComposition(round.shoe, hole === null ? [] : [hole]),
    count: countContext(state),
  };
}

/** The insurance decision in front of the player, or `null` when none is on offer. */
export function currentInsuranceSituation(
  state: BasicStrategyDrillState,
): InsuranceSituation | null {
  const round = state.round;
  if (!round || round.phase !== "insurance") return null;

  const hole = hiddenHoleCard(state);
  const hand = round.playerHands[0];
  const upcard = dealerUpcard(round);
  return {
    system: state.config.system,
    dealerUpcard: upcard,
    hand: hand ? snapshotHand(hand, upcard, 0, round.playerHands.length) : null,
    composition: unseenComposition(round.shoe, hole === null ? [] : [hole]),
    count: countContext(state),
  };
}

/** Exactly the buttons to render. Never a subset of the legal actions (invariant 7). */
export function currentActions(state: BasicStrategyDrillState): readonly Action[] {
  return state.round ? currentLegalActions(state.round) : [];
}

// --- Transitions ----------------------------------------------------------------------

/**
 * Deals the next hand, replacing the shoe first if the cut card is out.
 *
 * Not an undo point. Undo takes back a *decision*: a user who taps it expects the thing
 * they were last graded on to come back, not the deal that happened afterwards.
 */
export function dealNextHand(drill: BasicStrategyDrill): BasicStrategyDrill {
  const state = drill.current;
  if (!betweenRounds(state)) {
    throw new Error("Cannot deal: the current hand is still waiting on a decision.");
  }

  let shoe = currentShoe(state);
  let shoeIndex = state.shoeIndex;
  let shuffles = state.shuffles;

  if (isCutCardReached(shoe)) {
    shoeIndex += 1;
    shuffles += 1;
    shoe = createShoe(state.config.rules, shoeSeed(state.seed, shoeIndex));
  }

  const round = startRound({
    rules: state.config.rules,
    shoe,
    bet: state.config.bet,
    // Fresh chips every hand, so no cell is ever taken off the table. See the module comment.
    bankroll: state.config.bankroll,
  });

  return replace(drill, {
    ...state,
    shoe,
    shoeIndex,
    shuffles,
    round,
    roundsDealt: state.roundsDealt + 1,
    lastResult: null,
  });
}

/**
 * Grades a play and applies it. The verdict and its Explanation come back on
 * `drill.current.lastResult`, and the hand they describe is snapshotted inside the
 * Explanation, so the feedback survives whatever the round does next (invariant 3).
 */
export function submitDecision(
  drill: BasicStrategyDrill,
  action: Action,
  at: number,
): BasicStrategyDrill {
  const state = drill.current;
  const situation = currentSituation(state);
  const round = state.round;
  if (!situation || !round) {
    throw new Error("Cannot grade a play: the drill is not waiting on a hand action.");
  }

  const result = scoreAgainstBasicStrategy(situation, action, at);
  // Graded first, applied second. The Explanation describes the hand the user was looking
  // at, not the one the engine leaves behind.
  const next = applyAction(round, { type: action });

  return step(drill, {
    ...state,
    round: next,
    tally: recordVerdict(state.tally, result.verdict),
    chartAttempts: [...state.chartAttempts, toCellAttempt(result, action)],
    lastResult: result,
  });
}

/**
 * Grades the insurance decision and applies it.
 *
 * Basic Strategy declines insurance at every count, so `take: true` is always wrong in this
 * drill — and the Explanation says so *and* reports the published index and the actual ten
 * density, so a user who insured at a high count learns what they were half right about.
 */
export function submitInsurance(
  drill: BasicStrategyDrill,
  take: boolean,
  at: number,
): BasicStrategyDrill {
  const state = drill.current;
  const situation = currentInsuranceSituation(state);
  const round = state.round;
  if (!situation || !round) {
    throw new Error("Cannot grade insurance: the drill is not waiting on an insurance decision.");
  }

  const result = scoreInsuranceAgainstBasicStrategy(
    situation,
    take ? "insurance" : "decline-insurance",
    at,
  );
  const next = applyAction(round, { type: "insurance", take });

  return step(drill, {
    ...state,
    round: next,
    tally: recordVerdict(state.tally, result.verdict),
    insuranceTally: recordVerdict(state.insuranceTally, result.verdict),
    lastResult: result,
  });
}

function toCellAttempt(result: DecisionResult, action: Action): CellAttempt {
  const cell = result.explanation.cell;
  return {
    section: cell.section,
    row: cell.row,
    upcard: cell.upcard,
    code: cell.code,
    correctAction: cell.action,
    actionTaken: action,
    verdict: result.verdict,
    evLoss: result.evLoss,
  };
}

// --- Reporting ------------------------------------------------------------------------

export interface BasicStrategyReport {
  readonly tally: ScoreTally;
  readonly insuranceTally: ScoreTally;
  readonly roundsDealt: number;
  readonly shuffles: number;
  readonly undone: number;
  /** Every cell drilled, rolled up by cell, row and section. */
  readonly breakdown: ChartBreakdown;
  /** The cells to go and practise, worst first. */
  readonly weakestCells: readonly CellStat[];
  /** The rows to go and practise. This is the one that produces an actionable sentence. */
  readonly weakestRows: readonly RowStat[];
}

/**
 * Everything a results screen needs, derived rather than accumulated.
 *
 * Deriving matters after an undo: the breakdown is recomputed from the attempt list the
 * restored state carries, so a withdrawn decision leaves no trace in it.
 */
export function basicStrategyReport(drill: BasicStrategyDrill): BasicStrategyReport {
  const state = drill.current;
  const breakdown = chartBreakdown(state.chartAttempts);
  return {
    tally: state.tally,
    insuranceTally: state.insuranceTally,
    roundsDealt: state.roundsDealt,
    shuffles: state.shuffles,
    undone: drill.undone,
    breakdown,
    weakestCells: weakestCells(breakdown),
    weakestRows: weakestRows(breakdown),
  };
}

/** The result on screen, if any. Includes correct answers — they are explained too. */
export function lastResult(drill: BasicStrategyDrill): DrillDecisionResult | null {
  return drill.current.lastResult;
}

/** Narrowing helper for a screen that renders the two result shapes differently. */
export function isInsuranceResult(result: DrillDecisionResult): result is InsuranceResult {
  return result.kind === "insurance";
}
