/**
 * The roulette Strategy Builder's view model (design 10c, D0h320), on top of the roulette
 * engine: coverage, the exact per-spin outcome table, the selected bet's facts and amount
 * controls, the progression warning, and the differences from the original layout.
 *
 * React-free, so it runs under vitest with the engine.
 */

import {
  type Bet,
  type BetSpot,
  type InsideBetType,
  type Pocket,
  type ProgressionKind,
  type RouletteRules,
  BET_TYPE_NAMES,
  PROGRESSION_DESCRIPTIONS,
  PROGRESSION_NAMES,
  DEFAULT_CUSTOM_PROGRESSION,
  analyzeBets,
  averageResultCaption,
  betsTouching,
  describeGameRules,
  describeSpot,
  explainMartingaleRisk,
  formatDollars,
  formatPercent,
  formatSignedDollars,
  getLayout,
  getSpot,
  isInsideBet,
  outcomeGroupCopy,
  pocketColor,
  pocketsEquallyLikely,
  simulatePlan,
  simulatePlanMany,
  spotTitle,
  totalStake,
  uncoveredNote,
  validateBets,
} from "@/games/roulette";
import { type RouletteLayoutPlan, MAX_ROULETTE_DRAFT_SPINS } from "@/state/strategies";

/** Inside bets whose felt label does not say what kind of bet it is. */
const NAMED_INSIDE: ReadonlySet<string> = new Set<InsideBetType>([
  "split",
  "street",
  "trio",
  "corner",
  "firstFour",
  "topLine",
  "sixLine",
]);

export function coverage(layout: RouletteLayoutPlan): {
  covered: number;
  total: number;
  label: string;
} {
  const a = analyzeBets(layout.rules, layout.bets);
  const total = getLayout(layout.rules).pockets.length;
  return {
    covered: a.covered.length,
    total,
    label: `Covers ${a.covered.length} of ${total} numbers`,
  };
}

export interface OutcomeRow {
  readonly title: string;
  readonly pockets: string;
  readonly percent: string;
  readonly net: string;
  readonly netValue: number;
  readonly count: number;
  /** Index into the win shades (winning rows), or -1 for a losing row. */
  readonly shade: number;
}

export interface OutcomeTable {
  readonly rows: readonly OutcomeRow[];
  readonly caption: string;
  readonly average: string;
  readonly averageValue: number;
  readonly averageCaption: string;
  readonly uncovered: string | undefined;
}

/** "What happens on each spin": one row per distinct result, winners first. */
export function outcomeTable(layout: RouletteLayoutPlan): OutcomeTable {
  const { rules, bets } = layout;
  const a = analyzeBets(rules, bets);
  let shade = 0;
  const rows = a.groups.map((g) => {
    const copy = outcomeGroupCopy(g);
    const only =
      g.winningSpotIds.length === 1 ? getSpot(rules, g.winningSpotIds[0] ?? "") : undefined;
    const suffix =
      only && NAMED_INSIDE.has(only.type) ? ` (${BET_TYPE_NAMES[only.type].toLowerCase()})` : "";
    return {
      title: `${copy.title}${suffix}`,
      pockets: copy.pockets,
      percent: formatPercent(g.probability),
      net: formatSignedDollars(g.net),
      netValue: g.net,
      count: g.count,
      shade: g.net > 0 ? shade++ : -1,
    };
  });
  return {
    rows,
    caption: pocketsEquallyLikely(rules),
    average: formatSignedDollars(a.expectedValue),
    averageValue: a.expectedValue,
    averageCaption: bets.length ? averageResultCaption(rules, bets) : "No bets on the layout yet",
    uncovered: bets.length ? uncoveredNote(rules, bets) : undefined,
  };
}

/** Pockets a layout wins on (for dimming the uncovered numbers on the felt). */
export function coveredPockets(layout: RouletteLayoutPlan): Set<string> {
  return new Set(analyzeBets(layout.rules, layout.bets).covered.map(String));
}

// ---------------------------------------------------------------------------
// The selected bet
// ---------------------------------------------------------------------------

export interface CoverCell {
  readonly label: string;
  readonly color: "red" | "black" | "green";
}

export interface BetPanel {
  readonly title: string;
  readonly covers: readonly CoverCell[];
  readonly pays: string;
  readonly wins: string;
  readonly ifItHits: string;
  readonly amount: string;
  /** "Original: $50 of $200". */
  readonly original: string;
  /** "Yours: $25 of $100". */
  readonly yours: string;
  readonly matchesOriginalShare: boolean;
}

export function betPanel(
  layout: RouletteLayoutPlan,
  original: RouletteLayoutPlan,
  spotId: string,
): BetPanel | null {
  const spot = getSpot(layout.rules, spotId);
  const bet = layout.bets.find((b) => b.spotId === spotId);
  if (!spot || !bet) return null;
  const d = describeSpot(layout.rules, spot, bet.amount);
  const orig = original.bets.find((b) => b.spotId === spotId);
  const total = totalStake(layout.bets);
  const origTotal = totalStake(original.bets);
  return {
    title: d.title,
    covers: d.covers.map((p) => ({ label: String(p), color: pocketColor(p) })),
    pays: d.pays,
    wins: d.wins,
    ifItHits: d.ifItHits,
    amount: formatDollars(bet.amount),
    original: orig
      ? `Original: ${formatDollars(orig.amount)} of ${formatDollars(origTotal)}`
      : "Original: not in the layout",
    yours: `Yours: ${formatDollars(bet.amount)} of ${formatDollars(total)}`,
    matchesOriginalShare: orig
      ? Math.abs(bet.amount / total - orig.amount / origTotal) < 1e-9
      : false,
  };
}

/** One unit for a spot: the inside minimum for inside bets, the table minimum outside. */
export function unitFor(rules: RouletteRules, spot: BetSpot): number {
  return isInsideBet(spot.type) ? rules.limits.insideMin : rules.limits.min;
}

function setAmount(layout: RouletteLayoutPlan, spotId: string, amount: number): RouletteLayoutPlan {
  const clean = Math.max(1, Math.round(amount));
  return {
    ...layout,
    bets: layout.bets.map((b) => (b.spotId === spotId ? { ...b, amount: clean } : b)),
  };
}

export type AmountPreset = "half" | "unit" | "double" | "match";

export const AMOUNT_PRESETS: readonly { id: AmountPreset; label: string }[] = [
  { id: "half", label: "Half" },
  { id: "unit", label: "1 unit" },
  { id: "double", label: "Double" },
  { id: "match", label: "Match original %" },
];

/** Applies an amount preset. "Match original %" gives the bet the same share of the spin it had. */
export function applyPreset(
  layout: RouletteLayoutPlan,
  original: RouletteLayoutPlan,
  spotId: string,
  preset: AmountPreset,
): RouletteLayoutPlan {
  const spot = getSpot(layout.rules, spotId);
  const bet = layout.bets.find((b) => b.spotId === spotId);
  if (!spot || !bet) return layout;
  switch (preset) {
    case "half":
      return setAmount(layout, spotId, bet.amount / 2);
    case "unit":
      return setAmount(layout, spotId, unitFor(layout.rules, spot));
    case "double":
      return setAmount(layout, spotId, bet.amount * 2);
    case "match": {
      const orig = original.bets.find((b) => b.spotId === spotId);
      if (!orig) return layout;
      const share = orig.amount / totalStake(original.bets);
      const others = totalStake(layout.bets) - bet.amount;
      if (share >= 1 || others <= 0) return layout;
      return setAmount(layout, spotId, (share * others) / (1 - share));
    }
  }
}

/** Steps a bet by one unit (removing it below one unit is "Remove bet", not the stepper). */
export function stepBet(
  layout: RouletteLayoutPlan,
  spotId: string,
  dir: 1 | -1,
): RouletteLayoutPlan {
  const spot = getSpot(layout.rules, spotId);
  const bet = layout.bets.find((b) => b.spotId === spotId);
  if (!spot || !bet) return layout;
  const unit = unitFor(layout.rules, spot);
  return setAmount(layout, spotId, Math.max(unit, bet.amount + dir * unit));
}

/** Taps a spot: selects its bet, or puts one unit there. Returns the layout and the selection. */
export function tapSpot(layout: RouletteLayoutPlan, spotId: string): RouletteLayoutPlan {
  const spot = getSpot(layout.rules, spotId);
  if (!spot || layout.bets.some((b) => b.spotId === spotId)) return layout;
  return { ...layout, bets: [...layout.bets, { spotId, amount: unitFor(layout.rules, spot) }] };
}

export function removeBet(layout: RouletteLayoutPlan, spotId: string): RouletteLayoutPlan {
  return { ...layout, bets: layout.bets.filter((b) => b.spotId !== spotId) };
}

/** The other inside bets a straight-up can widen into ("Split 16 | 17", "Six line 13–18"…). */
export function widenOptions(layout: RouletteLayoutPlan, spotId: string): BetSpot[] {
  const spot = getSpot(layout.rules, spotId);
  if (!spot || !isInsideBet(spot.type)) return [];
  const anchor: Pocket | undefined = spot.pockets[0];
  if (anchor === undefined) return [];
  const seen = new Set<string>();
  const out: BetSpot[] = [];
  for (const s of betsTouching(layout.rules, anchor, { insideOnly: true })) {
    if (s.id === spotId || seen.has(s.type)) continue;
    if (layout.bets.some((b) => b.spotId === s.id)) continue;
    seen.add(s.type);
    out.push(s);
  }
  return out;
}

/** Moves a bet's chips to another spot (keeping its amount). */
export function moveBet(layout: RouletteLayoutPlan, from: string, to: string): RouletteLayoutPlan {
  return {
    ...layout,
    bets: layout.bets.map((b) => (b.spotId === from ? { spotId: to, amount: b.amount } : b)),
  };
}

export interface BetCheck {
  readonly ok: boolean;
  readonly title: string;
  readonly body: string;
}

/** "Rules-checked for European roulette". */
export function wheelName(rules: RouletteRules): string {
  if (rules.wheel === "american") return "American roulette";
  return rules.laPartage ? "French roulette" : "European roulette";
}

export function checkBet(
  layout: RouletteLayoutPlan,
  original: RouletteLayoutPlan,
  spotId: string,
): BetCheck {
  const issues = validateBets(layout.rules, layout.bets).filter(
    (i) => !i.spotId || i.spotId === spotId,
  );
  const spot = getSpot(layout.rules, spotId);
  const bet = layout.bets.find((b) => b.spotId === spotId);
  if (!spot || !bet) return { ok: false, title: "Pick a bet", body: "" };
  if (issues.length)
    return { ok: false, title: "Check this bet", body: issues.map((i) => i.message).join(" ") };
  const min = isInsideBet(spot.type)
    ? `Meets the ${formatDollars(layout.rules.limits.insideMin)} inside minimum.`
    : `Meets the ${formatDollars(layout.rules.limits.min)} outside minimum.`;
  const share = bet.amount / totalStake(layout.bets);
  const orig = original.bets.find((b) => b.spotId === spotId);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  let tail: string;
  if (!orig) tail = `It takes ${pct(share)} of each spin.`;
  else {
    const origShare = orig.amount / totalStake(original.bets);
    tail =
      Math.abs(origShare - share) < 1e-9
        ? `Same ${pct(share)} share of the spin as the original, so the payouts scale exactly.`
        : `${pct(share)} of the spin; the original put ${pct(origShare)} here.`;
  }
  return {
    ok: true,
    title: `Rules-checked for ${wheelName(layout.rules)}`,
    body: `${min} ${tail}`,
  };
}

/** The whole layout's check, for Test & submit. */
export function checkLayout(layout: RouletteLayoutPlan): BetCheck {
  if (layout.bets.length === 0)
    return { ok: false, title: "Add a bet first", body: "The layout is empty." };
  const issues = validateBets(layout.rules, layout.bets);
  if (issues.length)
    return { ok: false, title: "Check these bets", body: issues.map((i) => i.message).join(" ") };
  return {
    ok: true,
    title: `Rules-checked for ${wheelName(layout.rules)}`,
    body: `Every bet meets the table limits. ${averageResultCaption(layout.rules, layout.bets)}.`,
  };
}

// ---------------------------------------------------------------------------
// Progression and session
// ---------------------------------------------------------------------------

export function progressionOptions(layout: RouletteLayoutPlan) {
  const total = formatDollars(totalStake(layout.bets));
  return (["flat", "martingale", "dalembert", "custom"] as ProgressionKind[]).map((id) => ({
    id,
    label: PROGRESSION_NAMES[id] === "Flat bet" ? "Flat bet" : PROGRESSION_NAMES[id],
    detail: id === "flat" ? `Same ${total} every spin` : PROGRESSION_DESCRIPTIONS[id],
  }));
}

export function progressionWarning(layout: RouletteLayoutPlan): string {
  if (layout.progression === "custom")
    return "Your rule scales the whole layout. Break-even spins keep the same stake; bets never fall below the base layout and each spot is capped at the table maximum. A progression cannot remove the house edge.";
  return explainMartingaleRisk(Math.max(1, totalStake(layout.bets)));
}

export function progressionDescription(layout: RouletteLayoutPlan): string {
  if (layout.progression !== "custom") return PROGRESSION_NAMES[layout.progression];
  const custom = layout.customProgression ?? DEFAULT_CUSTOM_PROGRESSION;
  const units = `${custom.units} base unit${custom.units === 1 ? "" : "s"}`;
  const labels = {
    reset: "reset to base",
    hold: "keep the stake",
    double: "double the stake",
    add: `add ${units}`,
    subtract: `remove ${units}`,
  };
  return `Custom: after a loss, ${labels[custom.afterLoss]}; after a win, ${labels[custom.afterWin]}`;
}

export type SessionField = "stopWhenUp" | "stopWhenDown" | "maxSpins";

export function sessionCards(layout: RouletteLayoutPlan) {
  const s = layout.session;
  return [
    {
      field: "stopWhenUp" as const,
      label: "Stop when up",
      value: s.stopWhenUp === undefined ? "Off" : formatSignedDollars(s.stopWhenUp),
    },
    {
      field: "stopWhenDown" as const,
      label: "Stop when down",
      value: s.stopWhenDown === undefined ? "Off" : formatSignedDollars(-s.stopWhenDown),
    },
    { field: "maxSpins" as const, label: "Max spins", value: String(s.maxSpins) },
  ];
}

export function stepSession(
  layout: RouletteLayoutPlan,
  field: SessionField,
  dir: 1 | -1,
): RouletteLayoutPlan {
  const s = layout.session;
  if (field === "maxSpins")
    return {
      ...layout,
      session: {
        ...s,
        maxSpins: Math.min(MAX_ROULETTE_DRAFT_SPINS, Math.max(10, s.maxSpins + dir * 10)),
      },
    };
  const next = Math.max(0, (s[field] ?? 0) + dir * 50);
  const session = { ...s };
  if (next === 0) delete session[field];
  else session[field] = next;
  return { ...layout, session };
}

// ---------------------------------------------------------------------------
// Changes against the original
// ---------------------------------------------------------------------------

export interface LayoutChange {
  readonly key: string;
  readonly title: string;
  readonly from: string;
  readonly to: string;
}

/**
 * What differs from the original. A layout that is the original scaled up or down is one
 * change ("Spin size"), not one per bet: every share of the spin is the same.
 */
export function layoutChanges(
  layout: RouletteLayoutPlan,
  original: RouletteLayoutPlan,
): LayoutChange[] {
  const out: LayoutChange[] = [];
  const total = totalStake(layout.bets);
  const origTotal = totalStake(original.bets);
  const name = (id: string) => {
    const s = getSpot(layout.rules, id) ?? getSpot(original.rules, id);
    return s ? spotTitle(s) : id;
  };
  if (
    layout.rules.wheel !== original.rules.wheel ||
    layout.rules.laPartage !== original.rules.laPartage
  ) {
    out.push({
      key: "rules",
      title: "Table",
      from: wheelName(original.rules),
      to: wheelName(layout.rules),
    });
  }
  const sameSpots =
    layout.bets.length === original.bets.length &&
    layout.bets.every((b) => original.bets.some((o) => o.spotId === b.spotId));
  const scaled =
    sameSpots &&
    total > 0 &&
    layout.bets.every((b) => {
      const o = original.bets.find((x) => x.spotId === b.spotId);
      return o !== undefined && Math.abs(b.amount / total - o.amount / origTotal) < 1e-9;
    });
  if (scaled) {
    if (total !== origTotal) {
      out.push({
        key: "spin",
        title: "Spin size",
        from: `${formatDollars(origTotal)} per spin`,
        to: `${formatDollars(total)} per spin`,
      });
    }
  } else {
    for (const b of layout.bets) {
      const o = original.bets.find((x) => x.spotId === b.spotId);
      if (!o)
        out.push({
          key: `bet:${b.spotId}`,
          title: name(b.spotId),
          from: "Not in the layout",
          to: formatDollars(b.amount),
        });
      else if (o.amount !== b.amount) {
        out.push({
          key: `bet:${b.spotId}`,
          title: name(b.spotId),
          from: formatDollars(o.amount),
          to: formatDollars(b.amount),
        });
      }
    }
    for (const o of original.bets) {
      if (!layout.bets.some((b) => b.spotId === o.spotId)) {
        out.push({
          key: `bet:${o.spotId}`,
          title: name(o.spotId),
          from: formatDollars(o.amount),
          to: "Removed",
        });
      }
    }
  }
  if (progressionDescription(layout) !== progressionDescription(original)) {
    out.push({
      key: "progression",
      title: "After each spin",
      from: progressionDescription(original),
      to: progressionDescription(layout),
    });
  }
  const before = sessionCards(original);
  for (const card of sessionCards(layout)) {
    const was = before.find((c) => c.field === card.field);
    if (was && was.value !== card.value) {
      out.push({
        key: `session:${card.field}`,
        title: card.label,
        from: was.value,
        to: card.value,
      });
    }
  }
  return out;
}

/** "Roulette · European · $5 inside min". */
export function rouletteRulesLine(rules: RouletteRules): string {
  return describeGameRules(rules);
}

export function spinTotal(layout: RouletteLayoutPlan): string {
  return formatDollars(totalStake(layout.bets));
}

// ---------------------------------------------------------------------------
// Test & submit: "Play 50 spins with it"
// ---------------------------------------------------------------------------

export function testLayout(layout: RouletteLayoutPlan, seed: number) {
  const plan = {
    ...layout,
    session: { ...layout.session, maxSpins: Math.min(50, layout.session.maxSpins) },
  };
  const one = simulatePlan(plan, seed);
  const many = simulatePlanMany(layout, seed, 200);
  const reason: Record<typeof one.stopReason, string> = {
    stopWhenUp: "Stopped when up.",
    stopWhenDown: "Stopped when down.",
    maxSpins: `Played ${one.spins.length} spins.`,
    bankroll: "Ran out of chips.",
  };
  return {
    spins: one.spins.length,
    net: formatSignedDollars(one.finalNet),
    netValue: one.finalNet,
    peak: formatSignedDollars(one.peak),
    trough: formatSignedDollars(one.trough),
    stopped: reason[one.stopReason],
    sessions: many.sessions,
    averageNet: formatSignedDollars(many.averageNet),
    winning: formatPercent(many.winningSessions, 0),
    realisedEdge: formatPercent(many.realisedEdge, 2),
    hitTableMax: many.hitTableMaxSessions,
  };
}

export type { Bet };
