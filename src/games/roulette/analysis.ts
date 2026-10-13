/**
 * Exact analysis of a set of bets — what the Strategy Builder shows under "What happens on
 * each spin".
 *
 * Roulette is small enough to enumerate: every pocket is equally likely, so settling the bets
 * against each pocket in turn gives the exact distribution of one spin's result. Expected
 * value, house edge, best and worst case all fall out of that table with no sampling.
 */

import { type BetType, PAYOUTS, getLayout, getSpot, isEvenMoneyBet } from "./layout";
import { type Bet, settleBets, totalStake } from "./spin";
import { type Pocket, type RouletteRules, isZero, sortPockets } from "./wheel";

export interface PocketOutcome {
  readonly pocket: Pocket;
  readonly net: number;
  /** Spots that win outright on this pocket. */
  readonly winningSpotIds: readonly string[];
}

export interface OutcomeGroup {
  /** "19–36", "13–18", "0", "1–12", "Red" … — what goes after "Ball lands". */
  readonly label: string;
  readonly pockets: readonly Pocket[];
  readonly count: number;
  /** Chance the ball lands in this group: `count / pockets on the wheel`. */
  readonly probability: number;
  /** Net result of the whole spin when it does. */
  readonly net: number;
  /** Spots that win on every pocket of the group. */
  readonly winningSpotIds: readonly string[];
}

export interface BetAnalysis {
  readonly staked: number;
  /** Pockets on which at least one bet wins outright. */
  readonly covered: readonly Pocket[];
  readonly uncovered: readonly Pocket[];
  readonly byPocket: readonly PocketOutcome[];
  /** Pockets grouped by identical net result: winning groups first, then by size. */
  readonly groups: readonly OutcomeGroup[];
  /** Average net result per spin, in chips. Negative: the house keeps it. */
  readonly expectedValue: number;
  /** `-expectedValue / staked`, 0 for no stake. */
  readonly houseEdge: number;
  readonly worstCase: number;
  readonly bestCase: number;
  /** Probability the spin ends ahead (net > 0). */
  readonly winProbability: number;
}

export function outcomesByPocket(rules: RouletteRules, bets: readonly Bet[]): PocketOutcome[] {
  return getLayout(rules).pockets.map((pocket) => {
    const settlement = settleBets(rules, bets, pocket);
    return {
      pocket,
      net: settlement.net,
      winningSpotIds: settlement.results.filter((r) => r.outcome === "win").map((r) => r.spotId),
    };
  });
}

/** Floats from different summation orders can differ in the last bit; group on cents. */
function netKey(net: number): string {
  return (Math.round(net * 100) / 100).toFixed(2);
}

/** Outside bets whose pockets are not one run, so their name reads better than a list. */
const SCATTERED_SETS: ReadonlySet<BetType> = new Set<BetType>([
  "red",
  "black",
  "odd",
  "even",
  "column",
]);

/**
 * Describe a set of pockets the way a dealer would: an outside bet's name when the set is
 * exactly a scattered one ("Red", "1st column"), otherwise the zeros and runs of numbers ("0", "13–18",
 * "1, 5, 9"). Long scattered sets collapse to a count.
 */
export function describePockets(rules: RouletteRules, pockets: readonly Pocket[]): string {
  const sorted = sortPockets(pockets);
  const layout = getLayout(rules);
  const key = sorted.map(String).join(",");
  const named = layout.spots.find(
    (s) => SCATTERED_SETS.has(s.type) && s.pockets.map(String).join(",") === key,
  );
  if (named) return named.label;

  const parts: string[] = [];
  const numbers: number[] = [];
  for (const p of sorted) {
    if (isZero(p)) parts.push(String(p));
    else numbers.push(p as number);
  }
  let i = 0;
  while (i < numbers.length) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === (numbers[j] as number) + 1) j++;
    const a = numbers[i] as number;
    const b = numbers[j] as number;
    if (j - i >= 2) parts.push(`${a}–${b}`);
    else for (let k = i; k <= j; k++) parts.push(String(numbers[k]));
    i = j + 1;
  }
  if (parts.length > 6) return `${sorted.length} pockets`;
  return parts.join(", ");
}

export function analyzeBets(rules: RouletteRules, bets: readonly Bet[]): BetAnalysis {
  const byPocket = outcomesByPocket(rules, bets);
  const n = byPocket.length;
  const staked = totalStake(bets);

  const groupsByNet = new Map<string, PocketOutcome[]>();
  for (const o of byPocket) {
    const k = netKey(o.net);
    groupsByNet.set(k, [...(groupsByNet.get(k) ?? []), o]);
  }
  const groups: OutcomeGroup[] = [...groupsByNet.values()].map((members) => {
    const pockets = members.map((m) => m.pocket);
    const first = members[0] as PocketOutcome;
    const winningSpotIds = first.winningSpotIds.filter((id) =>
      members.every((m) => m.winningSpotIds.includes(id)),
    );
    return {
      label: describePockets(rules, pockets),
      pockets,
      count: pockets.length,
      probability: pockets.length / n,
      net: first.net,
      winningSpotIds,
    };
  });
  groups.sort(
    (a, b) => Number(a.net < 0) - Number(b.net < 0) || b.count - a.count || b.net - a.net,
  );

  const expectedValue = byPocket.reduce((sum, o) => sum + o.net, 0) / n;
  const covered = byPocket.filter((o) => o.winningSpotIds.length > 0).map((o) => o.pocket);
  const uncovered = byPocket.filter((o) => o.winningSpotIds.length === 0).map((o) => o.pocket);
  const nets = byPocket.map((o) => o.net);

  return {
    staked,
    covered,
    uncovered,
    byPocket,
    groups,
    expectedValue,
    houseEdge: staked > 0 ? -expectedValue / staked : 0,
    worstCase: bets.length > 0 ? Math.min(...nets) : 0,
    bestCase: bets.length > 0 ? Math.max(...nets) : 0,
    winProbability: byPocket.filter((o) => o.net > 0).length / n,
  };
}

/**
 * House edge on one bet type, from first principles: `1 - (payout + 1) × P(win)`, less the
 * half stake La Partage returns on a zero for even-money bets.
 *
 * Published figures: 2.70% for every European bet, 1.35% for even-money bets with La Partage,
 * 5.26% for every American bet except the five-number top line at 7.89%.
 */
export function houseEdgeOf(rules: RouletteRules, type: BetType): number {
  const layout = getLayout(rules);
  const spot = layout.spots.find((s) => s.type === type);
  if (!spot) throw new Error(`There is no ${type} bet on a ${rules.wheel} layout.`);
  const n = layout.pockets.length;
  const pWin = spot.pockets.length / n;
  const zeros = layout.pockets.filter(isZero).length;
  const halfBack = rules.laPartage && isEvenMoneyBet(type) ? (zeros / n) * 0.5 : 0;
  return 1 - (PAYOUTS[type] + 1) * pWin - halfBack;
}

/** The house edge of the wheel's standard bets (every bet but the top line). */
export function wheelHouseEdge(rules: RouletteRules): number {
  return houseEdgeOf(rules, "straight");
}

/** Chance a single spot wins: its pockets over the wheel's pockets. */
export function winProbability(rules: RouletteRules, spotId: string): number {
  const spot = getSpot(rules, spotId);
  if (!spot) throw new Error(`Unknown bet spot "${spotId}".`);
  return spot.pockets.length / getLayout(rules).pockets.length;
}
