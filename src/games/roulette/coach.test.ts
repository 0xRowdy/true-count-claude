import { describe, expect, it } from "vitest";
import {
  averageResultCaption,
  describeBetSummary,
  describeGameRules,
  describeSpot,
  describeTable,
  explainDoubleZero,
  explainHouseEdgeIsTheSame,
  explainLaPartage,
  explainLowestEdgeBets,
  explainMartingaleRisk,
  explainNoMemory,
  loupeCaption,
  outcomeGroupCopy,
  pocketsEquallyLikely,
  uncoveredNote,
} from "./coach";
import { analyzeBets } from "./analysis";
import { formatDollars, formatHouseEdge, formatPercent, formatSignedDollars } from "./format";
import { betsTouching, getSpot } from "./layout";
import type { Bet } from "./spin";
import { AMERICAN_RULES, EUROPEAN_RULES, FRENCH_RULES } from "./wheel";

const bet = (spotId: string, amount: number): Bet => ({ spotId, amount });
const HIGH_SIDE: Bet[] = [
  bet("high", 70),
  bet("sixLine:13-14-15-16-17-18", 25),
  bet("straight:0", 5),
];

describe("formatters", () => {
  it("formats dollars without the locale", () => {
    expect(formatDollars(6400)).toBe("$6,400");
    expect(formatDollars(1000)).toBe("$1,000");
    expect(formatDollars(2.7027)).toBe("$2.70");
    expect(formatDollars(12.5)).toBe("$12.50");
    expect(formatDollars(-100)).toBe("−$100");
    expect(formatDollars(1234567)).toBe("$1,234,567");
  });

  it("signs results with a true minus", () => {
    expect(formatSignedDollars(40)).toBe("+$40");
    expect(formatSignedDollars(-100)).toBe("−$100");
    expect(formatSignedDollars(-100 / 37)).toBe("−$2.70");
    expect(formatSignedDollars(0)).toBe("$0");
    expect(formatSignedDollars(-0.001)).toBe("$0");
  });

  it("formats percentages and house edges as published", () => {
    expect(formatPercent(18 / 37)).toBe("48.6%");
    expect(formatPercent(1 / 37)).toBe("2.7%");
    expect(formatHouseEdge(1 / 37)).toBe("2.7%");
    expect(formatHouseEdge(2 / 38)).toBe("5.26%");
    expect(formatHouseEdge(1 / 74)).toBe("1.35%");
    expect(formatHouseEdge(3 / 38)).toBe("7.89%");
  });
});

describe("screen copy", () => {
  it("describes the table and game rules", () => {
    expect(describeTable(EUROPEAN_RULES)).toBe("European · single zero · $5–$1,000");
    expect(describeTable(AMERICAN_RULES)).toBe("American · double zero · $5–$1,000");
    expect(describeGameRules(EUROPEAN_RULES)).toBe("Roulette · European · $5 inside min");
  });

  it("captions the bet loupe like the design", () => {
    const captions = betsTouching(EUROPEAN_RULES, 17, { insideOnly: true })
      .slice(0, 6)
      .map((s) => [s.label, loupeCaption(s)]);
    expect(captions).toEqual([
      ["17", "Straight 35:1"],
      ["16 | 17", "Split 17:1"],
      ["17 | 18", "Split 17:1"],
      ["14 | 17", "Split 17:1"],
      ["17 | 20", "Split 17:1"],
      ["16 · 17 · 18", "Street 11:1"],
    ]);
  });

  it("summarises the bets on the felt", () => {
    expect(
      describeBetSummary(EUROPEAN_RULES, [
        bet("straight:17", 5),
        bet("red", 25),
        bet("dozen:2", 10),
      ]),
    ).toBe("17 straight · Red · 2nd dozen");
  });

  it("fills the selected-bet panel", () => {
    const spot = getSpot(EUROPEAN_RULES, "sixLine:13-14-15-16-17-18");
    if (!spot) throw new Error("missing six line");
    expect(describeSpot(EUROPEAN_RULES, spot, 25)).toEqual({
      title: "Six line 13–18",
      covers: [13, 14, 15, 16, 17, 18],
      pays: "5 to 1",
      wins: "6 of 37 · 16.2%",
      ifItHits: "+$125",
    });
  });

  it("writes the strategy table rows", () => {
    expect(pocketsEquallyLikely(EUROPEAN_RULES)).toBe("37 pockets, each equally likely");
    const rows = analyzeBets(EUROPEAN_RULES, HIGH_SIDE).groups.map(outcomeGroupCopy);
    expect(rows[0]).toEqual({ title: "Ball lands 19–36", pockets: "18 pockets" });
    expect(rows[2]).toEqual({ title: "Ball lands 0", pockets: "1 pocket" });
    expect(uncoveredNote(EUROPEAN_RULES, HIGH_SIDE)).toBe("Not covered: 1–12");
    expect(
      uncoveredNote(EUROPEAN_RULES, [bet("red", 5), bet("black", 5), bet("straight:0", 5)]),
    ).toBe(undefined);
    expect(averageResultCaption(EUROPEAN_RULES, HIGH_SIDE)).toBe(
      "2.7% house edge, same as any single bet",
    );
    expect(averageResultCaption(FRENCH_RULES, [bet("red", 10)])).toBe(
      "1.35% house edge across this layout",
    );
  });
});

describe("teaching moments", () => {
  it("reproduces the design's Martingale warning", () => {
    expect(explainMartingaleRisk(100)).toBe(
      "Progressions change how you lose, not how much on average. With Martingale, 6 losses in a row ask for a $6,400 bet, past most table limits. Flat betting is the honest default.",
    );
    expect(explainMartingaleRisk(5, 1000)).toContain("8 losses in a row ask for a $1,280 bet");
    expect(explainMartingaleRisk(5, 1000)).toContain("past this table's $1,000 limit");
    expect(explainMartingaleRisk(600, 1000)).toContain("1 loss asks for a $1,200 bet");
  });

  it("handles a base bet already over the table max", () => {
    const text = explainMartingaleRisk(2000, 1000);
    expect(text).toContain("A $2,000 base bet is already past this table's $1,000 limit");
    expect(text).not.toMatch(/0 losses/);
    expect(explainMartingaleRisk(6000)).toContain("already past most table limits");
  });

  it("explains that the house edge is the same on every bet", () => {
    expect(explainHouseEdgeIsTheSame(EUROPEAN_RULES)).toContain("same 2.7% house edge");
    expect(explainHouseEdgeIsTheSame(EUROPEAN_RULES)).toContain("fair 36 to 1");
    expect(explainHouseEdgeIsTheSame(AMERICAN_RULES)).toContain("5.26%");
    expect(explainHouseEdgeIsTheSame(AMERICAN_RULES)).toContain("top line");
    expect(explainHouseEdgeIsTheSame(AMERICAN_RULES)).toContain("7.89%");
    expect(explainHouseEdgeIsTheSame(FRENCH_RULES)).toContain("1.35%");
  });

  it("explains La Partage and the double zero", () => {
    expect(explainLaPartage(FRENCH_RULES)).toContain("from 2.7% to 1.35%");
    expect(explainDoubleZero()).toContain("from 2.7% to 5.26%");
  });

  it("names the lowest-edge bets for each table", () => {
    expect(explainLowestEdgeBets(FRENCH_RULES)).toContain("even-money");
    expect(explainLowestEdgeBets(AMERICAN_RULES)).toContain("top line");
    expect(explainLowestEdgeBets(EUROPEAN_RULES)).toContain("La Partage");
  });

  it("answers a streak with the gambler's fallacy", () => {
    expect(explainNoMemory(EUROPEAN_RULES, [1, 3, 5, 2])).toBe(
      "Red has hit 3 in a row, and the wheel has no memory. Next spin, red is still 18 of 37 (48.6%), same as always.",
    );
    expect(explainNoMemory(EUROPEAN_RULES, [17, 32, 0])).toContain("each of the 37 pockets");
    expect(explainNoMemory(AMERICAN_RULES, [])).toContain("38 pockets");
  });
});
