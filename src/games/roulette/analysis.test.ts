import { describe, expect, it } from "vitest";
import {
  analyzeBets,
  describePockets,
  houseEdgeOf,
  outcomesByPocket,
  wheelHouseEdge,
  winProbability,
} from "./analysis";
import { type BetType, getLayout } from "./layout";
import type { Bet } from "./spin";
import { AMERICAN_RULES, DOUBLE_ZERO, EUROPEAN_RULES, FRENCH_RULES } from "./wheel";

const bet = (spotId: string, amount: number): Bet => ({ spotId, amount });

/** The Strategy Builder's "High Side + Six Line + Zero" plan, $100 per spin. */
const HIGH_SIDE: Bet[] = [
  bet("high", 70),
  bet("sixLine:13-14-15-16-17-18", 25),
  bet("straight:0", 5),
];

describe("house edge against published figures", () => {
  it("is 2.70% on every European bet", () => {
    for (const s of getLayout("european").spots) {
      expect(houseEdgeOf(EUROPEAN_RULES, s.type)).toBeCloseTo(1 / 37, 12);
    }
    expect(wheelHouseEdge(EUROPEAN_RULES)).toBeCloseTo(0.027027, 6);
  });

  it("is 5.26% on every American bet except the top line at 7.89%", () => {
    for (const s of getLayout("american").spots) {
      const expected = s.type === "topLine" ? 3 / 38 : 2 / 38;
      expect(houseEdgeOf(AMERICAN_RULES, s.type)).toBeCloseTo(expected, 12);
    }
    expect(houseEdgeOf(AMERICAN_RULES, "topLine")).toBeCloseTo(0.078947, 6);
    expect(wheelHouseEdge(AMERICAN_RULES)).toBeCloseTo(0.052632, 6);
  });

  it("is 1.35% on even-money bets with La Partage, and unchanged on the rest", () => {
    const evenMoney: BetType[] = ["red", "black", "odd", "even", "low", "high"];
    for (const t of evenMoney) expect(houseEdgeOf(FRENCH_RULES, t)).toBeCloseTo(1 / 74, 12);
    expect(houseEdgeOf(FRENCH_RULES, "red")).toBeCloseTo(0.013514, 6);
    for (const t of ["straight", "split", "dozen", "column", "sixLine"] as const) {
      expect(houseEdgeOf(FRENCH_RULES, t)).toBeCloseTo(1 / 37, 12);
    }
  });

  it("agrees with the exact enumeration for a single bet of every kind", () => {
    for (const rules of [EUROPEAN_RULES, FRENCH_RULES, AMERICAN_RULES]) {
      for (const s of getLayout(rules).spots) {
        const a = analyzeBets(rules, [bet(s.id, 10)]);
        expect(a.houseEdge).toBeCloseTo(houseEdgeOf(rules, s.type), 12);
        expect(a.expectedValue).toBeCloseTo(-10 * houseEdgeOf(rules, s.type), 12);
      }
    }
  });

  it("throws for a bet the wheel does not have", () => {
    expect(() => houseEdgeOf(EUROPEAN_RULES, "topLine")).toThrow();
  });
});

describe("analyzeBets — the Strategy Builder table", () => {
  const a = analyzeBets(EUROPEAN_RULES, HIGH_SIDE);

  it("matches the design's per-outcome rows", () => {
    expect(
      a.groups.map((g) => ({
        label: g.label,
        count: g.count,
        pct: (g.probability * 100).toFixed(1),
        net: g.net,
      })),
    ).toEqual([
      { label: "19–36", count: 18, pct: "48.6", net: 40 },
      { label: "13–18", count: 6, pct: "16.2", net: 50 },
      { label: "0", count: 1, pct: "2.7", net: 80 },
      { label: "1–12", count: 12, pct: "32.4", net: -100 },
    ]);
  });

  it("reports which bets win in each group", () => {
    expect(a.groups[1]?.winningSpotIds).toEqual(["sixLine:13-14-15-16-17-18"]);
    expect(a.groups[3]?.winningSpotIds).toEqual([]);
  });

  it("averages −$2.70 a spin: the same 2.7% edge as any single bet", () => {
    expect(a.staked).toBe(100);
    expect(a.expectedValue).toBeCloseTo(-100 / 37, 12);
    expect(a.houseEdge).toBeCloseTo(1 / 37, 12);
  });

  it("finds coverage, best and worst case", () => {
    expect(a.uncovered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(a.covered).toHaveLength(25);
    expect(a.worstCase).toBe(-100);
    expect(a.bestCase).toBe(80);
    expect(a.winProbability).toBeCloseTo(25 / 37, 12);
  });

  it("lowers the layout's edge when La Partage protects the even-money part", () => {
    const fr = analyzeBets(FRENCH_RULES, HIGH_SIDE);
    expect(fr.groups.find((g) => g.label === "0")?.net).toBe(80 + 35);
    expect(fr.houseEdge).toBeLessThan(a.houseEdge);
    expect(fr.expectedValue).toBeCloseTo(-100 / 37 + 35 / 37, 12);
  });

  it("covers every pocket exactly once in the per-pocket table", () => {
    const rows = outcomesByPocket(AMERICAN_RULES, [bet("red", 10)]);
    expect(rows).toHaveLength(38);
    expect(rows.find((r) => r.pocket === DOUBLE_ZERO)?.net).toBe(-10);
  });

  it("handles an empty layout", () => {
    const empty = analyzeBets(EUROPEAN_RULES, []);
    expect(empty).toMatchObject({ staked: 0, expectedValue: 0, houseEdge: 0, worstCase: 0 });
    expect(empty.groups).toHaveLength(1);
  });
});

describe("describePockets", () => {
  it("names runs, zeros and outside sets", () => {
    expect(
      describePockets(
        EUROPEAN_RULES,
        [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36],
      ),
    ).toBe("19–36");
    expect(describePockets(EUROPEAN_RULES, [0])).toBe("0");
    expect(describePockets(AMERICAN_RULES, [DOUBLE_ZERO, 0])).toBe("0, 00");
    expect(describePockets(EUROPEAN_RULES, [1, 5, 9])).toBe("1, 5, 9");
    expect(describePockets(EUROPEAN_RULES, [7, 8])).toBe("7, 8");
    expect(
      describePockets(EUROPEAN_RULES, getLayout("european").byId.get("red")?.pockets ?? []),
    ).toBe("Red");
    expect(describePockets(EUROPEAN_RULES, [1, 3, 5, 7, 9, 11, 13, 15])).toBe("8 pockets");
  });
});

describe("winProbability", () => {
  it("is pockets covered over pockets on the wheel", () => {
    expect(winProbability(EUROPEAN_RULES, "sixLine:13-14-15-16-17-18")).toBeCloseTo(6 / 37, 12);
    expect(winProbability(AMERICAN_RULES, "red")).toBeCloseTo(18 / 38, 12);
  });
});
