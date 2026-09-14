import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type RuleSet, describeRules, validateRules } from "./rules";

const rules = (overrides: Partial<RuleSet> = {}): RuleSet => ({ ...DEFAULT_RULES, ...overrides });

describe("describeRules", () => {
  it("summarises the default table", () => {
    expect(describeRules(DEFAULT_RULES)).toBe("6D · H17 · 3:2 · DAS · LS · 75% pen");
  });

  it("distinguishes a no-hole-card game from a peeked one", () => {
    // These two tables play differently — no-peek moves four Basic Strategy cells —
    // so they must not read identically.
    expect(describeRules(rules({ dealerPeek: true }))).not.toBe(
      describeRules(rules({ dealerPeek: false })),
    );
    expect(describeRules(rules({ dealerPeek: false }))).toContain("NHC");
  });

  it("names a restricted double range and omits the unrestricted one", () => {
    expect(describeRules(rules({ doubleRule: "10-11" }))).toContain("D10-11");
    expect(describeRules(rules({ doubleRule: "any" }))).not.toContain("D9");
  });

  it("names the split-ace rules that favour the player", () => {
    expect(describeRules(rules({ resplitAces: true }))).toContain("RSA");
    expect(describeRules(rules({ oneCardToSplitAces: false }))).toContain("DSA");
  });

  it("names a non-standard resplit limit only when it differs", () => {
    expect(describeRules(rules({ maxSplitHands: 2 }))).toContain("SP2");
    expect(describeRules(rules({ maxSplitHands: 4 }))).not.toContain("SP");
  });

  it("distinguishes every rule that moves a strategy cell", () => {
    const seen = new Set<string>();
    for (const dealerPeek of [true, false]) {
      for (const resplitAces of [true, false]) {
        for (const oneCardToSplitAces of [true, false]) {
          for (const doubleRule of ["any", "9-11", "10-11"] as const) {
            seen.add(describeRules(rules({ dealerPeek, resplitAces, oneCardToSplitAces, doubleRule })));
          }
        }
      }
    }
    expect(seen.size).toBe(2 * 2 * 2 * 3);
  });
});

describe("validateRules", () => {
  it("accepts the default table", () => {
    expect(validateRules(DEFAULT_RULES)).toEqual([]);
  });

  it("rejects a deck count outside 1-8", () => {
    expect(validateRules(rules({ decks: 0 }))).toContain("decks must be an integer from 1 to 8");
    expect(validateRules(rules({ decks: 9 }))).toHaveLength(1);
  });

  it("rejects penetration outside (0, 1]", () => {
    expect(validateRules(rules({ penetration: 0 }))).toHaveLength(1);
    expect(validateRules(rules({ penetration: 1.5 }))).toHaveLength(1);
    expect(validateRules(rules({ penetration: 1 }))).toEqual([]);
  });

  it("rejects a max bet below the min", () => {
    expect(validateRules(rules({ minBet: 100, maxBet: 50 }))).toContain(
      "maxBet must be at least minBet",
    );
  });

  it("reports every problem at once rather than the first", () => {
    expect(validateRules(rules({ decks: 0, minBet: -5, maxBet: -10 }))).toHaveLength(3);
  });
});
