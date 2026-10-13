/**
 * Craps rules — the table configuration.
 *
 * Like the blackjack Rule Set, every payout, max-odds check and edge figure takes one of these;
 * there is no global "current table". The presets mirror the tables the design names:
 * Downtown 3-4-5x (06, 10b, 11), and the 2x / 10x / 100x odds tables on the landing page.
 */

import type { PointNumber } from "./dice";
import { formatDollars } from "./money";

/** How much odds a line or come bet may take, as a multiple of the flat bet. */
export type OddsRule =
  | { readonly kind: "3-4-5x" }
  | { readonly kind: "flat"; readonly multiple: number };

/** When the 5% vig on a buy or lay bet is collected. */
export type CommissionTiming = "on-win" | "upfront";

export interface CommissionRule {
  /** Fraction of the bet (buy) or of the win (lay) charged, e.g. 0.05. */
  readonly rate: number;
  readonly timing: CommissionTiming;
  /** Smallest commission ever charged, in whole dollars (casinos charge at least $1). */
  readonly minimum: number;
}

export interface CrapsRules {
  readonly odds: OddsRule;
  /** Field pays this multiple on a 2. The design's table: 2 and 12 pay double. */
  readonly fieldTwoPays: 2 | 3;
  /** Field pays this multiple on a 12. Some tables pay triple. */
  readonly fieldTwelvePays: 2 | 3;
  readonly buyCommission: CommissionRule;
  readonly layCommission: CommissionRule;
  /** Whether hardway bets work on the come-out by default. Most tables: off. */
  readonly hardwaysWorkOnComeOut: boolean;
  readonly minBet: number;
  readonly maxBet: number;
}

export const DEFAULT_COMMISSION: CommissionRule = { rate: 0.05, timing: "on-win", minimum: 1 };

/** Downtown Craps — the table the design shows: 3-4-5x odds, $10–$2,000. */
export const DOWNTOWN_RULES: CrapsRules = {
  odds: { kind: "3-4-5x" },
  fieldTwoPays: 2,
  fieldTwelvePays: 2,
  buyCommission: DEFAULT_COMMISSION,
  layCommission: DEFAULT_COMMISSION,
  hardwaysWorkOnComeOut: false,
  minBet: 10,
  maxBet: 2000,
};

export const DEFAULT_CRAPS_RULES = DOWNTOWN_RULES;

export type CrapsPresetId = "3-4-5x" | "2x" | "10x" | "100x";

export const CRAPS_PRESETS: Readonly<Record<CrapsPresetId, CrapsRules>> = {
  "3-4-5x": DOWNTOWN_RULES,
  "2x": { ...DOWNTOWN_RULES, odds: { kind: "flat", multiple: 2 }, minBet: 5, maxBet: 1000 },
  "10x": { ...DOWNTOWN_RULES, odds: { kind: "flat", multiple: 10 }, fieldTwelvePays: 3 },
  "100x": { ...DOWNTOWN_RULES, odds: { kind: "flat", multiple: 100 }, minBet: 5, maxBet: 5000 },
};

/** The odds multiple allowed when the point (or come point) is `point`. */
export function maxOddsMultiple(rules: CrapsRules, point: PointNumber): number {
  if (rules.odds.kind === "flat") return rules.odds.multiple;
  if (point === 4 || point === 10) return 3;
  if (point === 5 || point === 9) return 4;
  return 5;
}

/** Odds rule shorthand: "3-4-5x", "2x", "10x", "100x". */
export function oddsLabel(rules: CrapsRules): string {
  return rules.odds.kind === "3-4-5x" ? "3-4-5x" : `${rules.odds.multiple}x`;
}

/**
 * The table summary the header shows: "3-4-5x odds · $10–$2,000", with " · Point: 6" when a
 * point is on.
 */
export function tableLabel(rules: CrapsRules, point?: PointNumber | null): string {
  const base = `${oddsLabel(rules)} odds · ${formatDollars(rules.minBet)}–${formatDollars(rules.maxBet)}`;
  return point ? `${base} · Point: ${point}` : base;
}

/** Returns the reasons a rule set is invalid, or an empty array if it is sound. */
export function validateCrapsRules(rules: CrapsRules): string[] {
  const problems: string[] = [];
  if (rules.odds.kind === "flat") {
    const m = rules.odds.multiple;
    if (!Number.isInteger(m) || m < 1 || m > 100) problems.push("odds multiple must be 1–100");
  }
  for (const [name, c] of [
    ["buy", rules.buyCommission],
    ["lay", rules.layCommission],
  ] as const) {
    if (c.rate < 0 || c.rate > 0.1) problems.push(`${name} commission rate must be 0–10%`);
    if (!Number.isInteger(c.minimum) || c.minimum < 0) {
      problems.push(`${name} commission minimum must be a whole dollar amount`);
    }
  }
  if (!Number.isInteger(rules.minBet) || rules.minBet < 1) {
    problems.push("minBet must be a positive whole dollar amount");
  }
  if (!Number.isInteger(rules.maxBet) || rules.maxBet < rules.minBet) {
    problems.push("maxBet must be a whole dollar amount at least minBet");
  }
  return problems;
}
