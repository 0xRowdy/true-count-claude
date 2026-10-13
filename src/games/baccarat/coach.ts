/**
 * Coach helpers: the teaching strings for the baccarat table.
 *
 * Every figure quoted here comes from `odds.ts` (exact enumeration), never a hard-coded
 * number, so the coach cannot drift from the math it teaches. Strings are locale-free so
 * prerendered web output and the hydrated page say the same thing.
 */

import type { Coup } from "./coup";
import { describeResult, explainDraws } from "./coup";
import { houseEdge, outcomeProbabilities } from "./odds";
import {
  BET_LABELS,
  type BaccaratRules,
  SIDE_BET_PAYS,
  type SideBetKind,
  formatPercent,
} from "./rules";
import type { Bets } from "./settle";

/** Title of the design's Coach Note on the payout screen. */
export const COACH_NOTE_TITLE = "Good to know before your trip";

export const STREAK_FALLACY = "Streaks on the road don't change the next hand.";

export interface CoachNote {
  readonly title: string;
  readonly body: string;
}

function pct(edge: number): string {
  return formatPercent(edge * 100, 2);
}

/**
 * "Banker carries the lower house edge (1.06% vs 1.24%), even after the 5% commission.
 * Streaks on the road don't change the next hand."
 */
export function bankerEdgeTip(rules: BaccaratRules): string {
  const banker = pct(houseEdge(rules, "banker"));
  const player = pct(houseEdge(rules, "player"));
  if (rules.variant === "ez") {
    return (
      `Banker carries the lower house edge (${banker} vs ${player}) with no commission — ` +
      `the house takes its share by pushing a Banker win on a three-card 7. ${STREAK_FALLACY}`
    );
  }
  const commission = formatPercent(rules.commission * 100, 0);
  return `Banker carries the lower house edge (${banker} vs ${player}), even after the ${commission} commission. ${STREAK_FALLACY}`;
}

/** "Tie pays 8:1, but it lands about 1 coup in 11 (9.52%) — a 14.36% house edge." */
export function tieTip(rules: BaccaratRules): string {
  const p = outcomeProbabilities(rules.decks).tie;
  return (
    `Tie pays ${rules.tiePays}:1, but it lands about 1 coup in ${Math.round(1 / p)} ` +
    `(${pct(p)}) — a ${pct(houseEdge(rules, "tie"))} house edge, the worst of the three main bets.`
  );
}

/** "Dragon 7 pays 40:1, but it lands about 1 coup in 44 (2.25%) — a 7.61% house edge." */
export function sideBetTip(rules: BaccaratRules, bet: SideBetKind): string {
  const odds = outcomeProbabilities(rules.decks);
  const p = bet === "dragon7" ? odds.dragon7 : bet === "panda8" ? odds.panda8 : odds.pair;
  return (
    `${BET_LABELS[bet]} pays ${SIDE_BET_PAYS[bet]}:1, but it lands about 1 coup in ` +
    `${Math.round(1 / p)} (${pct(p)}) — a ${pct(houseEdge(rules, bet))} house edge.`
  );
}

/** Why the commission exists: Banker wins more often because it acts last. */
export function commissionTip(rules: BaccaratRules): string {
  const p = outcomeProbabilities(rules.decks);
  return (
    `Banker wins ${pct(p.banker)} of coups to Player's ${pct(p.player)}, because Banker draws ` +
    `knowing the Player's third card. The commission is what keeps that bet from favouring you.`
  );
}

/**
 * The coach note for the payout screen. Picks the most useful lesson for what was on the
 * layout: a Tie or side bet gets its own cost spelled out; otherwise the Banker-edge lesson.
 */
export function coachNote(rules: BaccaratRules, bets: Bets = {}): CoachNote {
  if (bets.tie) return { title: COACH_NOTE_TITLE, body: tieTip(rules) };
  const side = rules.sideBets.find((bet) => bets[bet]);
  if (side) return { title: COACH_NOTE_TITLE, body: sideBetTip(rules, side) };
  return { title: COACH_NOTE_TITLE, body: bankerEdgeTip(rules) };
}

/** The coup's Explanation: the headline result, then why each side drew or stood. */
export function explainCoup(coup: Coup): string[] {
  return [`${describeResult(coup)}.`, ...explainDraws(coup)];
}
