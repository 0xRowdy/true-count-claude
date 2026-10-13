import { describe, expect, it } from "vitest";
import { cardId } from "../../engine/cards";
import { remainingComposition, verifyComposition } from "../../engine/shoe";
import { bankerDraws, handTotal, isNatural, playerDraws, pointValue } from "./coup";
import { outcomeProbabilities } from "./odds";
import { EZ_BACCARAT, PUNTO_BANCO } from "./rules";
import {
  createBaccaratShoe,
  dealCoup,
  dealWholeShoe,
  isCutCardOut,
  isLastCoup,
  isShoeComplete,
} from "./shoe";

describe("createBaccaratShoe", () => {
  it("holds eight full decks: 416 cards, 32 of every rank", () => {
    const state = createBaccaratShoe(PUNTO_BANCO, 1);
    expect(state.shoe.cards).toHaveLength(416);
    expect(verifyComposition(state.shoe)).toBe(true);
  });

  it("is reproducible from its seed and differs between seeds", () => {
    const a = createBaccaratShoe(PUNTO_BANCO, 7).shoe.cards.map(cardId);
    const b = createBaccaratShoe(PUNTO_BANCO, 7).shoe.cards.map(cardId);
    const c = createBaccaratShoe(PUNTO_BANCO, 8).shoe.cards.map(cardId);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("places the cut card 16 cards from the back", () => {
    expect(createBaccaratShoe(PUNTO_BANCO, 1).shoe.cutIndex).toBe(400);
    expect(createBaccaratShoe({ ...PUNTO_BANCO, cardsBehindCut: 14 }, 1).shoe.cutIndex).toBe(402);
  });

  it("burns as many cards as the exposed card's value, ten for a ten or court card", () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = createBaccaratShoe(PUNTO_BANCO, seed);
      const burn = state.burn;
      if (!burn) throw new Error("expected a burn");
      expect(burn.exposed).toEqual(state.shoe.cards[0]);
      expect(burn.burned).toHaveLength(pointValue(burn.exposed.rank) || 10);
      expect(state.shoe.dealtCount).toBe(1 + burn.burned.length);
    }
  });

  it("skips the burn when the rules say so", () => {
    const state = createBaccaratShoe({ ...PUNTO_BANCO, burn: false }, 3);
    expect(state.burn).toBeNull();
    expect(state.shoe.dealtCount).toBe(0);
  });

  it("rejects invalid rules", () => {
    expect(() => createBaccaratShoe({ ...PUNTO_BANCO, decks: 9 }, 1)).toThrow(/decks/);
  });
});

describe("dealCoup", () => {
  it("deals from the shoe in order and returns a new state without mutating the old one", () => {
    const start = createBaccaratShoe(PUNTO_BANCO, 11);
    const { coup, state } = dealCoup(start);
    const used = coup.player.length + coup.banker.length;
    expect(state.shoe.dealtCount).toBe(start.shoe.dealtCount + used);
    expect(start.coups).toHaveLength(0);
    expect(state.coups).toEqual([coup]);
    const top = start.shoe.cards.slice(start.shoe.dealtCount, start.shoe.dealtCount + 4);
    expect([coup.player[0], coup.banker[0], coup.player[1], coup.banker[1]]).toEqual(top);
  });

  it("deals exactly one more coup after the cut card comes out, then the shoe is complete", () => {
    let state = createBaccaratShoe(PUNTO_BANCO, 5);
    while (!isCutCardOut(state)) {
      expect(isLastCoup(state)).toBe(false);
      state = dealCoup(state).state;
    }
    const cutCoup = state.cutCardCoup as number;
    expect(cutCoup).toBe(state.coups.length - 1);
    expect(state.shoe.dealtCount).toBeGreaterThanOrEqual(state.shoe.cutIndex);
    expect(isLastCoup(state)).toBe(true);
    expect(isShoeComplete(state)).toBe(false);

    state = dealCoup(state).state;
    expect(state.cutCardCoup).toBe(cutCoup);
    expect(isShoeComplete(state)).toBe(true);
    expect(() => dealCoup(state)).toThrow(/Shoe complete/);
  });

  it("over many whole shoes: never runs dry, conserves cards, and follows the tableau every coup", () => {
    for (let seed = 0; seed < 300; seed++) {
      const rules = seed % 2 ? PUNTO_BANCO : EZ_BACCARAT;
      const start = createBaccaratShoe(rules, seed);
      const done = dealWholeShoe(start);
      const used = done.coups.reduce((n, c) => n + c.player.length + c.banker.length, 0);
      expect(done.shoe.dealtCount).toBe(start.shoe.dealtCount + used);
      expect(done.shoe.dealtCount).toBeLessThanOrEqual(416);
      expect(Object.values(remainingComposition(done.shoe)).reduce((a, b) => a + b, 0)).toBe(
        416 - done.shoe.dealtCount,
      );

      for (const coup of done.coups) {
        const p2 = coup.player.slice(0, 2);
        const b2 = coup.banker.slice(0, 2);
        if (isNatural(p2) || isNatural(b2)) {
          expect(coup.player.length + coup.banker.length).toBe(4);
          continue;
        }
        expect(coup.player.length === 3).toBe(playerDraws(handTotal(p2)));
        const third = coup.player[2];
        expect(coup.banker.length === 3).toBe(
          bankerDraws(handTotal(b2), third ? pointValue(third.rank) : null),
        );
      }
    }
  });

  it("simulated results sit inside the exact probabilities' band", () => {
    let player = 0;
    let banker = 0;
    let tie = 0;
    for (let seed = 1000; seed < 1600; seed++) {
      for (const coup of dealWholeShoe(createBaccaratShoe(PUNTO_BANCO, seed)).coups) {
        if (coup.winner === "player") player++;
        else if (coup.winner === "banker") banker++;
        else tie++;
      }
    }
    const n = player + banker + tie;
    const exact = outcomeProbabilities(8);
    // Four standard errors: a false failure is ~1 in 16,000 runs, and the seeds are fixed.
    for (const [observed, p] of [
      [player, exact.player],
      [banker, exact.banker],
      [tie, exact.tie],
    ] as const) {
      const se = Math.sqrt((p * (1 - p)) / n);
      expect(Math.abs(observed / n - p)).toBeLessThan(4 * se);
    }
  });
});
