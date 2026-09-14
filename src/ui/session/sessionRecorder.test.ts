/**
 * The recorder, driven through the real Play table transitions against a real seeded Shoe.
 *
 * Nothing here is mocked and nothing is hand-written: the tests deal actual cards through
 * `usePlayTable`'s own transitions and then assert that what the Session recorded agrees
 * with what the engine did. A hand-built fixture could not catch the failure these exist to
 * catch — a log that quietly disagrees with the game it claims to describe.
 */

import { describe, expect, it } from "vitest";
import { rankValue } from "@/engine/cards";
import type { CountingSystemId } from "@/engine/counting";
import type { Action } from "@/engine/hand";
import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";
import { currentLegalActions, isRoundOver } from "@/engine/round";
import {
  computeStats,
  endSession,
  handsPlayed,
  isActive,
  resetBankroll as resetBankrollOn,
  verifyReplay,
} from "@/state";
import type { Session } from "@/state";
import {
  type PlayTable,
  chooseBet,
  chooseSystem,
  createPlayTable,
  dealRound,
  nextRound,
  playAction,
  resetBankroll,
  shuffleShoe,
  takeInsurance,
} from "@/ui/table/usePlayTable";
import {
  beginSession,
  closeRound,
  countingSystemByName,
  handResults,
  observeDecision,
  openRound,
  sessionCountingSystem,
} from "./sessionRecorder";

const AT = 1_700_000_000_000;

interface Run {
  readonly session: Session;
  readonly table: PlayTable;
}

/** A play policy: which of the legal actions this run takes. */
type Policy = (legal: readonly Action[]) => Action;

/** Stand whenever standing is legal. Simple, deterministic, and often wrong — which is useful. */
const ALWAYS_STAND: Policy = (legal) => (legal.includes("stand") ? "stand" : (legal[0] ?? "stand"));

/** Split every pair, then stand. Produces the multi-hand rounds the log has to count separately. */
const ALWAYS_SPLIT: Policy = (legal) => (legal.includes("split") ? "split" : ALWAYS_STAND(legal));

/** Hit to 17 the hard way, which is how a bust actually happens. */
const HIT_TO_SEVENTEEN: Policy = (legal) => (legal.includes("hit") ? "hit" : ALWAYS_STAND(legal));

/**
 * Plays `rounds` rounds through the table's own transitions, recording every one. Insurance
 * is always declined, which is Basic Strategy.
 */
function play(
  rounds: number,
  seed = 1234,
  bet = 10,
  policy: Policy = ALWAYS_STAND,
  system: CountingSystemId = "hi-lo",
  rules: RuleSet = DEFAULT_RULES,
): Run {
  let table = chooseBet(chooseSystem(createPlayTable(rules, seed), system), bet);
  let session = beginSession({ table, id: "run", startedAt: AT });

  for (let round = 0; round < rounds; round++) {
    const at = AT + round * 30_000;
    const opened = openRound(session, table);
    session = opened.session;
    let pending = opened.pending;

    table = dealRound(table);

    while (table.round && table.round.phase === "insurance") {
      pending = observeDecision(pending, table, { kind: "insurance", take: false }, at);
      table = takeInsurance(table, false);
    }

    while (table.round && !isRoundOver(table.round)) {
      const action = policy(currentLegalActions(table.round));
      pending = observeDecision(pending, table, { kind: "play", action }, at);
      table = playAction(table, action);
    }

    session = closeRound(session, pending, table, at);
    table = nextRound(table);
  }

  return { session, table };
}

describe("recording a Session from the Play table", () => {
  it("opens a Session on the Shoe the table is actually dealing from", () => {
    const table = createPlayTable(DEFAULT_RULES, 99);
    const session = beginSession({ table, id: "run", startedAt: AT });

    expect(session.shoes).toHaveLength(1);
    // Recorded, not re-derived: the table and `src/state` derive Shoe seeds differently, and
    // a replay built from the wrong one would deal a different game.
    expect(session.shoes[0]?.seed).toBe(table.shoe.seed);
    expect(session.seed).toBe(table.sessionSeed);
    expect(isActive(session)).toBe(true);
  });

  it("puts a played round into the Decision log and the round results", () => {
    const { session } = play(1);

    expect(session.rounds).toHaveLength(1);
    expect(session.decisions.length).toBeGreaterThan(0);
    expect(session.decisions[0]?.roundIndex).toBe(0);
    expect(session.decisions[0]?.hand.dealerUpcard).toBeDefined();
  });

  it("replays from its seed plus its log, so the record describes the game that was played", () => {
    const { session } = play(8);
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

  it("keeps the Session bankroll in step with the table's, chip for chip", () => {
    const { session, table } = play(12);
    expect(session.bankroll).toBe(table.bankroll);
    expect(session.bankroll).toBe(session.startingBankroll + computeStats(session).netResult);
  });

  it("counts every split hand separately, so a split round reports two hands", () => {
    const { session } = play(30, 1234, 10, ALWAYS_SPLIT);
    const split = session.rounds.find((round) => round.hands.length > 1);
    expect(split, "30 rounds produced no split").toBeDefined();
    expect(handsPlayed(session)).toBeGreaterThan(session.rounds.length);
    // Each half carries its own stake, so the money follows the hands.
    expect(split?.net).toBe(split?.hands.reduce((sum, hand) => sum + hand.net, 0));
  });

  it("records the pair that produced a split Decision, not the halves it became", () => {
    const { session } = play(30, 1234, 10, ALWAYS_SPLIT);
    const splits = session.decisions.filter((decision) => decision.actionTaken === "split");
    expect(splits.length, "30 rounds produced no split").toBeGreaterThan(0);

    for (const decision of splits) {
      const [first, second] = decision.hand.playerCards;
      // `Decision.hand` is "the hand state that produced a Decision" — for a split that is
      // the pair, because a pair is the only thing that can be split.
      expect(decision.hand.playerCards).toHaveLength(2);
      // A pair by value, not by rank — Q and 10 split at every table that deals blackjack.
      expect(rankValue(first?.rank ?? "A")).toBe(rankValue(second?.rank ?? "2"));
    }
    // Recording the pair is what lets replay account for each card exactly once.
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

  it("stores the count that was showing at the moment of each Decision", () => {
    const { session } = play(6);
    for (const decision of session.decisions) {
      expect(decision.count.system).toBe("Hi-Lo");
      expect(decision.count.decksRemaining).toBeGreaterThan(0);
      // A balanced system with cards left always has a True Count — 0 included.
      expect(decision.count.trueCount).not.toBeNull();
    }
  });

  it("stores a balanced system's True Count of 0 as 0, not as an absence", () => {
    const { session } = play(40);
    const level = session.decisions.filter((decision) => decision.count.runningCount === 0);
    expect(level.length, "40 rounds never passed a Running Count of 0").toBeGreaterThan(0);
    for (const decision of level) expect(decision.count.trueCount).toBe(0);
  });

  it.each(["ko", "red-7"] as const)(
    "stores no True Count for %s, which does not convert, and still replays",
    (system) => {
      const { session } = play(20, 1234, 10, ALWAYS_STAND, system);
      expect(session.decisions.length).toBeGreaterThan(0);
      for (const decision of session.decisions) {
        expect(decision.count.trueCount).toBeNull();
        expect(decision.count.decksRemaining).toBeGreaterThan(0);
      }
      expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
    },
  );

  it("stores the deviation-aware answer and the chart answer side by side", () => {
    const { session } = play(20);
    for (const decision of session.decisions) {
      expect(decision.basicStrategyAction).toBeDefined();
      expect(decision.verdict).toBe(
        decision.actionTaken === decision.correctAction ? "correct" : "incorrect",
      );
    }
  });

  it("scores a stand-on-everything run below perfect, because standing on 8 is wrong", () => {
    const stats = computeStats(play(25).session);
    expect(stats.basicStrategyAccuracy).not.toBeNull();
    expect(stats.basicStrategyAccuracy ?? 1).toBeLessThan(1);
  });
});

/**
 * The property this seam exists to keep: whatever the player does, the recorded log replays
 * from its seed. Every policy, several seeds, and a double-deck shoe so each run crosses at
 * least one reshuffle before hitting every hand can run the bankroll out.
 */
describe("every recorded run replays from its seed", () => {
  const policies = { ALWAYS_STAND, ALWAYS_SPLIT, HIT_TO_SEVENTEEN } as const;
  const doubleDeck: RuleSet = { ...DEFAULT_RULES, decks: 2 };

  it.each(Object.keys(policies) as (keyof typeof policies)[])("under %s", (name) => {
    for (const seed of [1, 7, 1234, 4242]) {
      const { session } = play(40, seed, doubleDeck.minBet, policies[name], "hi-lo", doubleDeck);
      expect(session.shoes.length, `seed ${seed} never reshuffled`).toBeGreaterThan(1);
      expect(verifyReplay(session), `seed ${seed}`).toEqual({ ok: true, problems: [] });
    }
  });
});

describe("a round that has not settled is not in the log", () => {
  it("holds its Decisions back until the round closes", () => {
    let table = chooseBet(createPlayTable(DEFAULT_RULES, 7), 10);
    const session = beginSession({ table, id: "run", startedAt: AT });
    const opened = openRound(session, table);

    table = dealRound(table);
    expect(table.round?.phase).toBe("player");

    let pending = observeDecision(opened.pending, table, { kind: "play", action: "stand" }, AT);
    // The buffer holds it; the Session does not. A Decision persisted without its round would
    // carry the *next* round's index and make `verifyReplay` check the wrong cards.
    expect(pending.decisions).toHaveLength(1);
    expect(opened.session.decisions).toHaveLength(0);

    table = playAction(table, "stand");
    while (table.round && !isRoundOver(table.round)) {
      const legal = currentLegalActions(table.round);
      const action = legal.includes("stand") ? "stand" : (legal[0] ?? "stand");
      pending = observeDecision(pending, table, { kind: "play", action }, AT);
      table = playAction(table, action);
    }

    const closed = closeRound(opened.session, pending, table, AT);
    expect(closed.decisions).toHaveLength(pending.decisions.length);
    expect(closed.rounds).toHaveLength(1);
    expect(verifyReplay(closed)).toEqual({ ok: true, problems: [] });
  });

  it("records nothing at all when `closeRound` is handed an unsettled round", () => {
    let table = chooseBet(createPlayTable(DEFAULT_RULES, 7), 10);
    const session = beginSession({ table, id: "run", startedAt: AT });
    const opened = openRound(session, table);
    table = dealRound(table);

    if (table.round && !isRoundOver(table.round)) {
      expect(closeRound(opened.session, opened.pending, table, AT)).toBe(opened.session);
    }
  });
});

describe("what does not end a Session", () => {
  it("survives a reshuffle, and records the new Shoe by its seed", () => {
    let { session, table } = play(2);
    table = shuffleShoe(table);
    const opened = openRound(session, table);
    session = opened.session;

    expect(isActive(session)).toBe(true);
    expect(session.shoes).toHaveLength(2);
    expect(session.shoes[1]?.seed).toBe(table.shoe.seed);
  });

  it("survives a bankroll reset, and keeps the ruin in the net result", () => {
    const { session } = play(3);
    const before = computeStats(session).netResult;

    const topped = resetBankrollOn(session, 500);
    expect(isActive(topped)).toBe(true);
    expect(topped.bankroll).toBe(500);
    // The chips lost stay in the statistics: a ruin is the most instructive entry in a
    // training log, so the top-up moves the bankroll and nothing else.
    expect(computeStats(topped).netResult).toBe(before);
  });

  it("only closes when `endSession` is called", () => {
    const { session } = play(2);
    expect(isActive(session)).toBe(true);
    const ended = endSession(session, "user", AT + 1);
    expect(ended.endedAt).toBe(AT + 1);
    expect(ended.endReason).toBe("user");
    expect(endSession(ended, "discarded", AT + 2)).toBe(ended);
  });
});

describe("mapping the engine's settlement onto the log", () => {
  it("makes the round's hands sum to the settlement, insurance included", () => {
    let table = chooseBet(createPlayTable(DEFAULT_RULES, 4242), 10);
    for (let round = 0; round < 40; round++) {
      table = dealRound(table);
      while (table.round && table.round.phase === "insurance") {
        table = takeInsurance(table, true);
      }
      while (table.round && !isRoundOver(table.round)) {
        const legal = currentLegalActions(table.round);
        table = playAction(table, legal.includes("stand") ? "stand" : (legal[0] ?? "stand"));
      }
      const round_ = table.round;
      if (round_?.settlement) {
        const hands = handResults(round_);
        const sum = hands.reduce((total, hand) => total + hand.net, 0);
        expect(sum).toBeCloseTo(round_.settlement.net, 10);
      }
      table = nextRound(table);
    }
  });

  it("records a bust as a loss that is also a bust", () => {
    const { session } = play(40, 1234, 10, HIT_TO_SEVENTEEN);
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
    const busted = session.rounds.flatMap((round) => round.hands).filter((hand) => hand.busted);
    expect(busted.length, "40 rounds of hitting produced no bust").toBeGreaterThan(0);
    // The Session log has no "bust" outcome: a bust is a loss, with its cause kept beside it,
    // because bust rate is its own statistic and how you lost is what a trainer teaches from.
    for (const hand of busted) expect(hand.outcome).toBe("loss");

    const stats = computeStats(session);
    expect(stats.bustRate).not.toBeNull();
    expect(stats.bustRate ?? 0).toBeGreaterThan(0);
  });
});

describe("resuming", () => {
  it("reads a Counting System back by its published name", () => {
    expect(countingSystemByName("Hi-Lo").id).toBe("hi-lo");
    expect(countingSystemByName("Wong Halves").id).toBe("wong-halves");
    // An unrecognised name falls back rather than crashing a screen.
    expect(countingSystemByName("Nonesuch").id).toBe("hi-lo");
  });

  it("prefers the system the last Decision was taken under, not the one at the start", () => {
    const { session } = play(3);
    expect(sessionCountingSystem(session).id).toBe("hi-lo");

    const drifted: Session = {
      ...session,
      countingSystem: "Hi-Lo",
      decisions: session.decisions.map((decision, index) =>
        index === session.decisions.length - 1
          ? { ...decision, count: { ...decision.count, system: "Zen Count" } }
          : decision,
      ),
    };
    expect(sessionCountingSystem(drifted).id).toBe("zen");
  });
});

describe("the bankroll reset keeps the Session open (invariant 6)", () => {
  it("leaves the table playable and the Session recording", () => {
    const { table } = play(1);
    const broke = resetBankroll({ ...table, bankroll: 0 });
    expect(broke.bankroll).toBeGreaterThan(0);
    expect(broke.round).toBeNull();
  });
});
