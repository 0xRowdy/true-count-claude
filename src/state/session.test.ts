import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/engine";
import { buildSession } from "./fixtures";
import {
  changeCountingSystem,
  countingSystemsUsed,
  recordConversionCheck,
  recordIndexPlay,
  currentShoe,
  deriveShoeSeed,
  endSession,
  handsPlayed,
  isActive,
  openShoe,
  recordCountCheck,
  recordDecision,
  recordRound,
  resetBankroll,
  startSession,
  syncShoeProgress,
} from "./session";
import type { Session } from "./types";

function freshSession(): Session {
  return startSession({
    id: "s1",
    mode: "play",
    rules: DEFAULT_RULES,
    countingSystem: "Hi-Lo",
    seed: 77,
    startedAt: 1_000,
    startingBankroll: 200,
  });
}

describe("Session lifecycle", () => {
  it("starts active, with no Shoe and an empty log", () => {
    const session = freshSession();

    expect(isActive(session)).toBe(true);
    expect(session.endedAt).toBeNull();
    expect(session.endReason).toBeNull();
    expect(session.bankroll).toBe(200);
    expect(currentShoe(session)).toBeNull();
    expect(session.decisions).toHaveLength(0);
  });

  it("records a drillId only for a Drill", () => {
    const drill = startSession({
      id: "d1",
      mode: "drill",
      rules: DEFAULT_RULES,
      countingSystem: "KO",
      seed: 1,
      startedAt: 0,
      startingBankroll: 100,
      drillId: "illustrious-18",
    });
    const play = startSession({
      id: "p1",
      mode: "play",
      rules: DEFAULT_RULES,
      countingSystem: "KO",
      seed: 1,
      startedAt: 0,
      startingBankroll: 100,
      drillId: "illustrious-18",
    });

    expect(drill.drillId).toBe("illustrious-18");
    expect(play.drillId).toBeNull();
  });
});

/**
 * ADR-0003: the incumbent's most detailed negative review is about game sessions that would
 * not close reliably. These are the assertions that keep that from being us.
 */
describe("ending a Session is explicit and always available", () => {
  it("ends on an explicit call, recording when and why", () => {
    const ended = endSession(freshSession(), "user", 9_000);

    expect(isActive(ended)).toBe(false);
    expect(ended.endedAt).toBe(9_000);
    expect(ended.endReason).toBe("user");
  });

  it("ends mid-round, with an open Shoe and decisions in flight", () => {
    const mid = buildSession({ rounds: 3 });
    expect(isActive(mid)).toBe(true);

    const ended = endSession(mid, "user", 9_999);

    expect(isActive(ended)).toBe(false);
    // The log survives the close intact — ending is not discarding.
    expect(ended.decisions).toHaveLength(mid.decisions.length);
    expect(ended.rounds).toHaveLength(mid.rounds.length);
  });

  it("is idempotent, so a double-tapped button cannot rewrite a closed Session", () => {
    const first = endSession(freshSession(), "user", 5_000);
    const second = endSession(first, "discarded", 6_000);

    expect(second).toBe(first);
    expect(second.endedAt).toBe(5_000);
    expect(second.endReason).toBe("user");
  });

  it("never ends as a side effect of a bankroll reaching zero (invariant 6)", () => {
    let session = freshSession();
    session = openShoe(session).session;
    session = recordRound(session, {
      shoeIndex: 0,
      shoeStartIndex: 0,
      shoeEndIndex: 4,
      hands: [{ handIndex: 0, outcome: "loss", busted: true, bet: 200, net: -200, finalTotal: 23 }],
      dealerCards: [],
      at: 2_000,
    });

    expect(session.bankroll).toBe(0);
    expect(isActive(session)).toBe(true);

    // The one-tap reset happens in place; the Session is never a dead end.
    expect(resetBankroll(session, 200).bankroll).toBe(200);
    expect(isActive(resetBankroll(session, 200))).toBe(true);
  });

  it("never ends as a side effect of reshuffling", () => {
    let session = freshSession();
    session = openShoe(session).session;
    session = openShoe(session).session;

    expect(session.shoes).toHaveLength(2);
    expect(isActive(session)).toBe(true);
  });

  it("refuses to write to a closed Session, with a diagnosable message", () => {
    const ended = endSession(buildSession({ rounds: 1 }), "user", 9_000);

    expect(() => openShoe(ended)).toThrow(/Session session-1 ended/);
    expect(() => resetBankroll(ended, 100)).toThrow(/Cannot reset the bankroll/);
    expect(() =>
      recordRound(ended, {
        shoeIndex: 0,
        shoeStartIndex: 0,
        shoeEndIndex: 0,
        hands: [],
        dealerCards: [],
        at: 1,
      }),
    ).toThrow(/Cannot record a round/);
  });
});

describe("the Decision log", () => {
  it("indexes Decisions by position, so seed + index is a complete repro", () => {
    const session = buildSession({ rounds: 4 });

    expect(session.decisions).toHaveLength(4);
    session.decisions.forEach((decision, i) => expect(decision.index).toBe(i));
  });

  it("keeps the count that was showing at the moment of the Decision", () => {
    const session = buildSession({ rounds: 4 });
    const first = session.decisions[0]!;

    expect(first.count.system).toBe("Hi-Lo");
    expect(first.count.decksRemaining).toBeLessThan(DEFAULT_RULES.decks);
    expect(first.count.trueCount).toBeCloseTo(first.count.runningCount / first.count.decksRemaining);
  });

  it("derives a count check's verdict from the numbers, never from the caller", () => {
    let session = openShoe(freshSession()).session;
    session = recordCountCheck(session, {
      roundIndex: 0,
      shoeIndex: 0,
      shoeDealtCount: 10,
      statedRunningCount: 3,
      actualRunningCount: 3,
      at: 1,
    });
    session = recordCountCheck(session, {
      roundIndex: 1,
      shoeIndex: 0,
      shoeDealtCount: 20,
      statedRunningCount: 2,
      actualRunningCount: -1,
      at: 2,
    });

    expect(session.countChecks.map((c) => c.verdict)).toEqual(["correct", "incorrect"]);
    expect(session.countChecks.map((c) => c.index)).toEqual([0, 1]);
  });

  it("counts every split hand separately in handsPlayed", () => {
    let session = openShoe(freshSession()).session;
    session = recordRound(session, {
      shoeIndex: 0,
      shoeStartIndex: 0,
      shoeEndIndex: 8,
      hands: [
        { handIndex: 0, outcome: "win", busted: false, bet: 10, net: 10, finalTotal: 20 },
        { handIndex: 1, outcome: "loss", busted: true, bet: 10, net: -10, finalTotal: 24 },
      ],
      dealerCards: [],
      at: 1,
    });

    expect(handsPlayed(session)).toBe(1 + 1);
    expect(session.rounds).toHaveLength(1);
    expect(session.rounds[0]!.net).toBe(0);
    expect(session.bankroll).toBe(200);
  });
});

describe("Shoe bookkeeping", () => {
  it("opens Shoes with seeds derived from the Session seed, and records them", () => {
    let session = freshSession();
    const first = openShoe(session);
    session = first.session;
    const second = openShoe(session);
    session = second.session;

    expect(session.shoes.map((shoe) => shoe.index)).toEqual([0, 1]);
    expect(first.shoe.seed).toBe(deriveShoeSeed(77, 0));
    expect(second.shoe.seed).toBe(deriveShoeSeed(77, 1));
    expect(first.shoe.seed).not.toBe(second.shoe.seed);
    expect(currentShoe(session)?.index).toBe(1);
  });

  it("derives Shoe seeds deterministically", () => {
    expect(deriveShoeSeed(5, 0)).toBe(deriveShoeSeed(5, 0));
    expect(deriveShoeSeed(5, 1)).not.toBe(deriveShoeSeed(6, 1));
  });

  it("advances the Shoe's dealt count as Decisions and rounds are logged", () => {
    const session = buildSession({ rounds: 3 });
    const shoe = currentShoe(session)!;

    expect(shoe.dealtCount).toBeGreaterThan(0);
    expect(shoe.dealtCount).toBe(session.rounds[2]!.shoeEndIndex);
  });

  it("never rewinds a Shoe on an out-of-order write", () => {
    let session = openShoe(freshSession()).session;
    session = syncShoeProgress(session, 30);
    session = recordDecision(session, {
      roundIndex: 0,
      shoeIndex: 0,
      shoeDealtCount: 10,
      hand: {
        handIndex: 0,
        playerCards: [],
        dealerUpcard: { rank: "5", suit: "s" },
        total: 12,
        soft: false,
        fromSplit: false,
        bet: 10,
      },
      actionTaken: "hit",
      correctAction: "hit",
      basicStrategyAction: "hit",
      verdict: "correct",
      count: { system: "Hi-Lo", runningCount: 0, trueCount: 0, decksRemaining: 6 },
      at: 1,
    });

    expect(currentShoe(session)?.dealtCount).toBe(30);
  });
});

const CONVERSION = {
  system: "Hi-Lo",
  decks: 6,
  runningCount: -7,
  cardsRemaining: 104,
  decksRemaining: 2,
  rounding: "truncate",
  actualTrueCount: -3,
  runSeed: 11,
  questionIndex: 0,
  at: 5,
} as const;

const INDEX_PLAY = {
  entryId: "i18-16v10",
  entryLabel: "16 vs 10",
  indexNumber: 0,
  system: "Hi-Lo",
  kind: "hand",
  placedCards: [
    { rank: "10", suit: "s" },
    { rank: "6", suit: "h" },
  ],
  dealerUpcard: { rank: "K", suit: "d" },
  runningCount: 2,
  cardsRemaining: 104,
  rounding: "truncate",
  trueCount: 1,
  firing: true,
  correctAction: "stand",
  basicStrategyAction: "hit",
  runSeed: 3,
  questionIndex: 4,
  cutShoeSeed: 99,
  cutPosition: 120,
  at: 6,
} as const;

describe("the drill logs a Session gained in version 3 (#27)", () => {
  it("derives a conversion check's verdict from the two True Counts", () => {
    let session = freshSession();
    session = recordConversionCheck(session, { ...CONVERSION, statedTrueCount: -3 });
    // -4 is what flooring gives. Right arithmetic, wrong rounding — still not this drill's answer.
    session = recordConversionCheck(session, { ...CONVERSION, statedTrueCount: -4, at: 6 });

    expect(session.conversionChecks.map((check) => [check.index, check.verdict])).toEqual([
      [0, "correct"],
      [1, "incorrect"],
    ]);
  });

  it("derives an index play's verdict from the two actions, and touches no Shoe or round", () => {
    let session = openShoe(freshSession()).session;
    const before = session;
    session = recordIndexPlay(session, { ...INDEX_PLAY, actionTaken: "stand" });
    session = recordIndexPlay(session, { ...INDEX_PLAY, actionTaken: "hit" });

    expect(session.indexPlays.map((play) => [play.index, play.verdict])).toEqual([
      [0, "correct"],
      [1, "incorrect"],
    ]);
    // Placed cards are not dealt cards: nothing about the Shoe or the rounds moves.
    expect(session.shoes).toEqual(before.shoes);
    expect(session.rounds).toEqual([]);
    expect(session.decisions).toEqual([]);
  });

  it("refuses both on a closed Session", () => {
    const closed = endSession(freshSession(), "user", 2_000);
    expect(() => recordConversionCheck(closed, { ...CONVERSION, statedTrueCount: 0 })).toThrow(
      /Cannot record a conversion check/,
    );
    expect(() => recordIndexPlay(closed, { ...INDEX_PLAY, actionTaken: "hit" })).toThrow(
      /Cannot record an index play/,
    );
  });
});

describe("changing the Counting System mid-Session (#26)", () => {
  it("moves the Session to the new system and logs where the change happened", () => {
    let session = buildSession({ rounds: 3 });
    const shoe = currentShoe(session)!;
    session = changeCountingSystem(session, {
      to: "KO",
      at: 9_000,
      shoeDealtCount: shoe.dealtCount + 4,
    });

    expect(session.countingSystem).toBe("KO");
    expect(session.countingSystemChanges).toEqual([
      {
        index: 0,
        from: "Hi-Lo",
        to: "KO",
        roundIndex: 3,
        shoeIndex: shoe.index,
        shoeDealtCount: shoe.dealtCount + 4,
        at: 9_000,
        inferredFromDecision: null,
      },
    ]);
  });

  it("records nothing when the system is already the one in force", () => {
    const session = buildSession({ rounds: 1 });
    expect(changeCountingSystem(session, { to: "Hi-Lo", at: 1 })).toBe(session);
  });

  it("defaults the position to the Shoe as recorded, and has none before the first Shoe", () => {
    const recorded = changeCountingSystem(buildSession({ rounds: 2 }), { to: "Zen Count", at: 1 });
    expect(recorded.countingSystemChanges[0]!.shoeDealtCount).toBe(
      currentShoe(recorded)!.dealtCount,
    );

    const unopened = changeCountingSystem(freshSession(), { to: "Zen Count", at: 1 });
    expect(unopened.countingSystemChanges[0]).toMatchObject({
      shoeIndex: null,
      shoeDealtCount: null,
    });
  });

  it("lists every system used, once each, in the order each took over", () => {
    let session = freshSession();
    expect(countingSystemsUsed(session)).toEqual(["Hi-Lo"]);
    for (const to of ["KO", "Hi-Lo", "Omega II", "KO"]) {
      session = changeCountingSystem(session, { to, at: 1 });
    }
    expect(countingSystemsUsed(session)).toEqual(["Hi-Lo", "KO", "Omega II"]);
    expect(session.countingSystem).toBe("KO");
  });

  it("does not change a closed Session", () => {
    const closed = endSession(freshSession(), "user", 2_000);
    expect(() => changeCountingSystem(closed, { to: "KO", at: 1 })).toThrow(/Cannot change/);
  });
});
