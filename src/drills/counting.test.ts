import { describe, expect, it } from "vitest";
import {
  COUNTING_SYSTEMS,
  HI_LO,
  KO,
  OMEGA_II,
  RED_7,
  WONG_HALVES,
  ZEN,
  currentRunningCount,
  initialRunningCount,
  runningCount,
} from "@/engine";
import {
  type CountingDrill,
  type CountingDrillConfig,
  COUNTING_SPEEDS,
  DEFAULT_COUNTING_CONFIG,
  MAX_TRAIL_CARDS,
  advanceTo,
  cardsDueAt,
  countedCards,
  countingDrillFinished,
  countingReadout,
  countingReport,
  currentCheckSituation,
  dealNextStep,
  hideCount,
  msPerCard,
  msPerStep,
  revealCount,
  scoreCountCheck,
  setSpeed,
  startCountingDrill,
  submitCountCheck,
  toggleCount,
  totalCards,
} from "./counting";
import { undo } from "./progress";

function config(overrides: Partial<CountingDrillConfig> = {}): CountingDrillConfig {
  return { ...DEFAULT_COUNTING_CONFIG, ...overrides };
}

/** Deals `count` cards one step at a time. */
function deal(drill: CountingDrill, count: number): CountingDrill {
  let run = drill;
  for (let i = 0; i < count; i += run.current.config.cardsPerStep) run = dealNextStep(run);
  return run;
}

describe("pace", () => {
  it("turns a speed in cards per minute into milliseconds per card", () => {
    expect(msPerCard(config({ cardsPerMinute: 60 }))).toBe(1_000);
    expect(msPerCard(config({ cardsPerMinute: 120 }))).toBe(500);
    expect(msPerStep(config({ cardsPerMinute: 60, cardsPerStep: 2 }))).toBe(2_000);
  });

  it("reveals whole steps only, because a pair arrives together at a table", () => {
    const paired = config({ cardsPerMinute: 60, cardsPerStep: 2 });

    expect(cardsDueAt(paired, 0)).toBe(0);
    expect(cardsDueAt(paired, 1_999)).toBe(0);
    expect(cardsDueAt(paired, 2_000)).toBe(2);
    expect(cardsDueAt(paired, 5_999)).toBe(4);
    expect(cardsDueAt(paired, -1)).toBe(0);
  });

  it("offers a ladder of named speeds rather than a free number", () => {
    expect(COUNTING_SPEEDS.length).toBeGreaterThan(2);
    const rates = COUNTING_SPEEDS.map((speed) => speed.cardsPerMinute);
    expect([...rates].sort((a, b) => a - b)).toEqual(rates);
  });

  it("refuses a speed that would deal no cards", () => {
    expect(() => startCountingDrill(config({ cardsPerMinute: 0 }))).toThrow(/positive/);
    expect(() => startCountingDrill(config({ cardsPerStep: 0 }))).toThrow(/positive integer/);
  });
});

describe("dealing", () => {
  it("deals every card that has come due when the clock moves", () => {
    const drill = advanceTo(startCountingDrill(config({ cardsPerMinute: 60 }), 1), 10_500);
    expect(countedCards(drill.current)).toHaveLength(10);
  });

  it("never un-deals a card when a clock reading arrives out of order", () => {
    const ahead = advanceTo(startCountingDrill(config(), 1), 10_000);
    const behind = advanceTo(ahead, 5_000);

    expect(behind).toBe(ahead);
    expect(countedCards(behind.current)).toHaveLength(10);
  });

  it("stops at the cut card", () => {
    const drill = advanceTo(startCountingDrill(config({ decks: 1, penetration: 0.5 }), 1), 1e9);

    expect(countedCards(drill.current)).toHaveLength(26);
    expect(totalCards(drill.current)).toBe(26);
    expect(countingDrillFinished(drill.current)).toBe(true);
  });

  it("can be stepped by hand, and the clock keeps up", () => {
    const drill = dealNextStep(
      dealNextStep(startCountingDrill(config({ cardsPerMinute: 60, cardsPerStep: 2 }), 1)),
    );

    expect(countedCards(drill.current)).toHaveLength(4);
    expect(drill.current.elapsedMs).toBe(4_000);
  });

  it("changes speed mid-run without disturbing the shoe or the score", () => {
    const drill = setSpeed(deal(startCountingDrill(config(), 1), 10), 240);

    expect(drill.current.config.cardsPerMinute).toBe(240);
    expect(countedCards(drill.current)).toHaveLength(10);
    expect(msPerCard(drill.current.config)).toBe(250);
  });

  it("applies a new speed from the moment it changes, not from the start of the run", () => {
    // Sixty cards at four a second, then a drop to half a card a second. Recomputing from
    // time zero would stall the deal for two minutes while the slower clock caught up with
    // cards the user has already counted.
    let drill = advanceTo(startCountingDrill(config({ cardsPerMinute: 240 }), 1), 15_000);
    expect(countedCards(drill.current)).toHaveLength(60);

    drill = setSpeed(drill, 30);
    drill = advanceTo(drill, 17_000);
    expect(countedCards(drill.current)).toHaveLength(61);

    drill = advanceTo(drill, 21_000);
    expect(countedCards(drill.current)).toHaveLength(63);
  });
});

describe("hide and reveal", () => {
  it("starts hidden, because that is the drill", () => {
    expect(startCountingDrill(config()).current.countHidden).toBe(true);
  });

  it("counts the reveals rather than hiding that the user peeked", () => {
    let drill = startCountingDrill(config(), 1);
    drill = revealCount(drill);
    drill = hideCount(drill);
    drill = toggleCount(drill);

    expect(drill.current.countHidden).toBe(false);
    expect(drill.current.reveals).toBe(2);
    expect(countingReport(drill).reveals).toBe(2);
  });
});

describe("the count itself", () => {
  it("agrees with the engine for every system", () => {
    for (const system of COUNTING_SYSTEMS) {
      const drill = deal(startCountingDrill(config({ system, decks: 6 }), 4), 40);
      const cards = countedCards(drill.current);

      expect(countingReadout(drill.current).runningCount).toBe(
        currentRunningCount(cards, system, 6),
      );
    }
  });

  it("holds an unbalanced system's own starting count, not a bare tag sum", () => {
    for (const system of [KO, RED_7]) {
      const drill = deal(startCountingDrill(config({ system, decks: 6 }), 4), 40);
      const cards = countedCards(drill.current);
      const readout = countingReadout(drill.current);

      expect(readout.runningCount).toBe(
        initialRunningCount(system, 6) + runningCount(cards, system),
      );
      expect(readout.runningCount).not.toBe(runningCount(cards, system));
      expect(readout.trueCount).toBeNull();
      expect(readout.trueCountNote).toMatch(/unbalanced/i);
    }
  });

  it("converts for a balanced system", () => {
    const drill = deal(startCountingDrill(config({ system: ZEN, decks: 6 }), 4), 52);
    const readout = countingReadout(drill.current);

    expect(readout.balanced).toBe(true);
    expect(readout.decksRemaining).toBeCloseTo(5);
    expect(readout.trueCount).toBe(Math.trunc(readout.runningCount / readout.decksRemaining));
  });
});

describe("scoring a count check", () => {
  it("is right only on the exact number", () => {
    const drill = deal(startCountingDrill(config(), 6), 30);
    const truth = countingReadout(drill.current).runningCount;
    const situation = currentCheckSituation(drill.current);

    expect(scoreCountCheck(situation, truth, 0).verdict).toBe("correct");
    expect(scoreCountCheck(situation, truth + 1, 0).verdict).toBe("incorrect");
    expect(scoreCountCheck(situation, truth + 1, 0).off).toBe(1);
    expect(scoreCountCheck(situation, truth - 2, 0).off).toBe(-2);
  });

  it("explains a correct check as fully as a wrong one", () => {
    const drill = deal(startCountingDrill(config(), 6), 20);
    const situation = currentCheckSituation(drill.current);
    const truth = countingReadout(drill.current).runningCount;

    const right = scoreCountCheck(situation, truth, 0).explanation;
    const wrong = scoreCountCheck(situation, truth + 3, 0).explanation;

    expect(right.trail).toEqual(wrong.trail);
    expect(right.byRank).toEqual(wrong.byRank);
    expect(right.trail).toHaveLength(20);
  });

  it("walks the tag trail card by card, ending on the answer", () => {
    const drill = deal(startCountingDrill(config({ system: HI_LO }), 6), 15);
    const explanation = scoreCountCheck(currentCheckSituation(drill.current), 0, 0).explanation;
    const cards = countedCards(drill.current);

    expect(explanation.trail.map((entry) => entry.card)).toEqual([...cards]);
    expect(explanation.trail[0]?.ordinal).toBe(0);
    expect(explanation.trail[explanation.trail.length - 1]?.runningCount).toBe(
      explanation.actualRunningCount,
    );

    let running = 0;
    for (const entry of explanation.trail) {
      running += entry.tag;
      expect(entry.runningCount).toBe(running);
    }
  });

  it("covers only the cards since the previous check — where the slip actually is", () => {
    let drill = deal(startCountingDrill(config(), 6), 20);
    drill = submitCountCheck(drill, countingReadout(drill.current).runningCount, 1);
    drill = deal(drill, 6);

    const explanation = scoreCountCheck(currentCheckSituation(drill.current), 0, 2).explanation;

    expect(explanation.cardsSeen).toBe(26);
    expect(explanation.trail).toHaveLength(6);
    expect(explanation.trail[0]?.ordinal).toBe(20);
    expect(explanation.spanTagSum).toBe(
      explanation.actualRunningCount - explanation.spanStartRunningCount,
    );
  });

  it("truncates a very long span rather than returning the whole shoe", () => {
    const drill = deal(startCountingDrill(config(), 6), MAX_TRAIL_CARDS + 20);
    const explanation = scoreCountCheck(currentCheckSituation(drill.current), 0, 0).explanation;

    expect(explanation.trail).toHaveLength(MAX_TRAIL_CARDS);
    expect(explanation.trailTruncated).toBe(true);
    // The per-rank roll-up still covers the whole span, so a systematic slip is not lost.
    const counted = explanation.byRank.reduce((sum, entry) => sum + entry.seen, 0);
    expect(counted).toBe(MAX_TRAIL_CARDS + 20);
  });

  it("rolls the span up by rank, so a systematic error is visible", () => {
    const drill = deal(startCountingDrill(config({ system: HI_LO }), 6), 40);
    const explanation = scoreCountCheck(currentCheckSituation(drill.current), 0, 0).explanation;

    for (const entry of explanation.byRank) {
      expect(entry.seen).toBeGreaterThan(0);
      expect(entry.contribution).toBe((entry.tag as number) * entry.seen);
    }
    expect(explanation.byRank.reduce((sum, e) => sum + e.contribution, 0)).toBe(
      explanation.spanTagSum,
    );
  });

  it("says a suit-sensitive rank has no single tag rather than picking one", () => {
    const drill = deal(startCountingDrill(config({ system: RED_7 }), 6), 120);
    const explanation = scoreCountCheck(currentCheckSituation(drill.current), 0, 0).explanation;

    const sevens = explanation.byRank.find((entry) => entry.rank === "7");
    expect(sevens).toBeDefined();
    expect(sevens?.tag).toBeNull();
    // Every other rank still reports its tag.
    for (const entry of explanation.byRank) {
      if (entry.rank !== "7") expect(entry.tag).not.toBeNull();
    }
  });

  it("keeps fractional tags fractional for Wong Halves", () => {
    const drill = deal(startCountingDrill(config({ system: WONG_HALVES }), 6), 60);
    const explanation = scoreCountCheck(currentCheckSituation(drill.current), 0, 0).explanation;

    expect(explanation.trail.some((entry) => !Number.isInteger(entry.tag))).toBe(true);
  });

  it("carries the true count alongside, so a check doubles as a conversion", () => {
    const drill = deal(startCountingDrill(config({ system: OMEGA_II, decks: 6 }), 6), 52);
    const explanation = scoreCountCheck(currentCheckSituation(drill.current), 0, 0).explanation;

    expect(explanation.count.decksRemaining).toBeCloseTo(5);
    expect(explanation.count.trueCount).not.toBeNull();
  });
});

describe("the run", () => {
  it("has no accuracy and no error before the first check", () => {
    const report = countingReport(startCountingDrill(config(), 1));

    expect(report.tally.accuracy).toBeNull();
    expect(report.meanAbsoluteError).toBeNull();
    expect(report.meanSignedError).toBeNull();
    expect(report.worstError).toBeNull();
  });

  it("separates a consistent bias from random noise", () => {
    let drill = startCountingDrill(config(), 6);
    for (let i = 0; i < 3; i++) {
      drill = deal(drill, 10);
      // Always two high: a systematic error, not a scatter.
      drill = submitCountCheck(drill, countingReadout(drill.current).runningCount + 2, i);
    }

    const report = countingReport(drill);
    expect(report.tally.attempts).toBe(3);
    expect(report.tally.accuracy).toBe(0);
    expect(report.meanSignedError).toBe(2);
    expect(report.meanAbsoluteError).toBe(2);
    expect(report.worstError).toBe(2);
  });

  it("reports a mean signed error near zero when the misses cancel", () => {
    let drill = deal(startCountingDrill(config(), 6), 10);
    drill = submitCountCheck(drill, countingReadout(drill.current).runningCount + 2, 0);
    drill = deal(drill, 10);
    drill = submitCountCheck(drill, countingReadout(drill.current).runningCount - 2, 1);

    const report = countingReport(drill);
    expect(report.meanSignedError).toBe(0);
    expect(report.meanAbsoluteError).toBe(2);
  });

  it("takes a mis-typed check back without breaking the streak", () => {
    let drill = startCountingDrill(config(), 6);
    for (let i = 0; i < 3; i++) {
      drill = deal(drill, 8);
      drill = submitCountCheck(drill, countingReadout(drill.current).runningCount, i);
    }
    const before = countingReport(drill);
    expect(before.tally.streak).toBe(3);

    drill = submitCountCheck(drill, 999, 4);
    expect(countingReport(drill).tally.streak).toBe(0);

    drill = undo(drill);
    const restored = countingReport(drill);
    expect(restored.tally).toEqual(before.tally);
    expect(restored.checks).toEqual(before.checks);
    expect(restored.undone).toBe(1);
  });

  it("reproduces exactly from its seed", () => {
    const a = deal(startCountingDrill(config(), 42), 30);
    const b = deal(startCountingDrill(config(), 42), 30);

    expect(countedCards(a.current)).toEqual(countedCards(b.current));
  });
});
