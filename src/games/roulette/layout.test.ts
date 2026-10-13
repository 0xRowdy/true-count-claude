import { describe, expect, it } from "vitest";
import {
  type BetType,
  OUTSIDE_SPOT_IDS,
  PAYOUTS,
  betsTouching,
  findSpot,
  getLayout,
  getSpot,
  gridNeighbours,
  isEvenMoneyBet,
  isInsideBet,
  straightId,
} from "./layout";
import {
  AMERICAN_RULES,
  AMERICAN_WHEEL_ORDER,
  DOUBLE_ZERO,
  EUROPEAN_RULES,
  EUROPEAN_WHEEL_ORDER,
  type Pocket,
  RED_NUMBERS,
  parsePocket,
  pocketColor,
  sortPockets,
  validateRouletteRules,
  wheelPockets,
} from "./wheel";

const countByType = (wheel: "european" | "american") => {
  const counts: Partial<Record<BetType, number>> = {};
  for (const s of getLayout(wheel).spots) counts[s.type] = (counts[s.type] ?? 0) + 1;
  return counts;
};

describe("wheel", () => {
  it("has 37 pockets on the European wheel and 38 on the American", () => {
    expect(wheelPockets("european")).toHaveLength(37);
    expect(wheelPockets("american")).toHaveLength(38);
    expect(wheelPockets("american")).toContain(DOUBLE_ZERO);
    expect(wheelPockets("european")).not.toContain(DOUBLE_ZERO);
  });

  it("lists each pocket exactly once in the physical wheel order", () => {
    for (const [order, wheel] of [
      [EUROPEAN_WHEEL_ORDER, "european"],
      [AMERICAN_WHEEL_ORDER, "american"],
    ] as const) {
      expect(new Set(order).size).toBe(order.length);
      expect(sortPockets(order)).toEqual([...wheelPockets(wheel)]);
    }
  });

  it("alternates red and black around the European wheel", () => {
    const order = EUROPEAN_WHEEL_ORDER.slice(1);
    for (let i = 1; i < order.length; i++) {
      expect(pocketColor(order[i] as Pocket)).not.toBe(pocketColor(order[i - 1] as Pocket));
    }
  });

  it("colours 18 red, 18 black and the zeros green", () => {
    const colours = wheelPockets("american").map(pocketColor);
    expect(colours.filter((c) => c === "red")).toHaveLength(18);
    expect(colours.filter((c) => c === "black")).toHaveLength(18);
    expect(pocketColor(0)).toBe("green");
    expect(pocketColor(DOUBLE_ZERO)).toBe("green");
    expect(RED_NUMBERS).toContain(16);
    expect(pocketColor(17)).toBe("black");
    expect(pocketColor(14)).toBe("red");
    expect(pocketColor(25)).toBe("red");
  });

  it("parses pocket labels", () => {
    expect(parsePocket("00")).toBe(DOUBLE_ZERO);
    expect(parsePocket("0")).toBe(0);
    expect(parsePocket("36")).toBe(36);
    expect(parsePocket("37")).toBeUndefined();
    expect(parsePocket("x")).toBeUndefined();
  });

  it("validates table limits", () => {
    expect(validateRouletteRules(EUROPEAN_RULES)).toEqual([]);
    expect(
      validateRouletteRules({ ...EUROPEAN_RULES, limits: { min: 10, max: 5, insideMin: 0 } }),
    ).toEqual([
      "Inside minimum must be a positive amount.",
      "Table maximum must be at least the table minimum.",
    ]);
  });
});

describe("layout geometry", () => {
  it("enumerates the standard European spot counts", () => {
    expect(countByType("european")).toEqual({
      straight: 37,
      split: 60, // 57 on the grid + 0|1, 0|2, 0|3
      street: 12,
      trio: 2,
      corner: 22,
      firstFour: 1,
      sixLine: 11,
      column: 3,
      dozen: 3,
      red: 1,
      black: 1,
      odd: 1,
      even: 1,
      low: 1,
      high: 1,
    });
  });

  it("enumerates the standard American spot counts", () => {
    expect(countByType("american")).toEqual({
      straight: 38,
      split: 62, // 57 on the grid + 0|00, 0|1, 0|2, 00|2, 00|3
      street: 12,
      trio: 3,
      corner: 22,
      topLine: 1,
      sixLine: 11,
      column: 3,
      dozen: 3,
      red: 1,
      black: 1,
      odd: 1,
      even: 1,
      low: 1,
      high: 1,
    });
  });

  it("gives every spot a unique id and the right pocket count for its type", () => {
    const size: Record<BetType, number> = {
      straight: 1,
      split: 2,
      street: 3,
      trio: 3,
      corner: 4,
      firstFour: 4,
      topLine: 5,
      sixLine: 6,
      column: 12,
      dozen: 12,
      red: 18,
      black: 18,
      odd: 18,
      even: 18,
      low: 18,
      high: 18,
    };
    for (const wheel of ["european", "american"] as const) {
      const layout = getLayout(wheel);
      expect(layout.byId.size).toBe(layout.spots.length);
      for (const s of layout.spots) {
        expect(s.pockets).toHaveLength(size[s.type]);
        expect(s.payout).toBe(PAYOUTS[s.type]);
      }
    }
  });

  it("makes every bet fair at 36 units of coverage (the house edge comes from the zeros)", () => {
    // (payout + 1) × pockets covered = 36 for every bet except first four (36 too, 4 × 9)
    // and the American top line (35, which is why it is the worst bet on the table).
    for (const s of getLayout("american").spots) {
      expect((s.payout + 1) * s.pockets.length).toBe(s.type === "topLine" ? 35 : 36);
    }
    for (const s of getLayout("european").spots) {
      expect((s.payout + 1) * s.pockets.length).toBe(36);
    }
  });

  it("knows which numbers touch on the grid", () => {
    expect(gridNeighbours(17).sort((a, b) => a - b)).toEqual([14, 16, 18, 20]);
    expect(gridNeighbours(1).sort((a, b) => a - b)).toEqual([2, 4]);
    expect(gridNeighbours(3).sort((a, b) => a - b)).toEqual([2, 6]);
    expect(gridNeighbours(36).sort((a, b) => a - b)).toEqual([33, 35]);
  });

  it("allows a split only between numbers that touch", () => {
    for (let a = 1; a <= 36; a++) {
      for (let b = a + 1; b <= 36; b++) {
        const legal = gridNeighbours(a).includes(b);
        expect(findSpot("european", "split", [a, b]) !== undefined).toBe(legal);
      }
    }
    expect(findSpot("european", "split", [3, 4])).toBeUndefined();
    expect(findSpot("european", "split", [16, 17])?.label).toBe("16 | 17");
    expect(findSpot("european", "split", [17, 14])?.id).toBe("split:14-17");
  });

  it("only has streets, corners and six lines where the grid has them", () => {
    expect(findSpot("european", "street", [16, 17, 18])?.label).toBe("16 · 17 · 18");
    expect(findSpot("european", "street", [17, 18, 19])).toBeUndefined();
    expect(findSpot("european", "corner", [13, 14, 16, 17])).toBeDefined();
    expect(findSpot("european", "corner", [14, 15, 17, 18])).toBeDefined();
    expect(findSpot("european", "corner", [15, 16, 18, 19])).toBeUndefined();
    expect(findSpot("european", "corner", [34, 35, 37, 38])).toBeUndefined();
    expect(findSpot("european", "sixLine", [13, 14, 15, 16, 17, 18])?.label).toBe("13–18");
    expect(findSpot("european", "sixLine", [14, 15, 16, 17, 18, 19])).toBeUndefined();
    expect(findSpot("european", "sixLine", [31, 32, 33, 34, 35, 36])).toBeDefined();
  });

  it("models the zero row of each wheel", () => {
    expect(findSpot("european", "split", [0, 2])).toBeDefined();
    expect(findSpot("european", "trio", [0, 2, 3])).toBeDefined();
    expect(findSpot("european", "firstFour", [0, 1, 2, 3])?.payout).toBe(8);
    expect(findSpot("european", "split", [0, DOUBLE_ZERO])).toBeUndefined();

    expect(findSpot("american", "split", [0, DOUBLE_ZERO])?.label).toBe("0 | 00");
    expect(findSpot("american", "split", [DOUBLE_ZERO, 3])).toBeDefined();
    expect(findSpot("american", "split", [0, 3])).toBeUndefined();
    expect(findSpot("american", "split", [DOUBLE_ZERO, 1])).toBeUndefined();
    expect(findSpot("american", "trio", [0, DOUBLE_ZERO, 2])).toBeDefined();
    expect(findSpot("american", "topLine", [0, DOUBLE_ZERO, 1, 2, 3])?.payout).toBe(6);
    expect(findSpot("american", "firstFour", [0, 1, 2, 3])).toBeUndefined();
  });

  it("builds the outside bets", () => {
    const dozen2 = getSpot("european", OUTSIDE_SPOT_IDS.dozen(2));
    expect(dozen2?.label).toBe("2nd 12");
    expect(dozen2?.pockets).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(getSpot("european", OUTSIDE_SPOT_IDS.column(1))?.pockets.slice(0, 3)).toEqual([1, 4, 7]);
    expect(getSpot("european", OUTSIDE_SPOT_IDS.column(3))?.pockets.at(-1)).toBe(36);
    expect(getSpot("european", "red")?.pockets).toEqual(RED_NUMBERS);
    expect(getSpot("european", "low")?.label).toBe("1–18");
    expect(getSpot("european", "high")?.label).toBe("19–36");
    for (const id of ["red", "black", "odd", "even", "low", "high"]) {
      const spot = getSpot("american", id);
      expect(spot?.pockets).not.toContain(0);
      expect(spot?.pockets).not.toContain(DOUBLE_ZERO);
    }
  });

  it("classifies inside, outside and even-money bets", () => {
    expect(isInsideBet("sixLine")).toBe(true);
    expect(isInsideBet("dozen")).toBe(false);
    expect(isEvenMoneyBet("red")).toBe(true);
    expect(isEvenMoneyBet("dozen")).toBe(false);
  });
});

describe("betsTouching (bet loupe)", () => {
  it("lists the bets around 17 in the design's order", () => {
    const labels = betsTouching(EUROPEAN_RULES, 17, { insideOnly: true }).map(
      (s) => `${s.type} ${s.label}`,
    );
    expect(labels).toEqual([
      "straight 17",
      "split 16 | 17",
      "split 17 | 18",
      "split 14 | 17",
      "split 17 | 20",
      "street 16 · 17 · 18",
      "corner 13 · 14 · 16 · 17",
      "corner 14 · 15 · 17 · 18",
      "corner 16 · 17 · 19 · 20",
      "corner 17 · 18 · 20 · 21",
      "sixLine 13–18",
      "sixLine 16–21",
    ]);
  });

  it("appends the outside bets unless asked for inside only", () => {
    const all = betsTouching(EUROPEAN_RULES, 17).map((s) => s.id);
    expect(all.slice(-5)).toEqual(["column:2", "dozen:2", "black", "odd", "low"]);
  });

  it("returns exactly the spots containing the pocket, for every pocket on both wheels", () => {
    for (const rules of [EUROPEAN_RULES, AMERICAN_RULES]) {
      const layout = getLayout(rules);
      for (const p of layout.pockets) {
        const touching = betsTouching(rules, p);
        const expected = layout.spots.filter((s) => s.pockets.includes(p));
        expect(new Set(touching.map((s) => s.id))).toEqual(new Set(expected.map((s) => s.id)));
        expect(touching[0]?.id).toBe(straightId(p));
      }
    }
  });

  it("handles corner and edge numbers", () => {
    const one = betsTouching(EUROPEAN_RULES, 1, { insideOnly: true }).map((s) => s.id);
    expect(one).toEqual([
      "straight:1",
      "split:1-2",
      "split:1-4",
      "split:0-1",
      "street:1-2-3",
      "trio:0-1-2",
      "corner:1-2-4-5",
      "firstFour:0-1-2-3",
      "sixLine:1-2-3-4-5-6",
    ]);
    const zero = betsTouching(AMERICAN_RULES, 0, { insideOnly: true }).map((s) => s.id);
    expect(zero).toContain("split:0-00");
    expect(zero).toContain("topLine:0-00-1-2-3");
    expect(betsTouching(EUROPEAN_RULES, DOUBLE_ZERO)).toEqual([]);
  });
});
