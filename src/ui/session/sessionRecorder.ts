/**
 * The recorder — the seam between the Play table and `src/state`'s Session log.
 *
 * `usePlayTable` shaped its transitions so a recorder could subscribe without the table
 * changing shape (#7), and `src/state` shaped `startSession` / `recordDecision` /
 * `recordRound` / `resetBankroll` to take their timestamps and ids from the caller (#10).
 * This module is the function composition between them, and it is deliberately pure: it
 * takes a `Session` and a `PlayTable` and returns a new `Session`, reads no clock, generates
 * no id, and touches no storage. All of that lives in `usePlaySession`.
 *
 * Three decisions here are worth stating out loud, because each one could have been made
 * carelessly and produced a log that quietly disagrees with itself:
 *
 * 1. **A round's Decisions are buffered and appended when the round settles.** A Session is
 *    persisted at round boundaries, so a Decision that reached storage without its
 *    `RoundResult` would leave an orphan carrying the *next* round's index — and
 *    `verifyReplay` would then check that round's cards against the wrong Shoe span. The
 *    buffer means a Session never holds a Decision whose round did not finish.
 * 2. **The Shoe is recorded by the seed the table is actually dealing from**, not by
 *    re-deriving one. `usePlayTable` and `src/state/session` derive Shoe seeds differently,
 *    and `openShoe` accepts an explicit seed precisely so the log can record the truth
 *    rather than a plausible reconstruction (ADR-0004).
 * 3. **`correctAction` is deviation-aware; `basicStrategyAction` is not.** Both are stored,
 *    so a missed index play reads differently from a missed chart cell (#10's finding 3).
 */

import type { Card } from "@/engine/cards";
import { type CountingSystem, COUNTING_SYSTEMS, DEFAULT_COUNTING_SYSTEM } from "@/engine/counting";
import { deviationLookup, shouldTakeInsurance } from "@/engine/deviations";
import { type Action, type Hand, evaluate } from "@/engine/hand";
import {
  type HandResult as RoundHandOutcomeKind,
  type RoundState,
  dealerUpcard,
} from "@/engine/round";
import { basicStrategy } from "@/engine/strategy";
import type {
  DecisionAction,
  DecisionInput,
  HandOutcome,
  HandResult,
  Session,
} from "@/state";
import {
  currentShoe as currentSessionShoe,
  nextRoundIndex,
  openShoe,
  recordDecision,
  recordRound,
  startSession,
} from "@/state";
import { type PlayTable, countReadout } from "@/ui/table/usePlayTable";

// ---------------------------------------------------------------------------
// Opening a Session and a round
// ---------------------------------------------------------------------------

export interface BeginSessionInput {
  readonly table: PlayTable;
  /** Supplied by the caller — this module generates nothing it cannot reproduce. */
  readonly id: string;
  readonly startedAt: number;
}

/**
 * Opens a Session around the table as it stands, and records the Shoe it is about to deal
 * from. Called at the first deal rather than at mount, so simply opening the Play screen
 * and walking away does not litter the history with empty Sessions.
 */
export function beginSession(input: BeginSessionInput): Session {
  const { table } = input;
  const session = startSession({
    id: input.id,
    mode: "play",
    rules: table.rules,
    countingSystem: table.system.name,
    seed: table.sessionSeed,
    startedAt: input.startedAt,
    startingBankroll: table.bankroll,
  });
  return syncShoe(session, table);
}

/**
 * The round being played, held outside the Session until it settles. It carries the two
 * numbers a `RoundResult` cannot be reconstructed without — which Shoe, and where in it the
 * round began — plus the Decisions taken so far.
 */
export interface PendingRound {
  readonly roundIndex: number;
  readonly shoeIndex: number;
  /** The Shoe's `dealtCount` before the round's first card. */
  readonly shoeStartIndex: number;
  readonly decisions: readonly DecisionInput[];
}

export interface OpenRoundResult {
  readonly session: Session;
  readonly pending: PendingRound;
}

/** Called immediately before `dealRound`, while `table.shoe` is still the between-rounds Shoe. */
export function openRound(session: Session, table: PlayTable): OpenRoundResult {
  const synced = syncShoe(session, table);
  return {
    session: synced,
    pending: {
      roundIndex: nextRoundIndex(synced),
      shoeIndex: Math.max(0, synced.shoes.length - 1),
      shoeStartIndex: table.shoe.dealtCount,
      decisions: [],
    },
  };
}

/**
 * Records the table's current Shoe on the Session, if it is not the one already recorded.
 *
 * Identified by seed rather than by index: the table counts Shoes from its own mount and the
 * Session counts the ones it dealt from, and those two numbers drift apart the moment a user
 * shuffles before the first hand. The seed is the same in both, and it is the only thing
 * replay actually needs.
 */
function syncShoe(session: Session, table: PlayTable): Session {
  const recorded = currentSessionShoe(session);
  if (recorded && recorded.seed === table.shoe.seed) return session;
  return openShoe(session, table.shoe.seed).session;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** What the user just pressed. Insurance is a Decision but not a play on the hand. */
export type ObservedAction =
  | { readonly kind: "play"; readonly action: Action }
  | { readonly kind: "insurance"; readonly take: boolean };

/**
 * Buffers one Decision, taken with the table as it stood *before* the action was applied —
 * which is the state that has to be re-rendered to explain the verdict later.
 */
export function observeDecision(
  pending: PendingRound,
  table: PlayTable,
  action: ObservedAction,
  at: number,
): PendingRound {
  const decision = describeDecision(pending, table, action, at);
  if (!decision) return pending;
  return { ...pending, decisions: [...pending.decisions, decision] };
}

function describeDecision(
  pending: PendingRound,
  table: PlayTable,
  action: ObservedAction,
  at: number,
): DecisionInput | null {
  const round = table.round;
  if (!round) return null;

  const handIndex = action.kind === "insurance" ? 0 : round.activeHandIndex;
  const hand = round.playerHands[handIndex];
  if (!hand) return null;

  const upcard = dealerUpcard(round);
  const value = evaluate(hand.cards);
  const readout = countReadout(table);
  const context = { handCount: round.playerHands.length, bankroll: round.bankroll };

  const verdict =
    action.kind === "insurance"
      ? insuranceVerdict(action.take, readout.trueCount, table.system)
      : handVerdict(action.action, hand, upcard, readout.trueCount, table, context);

  return {
    roundIndex: pending.roundIndex,
    shoeIndex: pending.shoeIndex,
    shoeDealtCount: round.shoe.dealtCount,
    hand: {
      handIndex,
      playerCards: [...hand.cards],
      dealerUpcard: upcard,
      total: value.total,
      soft: value.soft,
      fromSplit: hand.fromSplit,
      bet: hand.bet,
    },
    actionTaken: verdict.actionTaken,
    correctAction: verdict.correctAction,
    basicStrategyAction: verdict.basicStrategyAction,
    verdict: verdict.actionTaken === verdict.correctAction ? "correct" : "incorrect",
    count: {
      system: table.system.name,
      runningCount: readout.running,
      // Null when there is no True Count — an unbalanced system does not convert, and the
      // conversion is undefined with no decks left. Stored as null, never as a stand-in 0.
      trueCount: readout.trueCount,
      decksRemaining: readout.decksRemaining,
    },
    at,
  };
}

interface DecisionVerdict {
  readonly actionTaken: DecisionAction;
  readonly correctAction: DecisionAction;
  readonly basicStrategyAction: DecisionAction;
}

/**
 * Insurance is the Illustrious 18's first and most valuable entry, and Basic Strategy always
 * declines it — which is exactly why both numbers are worth storing. A user who insured at a
 * true count of +4 played it correctly *and* departed from the chart.
 */
function insuranceVerdict(
  take: boolean,
  trueCount: number | null,
  system: CountingSystem,
): DecisionVerdict {
  const correct: DecisionAction =
    trueCount !== null && shouldTakeInsurance(trueCount, system)
      ? "insurance"
      : "decline-insurance";
  return {
    actionTaken: take ? "insurance" : "decline-insurance",
    correctAction: correct,
    basicStrategyAction: "decline-insurance",
  };
}

function handVerdict(
  action: Action,
  hand: Hand,
  upcard: Card,
  trueCount: number | null,
  table: PlayTable,
  context: { handCount: number; bankroll: number },
): DecisionVerdict {
  // No True Count means no index play to be judged against: KO and Red 7 publish no index
  // set, and a Shoe with no decks left has no conversion. Basic Strategy is then the whole
  // of the right answer, which is honest rather than a fallback.
  if (trueCount === null) {
    const play = basicStrategy(hand, upcard, table.rules, context);
    return { actionTaken: action, correctAction: play, basicStrategyAction: play };
  }

  const lookup = deviationLookup(hand, upcard, trueCount, table.rules, table.system, context);
  return {
    actionTaken: action,
    correctAction: lookup.deviation?.action ?? lookup.basicStrategy,
    basicStrategyAction: lookup.basicStrategy,
  };
}

// ---------------------------------------------------------------------------
// Settling the round
// ---------------------------------------------------------------------------

/** The engine's per-hand result, in the Session log's vocabulary. */
const OUTCOME: Readonly<Record<RoundHandOutcomeKind, HandOutcome>> = {
  blackjack: "blackjack",
  win: "win",
  push: "push",
  lose: "loss",
  // A bust is a loss with its cause recorded separately, because bust rate is its own
  // statistic and "how you lost" is the part a trainer has to be able to teach from.
  bust: "loss",
  surrender: "surrender",
};

/**
 * The round's hands, in the order they sit on the table.
 *
 * Insurance is a side bet on the round rather than on a hand, but `RoundResult.net` is
 * defined as the sum of its hands' `net` and `verifyReplay` checks that sum. It therefore
 * rides on the first hand — the one the opening bet was placed on — which keeps the stored
 * round self-checking and the bankroll arithmetic exact.
 */
export function handResults(round: RoundState): HandResult[] {
  const settlement = round.settlement;
  if (!settlement) return [];

  return settlement.outcomes.map((outcome, index) => {
    const hand = round.playerHands[index];
    return {
      handIndex: outcome.handIndex,
      outcome: OUTCOME[outcome.result],
      busted: outcome.result === "bust",
      bet: outcome.wagered,
      net: outcome.net + (index === 0 ? settlement.insuranceNet : 0),
      finalTotal: hand ? evaluate(hand.cards).total : 0,
    };
  });
}

/**
 * Appends the round's buffered Decisions and then the round itself, settling its money
 * against the Session's bankroll. This is the only place a Decision reaches the Session, so
 * the log can never hold a Decision whose round did not finish.
 */
export function closeRound(
  session: Session,
  pending: PendingRound,
  table: PlayTable,
  at: number,
): Session {
  const round = table.round;
  if (!round || round.settlement === null) return session;

  let next = session;
  for (const decision of pending.decisions) next = recordDecision(next, decision);

  return recordRound(next, {
    shoeIndex: pending.shoeIndex,
    shoeStartIndex: pending.shoeStartIndex,
    shoeEndIndex: round.shoe.dealtCount,
    hands: handResults(round),
    dealerCards: [...round.dealerHand.cards],
    at,
  });
}

// ---------------------------------------------------------------------------
// Resuming
// ---------------------------------------------------------------------------

/**
 * The Counting System a Session was last played with.
 *
 * `Session.countingSystem` is the name in force when the Session opened, and the table lets
 * a user switch systems mid-run. Every Decision stores the system that was actually showing,
 * so the latest of those is the honest answer, and the Session's own field is the fallback
 * for a Session with no Decisions yet.
 */
export function sessionCountingSystem(session: Session): CountingSystem {
  const last = session.decisions[session.decisions.length - 1];
  return countingSystemByName(last?.count.system ?? session.countingSystem);
}

/** Systems are recorded by published name (CONTEXT.md's glossary), so resume reads them back. */
export function countingSystemByName(name: string): CountingSystem {
  return COUNTING_SYSTEMS.find((system) => system.name === name) ?? DEFAULT_COUNTING_SYSTEM;
}
