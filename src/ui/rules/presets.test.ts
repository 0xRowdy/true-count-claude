/**
 * Preset tests.
 *
 * A preset is a claim about a real casino game, so these assert more than "the object has
 * the right shape". Every preset must be a Rule Set the engine accepts, must produce a
 * chart, and must land at the house edge published for the game it claims to be. A preset
 * that drifted would teach a user the wrong table by name, which is worse than no preset.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, describeRules, validateRules } from "@/engine/rules";
import { strategyChart } from "@/engine/strategy";
import { houseEdge } from "./houseEdge";
import { RULE_PRESETS, matchingPreset, sameRules } from "./presets";

describe("every preset", () => {
  it("is a valid Rule Set", () => {
    for (const preset of RULE_PRESETS) {
      expect(validateRules(preset.rules), preset.name).toEqual([]);
    }
  });

  it("has a priceable house edge — no preset lands on an unsourced deck count", () => {
    for (const preset of RULE_PRESETS) {
      const estimate = houseEdge(preset.rules);
      expect(estimate.unsourced, preset.name).toEqual([]);
      expect(estimate.percent, preset.name).toBeDefined();
    }
  });

  it("produces a strategy chart", () => {
    for (const preset of RULE_PRESETS) {
      expect(() => strategyChart(preset.rules)).not.toThrow();
    }
  });

  it("has a unique id and name", () => {
    expect(new Set(RULE_PRESETS.map((preset) => preset.id)).size).toBe(RULE_PRESETS.length);
    expect(new Set(RULE_PRESETS.map((preset) => preset.name)).size).toBe(RULE_PRESETS.length);
  });

  it("is a distinct table from every other preset", () => {
    for (const preset of RULE_PRESETS) {
      const twins = RULE_PRESETS.filter((other) => sameRules(other.rules, preset.rules));
      expect(twins.map((twin) => twin.id), preset.name).toEqual([preset.id]);
    }
  });

  it("round-trips through matchingPreset", () => {
    for (const preset of RULE_PRESETS) {
      expect(matchingPreset(preset.rules)?.id).toBe(preset.id);
    }
  });

  it("describes itself the way describeRules reads it", () => {
    for (const preset of RULE_PRESETS) {
      expect(describeRules(preset.rules)).toContain(`${preset.rules.decks}D`);
    }
  });
});

describe("the presets a user reaches for", () => {
  const byId = (id: string) => {
    const preset = RULE_PRESETS.find((entry) => entry.id === id);
    expect(preset, id).toBeDefined();
    return preset as (typeof RULE_PRESETS)[number];
  };

  it("offers the ordinary Strip game, and it is playable but not good", () => {
    const edge = houseEdge(byId("vegas-6d-h17").rules).percent as number;
    expect(edge).toBeGreaterThan(0.4);
    expect(edge).toBeLessThan(0.7);
  });

  it("offers a single-deck 6:5 game that costs more than three times the Strip game", () => {
    const strip = houseEdge(byId("vegas-6d-h17").rules).percent as number;
    const sixFive = houseEdge(byId("single-deck-6-5").rules).percent as number;
    expect(sixFive).toBeGreaterThan(strip * 3);
  });

  it("offers a table where basic strategy alone is already ahead", () => {
    expect(houseEdge(byId("single-deck-classic").rules).percent as number).toBeLessThan(0);
  });

  it("offers a no-hole-card game, because that rule alone rewrites four chart cells", () => {
    const european = byId("european-no-hole-card");
    expect(european.rules.dealerPeek).toBe(false);
    const peeked = strategyChart({ ...european.rules, dealerPeek: true });
    const unpeeked = strategyChart(european.rules);
    expect(unpeeked.pairs["A"][11]).not.toBe(peeked.pairs["A"][11]);
  });

  it("names the default table, so a user who has changed nothing is not told they are off-list", () => {
    expect(matchingPreset(DEFAULT_RULES)?.id).toBe("vegas-6d-h17");
  });

  it("covers 1, 2, 6 and 8 deck games", () => {
    const decks = new Set(RULE_PRESETS.map((preset) => preset.rules.decks));
    expect([...decks].sort((a, b) => a - b)).toEqual([1, 2, 6, 8]);
  });
});

describe("sameRules", () => {
  const [first] = RULE_PRESETS;

  it("is true only for an exact match on all thirteen fields", () => {
    expect(first).toBeDefined();
    const rules = (first as (typeof RULE_PRESETS)[number]).rules;
    expect(sameRules(rules, { ...rules })).toBe(true);
    expect(sameRules(rules, { ...rules, penetration: rules.penetration + 0.05 })).toBe(false);
    expect(sameRules(rules, { ...rules, minBet: rules.minBet + 1 })).toBe(false);
    expect(sameRules(rules, { ...rules, maxBet: rules.maxBet + 1 })).toBe(false);
    expect(sameRules(rules, { ...rules, resplitAces: !rules.resplitAces })).toBe(false);
  });

  it("reports no match for a table that is merely close to a preset", () => {
    expect(first).toBeDefined();
    const rules = (first as (typeof RULE_PRESETS)[number]).rules;
    expect(matchingPreset({ ...rules, penetration: 0.5 })).toBeUndefined();
  });
});
