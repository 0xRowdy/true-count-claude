import { describe, expect, it } from "vitest";
import {
  INITIAL_PROGRESSION,
  type StrategyPlan,
  lossesUntilOverMax,
  martingaleBet,
  nextProgression,
  simulatePlan,
  simulatePlanMany,
  stakeForSpin,
} from "./plan";
import type { Bet } from "./spin";
import { EUROPEAN_RULES } from "./wheel";

const bet = (spotId: string, amount: number): Bet => ({ spotId, amount });

const plan = (overrides: Partial<StrategyPlan> = {}): StrategyPlan => ({
  rules: EUROPEAN_RULES,
  bets: [bet("red", 10)],
  progression: "flat",
  session: { maxSpins: 60 },
  ...overrides,
});

describe("progressions", () => {
  it("flat never moves", () => {
    expect(nextProgression("flat", { multiplier: 1 }, -10)).toEqual({ multiplier: 1 });
  });

  it("Martingale doubles after a loss and resets after a win", () => {
    let s = INITIAL_PROGRESSION;
    s = nextProgression("martingale", s, -10);
    s = nextProgression("martingale", s, -20);
    expect(s.multiplier).toBe(4);
    s = nextProgression("martingale", s, 0);
    expect(s.multiplier).toBe(4);
    s = nextProgression("martingale", s, 40);
    expect(s.multiplier).toBe(1);
  });

  it("D'Alembert adds a unit after a loss and removes one after a win, floored at one", () => {
    let s = INITIAL_PROGRESSION;
    s = nextProgression("dalembert", s, -1);
    s = nextProgression("dalembert", s, -1);
    expect(s.multiplier).toBe(3);
    s = nextProgression("dalembert", s, 1);
    expect(s.multiplier).toBe(2);
    s = nextProgression("dalembert", s, 1);
    s = nextProgression("dalembert", s, 1);
    expect(s.multiplier).toBe(1);
  });

  it("finds the Martingale streak that breaks the table max", () => {
    expect(martingaleBet(100, 6)).toBe(6400);
    expect(lossesUntilOverMax(100, 5000)).toBe(6);
    expect(lossesUntilOverMax(5, 1000)).toBe(8); // 5 × 2^8 = 1,280
    expect(() => lossesUntilOverMax(0, 100)).toThrow();
  });

  it("caps each bet at the table maximum", () => {
    const { bets, capped } = stakeForSpin(EUROPEAN_RULES, [bet("red", 100), bet("odd", 10)], 16);
    expect(bets).toEqual([bet("red", 1000), bet("odd", 160)]);
    expect(capped).toBe(true);
  });
});

describe("simulatePlan", () => {
  it("is deterministic for a seed", () => {
    const p = plan({ progression: "martingale" });
    expect(simulatePlan(p, 11)).toEqual(simulatePlan(p, 11));
    expect(simulatePlan(p, 11)).not.toEqual(simulatePlan(p, 12));
  });

  it("runs max spins with no stop lines", () => {
    const r = simulatePlan(plan({ session: { maxSpins: 60 } }), 3);
    expect(r.spins).toHaveLength(60);
    expect(r.stopReason).toBe("maxSpins");
    expect(r.finalNet).toBe(r.spins.at(-1)?.cumulative);
    expect(r.spins.every((s) => s.staked === 10 && s.multiplier === 1)).toBe(true);
  });

  it("stops at the stop-when-up and stop-when-down lines", () => {
    const rules = { stopWhenUp: 200, stopWhenDown: 300, maxSpins: 100_000 };
    for (let seed = 0; seed < 20; seed++) {
      const r = simulatePlan(plan({ bets: [bet("red", 25)], session: rules }), seed);
      expect(["stopWhenUp", "stopWhenDown"]).toContain(r.stopReason);
      if (r.stopReason === "stopWhenUp") expect(r.finalNet).toBeGreaterThanOrEqual(200);
      else expect(r.finalNet).toBeLessThanOrEqual(-300);
      // It stopped the moment it crossed, not later.
      const before = r.spins.at(-2)?.cumulative ?? 0;
      expect(before).toBeGreaterThan(-300);
      expect(before).toBeLessThan(200);
    }
  });

  it("follows the Martingale sequence spin by spin", () => {
    const r = simulatePlan(plan({ progression: "martingale" }), 99);
    for (let i = 1; i < r.spins.length; i++) {
      const prev = r.spins[i - 1];
      const cur = r.spins[i];
      if (!prev || !cur) continue;
      const expected = prev.net < 0 ? prev.multiplier * 2 : 1;
      expect(cur.multiplier).toBe(expected);
    }
  });

  it("stops when the next stake exceeds the bankroll", () => {
    const r = simulatePlan(
      plan({ progression: "martingale", bankroll: 70, session: { maxSpins: 1000 } }),
      1,
    );
    if (r.stopReason === "bankroll") {
      const next = (r.spins.at(-1)?.net ?? 0) < 0 ? (r.spins.at(-1)?.staked ?? 0) * 2 : 10;
      expect(next).toBeGreaterThan(70 + r.finalNet);
    } else {
      expect(r.stopReason).toBe("maxSpins");
    }
  });

  it("records hitting the table max under a long Martingale", () => {
    const summary = simulatePlanMany(
      plan({ bets: [bet("red", 100)], progression: "martingale", session: { maxSpins: 500 } }),
      1,
      50,
    );
    expect(summary.hitTableMaxSessions).toBeGreaterThan(0);
  });

  it("rejects an illegal layout", () => {
    expect(() => simulatePlan(plan({ bets: [bet("split:3-4", 5)] }), 1)).toThrow();
  });
});

describe("simulatePlanMany", () => {
  it("converges on the house edge whatever the progression", () => {
    for (const progression of ["flat", "martingale", "dalembert"] as const) {
      const s = simulatePlanMany(
        plan({ progression, bets: [bet("red", 5)], session: { maxSpins: 200 } }),
        1000,
        400,
      );
      expect(s.sessions).toBe(400);
      // 80,000 spins: the realised edge lands within a couple of points of 2.70%.
      expect(s.realisedEdge).toBeGreaterThan(-0.01);
      expect(s.realisedEdge).toBeLessThan(0.06);
    }
  });

  it("counts every stop reason once per session", () => {
    const s = simulatePlanMany(
      plan({ session: { stopWhenUp: 50, stopWhenDown: 50, maxSpins: 60 } }),
      7,
      100,
    );
    const total = Object.values(s.stopReasons).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    expect(s.worstNet).toBeLessThanOrEqual(s.bestNet);
  });
});
