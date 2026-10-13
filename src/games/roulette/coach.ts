/**
 * Plain-language copy for roulette's teaching moments, plus the small formatters it needs.
 *
 * Formatting is done by hand rather than with `toLocaleString`: the web export is
 * prerendered, and locale-dependent output is a hydration mismatch waiting to happen. These
 * strings read the same on the server, in the browser, and in tests.
 */

import { analyzeBets, describePockets, houseEdgeOf, wheelHouseEdge } from "./analysis";
import { BET_TYPE_NAMES, type BetSpot, getLayout, getSpot } from "./layout";
import { lossesUntilOverMax, martingaleBet } from "./plan";
import type { Bet } from "./spin";
import { type Pocket, type RouletteRules, pocketColor } from "./wheel";

const MINUS = "−";

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "$6,400", "$2.70", "$12.50". Cents shown only when the amount is not whole. */
export function formatDollars(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const body = `$${groupThousands(String(whole))}${frac === 0 ? "" : `.${String(frac).padStart(2, "0")}`}`;
  return amount < 0 && cents !== 0 ? `${MINUS}${body}` : body;
}

/** "+$40", "−$100", "$0". Uses a true minus sign, as the design does. */
export function formatSignedDollars(amount: number): string {
  const cents = Math.round(amount * 100);
  if (cents === 0) return "$0";
  return cents > 0 ? `+${formatDollars(amount)}` : formatDollars(amount);
}

/** "48.6%", "2.7%", "5.26%" (with `digits = 2`). Trailing zeros are kept to `digits`. */
export function formatPercent(probability: number, digits = 1): string {
  return `${(probability * 100).toFixed(digits)}%`;
}

/** A house edge the way casinos publish it: 2.7%, 5.26%, 1.35%, 7.89%. */
export function formatHouseEdge(edge: number): string {
  const pct = edge * 100;
  const two = pct.toFixed(2);
  return two.endsWith("0") ? `${pct.toFixed(1)}%` : `${two}%`;
}

/** "35:1" for the bet loupe. */
export function formatPayoutRatio(payout: number): string {
  return `${payout}:1`;
}

/** "5 to 1" for the Strategy Builder. */
export function formatPayoutOdds(payout: number): string {
  return `${payout} to 1`;
}

/** "European · single zero · $5–$1,000". */
export function describeTable(rules: RouletteRules): string {
  const wheel = rules.wheel === "european" ? "European · single zero" : "American · double zero";
  const partage = rules.laPartage ? " · La Partage" : "";
  return `${wheel}${partage} · ${formatDollars(rules.limits.min)}–${formatDollars(rules.limits.max)}`;
}

/** "Roulette · European · $5 inside min". */
export function describeGameRules(rules: RouletteRules): string {
  const wheel = rules.wheel === "european" ? "European" : "American";
  const partage = rules.laPartage ? " · La Partage" : "";
  return `Roulette · ${wheel}${partage} · ${formatDollars(rules.limits.insideMin)} inside min`;
}

/** The bet loupe's second line: "Straight 35:1". */
export function loupeCaption(spot: BetSpot): string {
  return `${BET_TYPE_NAMES[spot.type]} ${formatPayoutRatio(spot.payout)}`;
}

/** "Six line 13–18", "Split 16 | 17", "Red", "2nd 12". */
export function spotTitle(spot: BetSpot): string {
  switch (spot.type) {
    case "red":
    case "black":
    case "odd":
    case "even":
    case "low":
    case "high":
    case "dozen":
    case "column":
      return spot.label;
    default:
      return `${BET_TYPE_NAMES[spot.type]} ${spot.label}`;
  }
}

/** Short name for the bet summary line: "17 straight", "Red", "2nd dozen". */
export function spotShortName(spot: BetSpot): string {
  switch (spot.type) {
    case "dozen":
      return spot.label.replace(" 12", " dozen");
    case "column":
    case "red":
    case "black":
    case "odd":
    case "even":
    case "low":
    case "high":
      return spot.label;
    default:
      return `${spot.label} ${BET_TYPE_NAMES[spot.type].toLowerCase()}`;
  }
}

/** "17 straight · Red · 2nd dozen" — the line under "Total bet". */
export function describeBetSummary(rules: RouletteRules, bets: readonly Bet[]): string {
  return bets
    .map((b) => getSpot(rules, b.spotId))
    .filter((s): s is BetSpot => s !== undefined)
    .map(spotShortName)
    .join(" · ");
}

export interface SpotDetail {
  readonly title: string;
  readonly covers: readonly Pocket[];
  /** "5 to 1". */
  readonly pays: string;
  /** "6 of 37 · 16.2%". */
  readonly wins: string;
  /** Profit when it hits at `amount`: "+$125". */
  readonly ifItHits: string;
}

/** The "Selected bet" panel. */
export function describeSpot(rules: RouletteRules, spot: BetSpot, amount: number): SpotDetail {
  const n = getLayout(rules).pockets.length;
  const k = spot.pockets.length;
  return {
    title: spotTitle(spot),
    covers: spot.pockets,
    pays: formatPayoutOdds(spot.payout),
    wins: `${k} of ${n} · ${formatPercent(k / n)}`,
    ifItHits: formatSignedDollars(amount * spot.payout),
  };
}

/** "Not covered: 1–12", or undefined when every pocket wins something. */
export function uncoveredNote(rules: RouletteRules, bets: readonly Bet[]): string | undefined {
  const { uncovered } = analyzeBets(rules, bets);
  return uncovered.length === 0 ? undefined : `Not covered: ${describePockets(rules, uncovered)}`;
}

/** "Ball lands 19–36" plus the subline "18 pockets", for each outcome group. */
export function outcomeGroupCopy(group: { label: string; count: number }): {
  title: string;
  pockets: string;
} {
  return {
    title: `Ball lands ${group.label}`,
    pockets: `${group.count} ${group.count === 1 ? "pocket" : "pockets"}`,
  };
}

/** "37 pockets, each equally likely". */
export function pocketsEquallyLikely(rules: RouletteRules): string {
  return `${getLayout(rules).pockets.length} pockets, each equally likely`;
}

/** "2.7% house edge, same as any single bet" — under the per-spin average. */
export function averageResultCaption(rules: RouletteRules, bets: readonly Bet[]): string {
  const { houseEdge } = analyzeBets(rules, bets);
  const single = wheelHouseEdge(rules);
  const same = Math.abs(houseEdge - single) < 1e-9;
  return same
    ? `${formatHouseEdge(houseEdge)} house edge, same as any single bet`
    : `${formatHouseEdge(houseEdge)} house edge across this layout`;
}

// ---------------------------------------------------------------------------------------------
// Teaching moments
// ---------------------------------------------------------------------------------------------

/** Why moving chips around the layout never changes what the house keeps. */
export function explainHouseEdgeIsTheSame(rules: RouletteRules): string {
  const n = getLayout(rules).pockets.length;
  const edge = formatHouseEdge(wheelHouseEdge(rules));
  let text =
    `Every bet on this wheel carries the same ${edge} house edge. ` +
    `A straight up wins 1 time in ${n} but pays 35 to 1, not the fair ${n - 1} to 1. ` +
    `Red, a dozen or a corner is the same deal cut a different way.`;
  if (rules.wheel === "american") {
    text += ` The one exception is the top line (0, 00, 1, 2, 3): it pays 6 to 1 and carries ${formatHouseEdge(houseEdgeOf(rules, "topLine"))}.`;
  }
  if (rules.laPartage) {
    text += ` With La Partage, even-money bets lose only half on zero, so they carry ${formatHouseEdge(houseEdgeOf(rules, "red"))}.`;
  }
  return text;
}

/** What La Partage does and what it is worth. */
export function explainLaPartage(rules: RouletteRules): string {
  const half = formatHouseEdge(houseEdgeOf({ ...rules, laPartage: true }, "red"));
  const full = formatHouseEdge(houseEdgeOf({ ...rules, laPartage: false }, "red"));
  const zero = rules.wheel === "american" ? "0 or 00" : "zero";
  return (
    `La Partage: when the ball lands on ${zero}, even-money bets (red/black, odd/even, ` +
    `1–18/19–36) get half the stake back instead of losing it all. ` +
    `That cuts their house edge from ${full} to ${half}, the lowest on the table.`
  );
}

const AMERICAN_LIKE: RouletteRules = {
  wheel: "american",
  laPartage: false,
  limits: { min: 1, max: 1, insideMin: 1 },
};

/** Why the second zero matters. */
export function explainDoubleZero(): string {
  const eu = formatHouseEdge(wheelHouseEdge({ ...AMERICAN_LIKE, wheel: "european" }));
  const us = formatHouseEdge(wheelHouseEdge(AMERICAN_LIKE));
  return (
    `The American wheel adds a 00 pocket but keeps the same payouts. ` +
    `That one extra losing pocket nearly doubles the house edge, from ${eu} to ${us}. ` +
    `If both wheels are open, play single zero.`
  );
}

/**
 * The Martingale warning. Without a table maximum it uses a typical $5,000 high-limit cap and
 * says "past most table limits": with a $100 base, 6 losses in a row ask for $6,400.
 */
export function explainMartingaleRisk(base: number, tableMax?: number): string {
  const max = tableMax ?? 5000;
  const losses = lossesUntilOverMax(base, max);
  const ask = formatDollars(martingaleBet(base, losses));
  const limit =
    tableMax === undefined
      ? "past most table limits"
      : `past this table's ${formatDollars(max)} limit`;
  return (
    `Progressions change how you lose, not how much on average. ` +
    `With Martingale, ${losses} losses in a row ask for a ${ask} bet, ${limit}. ` +
    `Flat betting is the honest default.`
  );
}

/** The gambler's fallacy, anchored on the current streak in the history (newest first). */
export function explainNoMemory(rules: RouletteRules, recent: readonly Pocket[]): string {
  const n = getLayout(rules).pockets.length;
  const first = recent[0];
  if (first === undefined) {
    return `The wheel has no memory. Every spin, each of the ${n} pockets is equally likely.`;
  }
  const color = pocketColor(first);
  let streak = 0;
  for (const p of recent) {
    if (pocketColor(p) !== color) break;
    streak++;
  }
  if (color === "green" || streak < 3) {
    return `The wheel has no memory. Every spin, each of the ${n} pockets is equally likely.`;
  }
  return (
    `${color === "red" ? "Red" : "Black"} has hit ${streak} in a row, and the wheel has no memory. ` +
    `Next spin, ${color} is still 18 of ${n} (${formatPercent(18 / n)}), same as always.`
  );
}

/** Which bets carry the lowest edge on this table — the onboarding teaching line. */
export function explainLowestEdgeBets(rules: RouletteRules): string {
  if (rules.laPartage) {
    return `The even-money bets carry the lowest house edge here: ${formatHouseEdge(houseEdgeOf(rules, "red"))} with La Partage, against ${formatHouseEdge(wheelHouseEdge(rules))} on everything else.`;
  }
  if (rules.wheel === "american") {
    return `Every bet here carries ${formatHouseEdge(wheelHouseEdge(rules))} except the top line at ${formatHouseEdge(houseEdgeOf(rules, "topLine"))}. Avoid the top line; a single-zero wheel is better still.`;
  }
  return `Every bet here carries the same ${formatHouseEdge(wheelHouseEdge(rules))} house edge. A table with La Partage cuts even-money bets to ${formatHouseEdge(houseEdgeOf({ ...rules, laPartage: true }, "red"))}.`;
}
