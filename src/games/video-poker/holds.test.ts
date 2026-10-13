import { describe, expect, it } from "vitest";
import { freshDeck } from "../../engine/cards";
import { createRng, shuffleInPlace } from "../../engine/rng";
import { choose, encodeHand } from "./cards";
import { HAND_RANKS, evaluateCodes, type VideoPokerGame } from "./evaluate";
import {
  HOLD_MASKS,
  analyzeHolds,
  drawTarget,
  holdFlags,
  holdMask,
  holdOutcomeCounts,
  isOptimalHold,
  optionForMask,
} from "./holds";
import { getPayTable, type PayTableId } from "./paytables";
import { cards } from "./test-helpers";

/** Brute force: every draw, card by card. Independent of the rank-multiset walk. */
function bruteForceCounts(game: VideoPokerGame, dealt: number[], mask: number): number[] {
  const stub = [...Array(52).keys()].filter((c) => !dealt.includes(c));
  const held = dealt.filter((_, i) => mask & (1 << i));
  const counts = new Array<number>(HAND_RANKS.length).fill(0);
  const hand = [...held];
  const walk = (from: number) => {
    if (hand.length === 5) {
      const code = evaluateCodes(game, hand);
      counts[code] = (counts[code] as number) + 1;
      return;
    }
    for (let i = from; i < stub.length; i++) {
      hand.push(stub[i] as number);
      walk(i + 1);
      hand.pop();
    }
  };
  walk(0);
  return counts;
}

const BRUTE_FORCE_CASES: [VideoPokerGame, string][] = [
  ["jacks-or-better", "5h 5s 9h Qh 2h"],
  ["deuces-wild", "2c 7h 8h Kd Ks"],
  ["double-double-bonus", "Ac Ad 3h 9s Js"],
];

describe("holdOutcomeCounts", () => {
  it.each(BRUTE_FORCE_CASES)(
    "%s: %s matches brute-force enumeration for all 32 holds",
    (game, hand) => {
      const dealt = encodeHand(cards(hand));
      for (const mask of HOLD_MASKS) {
        expect(Array.from(holdOutcomeCounts(game, dealt, mask)), `mask ${mask}`).toEqual(
          bruteForceCounts(game, dealt, mask),
        );
      }
    },
    60_000,
  );

  it("brute-force matches on seeded random deals for the cheaper holds", () => {
    const rng = createRng(7);
    const games: VideoPokerGame[] = ["jacks-or-better", "deuces-wild", "double-double-bonus"];
    for (let deal = 0; deal < 12; deal++) {
      const game = games[deal % 3] as VideoPokerGame;
      const dealt = encodeHand(shuffleInPlace(freshDeck(), rng).slice(0, 5));
      // Holds of two or more cards: at most 16,215 draws each.
      for (const mask of HOLD_MASKS.filter((m) => m.toString(2).split("1").length - 1 >= 2)) {
        expect(Array.from(holdOutcomeCounts(game, dealt, mask))).toEqual(
          bruteForceCounts(game, dealt, mask),
        );
      }
    }
  });

  it("accounts for every draw exactly once", () => {
    const dealt = encodeHand(cards("2c 2d 9h Th Kh"));
    for (const mask of HOLD_MASKS) {
      const counts = holdOutcomeCounts("deuces-wild", dealt, mask);
      const total = counts.reduce((a, b) => a + b, 0);
      const held = mask.toString(2).split("1").length - 1;
      expect(total).toBe(choose(47, 5 - held));
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("analyzeHolds", () => {
  it("ranks the design's hand: four hearts ≈ $6.10 beats the pair of 5s ≈ $4.10 on a $5 bet", () => {
    // Frame xfJEh: 5♥ 5♠ 9♥ Q♥ 2♥ on 9/6 Jacks or Better, 5 coins × $1.
    const analysis = analyzeHolds(cards("5h 5s 9h Qh 2h"), getPayTable("job-9-6"), 5);
    expect(analysis.best.indices).toEqual([0, 2, 3, 4]);
    // 9 flushes and 3 queens among 47 cards: (9 × 6 + 3 × 1) / 47.
    expect(analysis.best.ev).toBeCloseTo(57 / 47, 12);
    expect(analysis.best.ev * 5).toBeCloseTo(6.06, 2);
    const pair = optionForMask(analysis, 0b00011);
    expect(pair.ev * 5).toBeCloseTo(4.12, 2);
    expect(analysis.options[1]).toBe(pair);
    expect(drawTarget(analysis.best, analysis.table, 5)).toBe("flush");
  });

  it("returns all 32 holds, best first, with outcomes that add up", () => {
    const analysis = analyzeHolds(cards("Ah Kd 7c 4s 2h"), getPayTable("job-8-5"));
    expect(analysis.options).toHaveLength(32);
    expect(new Set(analysis.options.map((o) => o.mask)).size).toBe(32);
    for (let i = 1; i < 32; i++) {
      expect(analysis.options[i - 1]!.ev).toBeGreaterThanOrEqual(analysis.options[i]!.ev - 1e-12);
    }
    for (const option of analysis.options) {
      expect(option.outcomes.reduce((a, o) => a + o.probability, 0)).toBeCloseTo(1, 12);
      expect(option.held).toHaveLength(option.indices.length);
    }
  });

  it("breaks a made flush for four to a royal", () => {
    const analysis = analyzeHolds(cards("Ah Kh Qh Jh 3h"), getPayTable("job-9-6"));
    expect(analysis.best.indices).toEqual([0, 1, 2, 3]);
    expect(drawTarget(analysis.best, analysis.table, 5)).toBe("royal-flush");
  });

  it("holds a pat royal, straight flush and full house", () => {
    const table = getPayTable("job-9-6");
    expect(analyzeHolds(cards("Ah Kh Qh Jh Th"), table).best.mask).toBe(31);
    expect(analyzeHolds(cards("9s Ks Qs Js Ts"), table).best.mask).toBe(31);
    expect(analyzeHolds(cards("7c 7d 7h 2s 2c"), table).best.mask).toBe(31);
    expect(analyzeHolds(cards("Ah Kh Qh Jh Th"), table).best.ev).toBe(800);
  });

  it("keeps a low pair over four to an outside straight in Jacks or Better", () => {
    const analysis = analyzeHolds(cards("5c 5d 6h 7s 8c"), getPayTable("job-9-6"));
    expect(analysis.best.indices).toEqual([0, 1]);
  });

  it("keeps every deuce in Deuces Wild and draws to them", () => {
    const analysis = analyzeHolds(cards("2c 2d 7h Kc 9s"), getPayTable("deuces-wild-full-pay"));
    expect(analysis.best.indices).toEqual([0, 1]);
  });

  it("keeps four deuces with any kicker", () => {
    const analysis = analyzeHolds(cards("2c 2d 2h 2s 9s"), getPayTable("deuces-wild-full-pay"));
    expect(analysis.best.ev).toBe(200);
    expect(analysis.best.indices).toEqual([0, 1, 2, 3]);
  });

  it("drops even a 2-4 kicker from three Aces in 9/6 Double Double Bonus", () => {
    // The 400-for-1 kicker quad is tempting, but two draws to the Aces are worth more.
    const table = getPayTable("double-double-bonus-9-6");
    const analysis = analyzeHolds(cards("Ac Ad Ah 3s 9c"), table);
    expect(analysis.best.indices).toEqual([0, 1, 2]);
    expect(optionForMask(analysis, 0b01111).ev).toBeLessThan(analysis.best.ev);
  });

  it("changes the royal's weight with the bet size", () => {
    const table = getPayTable("job-9-6");
    const hand = cards("Ah Kh Qh Jh 9c");
    const five = optionForMask(analyzeHolds(hand, table, 5), 0b01111);
    const one = optionForMask(analyzeHolds(hand, table, 1), 0b01111);
    expect(five.ev - one.ev).toBeCloseTo((800 - 250) / 47, 12);
  });

  it("calls every tied hold optimal", () => {
    const analysis = analyzeHolds(cards("2c 7d 9h Js 4s"), getPayTable("job-9-6"));
    expect(isOptimalHold(analysis, analysis.best.mask)).toBe(true);
    expect(isOptimalHold(analysis, analysis.options[31]!.mask)).toBe(false);
  });

  it("converts between hold flags and masks", () => {
    expect(holdMask([true, false, true, true, true])).toBe(0b11101);
    expect(holdFlags(0b11101)).toEqual([true, false, true, true, true]);
    expect(() => holdMask([true])).toThrow(RangeError);
    const analysis = analyzeHolds(cards("2c 7d 9h Js 4s"), getPayTable("job-9-6"));
    expect(() => optionForMask(analysis, 32)).toThrow(RangeError);
  });

  /**
   * Invariant 3: feedback arrives while the cards are still visible, so all 32 EVs must be
   * ready on every deal. This measures the engine (it is a test; nothing here computes with
   * the clock).
   */
  it("is fast enough to run on every deal", () => {
    const clock = () => globalThis.performance.now();
    const rng = createRng(2026);
    const tables: PayTableId[] = ["job-9-6", "deuces-wild-full-pay", "double-double-bonus-9-6"];
    const deals = Array.from({ length: 60 }, () => shuffleInPlace(freshDeck(), rng).slice(0, 5));
    analyzeHolds(deals[0]!, getPayTable("job-9-6")); // warm up the JIT
    const start = clock();
    deals.forEach((deal, i) => analyzeHolds(deal, getPayTable(tables[i % 3]!)));
    const perDeal = (clock() - start) / deals.length;
    // Typically ~3 ms on a laptop; the bound leaves room for a slow CI runner.
    expect(perDeal).toBeLessThan(50);
  });
});
