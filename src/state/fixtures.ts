/**
 * Test support: a deterministic Session built by actually dealing from a seeded Shoe.
 *
 * Hand-written Session literals would let the log and the seed drift apart, which is the
 * one thing `verifyReplay` exists to catch — so the fixtures deal real cards and record
 * what happened, exactly as the Play loop will. Not exported from `index.ts`; this is
 * scaffolding, not product surface.
 */

import {
  DEFAULT_RULES,
  type Action,
  type Card,
  type Hand,
  type HandResult as EngineHandResult,
  type RoundAction,
  type RoundState,
  type RuleSet,
  type Shoe,
  applyAction,
  currentLegalActions,
  deal,
  dealerUpcard,
  evaluate,
  isCutCardReached,
  isRoundOver,
  isTen,
  startRound,
} from "@/engine";
import { openShoe, recordCountCheck, recordDecision, recordRound, startSession } from "./session";
import type { CountSnapshot, Decision, HandOutcome, HandResult, Session } from "./types";

/** Hi-Lo tags, local to the fixtures until `src/engine/counting` lands. */
function hiLoTag(card: Card): number {
  if (isTen(card.rank) || card.rank === "A") return -1;
  if (card.rank === "7" || card.rank === "8" || card.rank === "9") return 0;
  return 1;
}

export interface BuildSessionOptions {
  readonly id?: string;
  readonly seed?: number;
  readonly rounds?: number;
  readonly rules?: RuleSet;
  readonly bet?: number;
  readonly startingBankroll?: number;
  readonly startedAt?: number;
}

/**
 * Plays `rounds` rounds of stand-on-everything blackjack against a seeded Shoe and returns
 * the still-open Session. The caller ends it explicitly, because nothing else may.
 *
 * Every third round is logged as a wrong Decision, and a count check is logged every fifth,
 * so the statistics have something to disagree about.
 */
export function buildSession(options: BuildSessionOptions = {}): Session {
  const rules = options.rules ?? DEFAULT_RULES;
  const bet = options.bet ?? 10;
  const startedAt = options.startedAt ?? 1_700_000_000_000;

  let session = startSession({
    id: options.id ?? "session-1",
    mode: "play",
    rules,
    countingSystem: "Hi-Lo",
    seed: options.seed ?? 4242,
    startedAt,
    startingBankroll: options.startingBankroll ?? 500,
  });

  const opened = openShoe(session);
  session = opened.session;
  let shoe: Shoe = opened.shoe;
  let runningCount = 0;

  const draw = (): Card => {
    const result = deal(shoe);
    shoe = result.shoe;
    runningCount += hiLoTag(result.card);
    return result.card;
  };

  for (let round = 0; round < (options.rounds ?? 6); round++) {
    const shoeStartIndex = shoe.dealtCount;

    const playerCards = [draw()];
    const dealerCards = [draw()];
    playerCards.push(draw());
    dealerCards.push(draw());

    const player = evaluate(playerCards);
    const upcard = dealerCards[0] as Card;
    const at = startedAt + round * 30_000;

    const correct = round % 3 !== 0;
    session = recordDecision(session, {
      roundIndex: round,
      shoeIndex: 0,
      shoeDealtCount: shoe.dealtCount,
      hand: {
        handIndex: 0,
        playerCards: [...playerCards],
        dealerUpcard: upcard,
        total: player.total,
        soft: player.soft,
        fromSplit: false,
        bet,
      },
      actionTaken: "stand",
      correctAction: correct ? "stand" : "hit",
      basicStrategyAction: correct ? "stand" : "hit",
      verdict: correct ? "correct" : "incorrect",
      count: snapshot(runningCount, shoe),
      at,
    });

    // Dealer plays it out: hit until 17 or better.
    while (evaluate(dealerCards).total < 17) dealerCards.push(draw());
    const dealer = evaluate(dealerCards);

    session = recordRound(session, {
      shoeIndex: 0,
      shoeStartIndex,
      shoeEndIndex: shoe.dealtCount,
      hands: [settle(player.total, player.busted, dealer.total, dealer.busted, bet)],
      dealerCards: [...dealerCards],
      at,
    });

    if (round % 5 === 0) {
      session = recordCountCheck(session, {
        roundIndex: round,
        shoeIndex: 0,
        shoeDealtCount: shoe.dealtCount,
        // Off by one on the first check, right afterwards — two verdicts from one fixture.
        statedRunningCount: round === 0 ? runningCount + 1 : runningCount,
        actualRunningCount: runningCount,
        at,
      });
    }
  }

  return session;
}

function snapshot(runningCount: number, shoe: Shoe): CountSnapshot {
  const decksRemaining = (shoe.cards.length - shoe.dealtCount) / 52;
  return {
    system: "Hi-Lo",
    runningCount,
    trueCount: decksRemaining === 0 ? 0 : runningCount / decksRemaining,
    decksRemaining,
  };
}

function settle(
  playerTotal: number,
  playerBusted: boolean,
  dealerTotal: number,
  dealerBusted: boolean,
  bet: number,
): HandResult {
  let outcome: HandOutcome;
  if (playerBusted) outcome = "loss";
  else if (dealerBusted || playerTotal > dealerTotal) outcome = "win";
  else if (playerTotal === dealerTotal) outcome = "push";
  else outcome = "loss";

  const net = outcome === "win" ? bet : outcome === "loss" ? -bet : 0;
  return { handIndex: 0, outcome, busted: playerBusted, bet, net, finalTotal: playerTotal };
}

// ---------------------------------------------------------------------------
// Split rounds
// ---------------------------------------------------------------------------

export interface BuildSplitSessionOptions extends BuildSessionOptions {
  /**
   * Hands the policy is willing to split to. Capped by the Rule Set's `maxSplitHands`;
   * lower it to hold a run to single splits.
   */
  readonly maxHands?: number;
}

/**
 * Plays split-every-pair blackjack through the engine's own round state machine and returns
 * the still-open Session.
 *
 * `buildSession` deals its own cards and never splits, so it cannot reach the case that
 * broke `verifyReplay` (#21). A hand-written split round would be worse: it would encode
 * what the author *believed* a split records, which is precisely the assumption that was
 * wrong. So the cards here come from a seeded Shoe, the hands are the engine's — including
 * where a resplit inserts its sibling — and each Decision stores the hand state that
 * produced it, which for a split is the pair itself, exactly as `sessionRecorder` records
 * it from the Play table.
 *
 * Insurance is always declined (Basic Strategy) and is logged, because it is the one
 * Decision that records a hand without acting on it.
 */
export function buildSplitSession(options: BuildSplitSessionOptions = {}): Session {
  const rules = options.rules ?? DEFAULT_RULES;
  const bet = options.bet ?? 10;
  const startedAt = options.startedAt ?? 1_700_000_000_000;
  const maxHands = Math.min(options.maxHands ?? rules.maxSplitHands, rules.maxSplitHands);

  let session = startSession({
    id: options.id ?? "split-session",
    mode: "play",
    rules,
    countingSystem: "Hi-Lo",
    seed: options.seed ?? 29,
    startedAt,
    startingBankroll: options.startingBankroll ?? 5_000,
  });

  const opened = openShoe(session);
  session = opened.session;
  let shoe: Shoe = opened.shoe;

  for (let round = 0; round < (options.rounds ?? 12); round++) {
    // Splitting stakes another bet per hand, and the fixture must never be the thing that
    // runs out of chips.
    if (session.bankroll < bet * rules.maxSplitHands) break;
    if (isCutCardReached(shoe)) break;

    const at = startedAt + round * 30_000;
    const shoeStartIndex = shoe.dealtCount;
    let state = startRound({ rules, shoe, bet, bankroll: session.bankroll });

    while (state.phase === "insurance") {
      session = recordDecision(session, {
        ...decisionAt(state, 0, at),
        roundIndex: round,
        actionTaken: "decline-insurance",
        correctAction: "decline-insurance",
        basicStrategyAction: "decline-insurance",
        verdict: "correct",
      });
      state = applyAction(state, { type: "insurance", take: false });
    }

    while (!isRoundOver(state)) {
      const action = splitHappily(currentLegalActions(state), state.playerHands.length, maxHands);
      session = recordDecision(session, {
        ...decisionAt(state, state.activeHandIndex, at),
        roundIndex: round,
        actionTaken: action,
        correctAction: action,
        basicStrategyAction: action,
        verdict: "correct",
      });
      state = applyAction(state, roundAction(action));
    }

    session = recordRound(session, {
      shoeIndex: 0,
      shoeStartIndex,
      shoeEndIndex: state.shoe.dealtCount,
      hands: engineHandResults(state),
      dealerCards: [...state.dealerHand.cards],
      at,
    });
    shoe = state.shoe;
  }

  return session;
}

/** Split while there are hands left to split into; otherwise stand. Deterministic and blunt. */
function splitHappily(legal: readonly Action[], handCount: number, maxHands: number): Action {
  if (legal.includes("split") && handCount < maxHands) return "split";
  if (legal.includes("stand")) return "stand";
  return legal[0] ?? "stand";
}

function roundAction(action: Action): RoundAction {
  return { type: action };
}

/** Everything a Decision reads off the round; the caller supplies the verdict and the round. */
type ObservedHand = Omit<
  Decision,
  "index" | "roundIndex" | "actionTaken" | "correctAction" | "basicStrategyAction" | "verdict"
>;

/** The part of a Decision that reads off the round: which hand, which cards, which count. */
function decisionAt(state: RoundState, handIndex: number, at: number): ObservedHand {
  const hand = state.playerHands[handIndex] as Hand;
  const value = evaluate(hand.cards);
  return {
    shoeIndex: 0,
    shoeDealtCount: state.shoe.dealtCount,
    hand: {
      handIndex,
      // The hand state that produced the Decision — for a split, the pair (CONTEXT.md's
      // glossary, and the definition #21 turns on).
      playerCards: [...hand.cards],
      dealerUpcard: dealerUpcard(state),
      total: value.total,
      soft: value.soft,
      fromSplit: hand.fromSplit,
      bet: hand.bet,
    },
    count: snapshot(runningCountAt(state.shoe), state.shoe),
    at,
  };
}

/** The Running Count over everything the Shoe has dealt, recomputed rather than carried. */
function runningCountAt(shoe: Shoe): number {
  let count = 0;
  for (let index = 0; index < shoe.dealtCount; index++) {
    count += hiLoTag(shoe.cards[index] as Card);
  }
  return count;
}

const ENGINE_OUTCOME: Readonly<Record<EngineHandResult, HandOutcome>> = {
  blackjack: "blackjack",
  win: "win",
  push: "push",
  lose: "loss",
  bust: "loss",
  surrender: "surrender",
};

/** The engine's settlement in the Session log's vocabulary, one entry per hand on the table. */
function engineHandResults(state: RoundState): HandResult[] {
  const settlement = state.settlement;
  if (!settlement) return [];

  return settlement.outcomes.map((outcome, index) => {
    const hand = state.playerHands[index];
    return {
      handIndex: outcome.handIndex,
      outcome: ENGINE_OUTCOME[outcome.result],
      busted: outcome.result === "bust",
      bet: outcome.wagered,
      // Insurance is a bet on the round; it rides on the first hand so that a round's net
      // stays the sum of its hands' — which `verifyReplay` checks.
      net: outcome.net + (index === 0 ? settlement.insuranceNet : 0),
      finalTotal: hand ? evaluate(hand.cards).total : 0,
    };
  });
}
