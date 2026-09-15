import { describe, expect, it } from "vitest";
import { HI_LO } from "@/engine/counting";
import { DEFAULT_RULES } from "@/engine/rules";
import {
  type BasicStrategyReport,
  basicStrategyReport,
  startBasicStrategyDrill,
} from "@/drills/basicStrategy";
import { type CellAttempt, chartBreakdown, weakestCells, weakestRows } from "@/drills/chart";
import { dealNextStep, startCountingDrill, DEFAULT_COUNTING_CONFIG, currentCheckSituation, scoreCountCheck } from "@/drills/counting";
import { deviationDrillAvailability } from "@/drills/deviation";
import {
  DEFAULT_TRUE_COUNT_CONFIG,
  scoreTrueCount,
  trueCountQuestionFrom,
} from "@/drills/trueCount";
import {
  EXCLUSION_REASON,
  breakdownSentence,
  cellMistakeLine,
  countCheckVerdict,
  decksText,
  formatCountValue,
  formatRate,
  rowName,
  trueCountVerdict,
} from "./drillFormat";

function attempt(partial: Partial<CellAttempt> & Pick<CellAttempt, "section" | "row" | "upcard">): CellAttempt {
  return {
    code: "S",
    correctAction: "stand",
    actionTaken: "stand",
    verdict: "correct",
    evLoss: 0,
    ...partial,
  };
}

function reportFrom(attempts: readonly CellAttempt[]): BasicStrategyReport {
  const breakdown = chartBreakdown(attempts);
  const base = basicStrategyReport(startBasicStrategyDrill());
  return { ...base, breakdown, weakestCells: weakestCells(breakdown), weakestRows: weakestRows(breakdown) };
}

describe("the Basic Strategy breakdown, in words", () => {
  it("names rows the way a player says them", () => {
    expect(rowName("hard", "16")).toBe("hard 16");
    expect(rowName("soft", "A,7")).toBe("soft 18");
    expect(rowName("soft", "soft 12")).toBe("soft 12");
    expect(rowName("pairs", "8,8")).toBe("a pair of 8s");
    expect(rowName("pairs", "A,A")).toBe("a pair of aces");
    expect(rowName("pairs", "10,10")).toBe("a pair of tens");
  });

  it("says 'fine everywhere except soft 18' rather than a bare percentage", () => {
    const report = reportFrom([
      attempt({ section: "hard", row: "16", upcard: 10, correctAction: "hit", actionTaken: "hit" }),
      attempt({ section: "hard", row: "12", upcard: 4 }),
      attempt({ section: "soft", row: "A,7", upcard: 9, correctAction: "hit", actionTaken: "stand", verdict: "incorrect" }),
      attempt({ section: "soft", row: "A,7", upcard: 10, correctAction: "hit", actionTaken: "stand", verdict: "incorrect" }),
      attempt({ section: "soft", row: "A,7", upcard: 3, correctAction: "double", actionTaken: "double" }),
    ]);
    expect(breakdownSentence(report)).toBe(
      "Across 5 decisions in 3 chart rows, you are fine everywhere except soft 18 (missed 2 of 3).",
    );
    expect(cellMistakeLine(report.weakestCells[0] as never)).toMatch(
      /^soft 18 vs (9|10): the chart says hit; you stood\.$/,
    );
  });

  it("lists several weak rows in order", () => {
    const report = reportFrom([
      attempt({ section: "pairs", row: "8,8", upcard: 10, correctAction: "split", actionTaken: "stand", verdict: "incorrect" }),
      attempt({ section: "pairs", row: "8,8", upcard: 11, correctAction: "split", actionTaken: "hit", verdict: "incorrect" }),
      attempt({ section: "hard", row: "16", upcard: 10, correctAction: "hit", actionTaken: "stand", verdict: "incorrect" }),
    ]);
    expect(breakdownSentence(report)).toBe(
      "Across 3 decisions in 2 chart rows, you are fine everywhere except a pair of 8s (missed 2 of 2) and hard 16 (missed 1 of 1).",
    );
  });

  it("says nothing it cannot back up", () => {
    expect(breakdownSentence(reportFrom([]))).toMatch(/^No decisions graded yet/);
    expect(breakdownSentence(reportFrom([attempt({ section: "hard", row: "13", upcard: 2 })]))).toBe(
      "No misses in 1 decision across 1 chart row.",
    );
  });

  it("renders a rate with nothing to divide as a dash, never 0%", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(0.826)).toBe("83%");
  });
});

describe("count and true count verdicts", () => {
  it("signs counts with a real minus sign", () => {
    expect(formatCountValue(-12)).toBe("−12");
    expect(formatCountValue(14)).toBe("+14");
    expect(formatCountValue(0)).toBe("0");
    expect(formatCountValue(-7.5)).toBe("−7.5");
  });

  it("says how far off a count check was, and which way", () => {
    let drill = startCountingDrill(DEFAULT_COUNTING_CONFIG, 4);
    for (let i = 0; i < 10; i++) drill = dealNextStep(drill);
    const situation = currentCheckSituation(drill.current);
    const truth = scoreCountCheck(situation, 0, 0).actualRunningCount;

    expect(countCheckVerdict(scoreCountCheck(situation, truth, 0)).correct).toBe(true);
    const high = countCheckVerdict(scoreCountCheck(situation, truth + 2, 0));
    expect(high.correct).toBe(false);
    expect(high.detail).toMatch(/2 points high/);
    expect(countCheckVerdict(scoreCountCheck(situation, truth - 1, 0)).detail).toMatch(/1 point low/);
  });

  it("names the rounding a 'wrong' True Count was right under: −7 ÷ 2 answered −4", () => {
    const question = trueCountQuestionFrom(DEFAULT_TRUE_COUNT_CONFIG, { runningCount: -7, cardsRemaining: 104 });
    const view = trueCountVerdict(scoreTrueCount(question, -4, 0));
    expect(view.correct).toBe(false);
    expect(view.headline).toBe("You said −4; the True Count is −3.");
    expect(view.detail).toBe("−7 ÷ 2.00 = −3.50, truncated toward zero, is −3.");
    expect(view.lesson).toMatch(/^−4 is what rounded down \(floor\) gives — your arithmetic was right/);
  });

  it("explains a correct True Count as fully as a wrong one", () => {
    const question = trueCountQuestionFrom(DEFAULT_TRUE_COUNT_CONFIG, { runningCount: 14, cardsRemaining: 52 });
    const view = trueCountVerdict(scoreTrueCount(question, 14, 0));
    expect(view.correct).toBe(true);
    expect(view.detail).toBe("+14 ÷ 1.00 = +14.00, truncated toward zero, is +14.");
  });

  it("calls out a sign slip", () => {
    const question = trueCountQuestionFrom(DEFAULT_TRUE_COUNT_CONFIG, { runningCount: -12, cardsRemaining: 156 });
    expect(trueCountVerdict(scoreTrueCount(question, 4, 0)).lesson).toMatch(/wrong sign/);
  });

  it("shows decks with the cards they came from", () => {
    expect(decksText(117)).toBe("2.25 decks (117 cards)");
    expect(decksText(52)).toBe("1.00 deck (52 cards)");
  });
});

describe("deviation refusals, in words", () => {
  it("has a reason for every exclusion the default table produces", () => {
    const availability = deviationDrillAvailability(DEFAULT_RULES, HI_LO);
    expect(availability.excluded.length).toBeGreaterThan(0);
    for (const excluded of availability.excluded) {
      expect(EXCLUSION_REASON[excluded.reason]).toBeTruthy();
    }
  });
});
