import { describe, expect, it } from "vitest";
import type { Card, Rank } from "../../engine/cards";
import { playCoupFrom } from "./coup";
import { expectedValue, houseEdge, houseEdgeTable, outcomeProbabilities } from "./odds";
import { type BaccaratRules, EZ_BACCARAT, PUNTO_BANCO } from "./rules";

/**
 * Published 8-deck figures (Wizard of Odds, "Baccarat" and "EZ Baccarat"), to four
 * decimal places of a percent. The engine's numbers are computed, not copied; these
 * are what they must agree with.
 */
const PUBLISHED_8_DECK = {
  player: 0.446247,
  banker: 0.458597,
  tie: 0.095156,
  dragon7: 0.022534,
  panda8: 0.034543,
};

describe("outcomeProbabilities — exact enumeration of the 8-deck shoe", () => {
  const p = outcomeProbabilities(8);

  it("matches the published Player / Banker / Tie probabilities", () => {
    expect(p.player).toBeCloseTo(PUBLISHED_8_DECK.player, 6);
    expect(p.banker).toBeCloseTo(PUBLISHED_8_DECK.banker, 6);
    expect(p.tie).toBeCloseTo(PUBLISHED_8_DECK.tie, 6);
  });

  it("matches the published Dragon 7 and Panda 8 frequencies", () => {
    expect(p.dragon7).toBeCloseTo(PUBLISHED_8_DECK.dragon7, 6);
    expect(p.panda8).toBeCloseTo(PUBLISHED_8_DECK.panda8, 6);
  });

  it("Player, Banker and Tie are exhaustive", () => {
    expect(p.player + p.banker + p.tie).toBeCloseTo(1, 10);
  });

  it("pair probability is 13 · 32 · 31 / (416 · 415)", () => {
    expect(p.pair).toBeCloseTo((13 * 32 * 31) / (416 * 415), 15);
  });

  it("is memoised per deck count", () => {
    expect(outcomeProbabilities(8)).toBe(p);
    expect(outcomeProbabilities(6)).not.toBe(p);
  });

  /**
   * Independent cross-check: walk every sequence of six card values, weighted by its
   * probability when drawn without replacement, and let the real dealing code
   * (`playCoupFrom`) take as many as it needs. Summing over the unused tail gives each
   * coup's exact probability, so this must agree with `outcomeProbabilities` — which
   * implements the tableau separately — to rounding error.
   */
  it("agrees with the dealing code played over every six-card value sequence", () => {
    const REP: Rank[] = ["K", "A", "2", "3", "4", "5", "6", "7", "8", "9"];
    const reps: Card[] = REP.map((rank) => ({ rank, suit: "s" }));
    const counts = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];
    const seq: number[] = [];
    const totals = { player: 0, banker: 0, tie: 0, dragon7: 0, panda8: 0 };
    let left = 416;

    const walk = (depth: number, prob: number): void => {
      if (depth === 6) {
        let i = 0;
        const coup = playCoupFrom(() => reps[seq[i++] as number] as Card);
        totals[coup.winner] += prob;
        if (coup.dragon7) totals.dragon7 += prob;
        if (coup.panda8) totals.panda8 += prob;
        return;
      }
      for (let v = 0; v < 10; v++) {
        const n = counts[v] as number;
        counts[v] = n - 1;
        seq.push(v);
        left--;
        walk(depth + 1, (prob * n) / (left + 1));
        left++;
        seq.pop();
        counts[v] = n;
      }
    };
    walk(0, 1);

    expect(totals.player).toBeCloseTo(p.player, 10);
    expect(totals.banker).toBeCloseTo(p.banker, 10);
    expect(totals.tie).toBeCloseTo(p.tie, 10);
    expect(totals.dragon7).toBeCloseTo(p.dragon7, 10);
    expect(totals.panda8).toBeCloseTo(p.panda8, 10);
  });
});

/** House edges as a percent, published to four places. */
const cases: [string, BaccaratRules, Parameters<typeof houseEdge>[1], number][] = [
  ["Punto Banco Banker (5% commission)", PUNTO_BANCO, "banker", 1.0579],
  ["Punto Banco Player", PUNTO_BANCO, "player", 1.2351],
  ["Tie at 8:1", PUNTO_BANCO, "tie", 14.3596],
  ["Tie at 9:1", { ...PUNTO_BANCO, tiePays: 9 }, "tie", 4.844],
  ["Player Pair 11:1", PUNTO_BANCO, "playerPair", 10.3614],
  ["Banker Pair 11:1", PUNTO_BANCO, "bankerPair", 10.3614],
  ["EZ Banker (Dragon 7 push)", EZ_BACCARAT, "banker", 1.0183],
  ["EZ Player", EZ_BACCARAT, "player", 1.2351],
  ["EZ Tie at 8:1", EZ_BACCARAT, "tie", 14.3596],
  ["Dragon 7 at 40:1", EZ_BACCARAT, "dragon7", 7.6113],
  ["Panda 8 at 25:1", EZ_BACCARAT, "panda8", 10.1876],
];

describe("houseEdge — against published values", () => {
  it.each(cases)("%s", (_name, rules, bet, published) => {
    expect(houseEdge(rules, bet) * 100).toBeCloseTo(published, 3);
  });

  it("the design's headline: Banker 1.06% vs Player 1.24%", () => {
    expect((houseEdge(PUNTO_BANCO, "banker") * 100).toFixed(2)).toBe("1.06");
    expect((houseEdge(PUNTO_BANCO, "player") * 100).toFixed(2)).toBe("1.24");
    expect((houseEdge(PUNTO_BANCO, "tie") * 100).toFixed(2)).toBe("14.36");
  });

  it("matches published Banker and Tie edges for a 6-deck shoe and Banker for one deck", () => {
    const six = { ...PUNTO_BANCO, decks: 6 };
    expect(houseEdge(six, "banker") * 100).toBeCloseTo(1.0558, 3);
    expect(houseEdge(six, "tie") * 100).toBeCloseTo(14.4382, 3);
    expect(houseEdge({ ...PUNTO_BANCO, decks: 1 }, "banker") * 100).toBeCloseTo(1.0117, 3);
  });

  it("fewer decks: Banker edge falls, Player and Tie edges rise", () => {
    const edges = [1, 2, 4, 6, 8].map((decks) => {
      const rules = { ...PUNTO_BANCO, decks };
      return [houseEdge(rules, "banker"), houseEdge(rules, "player"), houseEdge(rules, "tie")];
    });
    for (let i = 1; i < edges.length; i++) {
      const [b0, p0, t0] = edges[i - 1] as number[];
      const [b1, p1, t1] = edges[i] as number[];
      expect(b1).toBeGreaterThan(b0 as number);
      expect(p1).toBeLessThan(p0 as number);
      expect(t1).toBeLessThan(t0 as number);
    }
  });

  it("expected value is the negative of the edge", () => {
    expect(expectedValue(PUNTO_BANCO, "banker")).toBeCloseTo(-houseEdge(PUNTO_BANCO, "banker"), 15);
  });
});

describe("houseEdgeTable", () => {
  it("lists the offered bets, lowest edge first", () => {
    expect(houseEdgeTable(PUNTO_BANCO).map((r) => [r.bet, r.label])).toEqual([
      ["banker", "1.06%"],
      ["player", "1.24%"],
      ["tie", "14.36%"],
    ]);
    expect(houseEdgeTable(EZ_BACCARAT).map((r) => [r.bet, r.label])).toEqual([
      ["banker", "1.02%"],
      ["player", "1.24%"],
      ["dragon7", "7.61%"],
      ["panda8", "10.19%"],
      ["tie", "14.36%"],
    ]);
  });
});
