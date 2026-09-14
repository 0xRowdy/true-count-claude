import { describe, expect, it } from "vitest";
import { type Card, RANKS, SUITS, freshDeck } from "./cards";
import {
  COUNTING_SYSTEMS,
  type CountingSystem,
  DEFAULT_COUNTING_SYSTEM,
  DEFAULT_TRUE_COUNT_ROUNDING,
  HI_LO,
  KO,
  OMEGA_II,
  RED_7,
  WONG_HALVES,
  ZEN,
  aceAdjustedRunningCount,
  aceAdjustmentValue,
  aceSideCount,
  aceTrueCountAdjustment,
  bettingTrueCount,
  currentRunningCount,
  deckTagSum,
  getCountingSystem,
  initialRunningCount,
  keyCount,
  runningCount,
  tagFor,
  trueCount,
  verifyBalance,
} from "./counting";
import { DEFAULT_RULES, type RuleSet } from "./rules";
import { createShoe } from "./shoe";

const card = (rank: Card["rank"], suit: Card["suit"] = "s"): Card => ({ rank, suit });

/** Every card in `decks` full decks, in deterministic order. */
const fullShoeCards = (decks: number): Card[] => {
  const cards: Card[] = [];
  for (let i = 0; i < decks; i++) cards.push(...freshDeck());
  return cards;
};

const DECK_COUNTS = [1, 2, 4, 6, 8];
const BALANCED = COUNTING_SYSTEMS.filter((system) => system.balanced);
const UNBALANCED = COUNTING_SYSTEMS.filter((system) => !system.balanced);

/**
 * Invariant 5 and ADR-0004: the shoe is provable. A competitor shipped a count that did not
 * return to zero over a full shoe and a *user* caught it — "the count does not end on 0 when
 * the shoe is finished like it should." This block is the product promise, in assertions.
 */
describe("balanced systems return to exactly zero over a complete shoe", () => {
  it("has four balanced systems to check", () => {
    expect(BALANCED.map((system) => system.id)).toEqual([
      "hi-lo",
      "omega-ii",
      "wong-halves",
      "zen",
    ]);
  });

  for (const system of BALANCED) {
    it.each(DECK_COUNTS)(`${system.name} over %i decks`, (decks) => {
      // Exactly zero, not "close to zero". Wong Halves' fractional tags are all exact
      // binary fractions, so there is no float slack to hide behind.
      expect(runningCount(fullShoeCards(decks), system)).toBe(0);
    });

    it.each(DECK_COUNTS)(`${system.name} over %i shuffled, dealt decks`, (decks) => {
      // The same assertion against a real seeded Shoe, dealt card by card, which is what
      // the Shoe Integrity Panel runs in front of the user.
      const rules: RuleSet = { ...DEFAULT_RULES, decks };
      const shoe = createShoe(rules, 20260914);
      expect(shoe.cards).toHaveLength(decks * 52);
      expect(runningCount(shoe.cards, system)).toBe(0);
    });
  }

  it.each(BALANCED.map((system) => [system.name, system] as const))(
    "%s sums to zero over one deck and reports itself balanced",
    (_name, system) => {
      expect(deckTagSum(system)).toBe(0);
      expect(verifyBalance(system)).toBe(true);
    },
  );

  it("does not report a positive zero as a negative zero", () => {
    // "-0" on a count display reads as a bug to the user, and compares unequal to 0.
    expect(Object.is(runningCount(fullShoeCards(6), HI_LO), 0)).toBe(true);
    expect(Object.is(runningCount(fullShoeCards(6), WONG_HALVES), 0)).toBe(true);
  });
});

/**
 * The tag tables themselves, asserted rank by rank against their published sources.
 * Invariant 4: one wrong cell discredits the whole product, so the tables are audited in CI
 * rather than trusted.
 */
describe("published tag tables", () => {
  // Written in the A,2..9,T shape every published table uses, so a reader can diff them
  // against the book by eye.
  const published: ReadonlyArray<readonly [CountingSystem, readonly number[]]> = [
    [HI_LO, [-1, 1, 1, 1, 1, 1, 0, 0, 0, -1]],
    [KO, [-1, 1, 1, 1, 1, 1, 1, 0, 0, -1]],
    [OMEGA_II, [0, 1, 1, 2, 2, 2, 1, 0, -1, -2]],
    [WONG_HALVES, [-1, 0.5, 1, 1, 1.5, 1, 0.5, 0, -0.5, -1]],
    [ZEN, [-1, 1, 1, 2, 2, 2, 1, 0, 0, -2]],
    // Red 7's base table is the *black* seven; the red override is asserted separately.
    [RED_7, [-1, 1, 1, 1, 1, 1, 0, 0, 0, -1]],
  ];

  it.each(published.map(([system, tags]) => [system.name, system, tags] as const))(
    "%s tags A,2-9,T",
    (_name, system, expected) => {
      const order = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
      expect(order.map((rank) => system.tags[rank])).toEqual(expected);
    },
  );

  it.each(COUNTING_SYSTEMS.map((system) => [system.name, system] as const))(
    "%s tags every rank, and all four ten-ranks alike",
    (_name, system) => {
      for (const rank of RANKS) {
        expect(Number.isFinite(system.tags[rank])).toBe(true);
      }
      for (const rank of ["J", "Q", "K"] as const) {
        expect(system.tags[rank]).toBe(system.tags["10"]);
      }
    },
  );

  it("records levels matching the published classifications", () => {
    expect(HI_LO.level).toBe(1);
    expect(KO.level).toBe(1);
    expect(RED_7.level).toBe(1);
    expect(OMEGA_II.level).toBe(2);
    expect(ZEN.level).toBe(2);
    expect(WONG_HALVES.level).toBe(3);
  });

  it("cites a source for every system", () => {
    for (const system of COUNTING_SYSTEMS) {
      expect(system.source.length).toBeGreaterThan(0);
    }
  });

  it("defaults to Hi-Lo, the system published indexes are quoted against", () => {
    expect(DEFAULT_COUNTING_SYSTEM).toBe(HI_LO);
    expect(getCountingSystem("hi-lo")).toBe(HI_LO);
    expect(getCountingSystem("wong-halves")).toBe(WONG_HALVES);
  });

  it("names every system, because named systems are the point", () => {
    expect(COUNTING_SYSTEMS.map((system) => system.name)).toEqual([
      "Hi-Lo",
      "KO",
      "Omega II",
      "Wong Halves",
      "Zen Count",
      "Red 7",
    ]);
  });
});

/** Suit matters in exactly one system, and getting it wrong silently halves its edge. */
describe("Red 7 distinguishes red sevens from black", () => {
  it("tags red sevens +1 and black sevens 0", () => {
    expect(tagFor(card("7", "h"), RED_7)).toBe(1);
    expect(tagFor(card("7", "d"), RED_7)).toBe(1);
    expect(tagFor(card("7", "s"), RED_7)).toBe(0);
    expect(tagFor(card("7", "c"), RED_7)).toBe(0);
  });

  it("ignores suit for every other rank", () => {
    for (const rank of RANKS) {
      if (rank === "7") continue;
      const tags = SUITS.map((suit) => tagFor(card(rank, suit), RED_7));
      expect(new Set(tags).size).toBe(1);
    }
  });

  it("adds exactly two per deck, from the two red sevens", () => {
    expect(deckTagSum(RED_7)).toBe(2);
    // The same hand of sevens counts differently by colour.
    expect(runningCount([card("7", "h"), card("7", "d")], RED_7)).toBe(2);
    expect(runningCount([card("7", "s"), card("7", "c")], RED_7)).toBe(0);
  });

  it("is otherwise Hi-Lo: a shoe with black sevens only counts like Hi-Lo", () => {
    const blackOnly = freshDeck().filter((c) => c.rank !== "7" || c.suit === "s" || c.suit === "c");
    expect(runningCount(blackOnly, RED_7)).toBe(runningCount(blackOnly, HI_LO));
  });

  it("every other system ignores suit entirely", () => {
    for (const system of COUNTING_SYSTEMS) {
      if (system.id === "red-7") continue;
      for (const rank of RANKS) {
        const tags = SUITS.map((suit) => tagFor(card(rank, suit), system));
        expect(new Set(tags).size).toBe(1);
      }
    }
  });
});

/**
 * An unbalanced system's correctness is entirely in its pivot: start at the right initial
 * running count and the shoe must finish on the pivot at every deck count.
 */
describe("unbalanced systems pivot correctly", () => {
  it("has exactly two unbalanced systems", () => {
    expect(UNBALANCED.map((system) => system.id)).toEqual(["ko", "red-7"]);
    for (const system of UNBALANCED) {
      expect(deckTagSum(system)).not.toBe(0);
      expect(verifyBalance(system)).toBe(true);
    }
  });

  it("KO adds four per deck", () => {
    expect(deckTagSum(KO)).toBe(4);
    expect(KO.pivot).toBe(4);
  });

  it("KO reproduces the published initial running counts", () => {
    // Vancura & Fuchs: IRC = 4 - (4 x decks).
    expect(initialRunningCount(KO, 1)).toBe(0);
    expect(initialRunningCount(KO, 2)).toBe(-4);
    expect(initialRunningCount(KO, 6)).toBe(-20);
    expect(initialRunningCount(KO, 8)).toBe(-28);
  });

  it("Red 7 reproduces the published initial running counts", () => {
    // Snyder: start at -2 x decks.
    expect(initialRunningCount(RED_7, 1)).toBe(-2);
    expect(initialRunningCount(RED_7, 2)).toBe(-4);
    expect(initialRunningCount(RED_7, 6)).toBe(-12);
    expect(initialRunningCount(RED_7, 8)).toBe(-16);
  });

  for (const system of UNBALANCED) {
    it.each(DECK_COUNTS)(`${system.name} finishes a complete %i-deck shoe on its pivot`, (decks) => {
      expect(currentRunningCount(fullShoeCards(decks), system, decks)).toBe(system.pivot);
    });

    it.each(DECK_COUNTS)(`${system.name} starts a %i-deck shoe at its IRC`, (decks) => {
      expect(currentRunningCount([], system, decks)).toBe(initialRunningCount(system, decks));
    });
  }

  it("KO's pivot is deck-count independent, which is the whole point of the system", () => {
    // The pivot is where the system needs no true-count conversion. Half a shoe of low
    // cards moves KO the same distance above its IRC regardless of shoe size.
    for (const decks of DECK_COUNTS) {
      const lows = Array.from({ length: 10 }, () => card("5"));
      const delta = currentRunningCount(lows, KO, decks) - initialRunningCount(KO, decks);
      expect(delta).toBe(10);
    }
  });

  it("publishes Key Counts only for the deck counts its authors did", () => {
    expect(keyCount(KO, 1)).toBe(2);
    expect(keyCount(KO, 2)).toBe(1);
    expect(keyCount(KO, 6)).toBe(-4);
    expect(keyCount(KO, 8)).toBe(-6);
    // Four decks was never published as a Key Count, and is not interpolated.
    expect(keyCount(KO, 4)).toBeUndefined();
    // Red 7 uses its pivot as the betting trigger; balanced systems use an index.
    expect(keyCount(RED_7, 6)).toBeUndefined();
    expect(keyCount(HI_LO, 6)).toBeUndefined();
  });

  it("gives balanced systems an initial running count of zero at every deck count", () => {
    for (const system of BALANCED) {
      for (const decks of DECK_COUNTS) {
        expect(initialRunningCount(system, decks)).toBe(0);
        expect(currentRunningCount([], system, decks)).toBe(0);
      }
    }
  });
});

describe("running count", () => {
  it("is zero before any card is seen", () => {
    for (const system of COUNTING_SYSTEMS) {
      expect(runningCount([], system)).toBe(0);
    }
  });

  it("sums Hi-Lo tags over a dealt hand", () => {
    // 5 (+1), K (-1), 3 (+1), A (-1), 4 (+1) = +1
    const dealt = [card("5"), card("K"), card("3"), card("A"), card("4")];
    expect(runningCount(dealt, HI_LO)).toBe(1);
  });

  it("keeps Wong Halves' fractional tags fractional", () => {
    // 2 (+0.5) + 9 (-0.5) = 0; 2 (+0.5) + 5 (+1.5) = +2
    expect(runningCount([card("2"), card("9")], WONG_HALVES)).toBe(0);
    expect(runningCount([card("2"), card("5")], WONG_HALVES)).toBe(2);
    expect(runningCount([card("7")], WONG_HALVES)).toBe(0.5);
  });

  it("treats Omega II aces as neutral and Zen aces as -1", () => {
    expect(runningCount([card("A"), card("A")], OMEGA_II)).toBe(0);
    expect(runningCount([card("A"), card("A")], ZEN)).toBe(-2);
  });

  it("is order independent", () => {
    const dealt = [card("5"), card("K"), card("3"), card("A"), card("4"), card("7", "h")];
    const reversed = [...dealt].reverse();
    for (const system of COUNTING_SYSTEMS) {
      expect(runningCount(dealt, system)).toBe(runningCount(reversed, system));
    }
  });

  it("does not mutate the cards it is given", () => {
    const dealt = [card("5"), card("K")];
    const snapshot = JSON.stringify(dealt);
    runningCount(dealt, HI_LO);
    expect(JSON.stringify(dealt)).toBe(snapshot);
  });

  it("tracks a partially dealt shoe against its remaining composition", () => {
    // Half a six-deck shoe of high cards drives Hi-Lo deeply negative, and the count of
    // the whole shoe is still exactly zero.
    const decks = 6;
    const all = fullShoeCards(decks);
    const tens = all.filter((c) => c.rank === "10");
    expect(tens).toHaveLength(decks * 4);
    expect(runningCount(tens, HI_LO)).toBe(-decks * 4);
    expect(runningCount(all, HI_LO)).toBe(0);
  });
});

/**
 * Competitor reviews show both users and apps failing on negative and two-digit counts, so
 * the conversion is tested across the sign boundary and at fractional decks remaining.
 */
describe("true count conversion", () => {
  it("defaults to truncation toward zero", () => {
    expect(DEFAULT_TRUE_COUNT_ROUNDING).toBe("truncate");
    expect(trueCount(7, 2)).toBe(trueCount(7, 2, "truncate"));
  });

  it("divides the running count by decks remaining", () => {
    expect(trueCount(12, 6, "exact")).toBe(2);
    expect(trueCount(12, 4, "exact")).toBe(3);
    expect(trueCount(0, 6, "exact")).toBe(0);
  });

  it("handles fractional decks remaining", () => {
    // Deep into a shoe, decks remaining is rarely a whole number.
    expect(trueCount(6, 1.5, "exact")).toBe(4);
    expect(trueCount(5, 2.5, "exact")).toBe(2);
    expect(trueCount(3, 0.5, "exact")).toBe(6);
    // A quarter deck left and a +4 running count is a true count of +16.
    expect(trueCount(4, 0.25, "exact")).toBe(16);
  });

  it("handles two-digit running counts", () => {
    expect(trueCount(24, 2, "exact")).toBe(12);
    expect(trueCount(-24, 2, "exact")).toBe(-12);
    expect(trueCount(17, 1.7, "exact")).toBeCloseTo(10, 10);
    expect(trueCount(-31, 2)).toBe(-15);
  });

  it("handles negative running counts symmetrically", () => {
    expect(trueCount(-12, 6, "exact")).toBe(-2);
    expect(trueCount(-6, 1.5, "exact")).toBe(-4);
    // Truncation toward zero is symmetric: the magnitude rounds down in both directions.
    expect(trueCount(7, 2, "truncate")).toBe(3);
    expect(trueCount(-7, 2, "truncate")).toBe(-3);
    expect(trueCount(11, 3, "truncate")).toBe(3);
    expect(trueCount(-11, 3, "truncate")).toBe(-3);
  });

  it("floors toward negative infinity when asked, which is not symmetric", () => {
    expect(trueCount(7, 2, "floor")).toBe(3);
    // The asymmetry is the whole reason truncate is the default: -3.5 floors to -4.
    expect(trueCount(-7, 2, "floor")).toBe(-4);
    expect(trueCount(-1, 6, "floor")).toBe(-1);
  });

  it("rounds halves away from zero, not toward positive infinity", () => {
    expect(trueCount(7, 2, "round")).toBe(4);
    // Math.round(-3.5) is -3. A symmetric round gives -4.
    expect(trueCount(-7, 2, "round")).toBe(-4);
    expect(trueCount(5, 2, "round")).toBe(3);
    expect(trueCount(-5, 2, "round")).toBe(-3);
    expect(trueCount(4, 3, "round")).toBe(1);
    expect(trueCount(-4, 3, "round")).toBe(-1);
  });

  it("reports a small negative count as 0, never as -0", () => {
    // -0 on the true-count display reads as a defect. A running count of -1 with six decks
    // left is -0.1667, which both truncate and round collapse to zero.
    expect(trueCount(-1, 6, "truncate")).toBe(0);
    expect(Object.is(trueCount(-1, 6, "truncate"), 0)).toBe(true);
    expect(Object.is(trueCount(-1, 6, "round"), 0)).toBe(true);
    expect(Object.is(trueCount(0, 6, "exact"), 0)).toBe(true);
    expect(Object.is(runningCount([card("A"), card("5")], HI_LO), 0)).toBe(true);
  });

  it("carries a fractional running count through, for Wong Halves", () => {
    expect(trueCount(7.5, 2.5, "exact")).toBe(3);
    expect(trueCount(-7.5, 2.5, "truncate")).toBe(-3);
  });

  it("refuses to divide by zero decks remaining rather than returning Infinity", () => {
    expect(() => trueCount(4, 0)).toThrow(/True count is undefined/);
    expect(() => trueCount(4, -1)).toThrow(/True count is undefined/);
    expect(() => trueCount(4, Number.NaN)).toThrow(/True count is undefined/);
  });

  it("converts a real shoe's running count", () => {
    const shoe = createShoe({ ...DEFAULT_RULES, decks: 6 }, 4242);
    const seen = shoe.cards.slice(0, 156); // three decks dealt
    const rc = runningCount(seen, HI_LO);
    expect(trueCount(rc, 3, "exact")).toBe(rc / 3);
    // The rest of the shoe must cancel it exactly.
    expect(rc + runningCount(shoe.cards.slice(156), HI_LO)).toBe(0);
  });
});

/** Omega II tags aces 0, so it cannot value a shoe for betting without this. */
describe("ace side count", () => {
  it("is required by Omega II alone, among these six", () => {
    expect(OMEGA_II.usesAceSideCount).toBe(true);
    expect(OMEGA_II.tags.A).toBe(0);
    for (const system of COUNTING_SYSTEMS) {
      if (system.id === "omega-ii") continue;
      expect(system.usesAceSideCount).toBe(false);
      expect(system.tags.A).not.toBe(0);
    }
  });

  it("reports a fresh shoe as exactly neutral", () => {
    const side = aceSideCount([], 6);
    expect(side.seen).toBe(0);
    expect(side.remaining).toBe(24);
    expect(side.expectedRemaining).toBe(24);
    expect(side.surplus).toBe(0);
    expect(side.surplusPerDeck).toBe(0);
  });

  it("reports an ace-poor shoe as a deficit", () => {
    // One deck dealt from a six-deck shoe, containing all four of its aces plus 48 others.
    const dealt = [
      ...Array.from({ length: 4 }, () => card("A")),
      ...Array.from({ length: 48 }, () => card("8")),
    ];
    const side = aceSideCount(dealt, 6);
    expect(side.seen).toBe(4);
    expect(side.remaining).toBe(20);
    expect(side.expectedRemaining).toBe(20); // 5 decks left x 4
    expect(side.surplus).toBe(0);

    // Now a deck dealt containing *eight* aces: the remainder is ace-poor.
    const aceHeavy = [
      ...Array.from({ length: 8 }, () => card("A")),
      ...Array.from({ length: 44 }, () => card("8")),
    ];
    const poor = aceSideCount(aceHeavy, 6);
    expect(poor.seen).toBe(8);
    expect(poor.remaining).toBe(16);
    expect(poor.expectedRemaining).toBe(20);
    expect(poor.surplus).toBe(-4);
    expect(poor.surplusPerDeck).toBeCloseTo(-0.8, 10);
  });

  it("reports an ace-rich shoe as a surplus", () => {
    // A deck dealt with no aces at all leaves every ace in five decks' worth of cards.
    const dealt = Array.from({ length: 52 }, () => card("8"));
    const side = aceSideCount(dealt, 6);
    expect(side.seen).toBe(0);
    expect(side.remaining).toBe(24);
    expect(side.expectedRemaining).toBe(20);
    expect(side.surplus).toBe(4);
    expect(side.surplusPerDeck).toBeCloseTo(0.8, 10);
  });

  it("returns zero surplus per deck when the shoe is exhausted", () => {
    const side = aceSideCount(fullShoeCards(1), 1);
    expect(side.seen).toBe(4);
    expect(side.remaining).toBe(0);
    expect(side.expectedRemaining).toBe(0);
    expect(side.surplusPerDeck).toBe(0);
  });

  it("counts aces regardless of suit", () => {
    const aces = SUITS.map((suit) => card("A", suit));
    expect(aceSideCount(aces, 6).seen).toBe(4);
  });
});

/**
 * The betting adjustment, straight from Omega II's own book: "add +2 to the running count for
 * each 'extra' Ace per 13 dealt cards ... add -2 ... for each Ace 'short'" (Carlson, Blackjack
 * for Blood). Wattenberger's Modern Blackjack states the same rule generally, as excess aces
 * times |ten tag|, and adds the true-count conversion.
 *
 * Every case below deals eights as filler, which Omega II tags 0, so the running count under
 * test is whatever the test passes in and the ace surplus is the only thing moving.
 */
describe("ace side count adjustment for betting", () => {
  /** `total` cards dealt, `aces` of them aces and the rest count-neutral eights. */
  const dealtWith = (aces: number, total: number): Card[] => [
    ...Array.from({ length: aces }, () => card("A")),
    ...Array.from({ length: total - aces }, () => card("8")),
  ];

  /**
   * Carlson's own worked example, reproduced exactly: a double-deck game, about one deck dealt,
   * one ace out where average distribution would have dropped four — "we have three 'extra'
   * Aces left in the pack. Let's say our raw running count at this point is -1; adding +2 for
   * each of our three 'extra' Aces, we end up with an adjusted running count, for betting
   * purposes, of +5." If this assertion ever fails, the engine has left the book behind.
   */
  it("reproduces Carlson's worked example: -1 raw becomes +5 for betting", () => {
    const side = aceSideCount(dealtWith(1, 52), 2);
    expect(side.seen).toBe(1);
    expect(side.surplus).toBe(3);
    expect(aceAdjustedRunningCount(-1, side, OMEGA_II)).toBe(5);
  });

  it("measures the surplus off dealt cards the way Carlson does: one ace per 13", () => {
    // He counts "extra" aces against the cards dealt; `surplus` counts against the cards left.
    // The two are the same number, so the engine and the book never disagree by a rounding.
    for (const decks of DECK_COUNTS) {
      for (const dealt of [13, 26, 52, 91, decks * 26]) {
        for (const aces of [0, 1, 4]) {
          if (dealt > decks * 52 || aces > Math.min(dealt, decks * 4)) continue;
          expect(aceSideCount(dealtWith(aces, dealt), decks).surplus).toBeCloseTo(
            dealt / 13 - aces,
            10,
          );
        }
      }
    }
  });

  it("values a surplus ace at the magnitude of the system's own ten tag", () => {
    // Derived from the tag table rather than stored, so it cannot drift away from the tags.
    expect(aceAdjustmentValue(OMEGA_II)).toBe(2);
    expect(aceAdjustmentValue(OMEGA_II)).toBe(Math.abs(OMEGA_II.tags["10"]));
    // The filler really is count-neutral, so these tests isolate the ace effect.
    expect(runningCount(dealtWith(0, 52), OMEGA_II)).toBe(0);
  });

  it("refuses to adjust a system that already counts aces", () => {
    for (const system of COUNTING_SYSTEMS) {
      if (system.usesAceSideCount) continue;
      expect(() => aceAdjustmentValue(system)).toThrow(/ace-neutral/);
    }
    expect(() => aceAdjustmentValue(HI_LO)).toThrow(/Hi-Lo counts aces at -1/);
    expect(() => bettingTrueCount(6, 3, aceSideCount([], 6), ZEN)).toThrow(/ace-neutral/);
  });

  it("leaves a neutral shoe's true count untouched, at every deck count", () => {
    for (const decks of DECK_COUNTS) {
      // Half the shoe dealt, holding exactly half its aces: no surplus, so no adjustment.
      const side = aceSideCount(dealtWith(decks * 2, decks * 26), decks);
      expect(side.surplus).toBe(0);
      expect(aceTrueCountAdjustment(side, OMEGA_II)).toBe(0);
      expect(aceAdjustedRunningCount(7, side, OMEGA_II)).toBe(7);
      expect(bettingTrueCount(7, decks / 2, side, OMEGA_II, "exact")).toBe(
        trueCount(7, decks / 2, "exact"),
      );
    }
  });

  it("adds two running-count points per surplus ace", () => {
    // Six decks, one deck dealt and not an ace in it: 24 aces left where 20 are expected.
    const side = aceSideCount(dealtWith(0, 52), 6);
    expect(side.surplus).toBe(4);
    expect(aceAdjustedRunningCount(9, side, OMEGA_II)).toBe(17); // 9 + 2 x 4
    expect(bettingTrueCount(9, 5, side, OMEGA_II, "exact")).toBeCloseTo(3.4, 10);
    // The unadjusted count says +1 and the shoe is really worth +3. That gap is the whole
    // reason Omega II asks for a side count before a bet.
    expect(trueCount(9, 5)).toBe(1);
    expect(bettingTrueCount(9, 5, side, OMEGA_II)).toBe(3);
  });

  it("subtracts two per missing ace, so an ace-stripped shoe stops looking rich", () => {
    // Four decks, two dealt, and twelve of the sixteen aces already gone.
    const side = aceSideCount(dealtWith(12, 104), 4);
    expect(side.surplus).toBe(-4);
    expect(aceAdjustedRunningCount(10, side, OMEGA_II)).toBe(2); // 10 - 2 x 4
    expect(trueCount(10, 2)).toBe(5);
    expect(bettingTrueCount(10, 2, side, OMEGA_II)).toBe(1);

    // A single deck with all four aces already out is worth nothing, whatever the tens say.
    const stripped = aceSideCount(dealtWith(4, 13), 1);
    expect(stripped.surplus).toBe(-3);
    expect(stripped.surplusPerDeck).toBe(-4);
    expect(trueCount(6, 0.75)).toBe(8);
    expect(bettingTrueCount(6, 0.75, stripped, OMEGA_II, "exact")).toBe(0);
  });

  it("moves the exact true count by two per surplus ace per deck remaining", () => {
    const cases = [
      // decks, dealt, aces in it, decks remaining, surplus per deck
      { decks: 1, dealt: 26, aces: 0, remaining: 0.5, perDeck: 4 },
      { decks: 2, dealt: 26, aces: 0, remaining: 1.5, perDeck: 4 / 3 },
      { decks: 4, dealt: 104, aces: 12, remaining: 2, perDeck: -2 },
      { decks: 6, dealt: 52, aces: 0, remaining: 5, perDeck: 0.8 },
      { decks: 8, dealt: 104, aces: 4, remaining: 6, perDeck: 2 / 3 },
    ];

    for (const { decks, dealt, aces, remaining, perDeck } of cases) {
      const side = aceSideCount(dealtWith(aces, dealt), decks);
      expect(side.surplusPerDeck).toBeCloseTo(perDeck, 10);
      expect(aceTrueCountAdjustment(side, OMEGA_II)).toBeCloseTo(2 * perDeck, 10);

      // The identity that ties the two forms together: adjusting the running count by the
      // surplus and converting equals converting and adding the per-deck adjustment.
      for (const rc of [-13, -4, 0, 5, 12]) {
        expect(bettingTrueCount(rc, remaining, side, OMEGA_II, "exact")).toBeCloseTo(
          trueCount(rc, remaining, "exact") + aceTrueCountAdjustment(side, OMEGA_II),
          10,
        );
      }
    }
  });

  it("adjusts the running count before converting, not the rounded true count", () => {
    // Rounding twice loses a whole point here: +1.8 truncates to +1 and the +1.6 ace
    // adjustment truncates to +1, which would report +2 for a shoe that is worth +3.
    const side = aceSideCount(dealtWith(0, 52), 6);
    expect(trueCount(9, 5)).toBe(1);
    expect(Math.trunc(aceTrueCountAdjustment(side, OMEGA_II))).toBe(1);
    expect(bettingTrueCount(9, 5, side, OMEGA_II)).toBe(3);
  });

  it("carries the rounding mode through, and never reports -0", () => {
    const rich = aceSideCount(dealtWith(0, 52), 6);
    expect(bettingTrueCount(9, 5, rich, OMEGA_II, "round")).toBe(3); // 3.4 to nearest
    expect(bettingTrueCount(9, 5, rich, OMEGA_II, "floor")).toBe(3);

    // Eight decks, an ace surplus that cancels a negative count almost exactly.
    const side = aceSideCount(dealtWith(4, 104), 8);
    expect(aceAdjustedRunningCount(-8, side, OMEGA_II)).toBe(0);
    expect(Object.is(aceAdjustedRunningCount(-8, side, OMEGA_II), 0)).toBe(true);
    expect(Object.is(bettingTrueCount(-9, 6, side, OMEGA_II), 0)).toBe(true);
    expect(Object.is(aceTrueCountAdjustment(aceSideCount([], 6), OMEGA_II), 0)).toBe(true);
  });

  it("adjusts a real seeded shoe's count", () => {
    const shoe = createShoe({ ...DEFAULT_RULES, decks: 6 }, 4242);
    const seen = shoe.cards.slice(0, 156); // three decks dealt
    const side = aceSideCount(seen, 6);
    const rc = runningCount(seen, OMEGA_II);

    expect(side.seen + side.remaining).toBe(24);
    expect(bettingTrueCount(rc, 3, side, OMEGA_II, "exact")).toBeCloseTo(
      (rc + 2 * side.surplus) / 3,
      10,
    );
  });
});

describe("system lookup", () => {
  it("throws a diagnosable error for an unknown id", () => {
    // @ts-expect-error — deliberately passing an id outside the union.
    expect(() => getCountingSystem("hi-opt-ii")).toThrow(/Unknown counting system/);
    // @ts-expect-error — deliberately passing an id outside the union.
    expect(() => getCountingSystem("hi-opt-ii")).toThrow(/hi-lo/);
  });

  it("round-trips every system through its id", () => {
    for (const system of COUNTING_SYSTEMS) {
      expect(getCountingSystem(system.id)).toBe(system);
    }
  });

  it("has six systems, and no duplicate ids", () => {
    expect(COUNTING_SYSTEMS).toHaveLength(6);
    expect(new Set(COUNTING_SYSTEMS.map((system) => system.id)).size).toBe(6);
  });
});
