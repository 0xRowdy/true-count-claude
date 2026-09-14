/**
 * Rule Set persistence tests.
 *
 * Runs against `createMemoryStore()` from `src/state`, so there is no AsyncStorage and no
 * React Native anywhere in this file — the same arrangement the Session repository uses.
 *
 * Most of these are about corruption. The write path is three lines; the read path has to
 * assume the record was written by a different version of the app, edited by hand, or cut
 * off half way, and must never turn any of those into a Rule Set that looks plausible and
 * generates a wrong chart.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";
import { createMemoryStore } from "@/state/store";
import {
  RULES_RECORD_VERSION,
  RULES_STORAGE_KEY,
  createRuleSetStore,
  parseRuleSet,
  serializeRuleSet,
} from "./storage";

const CUSTOM: RuleSet = {
  decks: 2,
  dealerSoft17: "stand",
  blackjackPayout: "6:5",
  doubleAfterSplit: false,
  doubleRule: "10-11",
  surrender: "early",
  maxSplitHands: 2,
  resplitAces: true,
  oneCardToSplitAces: false,
  dealerPeek: false,
  penetration: 0.6,
  minBet: 5,
  maxBet: 250,
};

describe("round trip", () => {
  it("restores every field exactly", () => {
    expect(parseRuleSet(serializeRuleSet(CUSTOM))).toEqual(CUSTOM);
    expect(parseRuleSet(serializeRuleSet(DEFAULT_RULES))).toEqual(DEFAULT_RULES);
  });

  it("survives a store round trip", async () => {
    const store = createRuleSetStore(createMemoryStore());
    expect(await store.load()).toBeUndefined();
    await store.save(CUSTOM);
    expect(await store.load()).toEqual(CUSTOM);
  });

  it("writes one record under the versioned truecount namespace", async () => {
    const backing = createMemoryStore();
    await createRuleSetStore(backing).save(CUSTOM);
    expect(await backing.getAllKeys()).toEqual([RULES_STORAGE_KEY]);
    expect(RULES_STORAGE_KEY.startsWith("truecount/v1")).toBe(true);
  });

  it("clears back to nothing stored", async () => {
    const backing = createMemoryStore();
    const store = createRuleSetStore(backing);
    await store.save(CUSTOM);
    await store.clear();
    expect(await store.load()).toBeUndefined();
    expect(await backing.getAllKeys()).toEqual([]);
  });
});

describe("a record that cannot be trusted", () => {
  const rejected: readonly [string, string][] = [
    ["empty", ""],
    ["not JSON", "{oh dear"],
    ["JSON but not an object", '"rules"'],
    ["an array", "[]"],
    ["null", "null"],
    ["no version", JSON.stringify({ rules: DEFAULT_RULES })],
    ["a future version", JSON.stringify({ version: 99, rules: DEFAULT_RULES })],
    ["no rules", JSON.stringify({ version: RULES_RECORD_VERSION })],
    [
      "a missing field",
      JSON.stringify({ version: RULES_RECORD_VERSION, rules: { ...DEFAULT_RULES, decks: undefined } }),
    ],
    [
      "a field of the wrong type",
      JSON.stringify({ version: RULES_RECORD_VERSION, rules: { ...DEFAULT_RULES, decks: "six" } }),
    ],
    [
      "an unknown enum value",
      JSON.stringify({
        version: RULES_RECORD_VERSION,
        rules: { ...DEFAULT_RULES, blackjackPayout: "7:5" },
      }),
    ],
    [
      "a boolean sent as a string",
      JSON.stringify({
        version: RULES_RECORD_VERSION,
        rules: { ...DEFAULT_RULES, dealerPeek: "true" },
      }),
    ],
    [
      "NaN smuggled in as null",
      JSON.stringify({ version: RULES_RECORD_VERSION, rules: { ...DEFAULT_RULES, penetration: NaN } }),
    ],
  ];

  it.each(rejected)("rejects %s", (_name, raw) => {
    expect(parseRuleSet(raw)).toBeUndefined();
  });

  it("rejects null and undefined outright", () => {
    expect(parseRuleSet(null)).toBeUndefined();
    expect(parseRuleSet(undefined)).toBeUndefined();
  });

  it("rejects a record that parses cleanly but validateRules refuses", () => {
    // Nine decks is well-formed JSON of exactly the right shape, and still not a game.
    const raw = JSON.stringify({
      version: RULES_RECORD_VERSION,
      rules: { ...DEFAULT_RULES, decks: 9 },
    });
    expect(parseRuleSet(raw)).toBeUndefined();
  });

  it("falls back to nothing stored rather than throwing", async () => {
    const backing = createMemoryStore({ [RULES_STORAGE_KEY]: "{corrupt" });
    expect(await createRuleSetStore(backing).load()).toBeUndefined();
  });
});

describe("the write path", () => {
  it("refuses to persist an invalid Rule Set", async () => {
    const backing = createMemoryStore();
    await createRuleSetStore(backing).save({ ...DEFAULT_RULES, maxBet: 1, minBet: 100 });
    expect(await backing.getAllKeys()).toEqual([]);
  });

  it("leaves an existing sound record alone when handed an invalid one", async () => {
    const backing = createMemoryStore();
    const store = createRuleSetStore(backing);
    await store.save(CUSTOM);
    await store.save({ ...DEFAULT_RULES, decks: 0 });
    expect(await store.load()).toEqual(CUSTOM);
  });
});
