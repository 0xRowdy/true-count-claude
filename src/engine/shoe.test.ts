import { describe, expect, it } from "vitest";
import { RANKS } from "./cards";
import { DEFAULT_RULES, type RuleSet } from "./rules";
import {
  cardsRemaining,
  createShoe,
  deal,
  decksRemaining,
  isCutCardReached,
  remainingComposition,
  verifyComposition,
} from "./shoe";

/**
 * ADR-0004: the shoe is provable. These are the assertions the Shoe Integrity Panel
 * shows the user, run on every commit.
 */
describe("shoe integrity", () => {
  const deckCounts = [1, 2, 4, 6, 8];

  it.each(deckCounts)("holds exactly 4x%i of every rank", (decks) => {
    const rules: RuleSet = { ...DEFAULT_RULES, decks };
    const shoe = createShoe(rules, 12345);

    expect(shoe.cards).toHaveLength(decks * 52);
    expect(verifyComposition(shoe)).toBe(true);

    const composition = remainingComposition(shoe);
    for (const rank of RANKS) {
      expect(composition[rank]).toBe(decks * 4);
    }
  });

  it("conserves composition as cards are dealt", () => {
    let shoe = createShoe(DEFAULT_RULES, 999);
    const dealtTally = Object.fromEntries(RANKS.map((r) => [r, 0])) as Record<string, number>;

    for (let i = 0; i < 100; i++) {
      const result = deal(shoe);
      dealtTally[result.card.rank]!++;
      shoe = result.shoe;
    }

    const remaining = remainingComposition(shoe);
    for (const rank of RANKS) {
      // Dealt plus remaining must always equal the original count.
      expect(dealtTally[rank]! + remaining[rank]).toBe(DEFAULT_RULES.decks * 4);
    }
    expect(cardsRemaining(shoe)).toBe(DEFAULT_RULES.decks * 52 - 100);
  });

  it("is reproducible from its seed", () => {
    const a = createShoe(DEFAULT_RULES, 42);
    const b = createShoe(DEFAULT_RULES, 42);
    const c = createShoe(DEFAULT_RULES, 43);

    expect(a.cards).toEqual(b.cards);
    expect(a.cards).not.toEqual(c.cards);
  });

  it("places the cut card according to penetration", () => {
    const shoe = createShoe({ ...DEFAULT_RULES, decks: 6, penetration: 0.75 }, 1);
    expect(shoe.cutIndex).toBe(234); // 6 * 52 * 0.75
    expect(isCutCardReached(shoe)).toBe(false);
  });

  it("reports decks remaining for the true-count conversion", () => {
    let shoe = createShoe({ ...DEFAULT_RULES, decks: 6 }, 7);
    expect(decksRemaining(shoe)).toBe(6);

    for (let i = 0; i < 52; i++) shoe = deal(shoe).shoe;
    expect(decksRemaining(shoe)).toBe(5);
  });

  it("throws a diagnosable error rather than dealing off the end", () => {
    let shoe = createShoe({ ...DEFAULT_RULES, decks: 1 }, 3);
    for (let i = 0; i < 52; i++) shoe = deal(shoe).shoe;
    expect(() => deal(shoe)).toThrow(/Shoe exhausted/);
  });

  it("shuffles without bias across many seeds", () => {
    // A biased shuffle is the defect users accuse trainers of. Check that the first
    // dealt card is not skewed toward any rank over a large sample.
    const tally = Object.fromEntries(RANKS.map((r) => [r, 0])) as Record<string, number>;
    const samples = 13_000;

    for (let seed = 0; seed < samples; seed++) {
      const shoe = createShoe(DEFAULT_RULES, seed);
      tally[deal(shoe).card.rank]!++;
    }

    // Tens are 4/13 of the deck, every other rank 1/13. Allow a generous band.
    const expectedSingle = samples / 13;
    for (const rank of ["A", "2", "5", "9"] as const) {
      expect(tally[rank]!).toBeGreaterThan(expectedSingle * 0.85);
      expect(tally[rank]!).toBeLessThan(expectedSingle * 1.15);
    }
  });
});
