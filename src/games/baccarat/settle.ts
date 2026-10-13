/**
 * Settlement: turns a finished coup and the bets on the layout into payouts.
 *
 * Amounts are practice chips. Commission can produce fractional chips (0.95 × 25 = 23.75),
 * so every amount is rounded to cents to keep floating-point noise out of the bankroll.
 */

import type { Coup } from "./coup";
import {
  BET_KINDS,
  BET_LABELS,
  type BaccaratRules,
  type BetKind,
  SIDE_BET_PAYS,
  formatPercent,
  isBetOffered,
} from "./rules";

/** Stakes on the layout, keyed by bet. Missing or zero means no bet. */
export type Bets = Partial<Record<BetKind, number>>;

export type BetOutcome = "win" | "lose" | "push";

export interface BetSettlement {
  readonly bet: BetKind;
  readonly stake: number;
  readonly outcome: BetOutcome;
  /** Winnings on top of the stake (0 on a push, −stake on a loss). */
  readonly net: number;
  /** Chips handed back: stake + winnings on a win, the stake on a push, 0 on a loss. */
  readonly returned: number;
  /** One line for the payout screen: "Player wins — pays 1:1". */
  readonly reason: string;
}

export interface Settlement {
  readonly bets: readonly BetSettlement[];
  readonly totalStaked: number;
  readonly totalReturned: number;
  /** Net result of the coup across every bet. */
  readonly net: number;
}

/** Returns the reasons a set of bets cannot be placed, or an empty array if it can. */
export function validateBets(rules: BaccaratRules, bets: Bets): string[] {
  const problems: string[] = [];
  for (const bet of BET_KINDS) {
    const stake = bets[bet];
    if (stake === undefined || stake === 0) continue;
    if (!Number.isFinite(stake) || stake < 0) {
      problems.push(`${BET_LABELS[bet]} stake must be a positive amount`);
      continue;
    }
    if (!isBetOffered(rules, bet)) {
      problems.push(`${BET_LABELS[bet]} is not offered at this table`);
      continue;
    }
    if (stake < rules.minBet || stake > rules.maxBet) {
      problems.push(`${BET_LABELS[bet]} must be between ${rules.minBet} and ${rules.maxBet}`);
    }
  }
  return problems;
}

/** Settles every bet on the layout against a coup. Throws on bets the table cannot take. */
export function settleBets(rules: BaccaratRules, coup: Coup, bets: Bets): Settlement {
  const problems = validateBets(rules, bets);
  if (problems.length > 0) throw new Error(`Invalid bets: ${problems.join("; ")}`);

  const settled: BetSettlement[] = [];
  for (const bet of BET_KINDS) {
    const stake = bets[bet];
    if (!stake) continue;
    settled.push(settleBet(rules, coup, bet, stake));
  }
  const totalStaked = cents(settled.reduce((sum, s) => sum + s.stake, 0));
  const totalReturned = cents(settled.reduce((sum, s) => sum + s.returned, 0));
  return { bets: settled, totalStaked, totalReturned, net: cents(totalReturned - totalStaked) };
}

/** Settles a single bet. */
export function settleBet(
  rules: BaccaratRules,
  coup: Coup,
  bet: BetKind,
  stake: number,
): BetSettlement {
  const win = (odds: number, reason: string): BetSettlement => {
    const net = cents(stake * odds);
    return { bet, stake, outcome: "win", net, returned: cents(stake + net), reason };
  };
  const lose = (reason: string): BetSettlement => ({
    bet,
    stake,
    outcome: "lose",
    net: -stake,
    returned: 0,
    reason,
  });
  const push = (reason: string): BetSettlement => ({
    bet,
    stake,
    outcome: "push",
    net: 0,
    returned: stake,
    reason,
  });

  switch (bet) {
    case "player":
      if (coup.winner === "player") return win(1, "Player wins — pays 1:1");
      if (coup.winner === "tie") return push("Tie — Player bet pushes");
      return lose("Banker wins — Player bet loses");

    case "banker":
      if (coup.winner === "tie") return push("Tie — Banker bet pushes");
      if (coup.winner === "player") return lose("Player wins — Banker bet loses");
      if (rules.variant === "ez") {
        if (coup.dragon7)
          return push("Dragon 7 — Banker wins with three cards to 7, so the bet pushes");
        return win(1, "Banker wins — pays 1:1, no commission");
      }
      return win(
        1 - rules.commission,
        `Banker wins — pays ${cents(1 - rules.commission)}:1 after the ${formatPercent(rules.commission * 100, 0)} commission`,
      );

    case "tie":
      if (coup.winner === "tie") return win(rules.tiePays, `Tie — pays ${rules.tiePays}:1`);
      return lose("No tie — Tie bet loses");

    case "playerPair":
      return coup.playerPair
        ? win(SIDE_BET_PAYS.playerPair, "Player Pair — pays 11:1")
        : lose("No Player Pair");

    case "bankerPair":
      return coup.bankerPair
        ? win(SIDE_BET_PAYS.bankerPair, "Banker Pair — pays 11:1")
        : lose("No Banker Pair");

    case "dragon7":
      return coup.dragon7
        ? win(SIDE_BET_PAYS.dragon7, "Dragon 7 — pays 40:1")
        : lose("No Dragon 7");

    case "panda8":
      return coup.panda8 ? win(SIDE_BET_PAYS.panda8, "Panda 8 — pays 25:1") : lose("No Panda 8");
  }
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}
