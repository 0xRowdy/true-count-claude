/**
 * House edge, derived from the dice — never typed in.
 *
 * Each figure is computed from the exact probabilities in `dice.ts` and the payouts in
 * `bets.ts` for the table's rules, so a test against the published figures (pass 1.41%,
 * don't pass 1.36%, place 6/8 1.52%, ...) checks the payout table too. Edges are per bet
 * *made*, as published: a don't-pass push on the 12 counts as a bet that cost nothing.
 *
 * Product rule (CONTEXT.md, the coach): no bet plan beats the house edge. The odds are the
 * only bet on the table with none, which is why the coach keeps steering players to them.
 */

import {
  type BetKind,
  type Bet,
  type OneRollKind,
  oneRollRatio,
  placeRatio,
  hardRatio,
  isComeBet,
  isLineBet,
  betNumber,
  commissionLabel,
  fieldPaysText,
} from "./bets";
import {
  type HardNumber,
  type PointNumber,
  POINT_NUMBERS,
  probabilityBeforeSeven,
  probabilityHardBeforeEasyOrSeven,
  probabilityOfTotal,
  trueOdds,
} from "./dice";
import type { CrapsRules } from "./rules";
import { formatPercent } from "./money";

/** Probability a pass line bet wins: 244/495. */
export function passWinProbability(): number {
  let win = probabilityOfTotal(7) + probabilityOfTotal(11);
  for (const p of POINT_NUMBERS) win += probabilityOfTotal(p) * probabilityBeforeSeven(p);
  return win;
}

/** Pass (and come): 7/495 ≈ 1.414%. */
export function passEdge(): number {
  return 1 - 2 * passWinProbability();
}

/** Don't pass (and don't come), bar 12: 3/220 ≈ 1.364%. */
export function dontPassEdge(): number {
  const push = probabilityOfTotal(12);
  let win = probabilityOfTotal(2) + probabilityOfTotal(3);
  for (const p of POINT_NUMBERS) win += probabilityOfTotal(p) * (1 - probabilityBeforeSeven(p));
  const lose = 1 - push - win;
  return lose - win;
}

/** Place bet edge: 4/10 6.67%, 5/9 4.00%, 6/8 1.52%. */
export function placeEdge(n: PointNumber): number {
  const p = probabilityBeforeSeven(n);
  const r = placeRatio(n);
  return 1 - p - (p * r.wins) / r.per;
}

/**
 * Buy bet edge. Vig on the win only: 1.67% on 4/10, 2.00% on 5/9, 2.27% on 6/8.
 * Vig up front: 4.76% on every number (the vig is part of what you risk).
 */
export function buyEdge(n: PointNumber, rules: CrapsRules): number {
  const c = rules.buyCommission;
  const p = probabilityBeforeSeven(n);
  if (c.timing === "upfront") return c.rate / (1 + c.rate);
  return p * c.rate;
}

/**
 * Lay bet edge. Vig on the win only: 1.67% on 4/10, 2.00% on 5/9, 2.27% on 6/8.
 * Vig up front: 2.44% on 4/10, 3.23% on 5/9, 4.00% on 6/8.
 */
export function layEdge(n: PointNumber, rules: CrapsRules): number {
  const c = rules.layCommission;
  const [against, forOdds] = trueOdds(n);
  const winPerDollar = forOdds / against;
  const vig = c.rate * winPerDollar;
  if (c.timing === "upfront") return vig / (1 + vig);
  return (1 - probabilityBeforeSeven(n)) * vig;
}

/** Hardways: hard 6/8 at 9:1 is 9.09%; hard 4/10 at 7:1 is 11.11%. */
export function hardEdge(n: HardNumber): number {
  const q = probabilityHardBeforeEasyOrSeven(n);
  const r = hardRatio(n);
  return 1 - q - (q * r.wins) / r.per;
}

/** Field: 5.56% with 2 and 12 paying double; 2.78% when the 12 (or the 2) pays triple. */
export function fieldEdge(rules: CrapsRules): number {
  const ev =
    probabilityOfTotal(2) * rules.fieldTwoPays +
    probabilityOfTotal(12) * rules.fieldTwelvePays +
    (probabilityOfTotal(3) +
      probabilityOfTotal(4) +
      probabilityOfTotal(9) +
      probabilityOfTotal(10) +
      probabilityOfTotal(11)) -
    (probabilityOfTotal(5) + probabilityOfTotal(6) + probabilityOfTotal(7) + probabilityOfTotal(8));
  return -ev;
}

/** One-roll center bets: any seven 16.67%, any craps 11.11%, yo 11.11%, aces/twelve 13.89%. */
export function oneRollEdge(kind: Exclude<OneRollKind, "field">): number {
  const p = oneRollProbability(kind);
  const r = oneRollRatio(kind);
  return 1 - p - (p * r.wins) / r.per;
}

function oneRollProbability(kind: Exclude<OneRollKind, "field">): number {
  switch (kind) {
    case "anySeven":
      return probabilityOfTotal(7);
    case "anyCraps":
      return probabilityOfTotal(2) + probabilityOfTotal(3) + probabilityOfTotal(12);
    case "yo":
      return probabilityOfTotal(11);
    case "aces":
      return probabilityOfTotal(2);
    case "aceDeuce":
      return probabilityOfTotal(3);
    case "twelve":
      return probabilityOfTotal(12);
  }
}

/** The house edge on a kind of bet. Box bets and hardways need their number. */
export function houseEdge(kind: BetKind | "odds", rules: CrapsRules, n?: PointNumber): number {
  switch (kind) {
    case "odds":
      return 0;
    case "pass":
    case "come":
      return passEdge();
    case "dontPass":
    case "dontCome":
      return dontPassEdge();
    case "place":
      return placeEdge(need(n, kind));
    case "buy":
      return buyEdge(need(n, kind), rules);
    case "lay":
      return layEdge(need(n, kind), rules);
    case "hard": {
      const h = need(n, kind);
      if (h === 5 || h === 9) throw new Error("hardways are 4, 6, 8 and 10");
      return hardEdge(h);
    }
    case "field":
      return fieldEdge(rules);
    default:
      return oneRollEdge(kind);
  }
}

function need(n: PointNumber | undefined, kind: string): PointNumber {
  if (n === undefined) throw new Error(`${kind} needs a number`);
  return n;
}

/** The edge on one bet on the layout (its flat part; odds carry none). */
export function betEdge(bet: Bet, rules: CrapsRules): number {
  return houseEdge(bet.kind, rules, betNumber(bet) ?? undefined);
}

/** Money and edge, for blending. */
export interface EdgeItem {
  readonly amount: number;
  readonly edge: number;
}

/**
 * The money-weighted edge across a set of bets: Σ(amount × edge) / Σ amount. Odds money is
 * included at 0%, which is exactly why taking odds lowers the blended figure.
 */
export function blendedEdge(items: readonly EdgeItem[]): number {
  let money = 0;
  let cost = 0;
  for (const i of items) {
    money += i.amount;
    cost += i.amount * i.edge;
  }
  return money === 0 ? 0 : cost / money;
}

/** Edge items for bets on the layout, with odds split out at 0%. */
export function edgeItems(bets: readonly Bet[], rules: CrapsRules): EdgeItem[] {
  const out: EdgeItem[] = [];
  for (const b of bets) {
    // A come bet that has not travelled is a fresh come-out: same edge as pass.
    out.push({ amount: b.amount, edge: betEdge(b, rules) });
    if ((isLineBet(b) || isComeBet(b)) && b.odds > 0) out.push({ amount: b.odds, edge: 0 });
  }
  return out;
}

/** Blended edge of whatever is on the layout. */
export function tableEdge(bets: readonly Bet[], rules: CrapsRules): number {
  return blendedEdge(edgeItems(bets, rules));
}

/** Expected cost of a bet in dollars per decision: amount × edge. */
export function expectedCost(amount: number, edge: number): number {
  return amount * edge;
}

/** "1.41%", "0%", "16.67%". */
export function formatEdge(edge: number): string {
  return formatPercent(edge, 2);
}

export interface EdgeRow {
  readonly label: string;
  readonly payout: string;
  readonly edge: number;
}

/** The edge chart the coach and table rules sheet show, computed for these rules. */
export function edgeChart(rules: CrapsRules): EdgeRow[] {
  const rows: EdgeRow[] = [
    { label: "Pass / Come", payout: "1:1", edge: passEdge() },
    { label: "Don't pass / Don't come (bar 12)", payout: "1:1", edge: dontPassEdge() },
    { label: "Odds / Lay odds", payout: "true odds", edge: 0 },
  ];
  for (const n of [6, 5, 4] as const) {
    const r = placeRatio(n);
    const pair = n === 6 ? "6 / 8" : n === 5 ? "5 / 9" : "4 / 10";
    rows.push({ label: `Place ${pair}`, payout: `${r.wins}:${r.per}`, edge: placeEdge(n) });
  }
  for (const n of [4, 5, 6] as const) {
    const pair = n === 6 ? "6 / 8" : n === 5 ? "5 / 9" : "4 / 10";
    rows.push({
      label: `Buy ${pair}`,
      payout: `true odds − ${commissionLabel(rules.buyCommission)}`,
      edge: buyEdge(n, rules),
    });
    rows.push({
      label: `Lay ${pair}`,
      payout: `true odds − ${commissionLabel(rules.layCommission)}`,
      edge: layEdge(n, rules),
    });
  }
  rows.push({ label: "Field", payout: fieldPaysText(rules), edge: fieldEdge(rules) });
  rows.push({ label: "Hard 6 / 8", payout: "9:1", edge: hardEdge(6) });
  rows.push({ label: "Hard 4 / 10", payout: "7:1", edge: hardEdge(4) });
  rows.push({ label: "Any seven", payout: "4:1", edge: oneRollEdge("anySeven") });
  rows.push({ label: "Any craps", payout: "7:1", edge: oneRollEdge("anyCraps") });
  rows.push({ label: "Yo (11)", payout: "15:1", edge: oneRollEdge("yo") });
  rows.push({ label: "Aces / Twelve", payout: "30:1", edge: oneRollEdge("aces") });
  return rows;
}
