import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/rng";
import { PAYOUTS, getLayout, straightId } from "./layout";
import {
  type Bet,
  addChips,
  createRouletteSession,
  normalizeBets,
  playSpin,
  recentPockets,
  removeChips,
  sessionNet,
  settleBets,
  spinPocket,
  spinWheel,
  totalStake,
  validateBets,
} from "./spin";
import {
  AMERICAN_RULES,
  DOUBLE_ZERO,
  EUROPEAN_RULES,
  FRENCH_RULES,
  type Pocket,
  type RouletteRules,
} from "./wheel";

const bet = (spotId: string, amount: number): Bet => ({ spotId, amount });

describe("payouts", () => {
  it("pays every spot its published odds on a win, stake included", () => {
    for (const rules of [EUROPEAN_RULES, AMERICAN_RULES]) {
      for (const spot of getLayout(rules).spots) {
        const pocket = spot.pockets[0] as Pocket;
        const s = settleBets(rules, [bet(spot.id, 10)], pocket);
        expect(s.results[0]?.outcome).toBe("win");
        expect(s.returned).toBe(10 * (PAYOUTS[spot.type] + 1));
        expect(s.net).toBe(10 * PAYOUTS[spot.type]);
      }
    }
  });

  it("publishes the standard payout table", () => {
    expect(PAYOUTS).toMatchObject({
      straight: 35,
      split: 17,
      street: 11,
      corner: 8,
      sixLine: 5,
      topLine: 6,
      dozen: 2,
      column: 2,
      red: 1,
      low: 1,
    });
  });

  it("takes the whole stake on a loss", () => {
    const s = settleBets(EUROPEAN_RULES, [bet("straight:17", 5)], 18);
    expect(s.results[0]).toMatchObject({ outcome: "lose", returned: 0, net: -5 });
  });

  it("settles the design's $40 table: 17 straight, red, 2nd dozen", () => {
    const bets = [bet("straight:17", 5), bet("red", 25), bet("dozen:2", 10)];
    expect(totalStake(bets)).toBe(40);
    // 17 is black: straight and dozen win, red loses.
    expect(settleBets(EUROPEAN_RULES, bets, 17).net).toBe(175 + 20 - 25);
    // 14 is red, 2nd dozen: straight loses.
    expect(settleBets(EUROPEAN_RULES, bets, 14).net).toBe(-5 + 25 + 20);
    expect(settleBets(EUROPEAN_RULES, bets, 0).net).toBe(-40);
  });

  it("rejects an unknown spot at settlement", () => {
    expect(() => settleBets(EUROPEAN_RULES, [bet("split:3-4", 5)], 3)).toThrow();
    expect(() => settleBets(EUROPEAN_RULES, [bet("straight:00", 5)], 3)).toThrow();
  });
});

describe("La Partage", () => {
  it("returns half of an even-money bet when the ball lands on zero", () => {
    for (const id of ["red", "black", "odd", "even", "low", "high"]) {
      const s = settleBets(FRENCH_RULES, [bet(id, 10)], 0);
      expect(s.results[0]).toMatchObject({ outcome: "halfBack", returned: 5, net: -5 });
    }
  });

  it("does not touch other bets or non-zero results", () => {
    expect(settleBets(FRENCH_RULES, [bet("dozen:1", 10)], 0).net).toBe(-10);
    expect(settleBets(FRENCH_RULES, [bet("split:1-2", 10)], 0).net).toBe(-10);
    expect(settleBets(FRENCH_RULES, [bet("red", 10)], 2).net).toBe(-10);
    expect(settleBets(FRENCH_RULES, [bet("red", 10)], 1).net).toBe(10);
  });

  it("is off on the plain European table", () => {
    expect(settleBets(EUROPEAN_RULES, [bet("red", 10)], 0).net).toBe(-10);
  });

  it("applies to both zeros when switched on for an American wheel", () => {
    const rules: RouletteRules = { ...AMERICAN_RULES, laPartage: true };
    expect(settleBets(rules, [bet("even", 10)], DOUBLE_ZERO).net).toBe(-5);
    expect(settleBets(rules, [bet("even", 10)], 0).net).toBe(-5);
  });
});

describe("bet building and validation", () => {
  it("adds, merges and removes chips", () => {
    let bets = addChips([], "straight:17", 5);
    bets = addChips(bets, "straight:17", 5);
    bets = addChips(bets, "red", 25);
    expect(bets).toEqual([bet("straight:17", 10), bet("red", 25)]);
    bets = removeChips(bets, "straight:17", 10);
    expect(bets).toEqual([bet("red", 25)]);
    expect(normalizeBets([bet("red", 5), bet("odd", 5), bet("red", 5)])).toEqual([
      bet("red", 10),
      bet("odd", 5),
    ]);
  });

  it("accepts a legal table", () => {
    expect(
      validateBets(EUROPEAN_RULES, [bet("straight:17", 5), bet("red", 25), bet("dozen:2", 10)]),
    ).toEqual([]);
  });

  it("counts the inside minimum across all inside bets combined", () => {
    expect(validateBets(EUROPEAN_RULES, [bet("straight:17", 1)]).map((i) => i.code)).toEqual([
      "below-inside-min",
    ]);
    const fiveSingles = [1, 2, 3, 4, 5].map((n) => bet(straightId(n), 1));
    expect(validateBets(EUROPEAN_RULES, fiveSingles)).toEqual([]);
  });

  it("holds each outside bet to the table minimum and every spot to the maximum", () => {
    expect(validateBets(EUROPEAN_RULES, [bet("red", 4)]).map((i) => i.code)).toEqual([
      "below-table-min",
    ]);
    expect(validateBets(EUROPEAN_RULES, [bet("red", 1001)]).map((i) => i.code)).toEqual([
      "above-table-max",
    ]);
    expect(
      validateBets(EUROPEAN_RULES, [bet("red", 600), bet("red", 600)]).map((i) => i.code),
    ).toEqual(["above-table-max"]);
  });

  it("rejects illegal spots and non-positive amounts", () => {
    expect(validateBets(EUROPEAN_RULES, [bet("split:3-4", 5)]).map((i) => i.code)).toEqual([
      "unknown-spot",
    ]);
    expect(validateBets(EUROPEAN_RULES, [bet("topLine:0-00-1-2-3", 5)])[0]?.code).toBe(
      "unknown-spot",
    );
    expect(validateBets(EUROPEAN_RULES, [bet("red", -5)])[0]?.code).toBe("non-positive");
    expect(validateBets(EUROPEAN_RULES, [bet("red", Number.NaN)])[0]?.code).toBe("non-positive");
  });
});

describe("spinning", () => {
  it("is deterministic for a seed", () => {
    const a = Array.from({ length: 50 }, (_, i) => spinPocket(EUROPEAN_RULES, 42, i));
    const b = Array.from({ length: 50 }, (_, i) => spinPocket(EUROPEAN_RULES, 42, i));
    const c = Array.from({ length: 50 }, (_, i) => spinPocket(EUROPEAN_RULES, 43, i));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("pins the first spins of seed 1 so a change to the draw is caught", () => {
    expect(Array.from({ length: 8 }, (_, i) => spinPocket(EUROPEAN_RULES, 1, i)))
      .toMatchInlineSnapshot(`
      [
        7,
        25,
        12,
        20,
        15,
        27,
        31,
        0,
      ]
    `);
  });

  it("lands on every pocket, roughly uniformly, on both wheels", () => {
    for (const rules of [EUROPEAN_RULES, AMERICAN_RULES]) {
      const pockets = getLayout(rules).pockets;
      const n = 200 * pockets.length;
      const counts = new Map<Pocket, number>();
      for (let i = 0; i < n; i++) {
        const p = spinPocket(rules, 7, i);
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      expect(counts.size).toBe(pockets.length);
      // Chi-square against uniform; the 99.9% critical value for 36–37 dof is ~67.
      const chi = [...counts.values()].reduce((s, c) => s + (c - 200) ** 2 / 200, 0);
      expect(chi).toBeLessThan(67);
    }
  });

  it("spins from an injected Rng", () => {
    const r1 = createRng(9);
    const r2 = createRng(9);
    expect(spinWheel(AMERICAN_RULES, r1)).toBe(spinWheel(AMERICAN_RULES, r2));
  });
});

describe("session history", () => {
  it("records spins, bankroll and recent pockets newest first", () => {
    let s = createRouletteSession({ rules: EUROPEAN_RULES, seed: 2026, bankroll: 1000 });
    const bets = [bet("red", 10), bet("straight:17", 5)];
    for (let i = 0; i < 10; i++) s = playSpin(s, bets);
    expect(s.history).toHaveLength(10);
    expect(s.history.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s.history.map((r) => r.pocket)).toEqual(
      Array.from({ length: 10 }, (_, i) => spinPocket(EUROPEAN_RULES, 2026, i)),
    );
    const net = s.history.reduce((sum, r) => sum + r.settlement.net, 0);
    expect(sessionNet(s)).toBe(net);
    expect(s.history.at(-1)?.bankrollAfter).toBe(s.bankroll);
    expect(recentPockets(s, 3)).toEqual(
      s.history
        .slice(-3)
        .map((r) => r.pocket)
        .reverse(),
    );
  });

  it("replays identically from the same seed", () => {
    const run = () => {
      let s = createRouletteSession({ rules: AMERICAN_RULES, seed: 5, bankroll: 500 });
      for (let i = 0; i < 20; i++) s = playSpin(s, [bet("odd", 5)]);
      return s;
    };
    expect(run()).toEqual(run());
  });

  it("does not mutate the previous session", () => {
    const s0 = createRouletteSession({ rules: EUROPEAN_RULES, seed: 1, bankroll: 100 });
    playSpin(s0, [bet("red", 10)]);
    expect(s0.history).toEqual([]);
    expect(s0.bankroll).toBe(100);
  });

  it("refuses bets that break the limits or exceed the bankroll", () => {
    const s = createRouletteSession({ rules: EUROPEAN_RULES, seed: 1, bankroll: 20 });
    expect(() => playSpin(s, [bet("red", 2)])).toThrow(/minimum/);
    expect(() => playSpin(s, [bet("red", 25)])).toThrow(/bankroll/);
    expect(() => playSpin(s, [bet("red", -5)])).toThrow(/positive/);
  });

  it("allows a spin with nothing on the felt", () => {
    const s = playSpin(createRouletteSession({ rules: EUROPEAN_RULES, seed: 1, bankroll: 20 }), []);
    expect(s.history).toHaveLength(1);
    expect(s.bankroll).toBe(20);
  });
});
