/**
 * The dealer-coach for craps.
 *
 * Invariant 2 (CONTEXT.md): every verdict carries an explanation. These helpers turn table state
 * into the coach copy the design shows — "Taking 3x odds was the best bet on the table. Odds pay
 * true odds, so the house has no edge on that $30." and "Point is 8: odds go up to 5x ($125).
 * You have 3x ($75). Odds carry no house edge." — with every number computed, never typed.
 */

import {
  type Bet,
  type BetKind,
  type BetSpec,
  YOU,
  betName,
  commissionLabel,
  fieldPaysText,
  exactStep,
  isBoxBet,
  isComeBet,
  isLineBet,
  layRatio,
  maxLayOdds,
  maxOdds,
  oddsRatio,
  placePayout,
  placeRatio,
  ratioLabel,
  hardRatio,
  oneRollRatio,
} from "./bets";
import type { HardNumber, PointNumber } from "./dice";
import { houseEdge, formatEdge } from "./edge";
import { formatDollars } from "./money";
import { type CrapsRules, maxOddsMultiple } from "./rules";
import type { BetResolution, CrapsTable, RollOutcome } from "./table";

export type CoachTone = "good" | "tip" | "mistake" | "info";

export interface CoachNote {
  readonly tone: CoachTone;
  /** The small caps tag: "GOOD CALL · ODDS". */
  readonly tag: string;
  readonly title: string;
  readonly body: string;
}

/** "3x", "2.5x" — a multiple of the flat bet. */
export function multipleLabel(odds: number, flat: number): string {
  if (flat <= 0) return "0x";
  const m = odds / flat;
  return `${Number.isInteger(m) ? m : Math.round(m * 10) / 10}x`;
}

/**
 * The max-odds hint: "Point is 8: odds go up to 5x ($125). You have 3x ($75). Odds carry no
 * house edge." Works for lay odds on the don't side too.
 */
export function maxOddsHint(
  rules: CrapsRules,
  point: PointNumber,
  flat: number,
  current: number,
  side: "do" | "dont" = "do",
): string {
  const limit = side === "do" ? maxOdds(rules, point, flat) : maxLayOdds(rules, point, flat);
  const limitX = side === "do" ? `${maxOddsMultiple(rules, point)}x` : multipleLabel(limit, flat);
  const verb = side === "do" ? "odds go up to" : "you can lay up to";
  const have =
    current <= 0
      ? "You have no odds yet."
      : current >= limit
        ? `You have full odds (${formatDollars(current)}).`
        : `You have ${multipleLabel(current, flat)} (${formatDollars(current)}).`;
  return `Point is ${point}: ${verb} ${limitX} (${formatDollars(limit)}). ${have} Odds carry no house edge.`;
}

/** "Take full odds: 3x on 4/10, 4x on 5/9, 5x on 6/8" — the odds rule in words. */
export function fullOddsRule(rules: CrapsRules): string {
  if (rules.odds.kind === "flat") return `Take full odds: ${rules.odds.multiple}x on every point`;
  return "Take full odds: 3x on 4/10, 4x on 5/9, 5x on 6/8";
}

/** Why odds are the best bet: "Odds pay true odds, so the house has no edge on that $30." */
export function oddsExplanation(oddsAmount: number): string {
  return `Odds pay true odds, so the house has no edge on that ${formatDollars(oddsAmount)}.`;
}

/** Payout ratio for a bet kind on a number, as the layout prints it: "7:6", "9:1", "4:1". */
export function payoutLabel(kind: BetKind | "odds" | "layOdds", n?: PointNumber): string {
  switch (kind) {
    case "pass":
    case "dontPass":
    case "come":
    case "dontCome":
      return "1:1";
    case "odds":
    case "buy":
      return n ? ratioLabel(oddsRatio(n)) : "true odds";
    case "layOdds":
    case "lay":
      return n ? ratioLabel(layRatio(n)) : "true odds";
    case "place":
      return n ? ratioLabel(placeRatio(n)) : "";
    case "hard":
      return n ? ratioLabel(hardRatio(n as HardNumber)) : "";
    case "field":
      return "1:1";
    default:
      return ratioLabel(oneRollRatio(kind));
  }
}

/** One-paragraph explanation of a bet: how it wins, what it pays, and its edge. */
export function explainBet(kind: BetKind | "odds", rules: CrapsRules, n?: PointNumber): string {
  const edge = formatEdge(houseEdge(kind, rules, n));
  switch (kind) {
    case "pass":
      return `Pass line wins on a come-out 7 or 11 and loses on 2, 3 or 12. Any other number becomes the point, and the bet wins if the point comes before a seven. Pays 1:1, house edge ${edge}.`;
    case "dontPass":
      return `Don't pass is the pass line in reverse: it wins on a come-out 2 or 3, pushes on 12 (bar 12), and wins if a seven comes before the point. Pays 1:1, house edge ${edge}.`;
    case "come":
      return `A come bet is a pass line bet made after the point is on. The next roll is its own come-out, and any box number becomes its point. House edge ${edge}.`;
    case "dontCome":
      return `Don't come is don't pass made after the point is on, with its own number. 12 is barred. House edge ${edge}.`;
    case "odds":
      return `Odds sit behind a line or come bet once it has a point and pay true odds (2:1 on 4/10, 3:2 on 5/9, 6:5 on 6/8). The house has no edge on them: 0%.`;
    case "place":
      return n
        ? `Place ${n} wins whenever ${n} rolls before a seven and stays up. Pays ${ratioLabel(placeRatio(n))}, so bet in steps of ${formatDollars(exactStep("place", n))}. House edge ${edge}.`
        : `Place bets win when their number rolls before a seven.`;
    case "buy":
      return n
        ? `Buy ${n} pays true odds (${ratioLabel(oddsRatio(n))}) less a ${commissionLabel(rules.buyCommission)} commission. House edge ${edge}.`
        : `Buy bets pay true odds less a ${commissionLabel(rules.buyCommission)} commission.`;
    case "lay":
      return n
        ? `Lay ${n} wins when a seven rolls before ${n}, paying ${ratioLabel(layRatio(n))} less ${commissionLabel(rules.layCommission)} of the win. House edge ${edge}.`
        : `Lay bets win on a seven before their number.`;
    case "hard":
      return n
        ? `Hard ${n} wins only if ${n} rolls as a pair before an easy ${n} or a seven. Pays ${ratioLabel(hardRatio(n as HardNumber))}. House edge ${edge}.`
        : `Hardways win on the pair before the easy way or a seven.`;
    case "field":
      return `The field is a one-roll bet on 2, 3, 4, 9, 10, 11 or 12. ${capitalizeFirst(fieldPaysText(rules))}. House edge ${edge}.`;
    case "anySeven":
      return `Any seven is a one-roll bet on 7, paying 4:1 on a 5:1 shot. House edge ${edge}, the worst on the table.`;
    case "anyCraps":
      return `Any craps is a one-roll bet on 2, 3 or 12, paying 7:1. House edge ${edge}.`;
    case "yo":
      return `Yo is a one-roll bet on 11, paying 15:1 on a 17:1 shot. House edge ${edge}.`;
    case "aces":
    case "twelve":
      return `${kind === "aces" ? "Aces (2)" : "Twelve"} is a one-roll bet paying 30:1 on a 35:1 shot. House edge ${edge}.`;
    case "aceDeuce":
      return `Ace-deuce (3) is a one-roll bet paying 15:1 on a 17:1 shot. House edge ${edge}.`;
  }
}

export type BetVerdict = "best" | "good" | "fair" | "costly";

export interface BetReview {
  readonly verdict: BetVerdict;
  readonly edge: number;
  /** Whether this counts as a correct decision for accuracy scoring. */
  readonly correct: boolean;
  readonly message: string;
}

/** Grades an edge: odds best, ≤1.52% good, ≤5.56% fair, worse is costly. */
export function verdictForEdge(edge: number): BetVerdict {
  if (edge <= 1e-9) return "best";
  if (edge <= 0.0153) return "good";
  if (edge <= 0.0556) return "fair";
  return "costly";
}

/**
 * Reviews a bet before it goes down: its edge, and a note if the amount breaks the payout
 * ("Place 6 for $10 pays $11 — bet in steps of $6 so 7:6 comes out exact").
 */
export function reviewBet(spec: BetSpec, rules: CrapsRules): BetReview {
  const n = "number" in spec ? spec.number : undefined;
  const edge = houseEdge(spec.kind, rules, n);
  const verdict = verdictForEdge(edge);
  const name = betName(spec);
  if (spec.kind === "place" && n && spec.amount % exactStep("place", n) !== 0) {
    const pays = placePayout(n, spec.amount);
    return {
      verdict: "fair",
      edge,
      correct: false,
      message: `${name} for ${formatDollars(spec.amount)} pays only ${formatDollars(pays)}. Bet in steps of ${formatDollars(exactStep("place", n))} so the ${ratioLabel(placeRatio(n))} payout comes out exact.`,
    };
  }
  const message =
    verdict === "costly"
      ? `${name} carries a ${formatEdge(edge)} house edge. ${edge > 0.09 ? "Center bets run 9–17%." : "Lower-edge bets cost far less per roll."}`
      : verdict === "fair"
        ? `${name} has a ${formatEdge(edge)} house edge. Fine in moderation; place 6/8 and the line are cheaper.`
        : `${name} has a ${formatEdge(edge)} house edge, one of the best bets on the table.`;
  return { verdict, edge, correct: verdict === "best" || verdict === "good", message };
}

/** Bets of the player that are still standing after a roll, worded for the coach. */
function standingNote(remaining: readonly Bet[]): string {
  const places = remaining.filter(isBoxBet);
  if (places.length === 0) return "";
  const names = places.map((b) => `${b.kind} ${b.number}`);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return ` Your ${list} ${places.length === 1 ? "stays" : "stay"} up for the next roll.`;
}

/**
 * The coach's note after a roll, for one player. Returns null when the roll needs no comment.
 * Priority: a winning odds bet (praise), a line win without odds (tip), a losing center bet
 * (mistake), a seven-out with a spread of box bets (info).
 */
export function coachRoll(
  outcome: RollOutcome,
  owner: string = YOU,
  rules: CrapsRules = outcome.table.rules,
): CoachNote | null {
  const mine = outcome.resolutions.filter((r) => r.bet.owner === owner);
  const remaining = outcome.table.bets.filter((b) => b.owner === owner);
  const { record } = outcome;

  const oddsWin = mine.find(
    (r) => r.outcome === "win" && (isLineBet(r.bet) || isComeBet(r.bet)) && r.bet.odds > 0,
  );
  if (oddsWin && (isLineBet(oddsWin.bet) || isComeBet(oddsWin.bet))) {
    const x = multipleLabel(oddsWin.bet.odds, oddsWin.bet.amount);
    return {
      tone: "good",
      tag: "GOOD CALL · ODDS",
      title: `Taking ${x} odds was the best bet on the table.`,
      body: `${oddsExplanation(oddsWin.bet.odds)}${standingNote(remaining)}`,
    };
  }

  const bareWin = mine.find(
    (r) =>
      r.outcome === "win" &&
      record.event === "point-made" &&
      r.bet.kind === "pass" &&
      isLineBet(r.bet) &&
      r.bet.odds === 0,
  );
  if (bareWin && record.pointBefore) {
    const limit = maxOdds(rules, record.pointBefore, bareWin.bet.amount);
    return {
      tone: "tip",
      tag: "TIP · ODDS",
      title: "Point made. Next time, back it with odds.",
      body: `With ${maxOddsMultiple(rules, record.pointBefore)}x odds (${formatDollars(limit)}) on the ${record.pointBefore}, this roll would have paid ${formatDollars(oddsRatioPay(record.pointBefore, limit))} more at no house edge.`,
    };
  }

  const centerLoss = mine.find((r) => r.outcome === "lose" && isCenter(r));
  if (centerLoss) {
    const edge = houseEdge(centerLoss.bet.kind, rules, numberOf(centerLoss.bet));
    return {
      tone: "mistake",
      tag: "MISTAKE · CENTER BET",
      title: `${betName(centerLoss.bet)} carries a ${formatEdge(edge)} house edge.`,
      body: "Center bets pay big but cost 9–17% of every dollar. The same chips behind the line as odds cost nothing.",
    };
  }

  if (record.event === "seven-out") {
    const lost = mine.reduce((s, r) => s + r.lost, 0);
    if (lost > 0) {
      return {
        tone: "info",
        tag: "SEVEN OUT",
        title: `A seven took ${formatDollars(lost)} off the layout.`,
        body: "Every box bet and the line lose together on a seven-out. That single roll is the risk a bet plan has to size for.",
      };
    }
  }
  return null;
}

function oddsRatioPay(point: PointNumber, amount: number): number {
  const r = oddsRatio(point);
  return Math.floor((amount * r.wins) / r.per);
}

function isCenter(r: BetResolution): boolean {
  const k = r.bet.kind;
  return (
    k === "hard" ||
    k === "anySeven" ||
    k === "anyCraps" ||
    k === "yo" ||
    k === "aces" ||
    k === "aceDeuce" ||
    k === "twelve"
  );
}

function numberOf(bet: Bet): PointNumber | undefined {
  return "number" in bet ? bet.number : undefined;
}

/**
 * A pre-roll hint for the player's layout: the max-odds nudge when the line has less than full
 * odds, or null when there is nothing to suggest.
 */
export function oddsNudge(table: CrapsTable, owner: string = YOU): string | null {
  if (table.point === null) return null;
  const line = table.bets.find((b) => b.owner === owner && isLineBet(b));
  if (!line || !isLineBet(line)) return null;
  const side = line.kind === "pass" ? "do" : "dont";
  const limit =
    side === "do"
      ? maxOdds(table.rules, table.point, line.amount)
      : maxLayOdds(table.rules, table.point, line.amount);
  if (line.odds >= limit) return null;
  return maxOddsHint(table.rules, table.point, line.amount, line.odds, side);
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
