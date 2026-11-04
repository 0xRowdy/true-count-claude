/**
 * Strategy plans: a base bet layout, a progression, and session rules — simulated spin by
 * spin from a seed.
 *
 * Progressions scale the whole base layout:
 *   - flat       — the same layout every spin.
 *   - martingale — double after every losing spin, back to base after a winning one.
 *   - dalembert  — one more unit after a loss, one fewer after a win (never below one).
 *
 * A spin "loses" when its net is negative and "wins" when positive; a spin that breaks even
 * (possible with several bets on the felt) leaves the progression where it is.
 *
 * No progression changes the house edge — every spin still loses the same fraction of what is
 * staked on average. What they change is the shape of the losses, and Martingale's shape runs
 * into the table maximum. The simulation caps each bet at the table maximum and records it.
 */

import { type Rng, createRng } from "../../engine/rng";
import { getSpot } from "./layout";
import { type Bet, scaleBets, settleBets, spinWheel, totalStake } from "./spin";
import { fromCents, toCents } from "./format";
import type { Pocket, RouletteRules } from "./wheel";

export type ProgressionKind = "flat" | "martingale" | "dalembert" | "custom";

export const PROGRESSION_ACTIONS = ["reset", "hold", "add", "subtract", "double"] as const;
export type ProgressionAction = (typeof PROGRESSION_ACTIONS)[number];

export interface CustomProgression {
  readonly afterLoss: ProgressionAction;
  readonly afterWin: ProgressionAction;
  /** Base-layout units added or removed; always a whole number from 1 to 10. */
  readonly units: number;
}

export const DEFAULT_CUSTOM_PROGRESSION: CustomProgression = {
  afterLoss: "add",
  afterWin: "reset",
  units: 1,
};

export const PROGRESSION_NAMES: Readonly<Record<ProgressionKind, string>> = {
  flat: "Flat bet",
  martingale: "Martingale",
  dalembert: "D'Alembert",
  custom: "Custom",
};

export const PROGRESSION_DESCRIPTIONS: Readonly<Record<ProgressionKind, string>> = {
  flat: "Same bet every spin",
  martingale: "Double after a loss",
  dalembert: "+1 unit after a loss",
  custom: "Choose your own rule",
};

export interface SessionRules {
  /** Stop once the session is up by at least this much. */
  readonly stopWhenUp?: number;
  /** Stop once the session is down by at least this much (a positive number). */
  readonly stopWhenDown?: number;
  readonly maxSpins: number;
}

export interface StrategyPlan {
  readonly rules: RouletteRules;
  /** The base layout, staked at one unit (multiplier 1). */
  readonly bets: readonly Bet[];
  readonly progression: ProgressionKind;
  readonly customProgression?: CustomProgression;
  readonly session: SessionRules;
  /** Chips available. Defaults to unlimited. */
  readonly bankroll?: number;
}

export type StopReason = "stopWhenUp" | "stopWhenDown" | "maxSpins" | "bankroll";

export interface PlanSpin {
  readonly index: number;
  readonly pocket: Pocket;
  /** Progression multiplier applied to the base layout before capping. */
  readonly multiplier: number;
  readonly staked: number;
  readonly net: number;
  /** Session net after this spin. */
  readonly cumulative: number;
  /** True when at least one bet was cut down to the table maximum. */
  readonly capped: boolean;
}

export interface PlanResult {
  readonly spins: readonly PlanSpin[];
  readonly finalNet: number;
  readonly stopReason: StopReason;
  readonly peak: number;
  readonly trough: number;
  readonly largestStake: number;
  readonly hitTableMax: boolean;
}

export interface ProgressionState {
  readonly multiplier: number;
}

export const INITIAL_PROGRESSION: ProgressionState = { multiplier: 1 };

/** Advance a progression after a spin with the given net result. */
export function nextProgression(
  kind: ProgressionKind,
  state: ProgressionState,
  spinNet: number,
  custom: CustomProgression = DEFAULT_CUSTOM_PROGRESSION,
): ProgressionState {
  if (spinNet === 0 || kind === "flat") return state;
  // Beyond this point every practical table is capped. Keep recorded state finite and
  // serializable even for a custom rule that doubles after both wins and losses.
  const doubled = Math.min(Number.MAX_SAFE_INTEGER, state.multiplier * 2);
  if (kind === "martingale") return { multiplier: spinNet < 0 ? doubled : 1 };
  if (kind === "custom") {
    const action = spinNet < 0 ? custom.afterLoss : custom.afterWin;
    switch (action) {
      case "reset":
        return INITIAL_PROGRESSION;
      case "hold":
        return state;
      case "double":
        return { multiplier: doubled };
      case "add":
        return { multiplier: Math.min(Number.MAX_SAFE_INTEGER, state.multiplier + custom.units) };
      case "subtract":
        return { multiplier: Math.max(1, state.multiplier - custom.units) };
    }
  }
  return { multiplier: Math.max(1, state.multiplier + (spinNet < 0 ? 1 : -1)) };
}

/** The Martingale bet after `losses` losses in a row: `base × 2^losses`. */
export function martingaleBet(base: number, losses: number): number {
  return base * 2 ** losses;
}

/**
 * Losses in a row before a Martingale bet first exceeds the table maximum. With a $100 base
 * and a $5,000 max that is 6: the seventh bet would be $6,400.
 */
export function lossesUntilOverMax(base: number, tableMax: number): number {
  if (base <= 0) throw new Error("The base bet must be positive.");
  let losses = 0;
  while (martingaleBet(base, losses) <= tableMax) losses++;
  return losses;
}

/** Apply a multiplier to the base layout and cap each spot at the table maximum. */
export function stakeForSpin(
  rules: RouletteRules,
  base: readonly Bet[],
  multiplier: number,
): { bets: Bet[]; capped: boolean } {
  let capped = false;
  const bets = scaleBets(base, multiplier).map((b) => {
    if (b.amount <= rules.limits.max) return b;
    capped = true;
    return { spotId: b.spotId, amount: rules.limits.max };
  });
  return { bets, capped };
}

/** Simulate one session of the plan with an injected Rng. */
export function simulatePlanWith(plan: StrategyPlan, rng: Rng): PlanResult {
  if (
    !Number.isSafeInteger(plan.session.maxSpins) ||
    plan.session.maxSpins < 1 ||
    plan.session.maxSpins > 100_000
  )
    throw new Error("A simulation needs a whole number of spins from 1 to 100,000.");
  for (const b of plan.bets) {
    if (!getSpot(plan.rules, b.spotId)) throw new Error(`Unknown bet spot "${b.spotId}".`);
  }
  const { stopWhenUp, stopWhenDown, maxSpins } = plan.session;
  const spins: PlanSpin[] = [];
  let progression = INITIAL_PROGRESSION;
  let cumulative = 0;
  let peak = 0;
  let trough = 0;
  let largestStake = 0;
  let hitTableMax = false;
  let stopReason: StopReason = "maxSpins";

  for (let index = 0; index < maxSpins; index++) {
    if (stopWhenUp !== undefined && cumulative >= stopWhenUp) {
      stopReason = "stopWhenUp";
      break;
    }
    if (stopWhenDown !== undefined && cumulative <= -stopWhenDown) {
      stopReason = "stopWhenDown";
      break;
    }
    const { bets, capped } = stakeForSpin(plan.rules, plan.bets, progression.multiplier);
    const staked = totalStake(bets);
    if (
      plan.bankroll !== undefined &&
      toCents(staked) > toCents(plan.bankroll) + toCents(cumulative)
    ) {
      stopReason = "bankroll";
      break;
    }
    const pocket = spinWheel(plan.rules, rng);
    const { net } = settleBets(plan.rules, bets, pocket);
    cumulative = fromCents(toCents(cumulative) + toCents(net));
    peak = Math.max(peak, cumulative);
    trough = Math.min(trough, cumulative);
    largestStake = Math.max(largestStake, staked);
    hitTableMax ||= capped;
    spins.push({
      index,
      pocket,
      multiplier: progression.multiplier,
      staked,
      net,
      cumulative,
      capped,
    });
    progression = nextProgression(plan.progression, progression, net, plan.customProgression);
  }
  if (spins.length === maxSpins) {
    // The last spin may itself have crossed a stop line; report that rather than maxSpins.
    if (stopWhenUp !== undefined && cumulative >= stopWhenUp) stopReason = "stopWhenUp";
    else if (stopWhenDown !== undefined && cumulative <= -stopWhenDown) stopReason = "stopWhenDown";
  }

  return { spins, finalNet: cumulative, stopReason, peak, trough, largestStake, hitTableMax };
}

/** Simulate one session of the plan, reproducibly from `seed`. */
export function simulatePlan(plan: StrategyPlan, seed: number): PlanResult {
  return simulatePlanWith(plan, createRng(seed));
}

export interface PlanSummary {
  readonly sessions: number;
  readonly averageNet: number;
  /** Fraction of sessions that finished ahead. */
  readonly winningSessions: number;
  readonly stopReasons: Readonly<Record<StopReason, number>>;
  readonly averageSpins: number;
  readonly averageStaked: number;
  /** Realised loss per chip staked across every session — converges on the house edge. */
  readonly realisedEdge: number;
  readonly worstNet: number;
  readonly bestNet: number;
  readonly hitTableMaxSessions: number;
}

/** Simulate many sessions (session `i` uses seed `seed + i`) and summarise them. */
export function simulatePlanMany(plan: StrategyPlan, seed: number, sessions: number): PlanSummary {
  const stopReasons: Record<StopReason, number> = {
    stopWhenUp: 0,
    stopWhenDown: 0,
    maxSpins: 0,
    bankroll: 0,
  };
  let totalNet = 0;
  let totalSpins = 0;
  let totalStaked = 0;
  let winning = 0;
  let worstNet = Infinity;
  let bestNet = -Infinity;
  let hitMax = 0;
  for (let i = 0; i < sessions; i++) {
    const r = simulatePlan(plan, (seed + i) >>> 0);
    totalNet = fromCents(toCents(totalNet) + toCents(r.finalNet));
    totalSpins += r.spins.length;
    totalStaked = fromCents(r.spins.reduce((s, x) => s + toCents(x.staked), toCents(totalStaked)));
    if (r.finalNet > 0) winning++;
    if (r.hitTableMax) hitMax++;
    worstNet = Math.min(worstNet, r.finalNet);
    bestNet = Math.max(bestNet, r.finalNet);
    stopReasons[r.stopReason]++;
  }
  return {
    sessions,
    averageNet: sessions > 0 ? totalNet / sessions : 0,
    winningSessions: sessions > 0 ? winning / sessions : 0,
    stopReasons,
    averageSpins: sessions > 0 ? totalSpins / sessions : 0,
    averageStaked: sessions > 0 ? totalStaked / sessions : 0,
    realisedEdge: totalStaked > 0 ? -totalNet / totalStaked : 0,
    worstNet: sessions > 0 ? worstNet : 0,
    bestNet: sessions > 0 ? bestNet : 0,
    hitTableMaxSessions: hitMax,
  };
}
