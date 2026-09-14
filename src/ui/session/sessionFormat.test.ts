/**
 * The statistics surface's arithmetic, with one theme running through it: a rate with a zero
 * denominator is `null`, and `null` is rendered, never coerced.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/engine/rules";
import {
  type Session,
  type SessionStats,
  computeStats,
  recordRound,
  resetBankroll,
  startSession,
} from "@/state";
import {
  EMPTY_SESSION,
  EMPTY_STATS,
  NO_VALUE,
  bankrollTopUp,
  bankrollWasReset,
  bettingUnit,
  describeEndReason,
  formatDuration,
  formatPerHand,
  formatRate,
  formatRatio,
  sessionResultFor,
} from "./sessionFormat";

function fresh(): Session {
  return startSession({
    id: "s",
    mode: "play",
    rules: DEFAULT_RULES,
    countingSystem: "Hi-Lo",
    seed: 1,
    startedAt: 0,
    startingBankroll: 500,
  });
}

/** A Session with `count` hands, each staked at `bet` and each netting `net`. */
function withHands(count: number, bet: number, net: number): Session {
  let session = fresh();
  for (let index = 0; index < count; index++) {
    session = recordRound(session, {
      shoeIndex: 0,
      shoeStartIndex: index * 4,
      shoeEndIndex: index * 4 + 4,
      hands: [
        {
          handIndex: 0,
          outcome: net > 0 ? "win" : net < 0 ? "loss" : "push",
          busted: false,
          bet,
          net,
          finalTotal: 20,
        },
      ],
      dealerCards: [],
      at: index,
    });
  }
  return session;
}

describe("a rate with nothing to divide", () => {
  it("renders an em dash, not 0%", () => {
    expect(formatRate(null)).toBe(NO_VALUE);
    expect(NO_VALUE).toBe("—");
  });

  it("renders a real zero as 0.0%, which is a different statement entirely", () => {
    expect(formatRate(0)).toBe("0.0%");
  });

  it("renders the rates in between to one decimal", () => {
    expect(formatRate(1)).toBe("100.0%");
    expect(formatRate(0.5)).toBe("50.0%");
    expect(formatRate(2 / 3)).toBe("66.7%");
  });

  it("gives a fresh Session no accuracy at all", () => {
    const stats = computeStats(fresh());
    expect(stats.basicStrategyAccuracy).toBeNull();
    expect(stats.winRate).toBeNull();
    expect(stats.bustRate).toBeNull();
    expect(stats.countingAccuracy).toBeNull();
    expect(formatRate(stats.basicStrategyAccuracy)).toBe(NO_VALUE);
  });

  it("ships an empty-stats constant derived through computeStats, so it cannot drift", () => {
    expect(EMPTY_STATS).toEqual(computeStats(EMPTY_SESSION));
    expect(EMPTY_STATS.basicStrategyAccuracy).toBeNull();
    expect(EMPTY_STATS.netPerHand).toBeNull();
    expect(EMPTY_STATS.handsPlayed).toBe(0);
  });
});

describe("showing the counts behind a rate", () => {
  it("prints the division a user could redo by hand", () => {
    expect(formatRatio(4, 7)).toBe("4 of 7");
  });

  it("has nothing to show with no denominator", () => {
    expect(formatRatio(0, 0)).toBe(NO_VALUE);
  });
});

describe("per-hand results", () => {
  it("is an em dash before a single hand has resolved", () => {
    expect(formatPerHand(null)).toBe(NO_VALUE);
  });

  it("is always signed, and does not render a negative zero", () => {
    expect(formatPerHand(1.5)).toBe("+$1.50");
    expect(formatPerHand(-1.5)).toBe("-$1.50");
    expect(formatPerHand(-0.001)).toBe("$0.00");
    expect(formatPerHand(0)).toBe("$0.00");
  });
});

describe("the betting unit the expectation band is quoted in", () => {
  it("is the mean stake per hand", () => {
    expect(bettingUnit(computeStats(withHands(4, 25, -25)))).toBe(25);
  });

  it("does not exist before a hand has been staked", () => {
    expect(bettingUnit(computeStats(fresh()))).toBeNull();
    expect(sessionResultFor(computeStats(fresh()))).toBeNull();
  });

  it("converts a chip result into units the band can place", () => {
    const stats = computeStats(withHands(10, 10, -10));
    expect(sessionResultFor(stats)).toEqual({ hands: 10, netUnits: -10 });
  });
});

describe("the bankroll after a top-up", () => {
  it("reconciles against the net result while the Session has never run dry", () => {
    const session = withHands(3, 10, -10);
    const stats = computeStats(session);
    expect(bankrollWasReset(session, stats)).toBe(false);
    expect(bankrollTopUp(session, stats)).toBe(0);
  });

  it("stops reconciling once invariant 6's one-tap reset has been taken, and says so", () => {
    const session = resetBankroll(withHands(3, 10, -10), 500);
    const stats = computeStats(session);
    expect(stats.netResult).toBe(-30);
    expect(bankrollWasReset(session, stats)).toBe(true);
    expect(bankrollTopUp(session, stats)).toBe(30);
  });
});

describe("describing a Session", () => {
  it("names every way one can end, and the fact that it has not", () => {
    const open = fresh();
    expect(describeEndReason(open)).toBe("In progress");
    expect(describeEndReason({ ...open, endReason: "user" })).toBe("Ended by you");
    expect(describeEndReason({ ...open, endReason: "bankroll-exhausted" })).toBe(
      "Ended out of chips",
    );
    expect(describeEndReason({ ...open, endReason: "drill-complete" })).toBe("Drill complete");
    expect(describeEndReason({ ...open, endReason: "discarded" })).toBe("Discarded");
  });

  it("has no duration while it is still running", () => {
    expect(formatDuration(null)).toBe(NO_VALUE);
  });

  it("reports a duration in the coarsest unit that still says something", () => {
    expect(formatDuration(30_000)).toBe("under a minute");
    expect(formatDuration(9 * 60_000)).toBe("9 min");
    expect(formatDuration(95 * 60_000)).toBe("1 h 35 min");
  });
});

describe("the statistics a screen renders", () => {
  it("agrees with the counts it was derived from", () => {
    const stats: SessionStats = computeStats(withHands(5, 20, 20));
    expect(stats.handsPlayed).toBe(5);
    expect(stats.wins).toBe(5);
    expect(formatRate(stats.winRate)).toBe("100.0%");
    expect(stats.netResult).toBe(100);
    expect(formatPerHand(stats.netPerHand)).toBe("+$20.00");
  });
});
