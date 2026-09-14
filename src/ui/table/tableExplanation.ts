/**
 * The Play table's decisions, graded and explained at the instant of the tap (#8).
 *
 * Invariant 3: feedback arrives while the cards are still on screen. The Play table already
 * records a verdict for every Decision (`src/ui/session/sessionRecorder.ts`); this is the
 * other half — the *why* — and it is built at exactly the same moment, from exactly the same
 * table, before the action is applied and the round moves on.
 *
 * Nothing here decides anything. The situation is read off the `PlayTable` the way the
 * drills read one off their own round (`currentSituation` in `src/drills/basicStrategy.ts`),
 * and grading and explaining are `scoreAgainstIndexPlay` and `scoreInsuranceAgainstIndexPlay`
 * from `src/drills/scoring.ts`. Index play is the standard because it is the standard the
 * Session log already records as `correctAction`: the explanation on screen must explain the
 * verdict in the log, not a different one. `tableExplanation.test.ts` asserts the two agree.
 *
 * Two details are easy to get wrong and are handled once, here:
 *
 * - **The hole card is unseen, not undealt.** It has left the shoe, but the player has not
 *   seen it, so it belongs in the composition the EVs are computed against — exactly as the
 *   drills do it — and out of the Running Count, exactly as `countReadout` does it.
 * - **The count and the composition come off the same shoe**, `round.shoe`, as
 *   `DecisionSituation` requires. A count read off one shoe and EVs off another would produce
 *   an Explanation that contradicts itself.
 */

import type { Card } from "@/engine/cards";
import type { Action } from "@/engine/hand";
import { currentLegalActions, dealerUpcard } from "@/engine/round";
import { cardsRemaining } from "@/engine/shoe";
import { unseenComposition } from "@/engine/ev";
import {
  type CountContext,
  type DecisionSituation,
  type InsuranceSituation,
  buildCountContext,
  snapshotHand,
} from "@/drills/explanation";
import {
  type DecisionResult,
  type DrillDecisionResult,
  type InsuranceResult,
  scoreAgainstIndexPlay,
  scoreInsuranceAgainstIndexPlay,
} from "@/drills/scoring";
import { type PlayTable, countReadout } from "./usePlayTable";

/** One graded Decision on the Play table, with its Explanation. */
export type TableDecision = DrillDecisionResult;

/** The dealer's hole card while it is still face down, or null once it is turned over. */
function hiddenHoleCard(table: PlayTable): Card | null {
  const round = table.round;
  if (!round || round.dealerHoleCardRevealed) return null;
  return round.dealerHand.cards[1] ?? null;
}

/** The count as the player holds it, with the division that produced the True Count visible. */
export function tableCountContext(table: PlayTable): CountContext | null {
  const round = table.round;
  if (!round) return null;
  return buildCountContext({
    system: table.system,
    decks: table.rules.decks,
    runningCount: countReadout(table).running,
    cardsRemaining: cardsRemaining(round.shoe),
  });
}

/** The playing decision in front of the player, or null when there is none. */
export function tableDecisionSituation(table: PlayTable): DecisionSituation | null {
  const round = table.round;
  if (!round || round.phase !== "player") return null;
  const hand = round.playerHands[round.activeHandIndex];
  const count = tableCountContext(table);
  if (!hand || !count) return null;

  const hole = hiddenHoleCard(table);
  return {
    rules: table.rules,
    system: table.system,
    hand,
    handIndex: round.activeHandIndex,
    handCount: round.playerHands.length,
    dealerUpcard: dealerUpcard(round),
    bankroll: round.bankroll,
    composition: unseenComposition(round.shoe, hole === null ? [] : [hole]),
    count,
  };
}

/** The insurance decision in front of the player, or null when none is on offer. */
export function tableInsuranceSituation(table: PlayTable): InsuranceSituation | null {
  const round = table.round;
  if (!round || round.phase !== "insurance") return null;
  const count = tableCountContext(table);
  if (!count) return null;

  const hole = hiddenHoleCard(table);
  const upcard = dealerUpcard(round);
  const hand = round.playerHands[0];
  return {
    system: table.system,
    dealerUpcard: upcard,
    hand: hand ? snapshotHand(hand, upcard, 0, round.playerHands.length) : null,
    composition: unseenComposition(round.shoe, hole === null ? [] : [hole]),
    count,
  };
}

/**
 * Grades and explains a play *before* it is applied. Returns null when the table is not
 * waiting on a play, or the action is not one of the buttons on offer — the same taps the
 * engine would refuse.
 */
export function gradeTablePlay(table: PlayTable, action: Action, at: number): DecisionResult | null {
  const round = table.round;
  if (!round || !currentLegalActions(round).includes(action)) return null;
  const situation = tableDecisionSituation(table);
  return situation ? scoreAgainstIndexPlay(situation, action, at) : null;
}

/** Grades and explains an insurance decision before it is applied. */
export function gradeTableInsurance(
  table: PlayTable,
  take: boolean,
  at: number,
): InsuranceResult | null {
  const situation = tableInsuranceSituation(table);
  return situation
    ? scoreInsuranceAgainstIndexPlay(situation, take ? "insurance" : "decline-insurance", at)
    : null;
}
