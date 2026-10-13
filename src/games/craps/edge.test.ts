import { describe, expect, it } from "vitest";
import {
  type Bet,
  type CrapsRules,
  type PointNumber,
  DOWNTOWN_RULES,
  POINT_NUMBERS,
  allDice,
  blendedEdge,
  buyEdge,
  diceTotal,
  dontPassEdge,
  edgeChart,
  fieldEdge,
  formatEdge,
  hardEdge,
  houseEdge,
  isPointNumber,
  layEdge,
  netOf,
  oneRollEdge,
  passEdge,
  passWinProbability,
  placeEdge,
  resolveBet,
  tableEdge,
} from "./index";

/**
 * Published figures (Wizard of Odds, "Craps — house edge"), to the precision they are quoted.
 * The engine derives every edge from the dice; these assert the derivation and the payout
 * table together.
 */
describe("house edge vs published figures", () => {
  const R = DOWNTOWN_RULES;

  it("pass / come: 1.41% (exactly 7/495), wins 244/495", () => {
    expect(passWinProbability()).toBeCloseTo(244 / 495, 12);
    expect(passEdge()).toBeCloseTo(7 / 495, 12);
    expect(formatEdge(passEdge())).toBe("1.41%");
    expect(houseEdge("come", R)).toBe(passEdge());
  });

  it("don't pass / don't come, bar 12: 1.36% (exactly 3/220)", () => {
    expect(dontPassEdge()).toBeCloseTo(3 / 220, 12);
    expect(formatEdge(dontPassEdge())).toBe("1.36%");
    expect(houseEdge("dontCome", R)).toBe(dontPassEdge());
  });

  it("odds and lay odds: 0%", () => {
    expect(houseEdge("odds", R)).toBe(0);
    expect(formatEdge(0)).toBe("0%");
  });

  it("place: 6/8 1.52%, 5/9 4.00%, 4/10 6.67%", () => {
    expect(placeEdge(6)).toBeCloseTo(1 / 66, 12);
    expect(placeEdge(8)).toBeCloseTo(1 / 66, 12);
    expect(formatEdge(placeEdge(6))).toBe("1.52%");
    expect(placeEdge(5)).toBeCloseTo(0.04, 12);
    expect(placeEdge(9)).toBeCloseTo(0.04, 12);
    expect(placeEdge(4)).toBeCloseTo(1 / 15, 12);
    expect(placeEdge(10)).toBeCloseTo(1 / 15, 12);
  });

  it("buy, vig on the win: 1.67% / 2.00% / 2.27%; vig up front: 4.76%", () => {
    expect(buyEdge(4, R)).toBeCloseTo(1 / 60, 12);
    expect(buyEdge(5, R)).toBeCloseTo(0.02, 12);
    expect(buyEdge(6, R)).toBeCloseTo(0.05 * (5 / 11), 12);
    expect(formatEdge(buyEdge(6, R))).toBe("2.27%");
    const upfront: CrapsRules = { ...R, buyCommission: { ...R.buyCommission, timing: "upfront" } };
    for (const n of POINT_NUMBERS) expect(formatEdge(buyEdge(n, upfront))).toBe("4.76%");
  });

  it("lay, vig on the win: 1.67% / 2.00% / 2.27%; up front: 2.44% / 3.23% / 4.00%", () => {
    expect(formatEdge(layEdge(4, R))).toBe("1.67%");
    expect(formatEdge(layEdge(5, R))).toBe("2%");
    expect(formatEdge(layEdge(6, R))).toBe("2.27%");
    const upfront: CrapsRules = { ...R, layCommission: { ...R.layCommission, timing: "upfront" } };
    expect(formatEdge(layEdge(4, upfront))).toBe("2.44%");
    expect(formatEdge(layEdge(9, upfront))).toBe("3.23%");
    expect(formatEdge(layEdge(8, upfront))).toBe("4%");
  });

  it("field: 5.56% with 2 and 12 double, 2.78% with triple 12", () => {
    expect(fieldEdge(R)).toBeCloseTo(1 / 18, 12);
    expect(formatEdge(fieldEdge(R))).toBe("5.56%");
    expect(fieldEdge({ ...R, fieldTwelvePays: 3 })).toBeCloseTo(1 / 36, 12);
    expect(formatEdge(fieldEdge({ ...R, fieldTwelvePays: 3 }))).toBe("2.78%");
  });

  it("hardways: hard 6/8 9.09%, hard 4/10 11.11%", () => {
    expect(hardEdge(6)).toBeCloseTo(1 / 11, 12);
    expect(hardEdge(8)).toBeCloseTo(1 / 11, 12);
    expect(hardEdge(4)).toBeCloseTo(1 / 9, 12);
    expect(hardEdge(10)).toBeCloseTo(1 / 9, 12);
  });

  it("center bets: any seven 16.67%, any craps 11.11%, yo 11.11%, aces/twelve 13.89%", () => {
    expect(oneRollEdge("anySeven")).toBeCloseTo(1 / 6, 12);
    expect(oneRollEdge("anyCraps")).toBeCloseTo(1 / 9, 12);
    expect(oneRollEdge("yo")).toBeCloseTo(1 / 9, 12);
    expect(oneRollEdge("aceDeuce")).toBeCloseTo(1 / 9, 12);
    expect(oneRollEdge("aces")).toBeCloseTo(5 / 36, 12);
    expect(oneRollEdge("twelve")).toBeCloseTo(5 / 36, 12);
  });

  it("every center bet sits in the design's '9–17%' band", () => {
    for (const k of ["anySeven", "anyCraps", "yo", "aces", "twelve"] as const) {
      expect(oneRollEdge(k)).toBeGreaterThanOrEqual(0.09);
      expect(oneRollEdge(k)).toBeLessThanOrEqual(0.17);
    }
    for (const n of [4, 6, 8, 10] as const) {
      expect(hardEdge(n)).toBeGreaterThanOrEqual(0.09);
      expect(hardEdge(n)).toBeLessThanOrEqual(0.17);
    }
  });

  it("houseEdge requires a number where one is needed", () => {
    expect(() => houseEdge("place", R)).toThrow();
    expect(() => houseEdge("hard", R, 5)).toThrow();
  });

  it("publishes an edge chart with every bet", () => {
    const chart = edgeChart(R);
    expect(chart.find((r) => r.label === "Pass / Come")?.edge).toBeCloseTo(7 / 495, 12);
    expect(chart.find((r) => r.label === "Place 6 / 8")?.payout).toBe("7:6");
    expect(chart.find((r) => r.label === "Any seven")?.payout).toBe("4:1");
    expect(chart).toHaveLength(19);
  });
});

/**
 * Settlement and edge must agree. For each bet, this enumerates all 36 dice through the real
 * `resolveBet` (a Markov chain over the point), computes the exact expected value per decision,
 * and compares it with the analytic edge. A wrong payout, a wrong win condition or a wrong
 * travel rule would all fail here.
 */
describe("settlement agrees with the analytic edge", () => {
  const R = DOWNTOWN_RULES;

  /** Expected net per decision of `bet` when the table point is `point`. */
  function decisionEv(bet: Bet, point: PointNumber | null, depth = 0): number {
    if (depth > 3) throw new Error("runaway recursion");
    let sum = 0;
    let decisive = 0;
    for (const d of allDice()) {
      const t = diceTotal(d);
      const r = resolveBet(bet, d, point, R);
      if (r.outcome === "travel" && r.remains) {
        sum += decisionEv(r.remains, point, depth + 1);
        decisive++;
      } else if (
        r.outcome === "stay" &&
        (bet.kind === "pass" || bet.kind === "dontPass") &&
        point === null &&
        isPointNumber(t)
      ) {
        sum += decisionEv(bet, t, depth + 1);
        decisive++;
      } else if (r.outcome === "stay" || r.outcome === "off") {
        continue;
      } else {
        sum += netOf(r);
        decisive++;
      }
    }
    return sum / decisive;
  }

  const base = { id: "x", owner: "you" };

  it("pass, don't pass, come, don't come", () => {
    expect(-decisionEv({ ...base, kind: "pass", amount: 1, odds: 0 }, null)).toBeCloseTo(
      passEdge(),
      12,
    );
    expect(-decisionEv({ ...base, kind: "dontPass", amount: 1, odds: 0 }, null)).toBeCloseTo(
      dontPassEdge(),
      12,
    );
    expect(-decisionEv({ ...base, kind: "come", amount: 1, point: null, odds: 0 }, 6)).toBeCloseTo(
      passEdge(),
      12,
    );
    expect(
      -decisionEv({ ...base, kind: "dontCome", amount: 1, point: null, odds: 0 }, 6),
    ).toBeCloseTo(dontPassEdge(), 12);
  });

  it("odds and lay odds behind the line are exactly fair", () => {
    for (const p of POINT_NUMBERS) {
      // EV of (flat + odds) minus EV of the flat alone = EV of the odds = 0.
      const odds = 60;
      const withOdds = decisionEv({ ...base, kind: "pass", amount: 10, odds }, p);
      const flat = decisionEv({ ...base, kind: "pass", amount: 10, odds: 0 }, p);
      expect(withOdds - flat).toBeCloseTo(0, 10);
      const lay = decisionEv({ ...base, kind: "dontPass", amount: 10, odds }, p);
      const dpFlat = decisionEv({ ...base, kind: "dontPass", amount: 10, odds: 0 }, p);
      expect(lay - dpFlat).toBeCloseTo(0, 10);
    }
  });

  it("place, buy and lay on every number", () => {
    for (const n of POINT_NUMBERS) {
      const place = decisionEv({ ...base, kind: "place", number: n, amount: 30 }, 6);
      expect(-place / 30).toBeCloseTo(placeEdge(n), 12);
      const buy = decisionEv({ ...base, kind: "buy", number: n, amount: 20 }, 6);
      expect(-buy / 20).toBeCloseTo(buyEdge(n, R), 12);
      const layAmount = n === 4 || n === 10 ? 40 : n === 5 || n === 9 ? 30 : 24;
      const lay = decisionEv({ ...base, kind: "lay", number: n, amount: layAmount }, 6);
      expect(-lay / layAmount).toBeCloseTo(layEdge(n, R), 12);
    }
  });

  it("hardways", () => {
    for (const n of [4, 6, 8, 10] as const) {
      const ev = decisionEv({ ...base, kind: "hard", number: n, amount: 1 }, 5);
      expect(-ev).toBeCloseTo(hardEdge(n), 12);
    }
  });

  it("field (double and triple 12) and every center bet", () => {
    expect(-decisionEv({ ...base, kind: "field", amount: 1 }, null)).toBeCloseTo(fieldEdge(R), 12);
    for (const k of ["anySeven", "anyCraps", "yo", "aces", "aceDeuce", "twelve"] as const) {
      expect(-decisionEv({ ...base, kind: k, amount: 1 }, null)).toBeCloseTo(oneRollEdge(k), 12);
    }
  });
});

describe("blended edge", () => {
  const R = DOWNTOWN_RULES;

  it("weights each bet by its money", () => {
    expect(blendedEdge([])).toBe(0);
    expect(
      blendedEdge([
        { amount: 10, edge: passEdge() },
        { amount: 10, edge: 0 },
      ]),
    ).toBeCloseTo(passEdge() / 2, 12);
  });

  it("odds money pulls the table edge down", () => {
    const pass: Bet = { id: "a", owner: "you", kind: "pass", amount: 10, odds: 0 };
    const withOdds: Bet = { ...pass, odds: 50 };
    expect(tableEdge([pass], R)).toBeCloseTo(passEdge(), 12);
    expect(tableEdge([withOdds], R)).toBeCloseTo(passEdge() / 6, 12);
  });

  it("pass $10 + odds $50 + place 8 $18 ≈ 0.53%", () => {
    const bets: Bet[] = [
      { id: "a", owner: "you", kind: "pass", amount: 10, odds: 50 },
      { id: "b", owner: "you", kind: "place", number: 8, amount: 18 },
    ];
    expect(tableEdge(bets, R)).toBeCloseTo((10 * passEdge() + 18 * placeEdge(8)) / 78, 12);
  });
});
