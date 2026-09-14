import { describe, expect, it } from "vitest";
import { HI_LO, KO, RED_7, WONG_HALVES, ZEN, trueCount } from "@/engine";
import { undo } from "./progress";
import {
  type TrueCountDrillConfig,
  DEFAULT_TRUE_COUNT_CONFIG,
  DEFAULT_TRUE_COUNT_MIX,
  TRUE_COUNT_FOCUSES,
  nextTrueCountQuestion,
  scoreTrueCount,
  startTrueCountDrill,
  submitTrueCount,
  trueCountDrillAvailability,
  trueCountQuestion,
  trueCountQuestionFrom,
  trueCountReport,
} from "./trueCount";

function config(overrides: Partial<TrueCountDrillConfig> = {}): TrueCountDrillConfig {
  return { ...DEFAULT_TRUE_COUNT_CONFIG, ...overrides };
}

function questions(count: number, cfg = config(), seed = 5) {
  return Array.from({ length: count }, (_, index) => trueCountQuestion(cfg, seed, index));
}

describe("which systems convert at all", () => {
  it("drills the conversion for the balanced systems", () => {
    for (const system of [HI_LO, ZEN, WONG_HALVES]) {
      expect(trueCountDrillAvailability(system).available).toBe(true);
    }
  });

  it("declines for an unbalanced system and says why, rather than teaching a division it never does", () => {
    for (const system of [KO, RED_7]) {
      const availability = trueCountDrillAvailability(system);

      expect(availability.available).toBe(false);
      expect(availability.note).toContain(system.name);
      expect(availability.note).toMatch(/pivot/);
      expect(availability.supportedSystems).not.toContain(system.id);
      expect(() => startTrueCountDrill(config({ system }))).toThrow(/pivot/);
    }
  });
});

describe("generating questions", () => {
  it("reproduces a question exactly from the run's seed and its index", () => {
    expect(trueCountQuestion(config(), 11, 7)).toEqual(trueCountQuestion(config(), 11, 7));
    expect(trueCountQuestion(config(), 11, 7)).not.toEqual(trueCountQuestion(config(), 11, 8));
  });

  it("never poses a shoe with nothing left to divide by", () => {
    for (const question of questions(300)) {
      expect(question.cardsRemaining).toBeGreaterThan(0);
      expect(question.decksRemaining).toBeGreaterThan(0);
      expect(Number.isFinite(question.answer)).toBe(true);
    }
  });

  it("answers its own questions with the engine's conversion", () => {
    for (const question of questions(200)) {
      expect(question.answer).toBe(
        trueCount(question.runningCount, question.decksRemaining, question.rounding),
      );
      expect(question.exact).toBeCloseTo(question.runningCount / question.decksRemaining, 10);
    }
  });

  it("never poses a count the shoe could not physically hold", () => {
    for (const question of questions(300, config({ decks: 1 }))) {
      const dealt = 52 - question.cardsRemaining;
      expect(Math.abs(question.runningCount)).toBeLessThanOrEqual(dealt);
      // A single deck holds twenty low cards, so a Hi-Lo count cannot exceed twenty.
      expect(Math.abs(question.runningCount)).toBeLessThanOrEqual(20);
    }
  });

  it("drills negative counts deliberately, not by accident", () => {
    const drawn = questions(200);
    const negative = drawn.filter((question) => question.traits.negativeTrueCount);

    // The mix weights negatives heavily on purpose — a real shoe would not.
    expect(negative.length / drawn.length).toBeGreaterThan(0.3);
  });

  it("drills two-digit counts deliberately", () => {
    const drawn = questions(200);
    const twoDigit = drawn.filter(
      (question) => question.traits.twoDigitTrueCount || question.traits.twoDigitRunningCount,
    );

    expect(twoDigit.length / drawn.length).toBeGreaterThan(0.15);
    expect(drawn.some((question) => question.traits.twoDigitTrueCount)).toBe(true);
  });

  it("reaches every focus in the mix", () => {
    const seen = new Set(questions(300).map((question) => question.focus));
    for (const focus of TRUE_COUNT_FOCUSES) {
      if (DEFAULT_TRUE_COUNT_MIX[focus] > 0) expect(seen.has(focus)).toBe(true);
    }
  });

  it("poses fractional Running Counts only for a system that really holds them", () => {
    const halves = questions(100, config({ system: WONG_HALVES }));
    const wholes = questions(100, config({ system: HI_LO }));

    expect(halves.some((question) => !Number.isInteger(question.runningCount))).toBe(true);
    expect(wholes.every((question) => Number.isInteger(question.runningCount))).toBe(true);
  });

  it("builds a question from an exact count when one is asked for", () => {
    const question = trueCountQuestionFrom(config(), { runningCount: -7, cardsRemaining: 104 });

    expect(question.decksRemaining).toBe(2);
    expect(question.exact).toBeCloseTo(-3.5);
    expect(question.answer).toBe(-3);
    expect(question.traits.negativeTrueCount).toBe(true);
    expect(question.traits.roundingMatters).toBe(true);
  });

  it("refuses to build a question with no cards left", () => {
    expect(() => trueCountQuestionFrom(config(), { runningCount: 5, cardsRemaining: 0 })).toThrow(
      /undefined at the end of a shoe/,
    );
  });
});

describe("scoring a conversion", () => {
  const minusSevenOverTwo = trueCountQuestionFrom(config(), {
    runningCount: -7,
    cardsRemaining: 104,
  });

  it("marks the exact answer correct", () => {
    const result = scoreTrueCount(minusSevenOverTwo, -3, 100);

    expect(result.verdict).toBe("correct");
    expect(result.off).toBe(0);
    expect(result.at).toBe(100);
    expect(result.explanation.correctUnderRounding).toBeNull();
  });

  it("shows the division and every rounding, right or wrong", () => {
    const explanation = scoreTrueCount(minusSevenOverTwo, -3, 0).explanation;

    expect(explanation.runningCount).toBe(-7);
    expect(explanation.decksRemaining).toBe(2);
    expect(explanation.exact).toBeCloseTo(-3.5);
    expect(explanation.byRounding.truncate).toBe(-3);
    expect(explanation.byRounding.floor).toBe(-4);
    expect(explanation.byRounding.round).toBe(-4);
    expect(explanation.byRounding.exact).toBeCloseTo(-3.5);
  });

  it("names the rounding mode a 'wrong' answer was actually right under", () => {
    // The whole point of the drill: -7 ÷ 2 is -3.5, and -4 is floor, not a blunder.
    const result = scoreTrueCount(minusSevenOverTwo, -4, 0);

    expect(result.verdict).toBe("incorrect");
    expect(result.explanation.correctUnderRounding).toBe("floor");
    expect(result.explanation.signError).toBe(false);
  });

  it("catches the other negative-count slip: the right number with the wrong sign", () => {
    const result = scoreTrueCount(minusSevenOverTwo, 3, 0);

    expect(result.verdict).toBe("incorrect");
    expect(result.explanation.signError).toBe(true);
    expect(result.off).toBe(6);
  });

  it("does not call a zero answer a sign error", () => {
    const zero = trueCountQuestionFrom(config(), { runningCount: 0, cardsRemaining: 104 });
    expect(scoreTrueCount(zero, 1, 0).explanation.signError).toBe(false);
  });

  it("truncates toward zero in both directions", () => {
    const positive = trueCountQuestionFrom(config(), { runningCount: 7, cardsRemaining: 104 });
    const negative = trueCountQuestionFrom(config(), { runningCount: -7, cardsRemaining: 104 });

    expect(positive.answer).toBe(3);
    expect(negative.answer).toBe(-3);
  });

  it("honours a run configured to floor instead", () => {
    const floored = trueCountQuestionFrom(config({ rounding: "floor" }), {
      runningCount: -7,
      cardsRemaining: 104,
    });

    expect(floored.answer).toBe(-4);
    expect(scoreTrueCount(floored, -3, 0).explanation.correctUnderRounding).toBe("truncate");
  });
});

describe("the run", () => {
  it("has no accuracy before the first answer", () => {
    const report = trueCountReport(startTrueCountDrill(config(), 3));

    expect(report.tally.accuracy).toBeNull();
    expect(report.meanAbsoluteError).toBeNull();
    expect(report.negativeTrueCounts.accuracy).toBeNull();
    expect(report.twoDigitCounts.accuracy).toBeNull();
  });

  it("leaves the question on screen after grading it", () => {
    let drill = startTrueCountDrill(config(), 3);
    const posed = drill.current.question;

    drill = submitTrueCount(drill, posed.answer + 1, 0);
    expect(drill.current.question).toBe(posed);
    expect(drill.current.lastResult?.question).toBe(posed);

    drill = nextTrueCountQuestion(drill);
    expect(drill.current.question).not.toBe(posed);
    expect(drill.current.lastResult).toBeNull();
  });

  it("ignores a double-tapped answer rather than counting it twice", () => {
    let drill = startTrueCountDrill(config(), 3);
    drill = submitTrueCount(drill, drill.current.question.answer, 0);
    const once = drill;
    drill = submitTrueCount(drill, drill.current.question.answer, 1);

    expect(drill).toBe(once);
    expect(drill.current.tally.attempts).toBe(1);
  });

  it("reports negative and two-digit counts separately from the rest", () => {
    // Answer everything correctly except the negative conversions.
    let drill = startTrueCountDrill(config(), 17);
    for (let i = 0; i < 40; i++) {
      const question = drill.current.question;
      const answer = question.traits.negativeTrueCount ? question.answer + 1 : question.answer;
      drill = nextTrueCountQuestion(submitTrueCount(drill, answer, i));
    }

    const report = trueCountReport(drill);
    expect(report.negativeTrueCounts.attempts).toBeGreaterThan(0);
    expect(report.negativeTrueCounts.accuracy).toBe(0);
    expect(report.positiveTrueCounts.accuracy).toBe(1);
    // A single headline number would have hidden exactly this.
    expect(report.tally.accuracy).toBeGreaterThan(0);
    expect(report.tally.accuracy).toBeLessThan(1);
  });

  it("counts rounding slips and sign slips separately from plain misses", () => {
    let drill = startTrueCountDrill(config(), 23);
    for (let i = 0; i < 60; i++) {
      const question = drill.current.question;
      // Floor everything: right whenever the quotient is whole, and a documented slip
      // whenever it is not and the count is negative.
      const answer = Math.floor(question.exact);
      drill = nextTrueCountQuestion(submitTrueCount(drill, answer, i));
    }

    const report = trueCountReport(drill);
    expect(report.roundingErrors).toBeGreaterThan(0);
    expect(report.roundingErrors).toBe(
      report.attempts.filter((attempt) => attempt.correctUnderRounding === "floor").length,
    );
  });

  it("takes a mis-typed answer back without breaking the streak", () => {
    let drill = startTrueCountDrill(config(), 31);
    for (let i = 0; i < 3; i++) {
      drill = nextTrueCountQuestion(submitTrueCount(drill, drill.current.question.answer, i));
    }
    const before = trueCountReport(drill);
    expect(before.tally.streak).toBe(3);

    drill = submitTrueCount(drill, 999, 4);
    expect(drill.current.tally.streak).toBe(0);

    drill = undo(drill);
    expect(trueCountReport(drill).tally).toEqual(before.tally);
    expect(drill.current.lastResult).toBeNull();
    // The same question is still on screen, so it can simply be answered again.
    expect(drill.current.question.index).toBe(3);
  });
});
