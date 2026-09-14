import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import { createHand, evaluate, isBlackjack, isSplittablePair, legalActions } from "./hand";
import { DEFAULT_RULES, type RuleSet } from "./rules";

const card = (rank: Card["rank"], suit: Card["suit"] = "s"): Card => ({ rank, suit });

describe("hand evaluation", () => {
  it("counts an ace as 11 when it fits", () => {
    expect(evaluate([card("A"), card("6")])).toEqual({ total: 17, soft: true, busted: false });
  });

  it("demotes an ace to 1 to avoid busting", () => {
    expect(evaluate([card("A"), card("6"), card("K")])).toEqual({
      total: 17,
      soft: false,
      busted: false,
    });
  });

  it("demotes only as many aces as necessary", () => {
    // A+A = 12 (one ace soft), not 2 or 22.
    expect(evaluate([card("A"), card("A")])).toEqual({ total: 12, soft: true, busted: false });
    expect(evaluate([card("A"), card("A"), card("9")])).toEqual({
      total: 21,
      soft: true,
      busted: false,
    });
  });

  it("never reports a total above 21 as unbusted", () => {
    // A competitor shipped a trainer that described a hard 22 as a target.
    const value = evaluate([card("K"), card("Q"), card("5")]);
    expect(value.total).toBe(25);
    expect(value.busted).toBe(true);
  });

  it("treats all ten-ranks as ten", () => {
    expect(evaluate([card("J"), card("Q")]).total).toBe(20);
    expect(evaluate([card("10"), card("K")]).total).toBe(20);
  });
});

describe("blackjack detection", () => {
  it("recognises a two-card natural in either order", () => {
    expect(isBlackjack(createHand([card("A"), card("K")], 10))).toBe(true);
    expect(isBlackjack(createHand([card("Q"), card("A")], 10))).toBe(true);
  });

  it("rejects a three-card 21", () => {
    expect(isBlackjack(createHand([card("7"), card("7"), card("7")], 10))).toBe(false);
  });

  it("rejects 21 made from a split", () => {
    expect(isBlackjack(createHand([card("A"), card("K")], 10, true))).toBe(false);
  });
});

describe("pair detection", () => {
  it("pairs matching ranks", () => {
    expect(isSplittablePair(createHand([card("8"), card("8", "h")], 10))).toBe(true);
  });

  it("pairs mixed ten-ranks", () => {
    expect(isSplittablePair(createHand([card("K"), card("J")], 10))).toBe(true);
  });

  it("does not pair unequal ranks", () => {
    expect(isSplittablePair(createHand([card("9"), card("8")], 10))).toBe(false);
  });
});

describe("legal actions", () => {
  const ctx = (cards: Card[], overrides: Partial<RuleSet> = {}, fromSplit = false) => ({
    hand: createHand(cards, 10, fromSplit),
    rules: { ...DEFAULT_RULES, ...overrides },
    handCount: 1,
    bankroll: 1000,
  });

  it("offers split on every splittable pair, including aces and eights", () => {
    // Greying out a legal split corrupts the user's accuracy stats — invariant 7,
    // and a complaint that appears three times in one competitor's reviews.
    for (const rank of ["A", "8", "7"] as const) {
      const actions = legalActions(ctx([card(rank), card(rank, "h")]));
      expect(actions).toContain("split");
    }
  });

  it("offers double and surrender on a fresh two-card hand", () => {
    const actions = legalActions(ctx([card("9"), card("7")]));
    expect(actions).toEqual(expect.arrayContaining(["hit", "stand", "double", "surrender"]));
  });

  it("withdraws double and surrender after the first decision", () => {
    const actions = legalActions(ctx([card("9"), card("5"), card("2")]));
    expect(actions).toEqual(["hit", "stand"]);
  });

  it("honours the double-range rule", () => {
    expect(legalActions(ctx([card("4"), card("4")], { doubleRule: "10-11" }))).not.toContain(
      "double",
    );
    expect(legalActions(ctx([card("6"), card("5")], { doubleRule: "10-11" }))).toContain("double");
  });

  it("withholds double-after-split when the rule forbids it", () => {
    const actions = legalActions(ctx([card("5"), card("6")], { doubleAfterSplit: false }, true));
    expect(actions).not.toContain("double");
  });

  it("never offers surrender on a split hand", () => {
    expect(legalActions(ctx([card("9"), card("7")], {}, true))).not.toContain("surrender");
  });

  it("returns no actions on a busted hand", () => {
    expect(legalActions(ctx([card("K"), card("Q"), card("5")]))).toEqual([]);
  });

  it("returns no actions on a natural", () => {
    expect(legalActions(ctx([card("A"), card("K")]))).toEqual([]);
  });

  it("stops offering split at the resplit limit", () => {
    const context = { ...ctx([card("8"), card("8", "h")]), handCount: 4 };
    expect(legalActions(context)).not.toContain("split");
  });

  it("gives split aces exactly one card", () => {
    const actions = legalActions(ctx([card("A"), card("9")], { oneCardToSplitAces: true }, true));
    expect(actions).toEqual([]);
  });

  it("withholds double and split when the bankroll cannot cover them", () => {
    const context = { ...ctx([card("8"), card("8", "h")]), bankroll: 5 };
    const actions = legalActions(context);
    expect(actions).not.toContain("double");
    expect(actions).not.toContain("split");
  });
});

/**
 * `oneCardToSplitAces` and `resplitAces` are independent rules and real tables run both at
 * once. Applying the one-card freeze first made `resplitAces` unreachable under the default
 * rule set, which hid a legal split from the player (invariant 7).
 */
describe("re-splitting aces", () => {
  const splitAce = (second: Card["rank"], overrides: Partial<RuleSet> = {}, handCount = 1) => ({
    hand: createHand([card("A"), card(second, "h")], 10, true),
    rules: { ...DEFAULT_RULES, oneCardToSplitAces: true, resplitAces: true, ...overrides },
    handCount,
    bankroll: 1000,
  });

  it("offers the split when a split ace draws another ace", () => {
    expect(legalActions(splitAce("A"))).toContain("split");
  });

  it("offers nothing but the split and standing on it", () => {
    // The hand has had its one card, so hitting and doubling are gone — but the player must
    // still be able to decline, and declining is a stand.
    expect(legalActions(splitAce("A"))).toEqual(["stand", "split"]);
  });

  it("withholds the split when the table does not re-split aces", () => {
    expect(legalActions(splitAce("A", { resplitAces: false }))).toEqual([]);
  });

  it("still freezes a split ace that draws anything else", () => {
    for (const rank of ["9", "K", "2"] as const) {
      expect(legalActions(splitAce(rank))).toEqual([]);
    }
  });

  it("stops re-splitting aces at the hand limit", () => {
    expect(legalActions(splitAce("A", { maxSplitHands: 4 }, 4))).toEqual([]);
    expect(legalActions(splitAce("A", { maxSplitHands: 4 }, 3))).toContain("split");
  });

  it("withholds the re-split when the bankroll cannot cover it", () => {
    expect(legalActions({ ...splitAce("A"), bankroll: 5 })).toEqual([]);
  });

  it("leaves the hand fully playable when split aces are not frozen", () => {
    const actions = legalActions(splitAce("A", { oneCardToSplitAces: false }));
    expect(actions).toEqual(expect.arrayContaining(["hit", "stand", "split"]));
  });

  it("never offers a re-split on a hand that only looks like split aces", () => {
    // Not from a split: a fresh A,A is an ordinary pair and keeps its full action set.
    const fresh = { ...splitAce("A"), hand: createHand([card("A"), card("A", "h")], 10) };
    expect(legalActions(fresh)).toEqual(
      expect.arrayContaining(["hit", "stand", "double", "split", "surrender"]),
    );
  });
});
