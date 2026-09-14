import { describe, expect, it } from "vitest";
import type { Action, ChartCode, ChartSection, DealerUpcard } from "@/engine";
import {
  type CellAttempt,
  EMPTY_BREAKDOWN,
  chartBreakdown,
  masteredCells,
  untestedCells,
  weakestCells,
  weakestRows,
} from "./chart";

interface AttemptSpec {
  readonly section?: ChartSection;
  readonly row: string;
  readonly upcard: DealerUpcard;
  readonly code?: ChartCode;
  readonly correctAction: Action;
  readonly actionTaken: Action;
  readonly evLoss?: number;
}

function attempt(spec: AttemptSpec): CellAttempt {
  return {
    section: spec.section ?? "hard",
    row: spec.row,
    upcard: spec.upcard,
    code: spec.code ?? "H",
    correctAction: spec.correctAction,
    actionTaken: spec.actionTaken,
    verdict: spec.correctAction === spec.actionTaken ? "correct" : "incorrect",
    evLoss: spec.evLoss ?? 0,
  };
}

/** Soft 18 against 9, 10 and an ace: hit, and the cell users most often stand on. */
function softEighteenMiss(upcard: DealerUpcard, evLoss = 0.05): CellAttempt {
  return attempt({
    section: "soft",
    row: "A,7",
    upcard,
    code: "H",
    correctAction: "hit",
    actionTaken: "stand",
    evLoss,
  });
}

describe("chart breakdown", () => {
  it("reports no accuracy for a run with nothing in it", () => {
    const breakdown = chartBreakdown([]);
    expect(breakdown).toEqual(EMPTY_BREAKDOWN);
    expect(breakdown.accuracy).toBeNull();
  });

  it("files each decision under the cell that governed it", () => {
    const breakdown = chartBreakdown([
      attempt({ row: "16", upcard: 10, correctAction: "hit", actionTaken: "hit" }),
      attempt({ row: "16", upcard: 10, correctAction: "hit", actionTaken: "stand" }),
      attempt({ row: "12", upcard: 3, correctAction: "hit", actionTaken: "hit" }),
    ]);

    expect(breakdown.cells).toHaveLength(2);
    const sixteen = breakdown.cells.find((cell) => cell.id === "hard:16:10");
    expect(sixteen?.attempts).toBe(2);
    expect(sixteen?.correct).toBe(1);
    expect(sixteen?.accuracy).toBe(0.5);
  });

  it("records what the user actually chose, not just that they were wrong", () => {
    const breakdown = chartBreakdown([
      softEighteenMiss(9),
      softEighteenMiss(9),
      attempt({
        section: "soft",
        row: "A,7",
        upcard: 9,
        correctAction: "hit",
        actionTaken: "double",
      }),
    ]);

    const cell = breakdown.cells[0];
    expect(cell?.mistakes).toEqual([
      { action: "stand", count: 2 },
      { action: "double", count: 1 },
    ]);
  });

  it("rolls a row up across every upcard drilled — the actionable unit", () => {
    const breakdown = chartBreakdown([
      softEighteenMiss(9),
      softEighteenMiss(10),
      softEighteenMiss(11),
      attempt({ row: "20", upcard: 6, correctAction: "stand", actionTaken: "stand" }),
    ]);

    const row = breakdown.rows.find((candidate) => candidate.id === "soft:A,7");
    expect(row?.attempts).toBe(3);
    expect(row?.missed).toBe(3);
    expect(row?.accuracy).toBe(0);
    expect(row?.cells.map((cell) => cell.upcard)).toEqual([9, 10, 11]);
  });

  it("names soft 18 as the weakness when every other cell is clean", () => {
    const clean: CellAttempt[] = [9, 10, 11, 2, 3, 4].map((upcard) =>
      attempt({
        row: "20",
        upcard: upcard as DealerUpcard,
        code: "S",
        correctAction: "stand",
        actionTaken: "stand",
      }),
    );

    const breakdown = chartBreakdown([
      ...clean,
      softEighteenMiss(9),
      softEighteenMiss(10),
      softEighteenMiss(11),
    ]);

    expect(breakdown.accuracy).toBeCloseTo(6 / 9);
    const worst = weakestRows(breakdown);
    expect(worst).toHaveLength(1);
    expect(worst[0]?.row).toBe("A,7");
    expect(worst[0]?.missed).toBe(3);
  });

  it("ranks cells by misses, then by what the mistake costs", () => {
    const breakdown = chartBreakdown([
      // One miss each, but the 12 vs 3 error costs three times as much.
      attempt({ row: "16", upcard: 9, correctAction: "hit", actionTaken: "stand", evLoss: 0.01 }),
      attempt({ row: "12", upcard: 3, correctAction: "hit", actionTaken: "stand", evLoss: 0.03 }),
      // Two misses, so this one leads regardless of cost.
      softEighteenMiss(9, 0.005),
      softEighteenMiss(9, 0.005),
    ]);

    expect(weakestCells(breakdown).map((cell) => cell.id)).toEqual([
      "soft:A,7:9",
      "hard:12:3",
      "hard:16:9",
    ]);
  });

  it("separates cells that are finished from cells with too little evidence", () => {
    const breakdown = chartBreakdown([
      ...Array.from({ length: 3 }, () =>
        attempt({ row: "20", upcard: 6, code: "S", correctAction: "stand", actionTaken: "stand" }),
      ),
      attempt({ row: "11", upcard: 6, code: "D", correctAction: "double", actionTaken: "double" }),
    ]);

    expect(masteredCells(breakdown).map((cell) => cell.id)).toEqual(["hard:20:6"]);
    expect(untestedCells(breakdown).map((cell) => cell.id)).toEqual(["hard:11:6"]);
  });

  it("rolls sections up and omits the ones that were never drilled", () => {
    const breakdown = chartBreakdown([
      attempt({ row: "16", upcard: 10, correctAction: "hit", actionTaken: "stand" }),
      softEighteenMiss(9),
      attempt({
        section: "soft",
        row: "A,8",
        upcard: 6,
        code: "Ds",
        correctAction: "double",
        actionTaken: "double",
      }),
    ]);

    expect(breakdown.sections.map((section) => section.section)).toEqual(["hard", "soft"]);
    expect(breakdown.sections.find((s) => s.section === "soft")?.attempts).toBe(2);
  });

  it("sums the bets given up across the run", () => {
    const breakdown = chartBreakdown([softEighteenMiss(9, 0.04), softEighteenMiss(10, 0.06)]);
    expect(breakdown.evLost).toBeCloseTo(0.1);
  });

  it("treats a missing EV as no cost rather than as a bad one", () => {
    const breakdown = chartBreakdown([
      { ...softEighteenMiss(9), evLoss: null },
      softEighteenMiss(10, 0.06),
    ]);
    expect(breakdown.evLost).toBeCloseTo(0.06);
  });
});
