import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/engine";
import { buildSession } from "./fixtures";
import {
  changeCountingSystem,
  endSession,
  openShoe,
  recordConversionCheck,
  recordIndexPlay,
  recordRound,
  startSession,
} from "./session";
import { aggregateStats, computeStats, summarize } from "./stats";
import type { Session } from "./types";

function emptySession(id = "empty"): Session {
  return startSession({
    id,
    mode: "play",
    rules: DEFAULT_RULES,
    countingSystem: "Hi-Lo",
    seed: 1,
    startedAt: 1_000,
    startingBankroll: 100,
  });
}

describe("session statistics", () => {
  it("reports no accuracy rather than 0% for a Session with nothing in it", () => {
    const stats = computeStats(emptySession());

    expect(stats.handsPlayed).toBe(0);
    expect(stats.basicStrategyAccuracy).toBeNull();
    expect(stats.countingAccuracy).toBeNull();
    expect(stats.winRate).toBeNull();
    expect(stats.bustRate).toBeNull();
    expect(stats.netPerHand).toBeNull();
    expect(stats.netResult).toBe(0);
  });

  it("scores Basic Strategy accuracy off the Decision log", () => {
    // The fixture logs every third round as a wrong Decision.
    const stats = computeStats(buildSession({ rounds: 6 }));

    expect(stats.decisionsMade).toBe(6);
    expect(stats.correctDecisions).toBe(4);
    expect(stats.basicStrategyAccuracy).toBeCloseTo(4 / 6);
  });

  it("scores counting accuracy off the count checks, separately from plays", () => {
    const stats = computeStats(buildSession({ rounds: 6 }));

    expect(stats.countChecks).toBe(2);
    expect(stats.correctCountChecks).toBe(1);
    expect(stats.countingAccuracy).toBeCloseTo(0.5);
  });

  it("derives every rate from counts a user could recount by hand", () => {
    const stats = computeStats(buildSession({ rounds: 12 }));

    expect(stats.wins + stats.blackjacks + stats.pushes + stats.losses + stats.surrenders).toBe(
      stats.handsPlayed,
    );
    expect(stats.winRate).toBeCloseTo((stats.wins + stats.blackjacks) / stats.handsPlayed);
    expect(stats.bustRate).toBeCloseTo(stats.busts / stats.handsPlayed);
    expect(stats.netPerHand).toBeCloseTo(stats.netResult / stats.handsPlayed);
  });

  it("matches the net result against the bankroll the Session actually holds", () => {
    const session = buildSession({ rounds: 10, startingBankroll: 500 });
    const stats = computeStats(session);

    expect(session.startingBankroll + stats.netResult).toBe(session.bankroll);
  });

  it("counts a push as a hand played but not as a win", () => {
    let session = openShoe(emptySession()).session;
    session = recordRound(session, {
      shoeIndex: 0,
      shoeStartIndex: 0,
      shoeEndIndex: 4,
      hands: [
        { handIndex: 0, outcome: "push", busted: false, bet: 10, net: 0, finalTotal: 20 },
        { handIndex: 1, outcome: "blackjack", busted: false, bet: 10, net: 15, finalTotal: 21 },
      ],
      dealerCards: [],
      at: 1,
    });
    const stats = computeStats(session);

    expect(stats.handsPlayed).toBe(2);
    expect(stats.pushes).toBe(1);
    expect(stats.blackjacks).toBe(1);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.netResult).toBe(15);
    expect(stats.wagered).toBe(20);
  });

  it("aggregates lifetime stats by summing counts, not averaging rates", () => {
    const long = buildSession({ id: "long", rounds: 9, seed: 11 });
    const short = buildSession({ id: "short", rounds: 3, seed: 22 });
    const lifetime = aggregateStats([long, short]);

    expect(lifetime.decisionsMade).toBe(12);
    expect(lifetime.handsPlayed).toBe(
      computeStats(long).handsPlayed + computeStats(short).handsPlayed,
    );
    expect(lifetime.netResult).toBe(computeStats(long).netResult + computeStats(short).netResult);
  });
});

describe("session summaries", () => {
  it("has no duration while the Session is still running", () => {
    const summary = summarize(buildSession({ rounds: 2 }));

    expect(summary.active).toBe(true);
    expect(summary.durationMs).toBeNull();
    expect(summary.endReason).toBeNull();
  });

  it("reports duration and reason once the Session is explicitly ended", () => {
    const session = endSession(buildSession({ rounds: 2, startedAt: 1_000 }), "user", 61_000);
    const summary = summarize(session);

    expect(summary.active).toBe(false);
    expect(summary.durationMs).toBe(60_000);
    expect(summary.endReason).toBe("user");
    expect(summary.seed).toBe(session.seed);
  });

  it("names every Counting System the Session was kept in, and the one in force now", () => {
    let session = buildSession({ rounds: 2 });
    expect(summarize(session).countingSystems).toEqual(["Hi-Lo"]);

    session = changeCountingSystem(session, { to: "KO", at: 1_700_000_900_000 });
    const summary = summarize(session);
    expect(summary.countingSystem).toBe("KO");
    expect(summary.countingSystems).toEqual(["Hi-Lo", "KO"]);
    expect(summary.lastActivityAt).toBe(1_700_000_900_000);
  });

  it("dates a Session by its latest record, not by when it opened", () => {
    let session = emptySession();
    expect(summarize(session).lastActivityAt).toBe(1_000);
    session = recordConversionCheck(session, { ...CONVERSION, statedTrueCount: 1, at: 50_000 });
    expect(summarize(session).lastActivityAt).toBe(50_000);
  });
});

const CONVERSION = {
  system: "Hi-Lo",
  decks: 6,
  runningCount: 6,
  cardsRemaining: 156,
  decksRemaining: 3,
  rounding: "truncate",
  actualTrueCount: 2,
  runSeed: 1,
  questionIndex: 0,
  at: 2_000,
} as const;

describe("drill accuracy for the version 3 records (#27)", () => {
  it("scores True Count accuracy off conversion checks and index-play accuracy off index plays", () => {
    let session = emptySession();
    session = recordConversionCheck(session, { ...CONVERSION, statedTrueCount: 2 });
    session = recordConversionCheck(session, { ...CONVERSION, statedTrueCount: 3 });
    session = recordConversionCheck(session, { ...CONVERSION, statedTrueCount: 2 });
    session = recordIndexPlay(session, {
      entryId: "insurance",
      entryLabel: "Insurance",
      indexNumber: 3,
      system: "Hi-Lo",
      kind: "insurance",
      placedCards: [],
      dealerUpcard: { rank: "A", suit: "s" },
      runningCount: 9,
      cardsRemaining: 156,
      rounding: "truncate",
      trueCount: 3,
      firing: true,
      actionTaken: "decline-insurance",
      correctAction: "insurance",
      basicStrategyAction: "decline-insurance",
      runSeed: 1,
      questionIndex: 0,
      cutShoeSeed: null,
      cutPosition: null,
      at: 3_000,
    });

    const stats = computeStats(session);
    expect(stats.conversionChecks).toBe(3);
    expect(stats.correctConversionChecks).toBe(2);
    expect(stats.trueCountAccuracy).toBeCloseTo(2 / 3);
    expect(stats.indexPlays).toBe(1);
    expect(stats.correctIndexPlays).toBe(0);
    expect(stats.indexPlayAccuracy).toBe(0);
    // Placed hands are not hands played: nothing reaches the win rate or the Decision tally.
    expect(stats.handsPlayed).toBe(0);
    expect(stats.decisionsMade).toBe(0);
    expect(stats.basicStrategyAccuracy).toBeNull();

    expect(aggregateStats([session, session]).trueCountAccuracy).toBeCloseTo(2 / 3);
  });

  it("reports no accuracy rather than 0% for drills never answered", () => {
    const stats = computeStats(buildSession({ rounds: 3 }));
    expect(stats.trueCountAccuracy).toBeNull();
    expect(stats.indexPlayAccuracy).toBeNull();
  });
});
