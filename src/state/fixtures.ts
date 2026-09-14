/**
 * Test support: a deterministic Session built by actually dealing from a seeded Shoe.
 *
 * Hand-written Session literals would let the log and the seed drift apart, which is the
 * one thing `verifyReplay` exists to catch — so the fixtures deal real cards and record
 * what happened, exactly as the Play loop will. Not exported from `index.ts`; this is
 * scaffolding, not product surface.
 */

import { DEFAULT_RULES, type Card, type RuleSet, type Shoe, deal, evaluate, isTen } from "@/engine";
import { openShoe, recordCountCheck, recordDecision, recordRound, startSession } from "./session";
import type { CountSnapshot, HandOutcome, HandResult, Session } from "./types";

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
