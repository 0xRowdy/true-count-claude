/**
 * Bet sizing for a blackjack strategy (the builder's "Bet sizing" tab): how many units to bet
 * at each true count, the unit in dollars, the spread it adds up to, and a rules check
 * against the table's limits. Practice chips only; nothing here is a wager.
 *
 * React-free, so it runs under vitest.
 */

import type { RuleSet } from "@/engine";
import { formatDollars } from "@/games/craps";
import { type BetRamp, RAMP_STEPS } from "@/state/strategies";

/** "≤ 0", "+1" … "+5 or more". */
export const RAMP_LABELS: readonly string[] = ["≤ 0", "+1", "+2", "+3", "+4", "+5 or more"];

const DEFAULT_UNITS = [1, 1, 2, 4, 6, 8];

/** The ramp a draft starts with: one table minimum per unit, a 1–8 spread. */
export function defaultRamp(rules: RuleSet): BetRamp {
  return { unit: rules.minBet, units: DEFAULT_UNITS };
}

export function rampOf(draft: { rules: RuleSet; ramp?: BetRamp }): BetRamp {
  return draft.ramp ?? defaultRamp(draft.rules);
}

/** Locale-free, so it reads the same everywhere. */
const money = formatDollars;

export interface RampRow {
  readonly label: string;
  readonly units: number;
  readonly dollars: string;
}

export function rampRows(ramp: BetRamp): RampRow[] {
  return ramp.units.map((u, i) => ({
    label: RAMP_LABELS[i] ?? "",
    units: u,
    dollars: money(u * ramp.unit),
  }));
}

/** "1–8 spread". */
export function spreadLabel(ramp: BetRamp): string {
  const lo = Math.min(...ramp.units);
  const hi = Math.max(...ramp.units);
  return `${lo}–${hi} spread`;
}

export function stepUnits(ramp: BetRamp, index: number, dir: 1 | -1): BetRamp {
  if (index < 0 || index >= RAMP_STEPS) return ramp;
  const units = ramp.units.map((u, i) => (i === index ? Math.min(100, Math.max(1, u + dir)) : u));
  return { ...ramp, units };
}

/** The unit moves in $5 steps (never below $5). */
export function stepUnit(ramp: BetRamp, dir: 1 | -1): BetRamp {
  return { ...ramp, unit: Math.max(5, ramp.unit + dir * 5) };
}

/** The spread past which a shoe of this size reads as aggressive. */
export function aggressiveSpread(decks: number): number {
  return decks <= 1 ? 4 : decks <= 2 ? 8 : 12;
}

export interface RampCheck {
  readonly level: "ok" | "warn" | "problem";
  readonly title: string;
  readonly body: string;
}

/** Limits first (min and max bet), then the shape (never shrink as the count rises), then the spread. */
export function checkRamp(ramp: BetRamp, rules: RuleSet): RampCheck {
  const problems: string[] = [];
  const low = Math.min(...ramp.units) * ramp.unit;
  const high = Math.max(...ramp.units) * ramp.unit;
  if (low < rules.minBet) {
    problems.push(
      `Your smallest bet, ${money(low)}, is under the ${money(rules.minBet)} table minimum.`,
    );
  }
  if (high > rules.maxBet) {
    problems.push(
      `Your top bet, ${money(high)}, is over the ${money(rules.maxBet)} table maximum.`,
    );
  }
  if (ramp.units.some((u, i) => i > 0 && u < (ramp.units[i - 1] ?? 0))) {
    problems.push("A bet shrinks as the count rises. Bet the same or more at every higher count.");
  }
  if (problems.length)
    return { level: "problem", title: "Check this ramp", body: problems.join(" ") };

  const spread = Math.max(...ramp.units) / Math.min(...ramp.units);
  const limit = aggressiveSpread(rules.decks);
  const shoe = `${rules.decks}-deck ${rules.decks === 1 ? "game" : "shoe"}`;
  if (spread > limit) {
    return {
      level: "warn",
      title: `Aggressive for a ${shoe}`,
      body: `A ${spreadLabel(ramp)} jumps from ${money(low)} to ${money(high)}. Spreads past 1–${limit} in a ${shoe} are what pit bosses watch for. Fine for practice chips; know it before a real table.`,
    };
  }
  return {
    level: "ok",
    title: `Rules-checked for ${money(rules.minBet)}–${money(rules.maxBet)} tables`,
    body: `${money(low)} to ${money(high)}: a ${spreadLabel(ramp)}, inside the table limits and a usual size for a ${shoe}.`,
  };
}
