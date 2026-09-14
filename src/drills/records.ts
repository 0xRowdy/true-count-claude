/**
 * Turning drill results into the records a Session persists.
 *
 * `src/state` owns three shapes and each exists because of something a Decision alone
 * cannot carry (see the merge notes on #10):
 *
 *  - **`Decision`** — one play, with the hand that produced it and both the count-aware
 *    `correctAction` and the count-independent `basicStrategyAction`, so a missed deviation
 *    reads differently from a missed chart cell.
 *  - **`CountCheck`** — stated Running Count against the truth. Separate from the Decision
 *    log because a Decision is a *play*, so its verdict can only ever measure strategy.
 *  - **`RoundResult`** — money and outcomes. A round can produce several hands through
 *    splitting and can resolve with no Decision at all, so win rate and net result are
 *    counted per round rather than per Decision.
 *
 * This module is the one place that knows both vocabularies. It is types-only against
 * `src/state`, so nothing here pulls storage, React Native, or the repository into a drill.
 *
 * The one genuine mismatch it resolves: the engine's `HandResult` has a `"bust"` outcome
 * and state's does not — state records a bust as a loss with `busted: true`, because a bust
 * is how a hand *ended*, not a separate way of settling. Losing that flag would silently
 * zero the bust rate in the statistics panel.
 */

import type { HandOutcome as EngineHandOutcome, RoundState } from "@/engine";
import { evaluate, isBlackjack } from "@/engine";
import type {
  CountCheck,
  Decision,
  DecisionHand,
  HandOutcome,
  HandResult,
  RoundResult,
} from "@/state/types";
import type { CountCheckResult } from "./counting";
import type { HandSnapshot } from "./explanation";
import type { DrillDecisionResult } from "./scoring";

/** Where in a Session a record belongs. Supplied by the caller; drills do not track Sessions. */
export interface RecordContext {
  readonly roundIndex: number;
  readonly shoeIndex: number;
  /** The Shoe's `dealtCount` at the moment the record was made. The replay anchor. */
  readonly shoeDealtCount: number;
}

export type DecisionInput = Omit<Decision, "index">;
export type CountCheckInput = Omit<CountCheck, "index" | "verdict">;
export type RoundInput = Omit<RoundResult, "index" | "net">;

function toDecisionHand(snapshot: HandSnapshot): DecisionHand {
  return {
    handIndex: snapshot.handIndex,
    playerCards: snapshot.playerCards,
    dealerUpcard: snapshot.dealerUpcard,
    total: snapshot.total,
    soft: snapshot.soft,
    fromSplit: snapshot.fromSplit,
    bet: snapshot.bet,
  };
}

/**
 * A graded drill decision as a Session `Decision`.
 *
 * The count snapshot is stored rather than left to be recomputed: a Decision must be
 * explainable years later even if a tag table is corrected, and the user's Explanation
 * showed *these* numbers. A True Count that does not exist — an unbalanced system, or a
 * shoe with nothing left to divide by — is recorded as 0 alongside the Running Count that
 * is the real answer for those systems, since `CountSnapshot.trueCount` is not nullable.
 */
export function toDecisionInput(
  result: DrillDecisionResult,
  context: RecordContext,
): DecisionInput {
  const snapshot = result.explanation.hand;
  if (!snapshot) {
    throw new Error(
      "Cannot record an insurance Decision with no hand behind it. " +
        "A Session's Decision log needs the hand state that produced the decision.",
    );
  }

  const count = result.explanation.count;
  return {
    roundIndex: context.roundIndex,
    shoeIndex: context.shoeIndex,
    shoeDealtCount: context.shoeDealtCount,
    hand: toDecisionHand(snapshot),
    actionTaken: result.actionTaken,
    correctAction: result.correctAction,
    basicStrategyAction: result.basicStrategyAction,
    verdict: result.verdict,
    count: {
      system: count.systemName,
      runningCount: count.runningCount,
      trueCount: count.trueCount ?? 0,
      decksRemaining: count.decksRemaining,
    },
    at: result.at,
  };
}

/** A graded count check as a Session `CountCheck`. The verdict is re-derived by the log. */
export function toCountCheckInput(
  result: CountCheckResult,
  context: RecordContext,
): CountCheckInput {
  return {
    roundIndex: context.roundIndex,
    shoeIndex: context.shoeIndex,
    shoeDealtCount: context.shoeDealtCount,
    statedRunningCount: result.statedRunningCount,
    actualRunningCount: result.actualRunningCount,
    at: result.at,
  };
}

/** The engine's settled round as a Session `RoundResult`. */
export interface RoundRecordContext {
  readonly shoeIndex: number;
  /** The Shoe's `dealtCount` before the round's first card. */
  readonly shoeStartIndex: number;
  readonly at: number;
}

export function toRoundInput(state: RoundState, context: RoundRecordContext): RoundInput {
  const settlement = state.settlement;
  if (!settlement) {
    throw new Error("Cannot record a round that has not settled; play it out first.");
  }

  const hands: HandResult[] = settlement.outcomes.map((outcome, position) => {
    const hand = state.playerHands[position];
    const cards = hand?.cards ?? [];
    const value = evaluate(cards);
    return {
      handIndex: outcome.handIndex,
      outcome: toStateOutcome(outcome.result, hand !== undefined && isBlackjack(hand)),
      busted: value.busted,
      // Chips actually staked, doubling included — the engine's `wagered`, not the opening
      // bet. `SessionStats.wagered` sums these, and a doubled hand risked two units.
      bet: outcome.wagered,
      // Insurance is a round-level bet, so it is folded onto the first hand — the one the
      // opening wager belongs to — rather than split across hands that never staked it.
      net: outcome.net + (position === 0 ? settlement.insuranceNet : 0),
      finalTotal: value.total,
    };
  });

  return {
    shoeIndex: context.shoeIndex,
    shoeStartIndex: context.shoeStartIndex,
    shoeEndIndex: state.shoe.dealtCount,
    hands,
    dealerCards: state.dealerHand.cards,
    at: context.at,
  };
}

/**
 * The engine's outcome vocabulary mapped onto state's.
 *
 * `"bust"` has no counterpart: state records the loss and keeps the bust on its own
 * `busted` flag. `"win"` becomes `"blackjack"` when the hand actually was one, which is how
 * the payout is told apart from an ordinary win in the statistics.
 */
function toStateOutcome(result: EngineHandOutcome["result"], natural: boolean): HandOutcome {
  switch (result) {
    case "blackjack":
      return "blackjack";
    case "win":
      return natural ? "blackjack" : "win";
    case "push":
      return "push";
    case "surrender":
      return "surrender";
    case "lose":
    case "bust":
      return "loss";
  }
}
