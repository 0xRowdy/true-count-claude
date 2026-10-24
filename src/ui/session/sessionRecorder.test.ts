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
  countingSystemsUsed,
  decodeSession,
  encodeSession,
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
  prepareRound,
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
  syncCountingSystem,
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
    // Match usePlaySession.deal: prepare before recording, then dealRound prepares again.
    table = prepareRound(table);
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
  it("replays every round when the cut card falls before the first card", () => {
    const rules = { ...DEFAULT_RULES, decks: 1, penetration: 0.01 };
    const { session } = play(3, 1234, 10, ALWAYS_STAND, "hi-lo", rules);
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
    expect(session.shoes).toHaveLength(3);
    expect(session.rounds.map((round) => round.shoeIndex)).toEqual([0, 1, 2]);
  });

  it("preserves a legacy no-peek round's reserved hole card and original-bet refund", () => {
    // Seed 3398 deals 5h, 10h, 6h, Ad, 9d. Older versions reserved Ad as the hole
    // card, doubled 11 onto 9d, then refunded the extra wager against dealer blackjack.
    const { session } = play(1, 3398, 10, () => "double", "hi-lo", {
      ...DEFAULT_RULES,
      dealerPeek: false,
    });
    const legacy: Session = {
      ...session,
      bankroll: session.startingBankroll - 10,
      decisions: session.decisions.map((decision) => ({
        ...decision,
        shoeDealtCount: 4,
        count: { ...decision.count, decksRemaining: 308 / 52 },
      })),
      rounds: session.rounds.map((round) => ({
        ...round,
        dealerCards: [
          { rank: "10", suit: "h" },
          { rank: "A", suit: "d" },
        ],
        hands: round.hands.map((hand) => ({ ...hand, finalTotal: 20, net: -10 })),
        net: -10,
      })),
    };
    const restored = decodeSession(encodeSession(legacy));
    expect(restored).toEqual({ ok: true, session: legacy, applied: [] });
    expect(verifyReplay(legacy)).toEqual({ ok: true, problems: [] });
    expect(computeStats(legacy).netResult).toBe(-10);
  });

  it("replays safety reshuffles and European dealer draw order at full penetration", () => {
    const rules = { ...DEFAULT_RULES, decks: 1, penetration: 1, dealerPeek: false };
    const { session } = play(40, 12, 10, ALWAYS_SPLIT, "hi-lo", rules);
    expect(session.shoes.length).toBeGreaterThan(1);
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

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

  it("resumes in the system in force, including one switched to after the last Decision", () => {
    let { session, table } = play(3);
    expect(sessionCountingSystem(session).id).toBe("hi-lo");

    // Switched between rounds, with no Decision taken since: the old rule of reading the last
    // Decision's system would resume this table in Hi-Lo.
    table = chooseSystem(table, "zen");
    session = syncCountingSystem(session, table, AT + 1);
    expect(sessionCountingSystem(session).id).toBe("zen");
  });
});

/**
 * #26: the table let a user switch Counting Systems mid-Session, and the Session went on naming
 * the old one — a bug report showed the table dealing KO while the Session said Hi-Lo. The
 * change is recorded, not deferred (see `syncCountingSystem`), and these walk a real run to
 * show the two never disagree at any point a Session is read.
 */
describe("changing the Counting System mid-Session (#26)", () => {
  /** Deals one round through the table's own transitions, syncing the system as the hook does. */
  function playRound(run: Run, at: number, midRound?: CountingSystemId): Run {
    let { session, table } = run;
    session = syncCountingSystem(session, table, at);
    const opened = openRound(session, table);
    session = opened.session;
    let pending = opened.pending;
    table = dealRound(table);

    let switched = false;
    while (table.round && !isRoundOver(table.round)) {
      if (table.round.phase === "insurance") {
        pending = observeDecision(pending, table, { kind: "insurance", take: false }, at);
        table = takeInsurance(table, false);
        continue;
      }
      if (midRound && !switched) {
        table = chooseSystem(table, midRound);
        session = syncCountingSystem(session, table, at);
        switched = true;
        expect(session.countingSystem).toBe(table.system.name);
      }
      const legal = table.round ? currentLegalActions(table.round) : [];
      const action = legal.includes("stand") ? "stand" : (legal[0] ?? "stand");
      pending = observeDecision(pending, table, { kind: "play", action }, at);
      table = playAction(table, action);
    }
    if (midRound) expect(switched, "the round settled on the deal").toBe(true);
    session = closeRound(session, pending, table, at);
    return { session, table: nextRound(table) };
  }

  it("keeps the Session's system equal to the table's through switches mid-round and between rounds", () => {
    let run = play(2);
    let at = AT + 100_000;

    run = playRound(run, at++, "ko");
    expect(run.session.countingSystem).toBe("KO");

    // Between rounds, after a reshuffle the Session has not yet seen.
    run = { ...run, table: chooseSystem(shuffleShoe(run.table), "omega-ii") };
    run = { ...run, session: syncCountingSystem(run.session, run.table, at++) };
    expect(run.session.countingSystem).toBe(run.table.system.name);
    expect(run.session.shoes.at(-1)?.seed).toBe(run.table.shoe.seed);

    for (let round = 0; round < 4; round++) run = playRound(run, at++);

    const { session, table } = run;
    expect(session.countingSystem).toBe(table.system.name);
    expect(countingSystemsUsed(session)).toEqual(["Hi-Lo", "KO", "Omega II"]);
    // Every Decision names the system the table was counting in when it was taken, and the
    // changes chain from Hi-Lo to the Session's current system.
    const systems = session.decisions.map((decision) => decision.count.system);
    expect(new Set(systems)).toEqual(new Set(["Hi-Lo", "KO", "Omega II"]));
    expect(systems.at(-1)).toBe("Omega II");
    // A system reads the cards and deals none, so the whole run still replays.
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

  it("places a mid-round change at the live Shoe position, inside the round it happened in", () => {
    const run = playRound(play(1), AT + 5, "red-7");
    const [change] = run.session.countingSystemChanges;

    expect(change).toMatchObject({ from: "Hi-Lo", to: "Red 7", roundIndex: 1, shoeIndex: 0 });
    const round = run.session.rounds[1]!;
    expect(change!.shoeDealtCount).toBeGreaterThan(round.shoeStartIndex);
    expect(change!.shoeDealtCount).toBeLessThanOrEqual(round.shoeEndIndex);
  });

  it("records nothing when the table's system has not changed, or the Session is closed", () => {
    const { session, table } = play(2);
    expect(syncCountingSystem(session, table, AT)).toBe(session);

    const ended = endSession(session, "user", AT + 1);
    expect(syncCountingSystem(ended, chooseSystem(table, "ko"), AT + 2)).toBe(ended);
  });

  it("opens a Session in the system the table is counting in", () => {
    const table = chooseSystem(createPlayTable(DEFAULT_RULES, 3), "wong-halves");
    const session = beginSession({ table, id: "run", startedAt: AT });
    expect(session.countingSystem).toBe("Wong Halves");
    expect(session.countingSystemChanges).toEqual([]);
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

/**
 * The coach catches a play before it reaches the cards and the player takes it back: the
 * Decision is scored as what they chose, and the cards follow what replaced it. Replay must
 * read the cards by the replacement, or a taken-back split would be counted as a real one.
 */
describe("a coach take-back", () => {
  /** Plays rounds where every legal `chosen` is taken back and replaced by `played`. */
  function playTakingBack(rounds: number, chosen: Action, played: Action, seed = 1234): Run {
    let table = chooseBet(createPlayTable(DEFAULT_RULES, seed), 10);
    let session = beginSession({ table, id: "coached", startedAt: AT });
    for (let round = 0; round < rounds; round++) {
      const opened = openRound(session, table);
      session = opened.session;
      let pending = opened.pending;
      table = dealRound(table);
      while (table.round && table.round.phase === "insurance") {
        pending = observeDecision(pending, table, { kind: "insurance", take: false }, AT);
        table = takeInsurance(table, false);
      }
      while (table.round && !isRoundOver(table.round)) {
        const legal = currentLegalActions(table.round);
        if (legal.includes(chosen) && legal.includes(played)) {
          pending = observeDecision(
            pending,
            table,
            { kind: "play", action: chosen, playedInstead: played },
            AT,
          );
          table = playAction(table, played);
        } else {
          const action = ALWAYS_STAND(legal);
          pending = observeDecision(pending, table, { kind: "play", action }, AT);
          table = playAction(table, action);
        }
      }
      session = closeRound(session, pending, table, AT);
      table = nextRound(table);
    }
    return { session, table };
  }

  it("records what was chosen, scored, and what was played in its place", () => {
    const { session } = playTakingBack(30, "split", "stand");
    const takenBack = session.decisions.filter((d) => d.playedInstead !== undefined);
    expect(takenBack.length, "30 rounds offered no split").toBeGreaterThan(0);
    for (const decision of takenBack) {
      expect(decision.actionTaken).toBe("split");
      expect(decision.playedInstead).toBe("stand");
    }
    // An ordinary Decision carries no replacement at all.
    expect(session.decisions.some((d) => !("playedInstead" in d))).toBe(true);
  });

  it("replays a taken-back split as the stand that was played", () => {
    const { session } = playTakingBack(30, "split", "stand");
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

  it("replays a stand taken back into a split as the split that was played", () => {
    const { session } = playTakingBack(30, "stand", "split");
    expect(session.decisions.some((d) => d.playedInstead === "split")).toBe(true);
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

  it("counts a taken-back mistake as a miss", () => {
    const { session } = playTakingBack(30, "stand", "split");
    const stats = computeStats(session);
    const misses = session.decisions.filter((d) => d.verdict === "incorrect").length;
    expect(stats.decisionsMade).toBe(session.decisions.length);
    expect(stats.decisionsMade - stats.correctDecisions).toBe(misses);
  });

  it("records a taken-back insurance answer the same way", () => {
    let table = chooseBet(createPlayTable(DEFAULT_RULES, 1), 10);
    const session = beginSession({ table, id: "ins", startedAt: AT });
    let pending = openRound(session, table).pending;
    // Find a round that offers insurance.
    for (let i = 0; i < 400 && !(table.round?.phase === "insurance"); i++) {
      table = table.round ? nextRound(table) : table;
      if (table.round && isRoundOver(table.round)) table = nextRound(table);
      if (!table.round) {
        pending = openRound(session, table).pending;
        table = dealRound(table);
        while (table.round && table.round.phase === "player") {
          table = playAction(table, ALWAYS_STAND(currentLegalActions(table.round)));
        }
      }
    }
    expect(table.round?.phase, "no insurance offer in 400 rounds").toBe("insurance");
    pending = observeDecision(
      pending,
      table,
      { kind: "insurance", take: true, playedInstead: false },
      AT,
    );
    expect(pending.decisions[0]?.actionTaken).toBe("insurance");
    expect(pending.decisions[0]?.playedInstead).toBe("decline-insurance");
  });
});
