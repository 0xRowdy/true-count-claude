/**
 * Chart-diff tests.
 *
 * The promise this screen makes is "change a rule, watch the chart move". These tests
 * assert that the promise is kept for each rule that ought to move it, and — just as
 * importantly — that rules which should move nothing move nothing. A diff that lit up
 * spuriously would be as misleading as one that stayed dark.
 *
 * The specific cells named below come from `src/engine/strategy.ts`, which cites its own
 * sources. This file is not a second opinion on basic strategy; it checks that the diff
 * reports faithfully what the engine already produces.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";
import { DEALER_UPCARDS, strategyChart } from "@/engine/strategy";
import {
  CHART_CODE_LABEL,
  CHART_CODE_TEXT,
  CODE_FAMILY,
  HARD_ROWS,
  PAIR_ROWS,
  SOFT_ROWS,
  cellKey,
  changedCellKeys,
  chartChanges,
  chartRows,
  describeChange,
  sectionRows,
  summarizeChanges,
  upcardLabel,
} from "./chartChanges";

function changesFor(from: RuleSet, to: Partial<RuleSet>) {
  return chartChanges(strategyChart(from), strategyChart({ ...from, ...to }));
}

describe("chartRows", () => {
  it("prints hard 5-20, soft A,2 through A,9, and all ten pairs", () => {
    const chart = strategyChart(DEFAULT_RULES);
    expect(sectionRows(chart, "hard")).toHaveLength(HARD_ROWS.length);
    expect(sectionRows(chart, "soft")).toHaveLength(SOFT_ROWS.length);
    expect(sectionRows(chart, "pairs")).toHaveLength(PAIR_ROWS.length);
    expect(chartRows(chart)).toHaveLength(16 + 8 + 10);
  });

  it("labels rows the way published tables do", () => {
    const chart = strategyChart(DEFAULT_RULES);
    expect(sectionRows(chart, "hard").map((row) => row.label)).toContain("16");
    expect(sectionRows(chart, "soft").map((row) => row.label)).toEqual([
      "A,2",
      "A,3",
      "A,4",
      "A,5",
      "A,6",
      "A,7",
      "A,8",
      "A,9",
    ]);
    expect(sectionRows(chart, "pairs").map((row) => row.label)).toContain("8,8");
  });

  it("gives every row a key unique across the whole chart", () => {
    const keys = chartRows(strategyChart(DEFAULT_RULES)).map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("labels an ace upcard as A and every other column by its value", () => {
    expect(upcardLabel(11)).toBe("A");
    expect(upcardLabel(10)).toBe("10");
    expect(upcardLabel(2)).toBe("2");
  });
});

describe("a chart compared with itself", () => {
  it("reports no changes", () => {
    const chart = strategyChart(DEFAULT_RULES);
    const changes = chartChanges(chart, chart);
    expect(changes).toEqual([]);
    expect(summarizeChanges(changes)).toContain("Basic strategy is unchanged");
  });

  it("reports no changes for rules that cannot affect strategy", () => {
    expect(changesFor(DEFAULT_RULES, { penetration: 0.5 })).toEqual([]);
    expect(changesFor(DEFAULT_RULES, { minBet: 500, maxBet: 50000 })).toEqual([]);
  });
});

describe("rules that move the chart", () => {
  it("moves cells when the dealer's soft 17 rule changes", () => {
    const changes = changesFor(DEFAULT_RULES, { dealerSoft17: "stand" });
    expect(changes.length).toBeGreaterThan(0);
  });

  it("moves soft doubles when doubling is restricted to 10-11", () => {
    const changes = changesFor(DEFAULT_RULES, { doubleRule: "10-11" });
    expect(changes.some((change) => change.section === "soft")).toBe(true);
    expect(changes.every((change) => CODE_FAMILY[change.before] !== "surrender")).toBe(true);
  });

  it("removes every surrender cell when surrender is taken away", () => {
    const withSurrender = strategyChart({ ...DEFAULT_RULES, surrender: "late" });
    const without = strategyChart({ ...DEFAULT_RULES, surrender: "none" });
    const changes = chartChanges(withSurrender, without);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((change) => CODE_FAMILY[change.before] === "surrender")).toBe(true);
    expect(changes.every((change) => CODE_FAMILY[change.after] !== "surrender")).toBe(true);
  });

  it("moves pair cells when double-after-split is taken away", () => {
    const changes = changesFor(DEFAULT_RULES, { doubleAfterSplit: false });
    expect(changes.some((change) => change.section === "pairs")).toBe(true);
  });

  it("moves A,A and hard 11 when the dealer stops peeking", () => {
    const changes = changesFor(DEFAULT_RULES, { dealerPeek: false });
    const moved = changes.map((change) => `${change.rowLabel} vs ${upcardLabel(change.upcard)}`);
    expect(moved).toContain("A,A vs A");
    expect(moved).toContain("11 vs A");
  });

  it("moves a great many cells when the deck count changes", () => {
    expect(changesFor(DEFAULT_RULES, { decks: 1 }).length).toBeGreaterThan(5);
  });

  it("reports the before and after code for each moved cell", () => {
    const changes = changesFor(DEFAULT_RULES, { surrender: "none" });
    for (const change of changes) {
      expect(change.before).not.toBe(change.after);
      expect(CHART_CODE_LABEL[change.before]).toBeTruthy();
      expect(CHART_CODE_TEXT[change.after]).toBeTruthy();
    }
  });

  it("only ever reports cells that are actually printed", () => {
    const after = strategyChart({ ...DEFAULT_RULES, decks: 1 });
    const printed = new Set(chartRows(after).map((row) => row.key));
    for (const change of changesFor(DEFAULT_RULES, { decks: 1 })) {
      expect(printed.has(change.rowKey)).toBe(true);
      expect(DEALER_UPCARDS).toContain(change.upcard);
    }
  });
});

describe("describing a change", () => {
  it("reads as a sentence about a hand, not a diff", () => {
    const changes = changesFor(
      { ...DEFAULT_RULES, surrender: "none" },
      { surrender: "late" },
    );
    const hard16 = changes.find(
      (change) => change.section === "hard" && change.rowLabel === "16" && change.upcard === 10,
    );
    expect(hard16).toBeDefined();
    expect(describeChange(hard16 as (typeof changes)[number])).toBe(
      "Hard 16 vs 10: Hit becomes Surrender, else hit",
    );
  });

  it("names a pair row by the pair itself", () => {
    const changes = changesFor(DEFAULT_RULES, { dealerPeek: false });
    const aces = changes.find((change) => change.rowLabel === "A,A");
    expect(aces).toBeDefined();
    expect(describeChange(aces as (typeof changes)[number])).toMatch(/^A,A vs /);
  });

  it("counts the cells and names the sections in the summary", () => {
    const changes = changesFor(DEFAULT_RULES, { doubleRule: "10-11" });
    expect(summarizeChanges(changes)).toMatch(/^\d+ cells move, in /);
  });
});

describe("changedCellKeys", () => {
  it("produces keys the renderer can look a cell up by", () => {
    const changes = changesFor(DEFAULT_RULES, { dealerPeek: false });
    const keys = changedCellKeys(changes);
    expect(keys.size).toBe(changes.length);
    for (const change of changes) {
      expect(keys.has(cellKey(change.rowKey, change.upcard))).toBe(true);
    }
    expect(keys.has(cellKey("hard:20", 2))).toBe(false);
  });
});
