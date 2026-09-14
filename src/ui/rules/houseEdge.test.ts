/**
 * House-edge tests.
 *
 * Two kinds of assertion here, and the second kind is the one that matters.
 *
 * The first kind checks the arithmetic: the right lines appear, the signs point the right
 * way, an unsourced input refuses to produce a total.
 *
 * The second kind checks the *model* against the outside world. Published house edges
 * exist for the well-known games — a 6-deck H17 Strip table, Atlantic City, European no
 * hole card — and if adding up per-rule deltas did not reproduce them, the model would be
 * wrong no matter how tidy the arithmetic was. Those tests are at the bottom, with the
 * figure each one is checking against named in the assertion.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type RuleSet, validateRules } from "@/engine/rules";
import {
  EDGE_NEUTRAL_RULES,
  EDGE_REFERENCE_RULES,
  SOURCED_DECK_COUNTS,
  edgeVerdict,
  formatEdge,
  formatEdgePerHundred,
  houseEdge,
  hourlyCost,
} from "./houseEdge";
import { RULE_PRESETS } from "./presets";

/** The published reference game at a given deck count — every adjustment switched off. */
function reference(decks: number): RuleSet {
  return {
    ...DEFAULT_RULES,
    ...EDGE_REFERENCE_RULES,
    decks,
  };
}

function edgeOf(rules: Partial<RuleSet>, decks = 6): number {
  const estimate = houseEdge({ ...reference(decks), ...rules });
  expect(estimate.percent).toBeDefined();
  return estimate.percent as number;
}

describe("the published baseline", () => {
  it("reproduces the source's figures for every deck count it publishes", () => {
    // Wizard of Odds, "Why the number of decks matters in blackjack".
    const published: Readonly<Record<number, number>> = {
      1: 0.014,
      2: 0.341,
      4: 0.499,
      6: 0.551,
      8: 0.577,
    };
    for (const decks of SOURCED_DECK_COUNTS) {
      const estimate = houseEdge(reference(decks));
      expect(estimate.adjustments).toEqual([]);
      expect(estimate.percent).toBeCloseTo(published[decks] as number, 5);
    }
  });

  it("matches the source's own stated one-to-eight-deck spread of 0.563%", () => {
    const one = edgeOf({}, 1);
    const eight = edgeOf({}, 8);
    expect(eight - one).toBeCloseTo(0.563, 5);
  });

  it("has no published figure for a 3, 5 or 7 deck game and says so instead of guessing", () => {
    for (const decks of [3, 5, 7]) {
      const estimate = houseEdge(reference(decks));
      expect(estimate.percent).toBeUndefined();
      expect(estimate.unsourced).toHaveLength(1);
      expect(estimate.baseline.note).toContain("No house edge has been published");
    }
  });

  it("is a valid rule set at every sourced deck count", () => {
    for (const decks of SOURCED_DECK_COUNTS) {
      expect(validateRules(reference(decks))).toEqual([]);
    }
  });
});

describe("per-rule contributions", () => {
  const base = edgeOf({});

  it("credits the player 0.22% for a dealer standing on soft 17", () => {
    expect(edgeOf({ dealerSoft17: "stand" }) - base).toBeCloseTo(-0.22, 5);
  });

  it("charges 1.39% for a 6:5 blackjack — the most expensive rule on the screen", () => {
    expect(edgeOf({ blackjackPayout: "6:5" }) - base).toBeCloseTo(1.39, 5);
  });

  it("makes 6:5 cost more than every other adverse rule combined", () => {
    const sixFive = edgeOf({ blackjackPayout: "6:5" }) - base;
    const everythingElse =
      edgeOf({
        doubleAfterSplit: false,
        doubleRule: "10-11",
        maxSplitHands: 2,
        resplitAces: false,
        dealerPeek: false,
      }) - base;
    expect(sixFive).toBeGreaterThan(everythingElse);
  });

  it("charges 0.14% for no double after split", () => {
    expect(edgeOf({ doubleAfterSplit: false }) - base).toBeCloseTo(0.14, 5);
  });

  it("charges 0.09% for doubling 9-11 only and 0.18% for 10-11 only", () => {
    expect(edgeOf({ doubleRule: "9-11" }) - base).toBeCloseTo(0.09, 5);
    expect(edgeOf({ doubleRule: "10-11" }) - base).toBeCloseTo(0.18, 5);
  });

  it("credits 0.07% for late surrender and 0.63% for early", () => {
    expect(edgeOf({ surrender: "late" }) - base).toBeCloseTo(-0.07, 5);
    expect(edgeOf({ surrender: "early" }) - base).toBeCloseTo(-0.63, 5);
  });

  it("charges 0.01% for splitting to 3 hands and 0.10% for no resplitting", () => {
    expect(edgeOf({ maxSplitHands: 3 }) - base).toBeCloseTo(0.01, 5);
    expect(edgeOf({ maxSplitHands: 2 }) - base).toBeCloseTo(0.1, 5);
  });

  it("treats more than four split hands as no better than four, which is what is published", () => {
    expect(edgeOf({ maxSplitHands: 4 })).toBeCloseTo(base, 5);
    expect(edgeOf({ maxSplitHands: 8 })).toBeCloseTo(base, 5);
  });

  it("refuses to price a game with no splitting at all rather than inventing a figure", () => {
    const estimate = houseEdge({ ...reference(6), maxSplitHands: 1 });
    expect(estimate.percent).toBeUndefined();
    expect(estimate.unsourced.map((entry) => entry.id)).toEqual(["splits"]);
  });

  it("charges 0.08% when split aces may not be resplit", () => {
    expect(edgeOf({ resplitAces: false }) - base).toBeCloseTo(0.08, 5);
  });

  it("credits 0.19% when the player may draw to split aces", () => {
    expect(edgeOf({ oneCardToSplitAces: false }) - base).toBeCloseTo(-0.19, 5);
  });

  it("charges 0.11% for a no-hole-card game", () => {
    expect(edgeOf({ dealerPeek: false }) - base).toBeCloseTo(0.11, 5);
  });

  it("moves not at all for penetration or table limits", () => {
    expect(edgeOf({ penetration: 0.5 })).toBeCloseTo(base, 5);
    expect(edgeOf({ penetration: 0.95 })).toBeCloseTo(base, 5);
    expect(edgeOf({ minBet: 500, maxBet: 50000 })).toBeCloseTo(base, 5);
    expect(EDGE_NEUTRAL_RULES).toHaveLength(2);
  });

  it("lists the baseline first and one line per departure from it", () => {
    const estimate = houseEdge({
      ...reference(6),
      dealerSoft17: "stand",
      blackjackPayout: "6:5",
      resplitAces: false,
    });
    expect(estimate.lines[0]).toBe(estimate.baseline);
    expect(estimate.adjustments.map((entry) => entry.id)).toEqual(["s17", "payout", "rsa"]);
    expect(estimate.unsourced).toEqual([]);
  });

  it("carries a citation on every line", () => {
    const estimate = houseEdge(DEFAULT_RULES);
    for (const entry of estimate.lines) {
      expect(["decks", "variations"]).toContain(entry.source);
    }
  });
});

describe("cross-checks against published house edges for real games", () => {
  /** Within a tenth of a percent — the precision the module claims and no more. */
  function expectPublished(rules: RuleSet, published: number): void {
    const estimate = houseEdge(rules);
    expect(estimate.percent).toBeDefined();
    expect(Math.abs((estimate.percent as number) - published)).toBeLessThan(0.1);
  }

  it("6-deck H17 DAS late surrender lands near the published 0.56%", () => {
    expectPublished(
      { ...DEFAULT_RULES, decks: 6, dealerSoft17: "hit", surrender: "late", resplitAces: false },
      0.56,
    );
  });

  it("6-deck S17 DAS late surrender lands near the published 0.34%", () => {
    expectPublished(
      { ...DEFAULT_RULES, decks: 6, dealerSoft17: "stand", surrender: "late", resplitAces: false },
      0.34,
    );
  });

  it("2-deck H17 DAS no surrender lands near the published 0.42%", () => {
    expectPublished(
      { ...DEFAULT_RULES, decks: 2, dealerSoft17: "hit", surrender: "none", resplitAces: false },
      0.42,
    );
  });

  it("8-deck Atlantic City S17 DAS late surrender lands near the published 0.37%", () => {
    expectPublished(
      { ...DEFAULT_RULES, decks: 8, dealerSoft17: "stand", surrender: "late", resplitAces: false },
      0.37,
    );
  });

  it("European 6-deck S17, double 9-11, no hole card lands near the published 0.61%", () => {
    expectPublished(
      {
        ...DEFAULT_RULES,
        decks: 6,
        dealerSoft17: "stand",
        doubleRule: "9-11",
        surrender: "none",
        resplitAces: false,
        dealerPeek: false,
      },
      0.61,
    );
  });

  it("puts single deck S17 3:2 on the player's side of zero", () => {
    const estimate = houseEdge({
      ...DEFAULT_RULES,
      decks: 1,
      dealerSoft17: "stand",
      surrender: "none",
      resplitAces: false,
    });
    expect(estimate.percent).toBeLessThan(0);
    expect(edgeVerdict(estimate.percent as number)).toBe("player-advantage");
  });

  it("puts a single-deck 6:5 game past 1.5%, where the verdict is do not play", () => {
    const preset = RULE_PRESETS.find((entry) => entry.id === "single-deck-6-5");
    expect(preset).toBeDefined();
    const estimate = houseEdge((preset as { rules: RuleSet }).rules);
    expect(estimate.percent).toBeGreaterThan(1.5);
    expect(edgeVerdict(estimate.percent as number)).toBe("predatory");
  });
});

describe("verdicts and formatting", () => {
  it("bands the edge at zero, 0.5, 1.0 and 1.5", () => {
    expect(edgeVerdict(-0.13)).toBe("player-advantage");
    expect(edgeVerdict(0)).toBe("excellent");
    expect(edgeVerdict(0.49)).toBe("excellent");
    expect(edgeVerdict(0.5)).toBe("fair");
    expect(edgeVerdict(0.99)).toBe("fair");
    expect(edgeVerdict(1.0)).toBe("poor");
    expect(edgeVerdict(1.49)).toBe("poor");
    expect(edgeVerdict(1.5)).toBe("predatory");
  });

  it("formats to two decimals, keeping the sign", () => {
    expect(formatEdge(0.551)).toBe("0.55%");
    expect(formatEdge(-0.126)).toBe("-0.13%");
  });

  it("restates the edge in money", () => {
    expect(formatEdgePerHundred(1.95)).toBe("$1.95 per $100 wagered, to the house");
    expect(formatEdgePerHundred(-0.13)).toBe("$0.13 per $100 wagered, to you");
  });

  it("prices an hour at eighty hands", () => {
    expect(hourlyCost(1.0, 25)).toBeCloseTo(20, 5);
    expect(hourlyCost(-0.5, 10)).toBeCloseTo(-4, 5);
  });
});
