/**
 * Persisting the user's Rule Set.
 *
 * The table you play at is not a preference, it is a fact about your life, and a trainer
 * that forgets it every launch is asking you to re-enter thirteen fields before every
 * session. So it is stored — locally, with no account, per invariant 8.
 *
 * Storage arrives as an injected `KeyValueStore` (`src/state/store.ts`) rather than a
 * direct AsyncStorage call, for the same reason `src/state` does it: everything here is
 * then testable in plain Node against `createMemoryStore()`, with no mocking and no React
 * Native in the test environment.
 *
 * Reads are paranoid. A record written by an older build, hand-edited, or truncated by a
 * crash must never become a half-populated Rule Set that quietly produces a wrong strategy
 * chart — `parseRuleSet` validates every field and returns `undefined` on the first thing
 * it does not recognise, which drops the user back to `DEFAULT_RULES`. A forgotten table
 * is a small annoyance; a silently wrong one is invariant 4 violated.
 */

import {
  type BlackjackPayout,
  type DealerSoft17,
  type DoubleRule,
  type RuleSet,
  type SurrenderRule,
  validateRules,
} from "@/engine/rules";
import type { KeyValueStore } from "@/state/store";

/** Shares the `truecount/v1` namespace the Session repository uses. */
export const RULES_STORAGE_KEY = "truecount/v1/rules";

/** Bump only alongside a migration. Version 1 is the thirteen fields of `RuleSet`. */
export const RULES_RECORD_VERSION = 1;

interface RulesRecord {
  readonly version: number;
  readonly rules: RuleSet;
}

export function serializeRuleSet(rules: RuleSet): string {
  const record: RulesRecord = { version: RULES_RECORD_VERSION, rules };
  return JSON.stringify(record);
}

const DEALER_SOFT_17: readonly DealerSoft17[] = ["stand", "hit"];
const BLACKJACK_PAYOUTS: readonly BlackjackPayout[] = ["3:2", "6:5"];
const SURRENDER_RULES: readonly SurrenderRule[] = ["none", "late", "early"];
const DOUBLE_RULES: readonly DoubleRule[] = ["any", "9-11", "10-11"];

/**
 * Reads a stored record back into a Rule Set, or `undefined` if it cannot be trusted.
 *
 * The final gate is `validateRules` itself, so a record can never reintroduce a rule set
 * the engine considers impossible — the persisted copy is held to exactly the same
 * standard as one typed in on the screen.
 */
export function parseRuleSet(raw: string | null | undefined): RuleSet | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) return undefined;
  if (parsed["version"] !== RULES_RECORD_VERSION) return undefined;

  const source = parsed["rules"];
  if (!isRecord(source)) return undefined;

  const decks = numberField(source, "decks");
  const dealerSoft17 = memberField(source, "dealerSoft17", DEALER_SOFT_17);
  const blackjackPayout = memberField(source, "blackjackPayout", BLACKJACK_PAYOUTS);
  const doubleAfterSplit = booleanField(source, "doubleAfterSplit");
  const doubleRule = memberField(source, "doubleRule", DOUBLE_RULES);
  const surrender = memberField(source, "surrender", SURRENDER_RULES);
  const maxSplitHands = numberField(source, "maxSplitHands");
  const resplitAces = booleanField(source, "resplitAces");
  const oneCardToSplitAces = booleanField(source, "oneCardToSplitAces");
  const dealerPeek = booleanField(source, "dealerPeek");
  const penetration = numberField(source, "penetration");
  const minBet = numberField(source, "minBet");
  const maxBet = numberField(source, "maxBet");

  if (
    decks === undefined ||
    dealerSoft17 === undefined ||
    blackjackPayout === undefined ||
    doubleAfterSplit === undefined ||
    doubleRule === undefined ||
    surrender === undefined ||
    maxSplitHands === undefined ||
    resplitAces === undefined ||
    oneCardToSplitAces === undefined ||
    dealerPeek === undefined ||
    penetration === undefined ||
    minBet === undefined ||
    maxBet === undefined
  ) {
    return undefined;
  }

  const rules: RuleSet = {
    decks,
    dealerSoft17,
    blackjackPayout,
    doubleAfterSplit,
    doubleRule,
    surrender,
    maxSplitHands,
    resplitAces,
    oneCardToSplitAces,
    dealerPeek,
    penetration,
    minBet,
    maxBet,
  };

  return validateRules(rules).length === 0 ? rules : undefined;
}

export interface RuleSetStore {
  /** The stored Rule Set, or `undefined` if there is none or it cannot be trusted. */
  load(): Promise<RuleSet | undefined>;
  save(rules: RuleSet): Promise<void>;
  clear(): Promise<void>;
}

export function createRuleSetStore(store: KeyValueStore): RuleSetStore {
  return {
    load: async () => parseRuleSet(await store.getItem(RULES_STORAGE_KEY)),
    save: async (rules) => {
      // Refusing to persist an invalid Rule Set keeps the "a stored record is always
      // sound" promise true at the write end as well as the read end.
      if (validateRules(rules).length > 0) return;
      await store.setItem(RULES_STORAGE_KEY, serializeRuleSet(rules));
    },
    clear: () => store.removeItem(RULES_STORAGE_KEY),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanField(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

function memberField<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = source[key];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
