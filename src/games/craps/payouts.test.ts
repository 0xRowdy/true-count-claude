import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/rng";
import {
  type PointNumber,
  POINT_NUMBERS,
  allDice,
  buyCommission,
  commissionOn,
  deriveSeed,
  dice,
  diceTotal,
  exactStep,
  fieldMultiple,
  hardPayout,
  isExactAmount,
  isHard,
  layCommission,
  layOddsPayout,
  maxLayOdds,
  maxOdds,
  maxOddsMultiple,
  oddsPayout,
  placePayout,
  probabilityBeforeSeven,
  probabilityOfTotal,
  rollDice,
  roundToStep,
  trueOdds,
  unitHint,
  waysToRoll,
  CRAPS_PRESETS,
  DOWNTOWN_RULES,
  formatDollars,
  formatPercent,
  formatSignedDollars,
  oddsLabel,
  tableLabel,
  validateCrapsRules,
  upfrontCommission,
} from "./index";

describe("dice", () => {
  it("has 36 combinations with the textbook ways per total", () => {
    const expected = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(waysToRoll)).toEqual(expected);
    expect(allDice()).toHaveLength(36);
    const tally = new Map<number, number>();
    for (const d of allDice()) tally.set(diceTotal(d), (tally.get(diceTotal(d)) ?? 0) + 1);
    for (let t = 2; t <= 12; t++) expect(tally.get(t)).toBe(waysToRoll(t));
    expect(waysToRoll(1)).toBe(0);
    expect(waysToRoll(13)).toBe(0);
  });

  it("knows the hardways: pairs on 4, 6, 8, 10 only", () => {
    expect(isHard(dice(3, 3))).toBe(true);
    expect(isHard(dice(2, 2))).toBe(true);
    expect(isHard(dice(5, 5))).toBe(true);
    expect(isHard(dice(4, 4))).toBe(true);
    expect(isHard(dice(1, 1))).toBe(false); // aces are not a hardway
    expect(isHard(dice(6, 6))).toBe(false);
    expect(isHard(dice(4, 2))).toBe(false);
    expect(() => dice(0, 7)).toThrow();
  });

  it("computes number-before-seven probabilities", () => {
    expect(probabilityBeforeSeven(4)).toBeCloseTo(1 / 3, 12);
    expect(probabilityBeforeSeven(5)).toBeCloseTo(2 / 5, 12);
    expect(probabilityBeforeSeven(6)).toBeCloseTo(5 / 11, 12);
    expect(probabilityOfTotal(7)).toBeCloseTo(1 / 6, 12);
  });

  it("true odds are 2:1, 3:2, 6:5", () => {
    expect(trueOdds(4)).toEqual([2, 1]);
    expect(trueOdds(10)).toEqual([2, 1]);
    expect(trueOdds(5)).toEqual([3, 2]);
    expect(trueOdds(9)).toEqual([3, 2]);
    expect(trueOdds(6)).toEqual([6, 5]);
    expect(trueOdds(8)).toEqual([6, 5]);
  });

  it("rolls are reproducible per seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const rollsA = Array.from({ length: 50 }, () => rollDice(a));
    const rollsB = Array.from({ length: 50 }, () => rollDice(b));
    expect(rollsA).toEqual(rollsB);
    const c = createRng(43);
    expect(Array.from({ length: 50 }, () => rollDice(c))).not.toEqual(rollsA);
  });

  it("pins the first rolls of seed 2026 (a change here changes every replay)", () => {
    const rng = createRng(2026);
    const first = Array.from({ length: 8 }, () => {
      const d = rollDice(rng);
      return `${d.d1}${d.d2}`;
    });
    expect(first).toMatchInlineSnapshot(`
      [
        "32",
        "44",
        "12",
        "55",
        "21",
        "14",
        "31",
        "22",
      ]
    `);
  });

  it("rolls fair dice: every total within 2% of its probability over 360k rolls", () => {
    const rng = createRng(7);
    const n = 360_000;
    const counts = new Array<number>(13).fill(0);
    for (let i = 0; i < n; i++) counts[diceTotal(rollDice(rng))]!++;
    for (let t = 2; t <= 12; t++) {
      expect(Math.abs(counts[t]! / n - probabilityOfTotal(t))).toBeLessThan(
        0.02 * probabilityOfTotal(t) + 0.001,
      );
    }
  });

  it("derives distinct, stable seeds", () => {
    expect(deriveSeed(1, 0)).toBe(deriveSeed(1, 0));
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(deriveSeed(99, i));
    expect(seen.size).toBe(1000);
    expect(deriveSeed(1, 5)).not.toBe(deriveSeed(2, 5));
  });
});

describe("payouts", () => {
  it("place bets: 9:5 on 4/10, 7:5 on 5/9, 7:6 on 6/8", () => {
    expect(placePayout(6, 12)).toBe(14); // the design: place 6 for $12 pays $14
    expect(placePayout(8, 12)).toBe(14);
    expect(placePayout(8, 18)).toBe(21); // pressed to $18 pays $21
    expect(placePayout(6, 30)).toBe(35);
    expect(placePayout(5, 10)).toBe(14);
    expect(placePayout(9, 25)).toBe(35);
    expect(placePayout(4, 10)).toBe(18);
    expect(placePayout(10, 25)).toBe(45);
  });

  it("rounds breakage down, as a real table does", () => {
    expect(placePayout(6, 10)).toBe(11); // 11.67
    expect(placePayout(5, 6)).toBe(8); // 8.4
    expect(oddsPayout(5, 25)).toBe(37); // 37.5
  });

  it("odds pay true odds", () => {
    expect(oddsPayout(6, 30)).toBe(36); // the design: $30 odds on 6 → "10 + 36 odds"
    expect(oddsPayout(8, 125)).toBe(150);
    expect(oddsPayout(4, 30)).toBe(60);
    expect(oddsPayout(10, 75)).toBe(150);
    expect(oddsPayout(5, 40)).toBe(60);
    expect(oddsPayout(9, 40)).toBe(60);
  });

  it("lay odds pay the inverse", () => {
    expect(layOddsPayout(4, 60)).toBe(30);
    expect(layOddsPayout(5, 60)).toBe(40);
    expect(layOddsPayout(6, 60)).toBe(50);
    expect(layOddsPayout(10, 40)).toBe(20);
  });

  it("hardways pay 9:1 on 6/8 and 7:1 on 4/10", () => {
    expect(hardPayout(6, 5)).toBe(45);
    expect(hardPayout(8, 1)).toBe(9);
    expect(hardPayout(4, 5)).toBe(35);
    expect(hardPayout(10, 2)).toBe(14);
  });

  it("field: 2 and 12 double; triple 12 is configurable", () => {
    for (const t of [3, 4, 9, 10, 11]) expect(fieldMultiple(t, DOWNTOWN_RULES)).toBe(1);
    for (const t of [5, 6, 7, 8]) expect(fieldMultiple(t, DOWNTOWN_RULES)).toBe(0);
    expect(fieldMultiple(2, DOWNTOWN_RULES)).toBe(2);
    expect(fieldMultiple(12, DOWNTOWN_RULES)).toBe(2);
    expect(fieldMultiple(12, { ...DOWNTOWN_RULES, fieldTwelvePays: 3 })).toBe(3);
  });

  it("commission is 5%, rounded down, at least $1", () => {
    expect(buyCommission(20, DOWNTOWN_RULES)).toBe(1);
    expect(buyCommission(25, DOWNTOWN_RULES)).toBe(1);
    expect(buyCommission(40, DOWNTOWN_RULES)).toBe(2);
    expect(buyCommission(10, DOWNTOWN_RULES)).toBe(1); // minimum
    expect(layCommission(4, 40, DOWNTOWN_RULES)).toBe(1); // lay $40 to win $20
    expect(layCommission(6, 120, DOWNTOWN_RULES)).toBe(5); // wins $100
    expect(commissionOn(100, { rate: 0, timing: "on-win", minimum: 1 })).toBe(0);
  });

  it("charges upfront vig only when the table says so", () => {
    expect(upfrontCommission({ kind: "buy", number: 4, amount: 20 }, DOWNTOWN_RULES)).toBe(0);
    const upfront = {
      ...DOWNTOWN_RULES,
      buyCommission: { ...DOWNTOWN_RULES.buyCommission, timing: "upfront" as const },
      layCommission: { ...DOWNTOWN_RULES.layCommission, timing: "upfront" as const },
    };
    expect(upfrontCommission({ kind: "buy", number: 4, amount: 20 }, upfront)).toBe(1);
    expect(upfrontCommission({ kind: "lay", number: 4, amount: 40 }, upfront)).toBe(1);
    expect(upfrontCommission({ kind: "place", number: 6, amount: 12 }, upfront)).toBe(0);
  });
});

describe("units", () => {
  it("exact steps: $6 on place 6/8, $5 on the rest; odds in 5s on 6/8, 2s on 5/9", () => {
    expect(exactStep("place", 6)).toBe(6);
    expect(exactStep("place", 8)).toBe(6);
    expect(exactStep("place", 5)).toBe(5);
    expect(exactStep("place", 4)).toBe(5);
    expect(exactStep("odds", 6)).toBe(5);
    expect(exactStep("odds", 5)).toBe(2);
    expect(exactStep("odds", 4)).toBe(1);
    expect(exactStep("layOdds", 4)).toBe(2);
    expect(exactStep("layOdds", 5)).toBe(3);
    expect(exactStep("layOdds", 6)).toBe(6);
    expect(exactStep("buy", 4)).toBe(20);
    expect(exactStep("lay", 4)).toBe(40);
    expect(exactStep("lay", 5)).toBe(30);
    expect(exactStep("lay", 6)).toBe(24);
  });

  it("every amount in exact steps pays without breakage", () => {
    for (const n of POINT_NUMBERS) {
      for (const kind of ["place", "odds", "layOdds"] as const) {
        const step = exactStep(kind, n);
        for (let k = 1; k <= 20; k++) {
          expect(isExactAmount(kind, n, step * k)).toBe(true);
          const pay =
            kind === "place"
              ? placePayout(n, step * k)
              : kind === "odds"
                ? oddsPayout(n, step * k)
                : layOddsPayout(n, step * k);
          const r = kind === "place" ? placeRatioOf(n) : null;
          if (r) expect(pay * r[1]).toBe(step * k * r[0]);
        }
      }
    }
    expect(isExactAmount("place", 6, 10)).toBe(false);
  });

  it("buy and lay steps carry whole-dollar commission", () => {
    for (const n of POINT_NUMBERS) {
      const buy = exactStep("buy", n);
      expect((buy * 0.05) % 1).toBe(0);
      expect(oddsPayout(n, buy) * trueOdds(n)[1]).toBe(buy * trueOdds(n)[0]);
      const lay = exactStep("lay", n);
      const win = layOddsPayout(n, lay);
      expect(win * trueOdds(n)[0]).toBe(lay * trueOdds(n)[1]);
      expect((win * 0.05) % 1).toBe(0);
    }
  });

  it("rounds to steps", () => {
    expect(roundToStep(10, 6)).toBe(6);
    expect(roundToStep(10, 6, "up")).toBe(12);
    expect(roundToStep(16, 6, "nearest")).toBe(18);
  });

  it("writes the builder's unit hint", () => {
    expect(unitHint("place", 6)).toBe("Steps of $6 so the 7:6 payout comes out exact.");
    expect(unitHint("place", 5)).toBe("Steps of $5 so the 7:5 payout comes out exact.");
    expect(unitHint("odds", 6)).toBe("Steps of $5 so the 6:5 payout comes out exact.");
  });
});

function placeRatioOf(n: PointNumber): [number, number] {
  return n === 6 || n === 8 ? [7, 6] : n === 5 || n === 9 ? [7, 5] : [9, 5];
}

describe("odds limits", () => {
  it("3-4-5x: 3x on 4/10, 4x on 5/9, 5x on 6/8", () => {
    expect(maxOddsMultiple(DOWNTOWN_RULES, 4)).toBe(3);
    expect(maxOddsMultiple(DOWNTOWN_RULES, 10)).toBe(3);
    expect(maxOddsMultiple(DOWNTOWN_RULES, 5)).toBe(4);
    expect(maxOddsMultiple(DOWNTOWN_RULES, 9)).toBe(4);
    expect(maxOddsMultiple(DOWNTOWN_RULES, 6)).toBe(5);
    expect(maxOddsMultiple(DOWNTOWN_RULES, 8)).toBe(5);
    expect(maxOdds(DOWNTOWN_RULES, 8, 25)).toBe(125); // "odds go up to 5x ($125)"
  });

  it("3-4-5x odds always win exactly 6x the flat on a point made", () => {
    for (const p of POINT_NUMBERS) {
      expect(oddsPayout(p, maxOdds(DOWNTOWN_RULES, p, 10))).toBe(60);
    }
  });

  it("lays up to 6x on every number at a 3-4-5x table", () => {
    for (const p of POINT_NUMBERS) expect(maxLayOdds(DOWNTOWN_RULES, p, 10)).toBe(60);
  });

  it("flat-multiple tables: 2x, 10x and 100x", () => {
    for (const [id, m] of [
      ["2x", 2],
      ["10x", 10],
      ["100x", 100],
    ] as const) {
      const rules = CRAPS_PRESETS[id];
      for (const p of POINT_NUMBERS) expect(maxOdds(rules, p, 10)).toBe(10 * m);
      expect(oddsLabel(rules)).toBe(id);
      expect(maxLayOdds(rules, 4, 10)).toBe(20 * m);
      expect(maxLayOdds(rules, 6, 10)).toBe(12 * m);
    }
  });
});

describe("rules", () => {
  it("labels the table as the header does", () => {
    expect(tableLabel(DOWNTOWN_RULES)).toBe("3-4-5x odds · $10–$2,000");
    expect(tableLabel(DOWNTOWN_RULES, 6)).toBe("3-4-5x odds · $10–$2,000 · Point: 6");
  });

  it("validates presets and rejects nonsense", () => {
    for (const rules of Object.values(CRAPS_PRESETS)) expect(validateCrapsRules(rules)).toEqual([]);
    expect(validateCrapsRules({ ...DOWNTOWN_RULES, minBet: 0 })).not.toEqual([]);
    expect(validateCrapsRules({ ...DOWNTOWN_RULES, maxBet: 5 })).not.toEqual([]);
    expect(
      validateCrapsRules({ ...DOWNTOWN_RULES, odds: { kind: "flat", multiple: 0 } }),
    ).not.toEqual([]);
    expect(
      validateCrapsRules({
        ...DOWNTOWN_RULES,
        buyCommission: { rate: 0.5, timing: "on-win", minimum: 1 },
      }),
    ).not.toEqual([]);
  });

  it("formats money without locale", () => {
    expect(formatDollars(2596)).toBe("$2,596");
    expect(formatDollars(1234567)).toBe("$1,234,567");
    expect(formatDollars(-78)).toBe("-$78");
    expect(formatSignedDollars(46)).toBe("+$46");
    expect(formatSignedDollars(-78)).toBe("−$78");
    expect(formatSignedDollars(0)).toBe("$0");
    expect(formatPercent(0.014141)).toBe("1.41%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.1)).toBe("10%");
  });
});
