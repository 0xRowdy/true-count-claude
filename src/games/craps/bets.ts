/**
 * Craps bets and their payouts.
 *
 * Every amount is whole dollars. A payout that does not divide evenly is rounded *down* to the
 * dollar, which is what a real table does ("breakage") — and why the unit helpers below exist:
 * a place 6 in steps of $6 always pays exactly 7:6 ($12 pays $14, $18 pays $21).
 */

import { type HardNumber, type PointNumber, isHardNumber, isPointNumber, trueOdds } from "./dice";
import { type CommissionRule, type CrapsRules, maxOddsMultiple } from "./rules";
import { formatDollars } from "./money";

export type LineKind = "pass" | "dontPass";
export type ComeKind = "come" | "dontCome";
export type BoxKind = "place" | "buy" | "lay";
export type OneRollKind = "field" | "anySeven" | "anyCraps" | "yo" | "aces" | "aceDeuce" | "twelve";
export type BetKind = LineKind | ComeKind | BoxKind | "hard" | OneRollKind;

export const ONE_ROLL_KINDS: readonly OneRollKind[] = [
  "field",
  "anySeven",
  "anyCraps",
  "yo",
  "aces",
  "aceDeuce",
  "twelve",
];

/** The player a bet belongs to. Single-player tables use "you". */
export const YOU = "you";

interface BetBase {
  readonly id: string;
  readonly owner: string;
  /** The flat bet, whole dollars. */
  readonly amount: number;
  /**
   * Explicit working / off call. Undefined means the table default: box bets, hardways and
   * come odds are off on the come-out; everything else works.
   */
  readonly working?: boolean;
}

/** Pass or don't pass. `odds` is free odds (pass) or lay odds (don't pass). */
export interface LineBet extends BetBase {
  readonly kind: LineKind;
  readonly odds: number;
}

/** Come or don't come. `point` is null until the bet travels to a number. */
export interface ComeBet extends BetBase {
  readonly kind: ComeKind;
  readonly point: PointNumber | null;
  readonly odds: number;
}

/** Place, buy or lay on a box number. */
export interface BoxBet extends BetBase {
  readonly kind: BoxKind;
  readonly number: PointNumber;
}

export interface HardBet extends BetBase {
  readonly kind: "hard";
  readonly number: HardNumber;
}

export interface OneRollBet extends BetBase {
  readonly kind: OneRollKind;
}

export type Bet = LineBet | ComeBet | BoxBet | HardBet | OneRollBet;

interface SpecBase {
  readonly amount: number;
  readonly owner?: string;
  readonly working?: boolean;
}

/** What a caller asks for when making a bet. The table assigns the id. */
export type BetSpec =
  | (SpecBase & { readonly kind: LineKind; readonly odds?: number })
  | (SpecBase & { readonly kind: ComeKind })
  | (SpecBase & { readonly kind: BoxKind; readonly number: PointNumber })
  | (SpecBase & { readonly kind: "hard"; readonly number: HardNumber })
  | (SpecBase & { readonly kind: OneRollKind });

export function isLineBet(bet: Bet): bet is LineBet {
  return bet.kind === "pass" || bet.kind === "dontPass";
}

export function isComeBet(bet: Bet): bet is ComeBet {
  return bet.kind === "come" || bet.kind === "dontCome";
}

export function isBoxBet(bet: Bet): bet is BoxBet {
  return bet.kind === "place" || bet.kind === "buy" || bet.kind === "lay";
}

export function isHardBet(bet: Bet): bet is HardBet {
  return bet.kind === "hard";
}

export function isOneRollBet(bet: Bet): bet is OneRollBet {
  return (ONE_ROLL_KINDS as readonly string[]).includes(bet.kind);
}

/** True for the "wrong" (betting with the seven) side: don't pass, don't come, lay. */
export function isDarkSide(bet: { readonly kind: BetKind }): boolean {
  return bet.kind === "dontPass" || bet.kind === "dontCome" || bet.kind === "lay";
}

/** The bet's number, if it has one (box, hardway, or a come bet's point). */
export function betNumber(bet: Bet): PointNumber | null {
  if (isBoxBet(bet) || isHardBet(bet)) return bet.number;
  if (isComeBet(bet)) return bet.point;
  return null;
}

/** Everything the bet has at risk: flat plus odds. */
export function betTotal(bet: Bet): number {
  return bet.amount + (isLineBet(bet) || isComeBet(bet) ? bet.odds : 0);
}

// ---------------------------------------------------------------------------
// Payout ratios
// ---------------------------------------------------------------------------

/** A payout ratio "wins : stakes" — 7:6 means $6 wins $7. */
export interface Ratio {
  readonly wins: number;
  readonly per: number;
}

/** Place bet payouts: 4/10 pay 9:5, 5/9 pay 7:5, 6/8 pay 7:6. */
export function placeRatio(n: PointNumber): Ratio {
  if (n === 4 || n === 10) return { wins: 9, per: 5 };
  if (n === 5 || n === 9) return { wins: 7, per: 5 };
  return { wins: 7, per: 6 };
}

/** Free odds pay true odds: 4/10 2:1, 5/9 3:2, 6/8 6:5. */
export function oddsRatio(n: PointNumber): Ratio {
  const [against, forOdds] = trueOdds(n);
  return { wins: against, per: forOdds };
}

/** Lay odds pay the inverse of true odds: 4/10 1:2, 5/9 2:3, 6/8 5:6. */
export function layRatio(n: PointNumber): Ratio {
  const [against, forOdds] = trueOdds(n);
  return { wins: forOdds, per: against };
}

/** Hardways: 6 and 8 pay 9:1, 4 and 10 pay 7:1. */
export function hardRatio(n: HardNumber): Ratio {
  return n === 6 || n === 8 ? { wins: 9, per: 1 } : { wins: 7, per: 1 };
}

/** One-roll proposition payouts (the field depends on the total; see `fieldMultiple`). */
export function oneRollRatio(kind: Exclude<OneRollKind, "field">): Ratio {
  switch (kind) {
    case "anySeven":
      return { wins: 4, per: 1 };
    case "anyCraps":
      return { wins: 7, per: 1 };
    case "yo":
    case "aceDeuce":
      return { wins: 15, per: 1 };
    case "aces":
    case "twelve":
      return { wins: 30, per: 1 };
  }
}

export function ratioLabel(r: Ratio): string {
  return `${r.wins}:${r.per}`;
}

/** Profit paid on `amount` at `ratio`, rounded down to the dollar. */
export function payAt(ratio: Ratio, amount: number): number {
  return Math.floor((amount * ratio.wins) / ratio.per);
}

// ---------------------------------------------------------------------------
// Payouts (profit only — the stake is returned or stays up separately)
// ---------------------------------------------------------------------------

/** Place bet win. Place 6 for $12 pays $14. */
export function placePayout(n: PointNumber, amount: number): number {
  return payAt(placeRatio(n), amount);
}

/** Free odds win. $30 odds on a 6 pays $36. */
export function oddsPayout(n: PointNumber, amount: number): number {
  return payAt(oddsRatio(n), amount);
}

/** Lay odds win. $60 laid against a 4 wins $30. */
export function layOddsPayout(n: PointNumber, amount: number): number {
  return payAt(layRatio(n), amount);
}

export function hardPayout(n: HardNumber, amount: number): number {
  return payAt(hardRatio(n), amount);
}

/** Field multiple for a total: 0 means the field loses. */
export function fieldMultiple(total: number, rules: CrapsRules): number {
  if (total === 2) return rules.fieldTwoPays;
  if (total === 12) return rules.fieldTwelvePays;
  if (total === 3 || total === 4 || total === 9 || total === 10 || total === 11) return 1;
  return 0;
}

/** How the field pays its 2 and 12: "2 and 12 pay double", "2 pays double, 12 pays triple". */
export function fieldPaysText(rules: CrapsRules): string {
  const word = (m: number) => (m === 3 ? "triple" : "double");
  if (rules.fieldTwoPays === rules.fieldTwelvePays) {
    return `2 and 12 pay ${word(rules.fieldTwoPays)}`;
  }
  return `2 pays ${word(rules.fieldTwoPays)}, 12 pays ${word(rules.fieldTwelvePays)}`;
}

/** The commission rate as copy: "5%". */
export function commissionLabel(rule: CommissionRule): string {
  const pct = Math.round(rule.rate * 10000) / 100;
  return `${pct}%`;
}

/** The commission on a buy (`base` = the bet) or lay (`base` = the win), whole dollars. */
export function commissionOn(base: number, rule: CommissionRule): number {
  if (rule.rate <= 0 || base <= 0) return 0;
  return Math.max(rule.minimum, Math.floor(base * rule.rate + 1e-9));
}

/** Buy commission is 5% of the bet. Paid up front or out of the win, per the rules. */
export function buyCommission(amount: number, rules: CrapsRules): number {
  return commissionOn(amount, rules.buyCommission);
}

/** Lay commission is 5% of what the lay would win. */
export function layCommission(n: PointNumber, amount: number, rules: CrapsRules): number {
  return commissionOn(layOddsPayout(n, amount), rules.layCommission);
}

/**
 * Commission due when the bet is made (zero unless the table collects vig up front).
 *
 * House rule: vig paid up front is **not refunded** when a buy or lay bet is taken down
 * (`takeDown` returns the stake only). Many rooms do refund it; a table that wants that would
 * add the commission back to the take-down's cash.
 */
export function upfrontCommission(bet: BetSpec | Bet, rules: CrapsRules): number {
  if (bet.kind === "buy" && rules.buyCommission.timing === "upfront") {
    return buyCommission(bet.amount, rules);
  }
  if (bet.kind === "lay" && rules.layCommission.timing === "upfront") {
    return layCommission(bet.number, bet.amount, rules);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Units: bet sizes that make the payout come out exact
// ---------------------------------------------------------------------------

/** The bet size step at which `kind` on `n` pays without breakage. */
export function exactStep(kind: BoxKind | "odds" | "layOdds" | "hard", n: PointNumber): number {
  switch (kind) {
    case "place":
      return placeRatio(n).per;
    case "odds":
      return oddsRatio(n).per;
    case "layOdds":
      return layRatio(n).per;
    case "hard":
      return 1;
    case "buy":
      // True odds at 1 unit, and a whole-dollar 5% commission at $20.
      return lcm(oddsRatio(n).per, 20);
    case "lay": {
      // The lay must win a whole number of dollars ($per → $wins), and that win must be a
      // multiple of $20 so its 5% commission is whole: lay $40 on the 4 to win $20 for $1.
      const r = layRatio(n);
      return (r.per * 20) / gcd(r.wins, 20);
    }
  }
}

/** Whether `amount` pays exactly (no rounding) for `kind` on `n`. */
export function isExactAmount(
  kind: "place" | "odds" | "layOdds" | "hard",
  n: PointNumber,
  amount: number,
): boolean {
  return amount % exactStep(kind, n) === 0;
}

/** Rounds `amount` to a multiple of `step` (down by default — never bet more than asked). */
export function roundToStep(
  amount: number,
  step: number,
  mode: "down" | "up" | "nearest" = "down",
): number {
  const units = amount / step;
  const whole =
    mode === "down" ? Math.floor(units) : mode === "up" ? Math.ceil(units) : Math.round(units);
  return whole * step;
}

/**
 * The strategy builder's hint under a bet amount:
 * "Steps of $6 so the 7:6 payout comes out exact."
 */
export function unitHint(kind: "place" | "odds" | "layOdds", n: PointNumber): string {
  const step = exactStep(kind, n);
  const ratio = kind === "place" ? placeRatio(n) : kind === "odds" ? oddsRatio(n) : layRatio(n);
  return `Steps of ${formatDollars(step)} so the ${ratioLabel(ratio)} payout comes out exact.`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

// ---------------------------------------------------------------------------
// Odds limits
// ---------------------------------------------------------------------------

/** Most free odds a pass or come bet of `flat` may take behind `point`. */
export function maxOdds(rules: CrapsRules, point: PointNumber, flat: number): number {
  return flat * maxOddsMultiple(rules, point);
}

/**
 * Most lay odds a don't bet of `flat` may lay against `point`. The limit is on the *win*:
 * a lay may win at most what the same-sized odds multiple would, so a 3-4-5x table allows
 * 6x lay odds on every number.
 */
export function maxLayOdds(rules: CrapsRules, point: PointNumber, flat: number): number {
  const r = layRatio(point);
  const exact = (flat * maxOddsMultiple(rules, point) * r.per) / r.wins;
  // Floor to the lay step so the limit is always a whole, exactly-paying amount
  // ($11 on the 6 at 2x lays $24, not $26.40). 3-4-5x tables (6x) are never affected.
  return Math.floor(exact / r.per + 1e-9) * r.per;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Readonly<Record<number, string>> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Eleven",
  12: "Twelve",
};

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** Short display name: "Pass line", "Place 6", "Hard 8", "Come 5", "Any seven". */
export function betName(bet: Bet | BetSpec): string {
  switch (bet.kind) {
    case "pass":
      return "Pass line";
    case "dontPass":
      return "Don't pass";
    case "come":
      return "point" in bet && bet.point ? `Come ${bet.point}` : "Come";
    case "dontCome":
      return "point" in bet && bet.point ? `Don't come ${bet.point}` : "Don't come";
    case "place":
      return `Place ${bet.number}`;
    case "buy":
      return `Buy ${bet.number}`;
    case "lay":
      return `Lay ${bet.number}`;
    case "hard":
      return `Hard ${bet.number}`;
    case "field":
      return "Field";
    case "anySeven":
      return "Any seven";
    case "anyCraps":
      return "Any craps";
    case "yo":
      return "Yo (11)";
    case "aces":
      return "Aces";
    case "aceDeuce":
      return "Ace-deuce";
    case "twelve":
      return "Twelve";
  }
}

/** Validates a spec's shape (number fields, whole-dollar amount). Table rules are separate. */
export function specProblem(spec: BetSpec): string | null {
  if (!Number.isInteger(spec.amount) || spec.amount <= 0) {
    return "Bets are whole dollars greater than zero.";
  }
  if (
    (spec.kind === "place" || spec.kind === "buy" || spec.kind === "lay") &&
    !isPointNumber(spec.number)
  ) {
    return "Box bets go on 4, 5, 6, 8, 9 or 10.";
  }
  if (spec.kind === "hard" && !isHardNumber(spec.number)) {
    return "Hardways are 4, 6, 8 and 10.";
  }
  return null;
}
