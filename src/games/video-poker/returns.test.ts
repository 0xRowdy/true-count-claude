import { beforeAll, describe, expect, it } from "vitest";
import { freshDeck } from "../../engine/cards";
import { createRng, shuffleInPlace } from "../../engine/rng";
import { choose, encodeHand } from "./cards";
import { analyzeHolds, optionForMask } from "./holds";
import { PAY_TABLE_IDS, getPayTable, type PayTableId } from "./paytables";
import {
  dealClasses,
  exactReturn,
  holdEvsBySubsetSums,
  subsetSums,
  type DealClasses,
} from "./returns";

let classes: DealClasses;
beforeAll(() => {
  classes = dealClasses();
}, 180_000);

describe("deal classes", () => {
  it("collapses 2,598,960 deals into 134,459 suit-isomorphism classes", () => {
    expect(classes.length).toBe(134_459);
    expect(classes.sizes.reduce((a, b) => a + b, 0)).toBe(choose(52, 5));
  });
});

describe("exact return to player under perfect play", () => {
  /**
   * The headline promise: the return printed for each machine is recomputed here from every
   * deal, every hold and every draw, and must agree with the published figure to within
   * 0.00005 of a percent (the figures are published to four decimal places of a percent).
   */
  it.each(PAY_TABLE_IDS)(
    "%s matches its published return",
    (id) => {
      const table = getPayTable(id);
      const { returnRate, distinctDeals } = exactReturn(table, 5, classes);
      expect(distinctDeals).toBe(134_459);
      expect(Math.abs(returnRate - table.publishedReturn)).toBeLessThan(5e-7);
    },
    180_000,
  );

  it("pins the headline figures the app prints", () => {
    const pct = (id: PayTableId) => (getPayTable(id).publishedReturn * 100).toFixed(2);
    expect(pct("job-9-6")).toBe("99.54");
    expect(pct("job-8-5")).toBe("97.30");
    expect(pct("deuces-wild-full-pay")).toBe("100.76");
    expect(pct("double-double-bonus-9-6")).toBe("98.98");
  });
});

/**
 * Two algorithms that share nothing but the hand evaluator — rank-multiset combinatorics
 * (holds.ts) and subset sums with inclusion–exclusion (returns.ts) — must agree on every
 * hold of every deal.
 */
describe("cross-check: rank combinatorics vs inclusion–exclusion", () => {
  it.each(["job-9-6", "deuces-wild-full-pay", "double-double-bonus-9-6"] as const)(
    "%s agrees on all 32 holds of 150 seeded deals",
    (id) => {
      const table = getPayTable(id);
      const sums = subsetSums(table, 5);
      const rng = createRng(id.length * 1009);
      for (let deal = 0; deal < 150; deal++) {
        const hand = shuffleInPlace(freshDeck(), rng).slice(0, 5);
        const codes = encodeHand(hand);
        const order = codes.map((code, i) => [code, i] as const).sort((a, b) => a[0] - b[0]);
        const evs = holdEvsBySubsetSums(
          sums,
          order.map(([code]) => code),
        );
        const analysis = analyzeHolds(hand, table, 5);
        for (let sortedMask = 0; sortedMask < 32; sortedMask++) {
          // Translate a mask over sorted cards back to a mask over dealt positions.
          let mask = 0;
          order.forEach(([, position], i) => {
            if (sortedMask & (1 << i)) mask |= 1 << position;
          });
          expect(optionForMask(analysis, mask).ev).toBeCloseTo(evs[sortedMask] as number, 9);
        }
      }
    },
    180_000,
  );
});
