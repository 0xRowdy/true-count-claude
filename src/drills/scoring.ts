/**
 * Scoring a decision — the moment a Drill becomes a Drill.
 *
 * Every function here is **pure and synchronous**, and takes the situation rather than a
 * drill. That is not a stylistic preference, it is invariant 3: feedback arrives while the
 * cards are still visible, so a screen must be able to grade a tap *before* it applies the
 * action to the round and the table moves on. A competitor graded after sweeping the hand
 * and a review named that as the specific thing that made the drill useless:
 *
 *   > "when you make a mistake, you find out only after the cards dealt have been removed.
 *   > So there's no way to learn immediately what you did wrong."
 *
 * There are two graders, because "correct" is genuinely ambiguous once index play exists
 * and pretending otherwise is how a trainer ends up in the 21% of low-star reviews about
 * wrong math:
 *
 *  - `scoreAgainstBasicStrategy` — the count-independent chart for the Rule Set. What the
 *    Basic Strategy drill measures.
 *  - `scoreAgainstIndexPlay` — the chart *as amended by the published index numbers at this
 *    count*. What the Deviation drill measures.
 *
 * Both return the same shape, both carry the same full Explanation, and both record
 * `basicStrategyAction` alongside `correctAction` so a screen can always show the user both
 * answers and say which one this drill is asking for.
 */

import type { Action } from "@/engine";
import {
  type DecisionExplanation,
  type DecisionSituation,
  type DrillAction,
  type InsuranceExplanation,
  type InsuranceSituation,
  evLossFor,
  explainDecision,
  explainInsurance,
  isHandAction,
} from "./explanation";
import type { Verdict } from "./types";

/** Which standard a decision was measured against. Always shown, never implied. */
export type GradingStandard = "basic-strategy" | "index-play";

/**
 * A graded playing decision.
 *
 * The three index flags are descriptive rather than judgemental: they say what the index
 * numbers had to say about this hand, whatever standard the drill graded against. In the
 * Basic Strategy drill a correct answer can still carry `indexWouldHaveDeparted`, and that
 * is the point — the user is told that the chart play they just made right is also a play
 * a counter would have departed from at this count, which is the bridge to the next drill.
 */
export interface DecisionResult {
  readonly kind: "decision";
  readonly verdict: Verdict;
  readonly actionTaken: DrillAction;
  /** The answer this drill graded against. */
  readonly correctAction: DrillAction;
  /** The count-independent chart play, always recorded alongside. */
  readonly basicStrategyAction: DrillAction;
  readonly gradedAgainst: GradingStandard;
  /**
   * Bets given up against the **highest-EV** play for this exact shoe, or `null` when no EV
   * was available.
   *
   * Measured against the EVs, not against `correctAction`, and the two can disagree by a
   * whisker: a chart cell is the best play *on average* over every composition, and the
   * composition in front of the player is one particular one. `ev.test.ts` documents
   * fourteen genuine composition-dependent exceptions. So a *correct* answer can still carry
   * a small non-zero `evLoss`, and that is information rather than a contradiction — the EV
   * of the graded answer itself is in `explanation.evs[correctAction]` for a screen that
   * wants to show the gap the other way round.
   */
  readonly evLoss: number | null;
  /** True when the graded answer departs from the chart — an index play was required. */
  readonly correctWasDeparture: boolean;
  /** True when an index fired and the user played the chart instead. */
  readonly indexWouldHaveDeparted: boolean;
  /** True when the user made an index's departure at a count that does not support it. */
  readonly departedWithoutIndex: boolean;
  readonly explanation: DecisionExplanation;
  readonly at: number;
}

/** A graded insurance decision. Insurance is a side bet, so it has its own shape. */
export interface InsuranceResult {
  readonly kind: "insurance";
  readonly verdict: Verdict;
  readonly actionTaken: InsuranceAnswer;
  readonly correctAction: InsuranceAnswer;
  readonly basicStrategyAction: "decline-insurance";
  readonly gradedAgainst: GradingStandard;
  /** Bets given up, in units of the opening wager. */
  readonly evLoss: number | null;
  readonly correctWasDeparture: boolean;
  readonly indexWouldHaveDeparted: boolean;
  readonly departedWithoutIndex: boolean;
  readonly explanation: InsuranceExplanation;
  readonly at: number;
}

export type InsuranceAnswer = "insurance" | "decline-insurance";

export type DrillDecisionResult = DecisionResult | InsuranceResult;

/**
 * Grades a play against Basic Strategy for the Rule Set.
 *
 * Never throws on an unexpected action. An illegal tap is simply wrong and is explained as
 * such — a scoring function that threw would take a mis-tap and turn it into a crash in the
 * middle of a hand.
 */
export function scoreAgainstBasicStrategy(
  situation: DecisionSituation,
  action: DrillAction,
  at: number,
): DecisionResult {
  const explanation = explainDecision(situation);
  return buildDecisionResult(explanation, action, explanation.basicStrategyAction, "basic-strategy", at);
}

/** Grades a play against Basic Strategy as amended by the index numbers at this count. */
export function scoreAgainstIndexPlay(
  situation: DecisionSituation,
  action: DrillAction,
  at: number,
): DecisionResult {
  const explanation = explainDecision(situation);
  return buildDecisionResult(explanation, action, explanation.countAwareAction, "index-play", at);
}

function buildDecisionResult(
  explanation: DecisionExplanation,
  action: DrillAction,
  correctAction: Action,
  gradedAgainst: GradingStandard,
  at: number,
): DecisionResult {
  const basic = explanation.basicStrategyAction;
  const entry = explanation.index.entry;
  const departure = entry && isHandAction(entry.deviate) ? entry.deviate : null;

  return {
    kind: "decision",
    verdict: action === correctAction ? "correct" : "incorrect",
    actionTaken: action,
    correctAction,
    basicStrategyAction: basic,
    gradedAgainst,
    evLoss: evLossFor(explanation, action),
    correctWasDeparture: correctAction !== basic,
    indexWouldHaveDeparted:
      explanation.index.fired && departure !== null && departure !== basic && action === basic,
    departedWithoutIndex:
      !explanation.index.fired && departure !== null && departure !== basic && action === departure,
    explanation,
    at,
  };
}

/**
 * Grades an insurance decision against Basic Strategy, which never insures at any count.
 *
 * A user who insures at a true count of +5 is told two things at once: that Basic Strategy
 * declines this bet unconditionally, and that the Hi-Lo index is +3 so a counter takes it.
 * Both are true, and the drill says which one it is grading.
 */
export function scoreInsuranceAgainstBasicStrategy(
  situation: InsuranceSituation,
  answer: InsuranceAnswer,
  at: number,
): InsuranceResult {
  const explanation = explainInsurance(situation);
  return buildInsuranceResult(explanation, answer, "decline-insurance", "basic-strategy", at);
}

/** Grades an insurance decision against the system's published insurance index. */
export function scoreInsuranceAgainstIndexPlay(
  situation: InsuranceSituation,
  answer: InsuranceAnswer,
  at: number,
): InsuranceResult {
  const explanation = explainInsurance(situation);
  return buildInsuranceResult(explanation, answer, explanation.countAwareAction, "index-play", at);
}

function buildInsuranceResult(
  explanation: InsuranceExplanation,
  answer: InsuranceAnswer,
  correctAction: DrillAction,
  gradedAgainst: GradingStandard,
  at: number,
): InsuranceResult {
  const correct: InsuranceAnswer = correctAction === "insurance" ? "insurance" : "decline-insurance";
  const ev = explanation.ev;

  // Taking stakes half a unit at 2:1; declining stakes nothing. The loss is the gap
  // between what the chosen side is worth and what the better side is worth.
  const evLoss = ev === null ? null : Math.max(0, Math.max(ev, 0) - (answer === "insurance" ? ev : 0));

  return {
    kind: "insurance",
    verdict: answer === correct ? "correct" : "incorrect",
    actionTaken: answer,
    correctAction: correct,
    basicStrategyAction: "decline-insurance",
    gradedAgainst,
    evLoss,
    correctWasDeparture: correct !== "decline-insurance",
    indexWouldHaveDeparted: explanation.index.fired && answer === "decline-insurance",
    departedWithoutIndex: !explanation.index.fired && answer === "insurance",
    explanation,
    at,
  };
}
