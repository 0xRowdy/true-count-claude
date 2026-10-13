/**
 * The Tableside blackjack table, as words and numbers (frames CcmBm, N6Lcl, WSAfm, w7wLdL).
 *
 * Everything the felt prints is read off the engine's state or the configured Rule Set here,
 * never typed into the screen: "BLACKJACK PAYS 3 TO 2" is the table's payout, "Soft 17" is
 * `evaluate`, "$200 moving to your rack" is the settlement's `returned`. Pure and React-free,
 * so it runs under vitest (`tableView.test.ts`) and the prerendered markup cannot drift from
 * the client's (no clock, no locale).
 */

import type { Card } from "@/engine/cards";
import { type Hand, evaluate, isBlackjack } from "@/engine/hand";
import type { RuleSet } from "@/engine/rules";
import type { RoundState } from "@/engine/round";
import type { RoundResult } from "@/state";
import { CHIP_VALUES, type ChipValue, formatMoney } from "@/ui/ds/format";

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

/** The Phase Stepper's four steps, 0-based: Bet, Deal, Result, Payout. */
export type TablePhase = "bet" | "deal" | "result" | "payout";

export const PHASE_INDEX: Readonly<Record<TablePhase, number>> = {
  bet: 0,
  deal: 1,
  result: 2,
  payout: 3,
};

/**
 * Where the round stands. A settled round is the Result until the player collects, then the
 * Payout until the next hand is dealt or the table returns to the bet prompt.
 */
export function tablePhase(round: RoundState | null, collected: boolean): TablePhase {
  if (round === null) return "bet";
  if (round.phase !== "settled") return "deal";
  return collected ? "payout" : "result";
}

// ---------------------------------------------------------------------------
// The table's rules, printed
// ---------------------------------------------------------------------------

/** The Top Bar's subtitle: "6 deck · S17 · 3:2 · $10–$500". */
export function tableSubtitle(rules: RuleSet): string {
  return [
    `${rules.decks} deck`,
    rules.dealerSoft17 === "stand" ? "S17" : "H17",
    rules.blackjackPayout,
    `${formatMoney(rules.minBet)}–${formatMoney(rules.maxBet)}`,
  ].join(" · ");
}

const PAYOUT_WORDS: Readonly<Record<RuleSet["blackjackPayout"], string>> = {
  "3:2": "3 TO 2",
  "6:5": "6 TO 5",
};

/** What the felt prints, from the Rule Set being dealt. */
export function feltRules(rules: RuleSet): { pays: string; dealer: string } {
  return {
    pays: `BLACKJACK PAYS ${PAYOUT_WORDS[rules.blackjackPayout]}`,
    dealer: rules.dealerSoft17 === "stand" ? "DEALER STANDS ON ALL 17s" : "DEALER HITS SOFT 17",
  };
}

// ---------------------------------------------------------------------------
// Hand totals
// ---------------------------------------------------------------------------

export type TotalTone = "plain" | "bust" | "blackjack";

export interface TotalLabel {
  readonly text: string;
  readonly tone: TotalTone;
}

/** A player hand's pill: "Soft 17", "21 · doubled", "Bust · 24", "Blackjack". */
export function playerTotal(hand: Hand): TotalLabel {
  const value = evaluate(hand.cards);
  if (hand.surrendered) return { text: `Surrendered · ${value.total}`, tone: "plain" };
  if (isBlackjack(hand)) return { text: "Blackjack", tone: "blackjack" };
  if (value.busted) return { text: `Bust · ${value.total}`, tone: "bust" };
  const total = value.soft && value.total < 21 ? `Soft ${value.total}` : String(value.total);
  return { text: hand.doubled ? `${total} · doubled` : total, tone: "plain" };
}

/** The dealer's pill once the hole card is up: "Bust · 24", "Blackjack", "19". */
export function dealerTotal(cards: readonly Card[]): TotalLabel {
  const value = evaluate(cards);
  if (cards.length === 2 && value.total === 21) return { text: "Blackjack", tone: "blackjack" };
  if (value.busted) return { text: `Bust · ${value.total}`, tone: "bust" };
  return { text: String(value.total), tone: "plain" };
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

/** The most chips a stack draws; a bigger stack keeps its largest chips. */
export const MAX_STACK = 6;

/**
 * The chips that make up `amount`, largest first and bottom first, from the design's six
 * denominations. Practice chips only: an amount below $1 draws nothing.
 */
export function chipStack(amount: number, max = MAX_STACK): ChipValue[] {
  const chips: ChipValue[] = [];
  let left = Math.floor(amount);
  for (const value of [...CHIP_VALUES].reverse()) {
    while (left >= value && chips.length < max) {
      chips.push(value);
      left -= value;
    }
  }
  return chips;
}

/** The chips the rack offers: never one the table or the bankroll would refuse outright. */
export function rackChips(rules: RuleSet, bankroll: number): ChipValue[] {
  return CHIP_VALUES.filter((value) => value <= rules.maxBet && value <= bankroll);
}

export interface SpotChange {
  readonly amount: number;
  /** Why the spot stopped short of what was asked, when it did. */
  readonly capped: string | null;
}

/** Adds a chip to the bet spot, held to the table maximum and the bankroll. */
export function addChip(spot: number, chip: number, rules: RuleSet, bankroll: number): SpotChange {
  const ceiling = Math.min(rules.maxBet, bankroll);
  const wanted = spot + chip;
  if (wanted <= ceiling) return { amount: wanted, capped: null };
  return {
    amount: Math.max(spot, ceiling),
    capped:
      ceiling === rules.maxBet
        ? `Table maximum is ${formatMoney(rules.maxBet)}`
        : `That is your whole bankroll (${formatMoney(bankroll)})`,
  };
}

/** Takes a chip off the bet spot (long-press). Never below an empty spot. */
export function removeChip(spot: number, chip: number): number {
  return Math.max(0, spot - chip);
}

// ---------------------------------------------------------------------------
// The "LAST" results strip
// ---------------------------------------------------------------------------

export type HistoryTone = "blackjack" | "win" | "loss" | "push";

export interface HistoryChip {
  readonly key: string;
  readonly label: string;
  readonly tone: HistoryTone;
}

/** "+75", "−25" (a true minus sign, as the design prints it), "0". */
export function signedAmount(amount: number): string {
  const magnitude = Math.abs(amount);
  const text = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(2);
  if (amount > 0) return `+${text}`;
  if (amount < 0) return `−${text}`;
  return "0";
}

/** The last rounds, newest first: "BJ +75", "W +50", "L −25", "P 0". */
export function historyChips(rounds: readonly RoundResult[], limit = 5): HistoryChip[] {
  return rounds
    .slice(-limit)
    .reverse()
    .map((round) => {
      const blackjack = round.hands.some((hand) => hand.outcome === "blackjack");
      const tone: HistoryTone =
        round.net > 0 ? (blackjack ? "blackjack" : "win") : round.net < 0 ? "loss" : "push";
      const prefix = { blackjack: "BJ", win: "W", loss: "L", push: "P" }[tone];
      return { key: `r${round.index}`, label: `${prefix} ${signedAmount(round.net)}`, tone };
    });
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/** Every chip the settlement hands back — stakes included — which Collect moves to the rack. */
export function collectAmount(round: RoundState): number {
  const settlement = round.settlement;
  if (!settlement) return 0;
  const hands = settlement.outcomes.reduce((total, outcome) => total + outcome.returned, 0);
  return hands + round.insurance.returned;
}

/**
 * The bankroll the Top Bar shows. The engine credits the settlement the moment the round
 * settles; the table shows it arriving when the player collects, so the Result phase still
 * shows the chips that were on the felt as gone, as the design's $2,350 → $2,550 does.
 */
export function shownBankroll(available: number, round: RoundState | null, phase: TablePhase) {
  if (phase !== "result" || round === null) return available;
  return available - collectAmount(round);
}

/** Total staked across the round's hands, doubles included, plus insurance. */
export function totalStaked(round: RoundState): number {
  const hands = round.playerHands.reduce(
    (total, hand) => total + (hand.doubled ? hand.bet * 2 : hand.bet),
    0,
  );
  return hands + round.insurance.bet;
}

export type OutcomeTone = "win" | "loss" | "push";

export interface OutcomeSummary {
  readonly tone: OutcomeTone;
  /** "You win $100" */
  readonly headline: string;
  /** "Dealer drew to 24 and busted. Doubled bet pays 1 to 1." */
  readonly detail: string;
  /** The payout pill's second line: "paid 1:1", "paid 3:2", "bet returned". */
  readonly paid: string;
}

const RATIO_WORDS: Readonly<Record<RuleSet["blackjackPayout"], string>> = {
  "3:2": "3 to 2",
  "6:5": "6 to 5",
};

function dealerClause(round: RoundState): string {
  const cards = round.dealerHand.cards;
  const value = evaluate(cards);
  if (cards.length === 2 && value.total === 21) return "Dealer has blackjack.";
  if (value.busted) return `Dealer drew to ${value.total} and busted.`;
  if (cards.length > 2) return `Dealer drew to ${value.total}.`;
  return `Dealer stands on ${value.total}.`;
}

/** The Result phase's headline and subline, and the Payout pill's ratio. */
export function outcomeSummary(round: RoundState): OutcomeSummary {
  const settlement = round.settlement;
  const net = settlement?.net ?? 0;
  const outcomes = settlement?.outcomes ?? [];
  const tone: OutcomeTone = net > 0 ? "win" : net < 0 ? "loss" : "push";
  const single = outcomes.length === 1 ? outcomes[0] : undefined;
  const hand = round.playerHands[0];
  const ratio = round.rules.blackjackPayout;

  const headline =
    single?.result === "blackjack"
      ? `Blackjack! You win ${formatMoney(net)}`
      : tone === "win"
        ? `You win ${formatMoney(net)}`
        : tone === "loss"
          ? `You lose ${formatMoney(-net)}`
          : "Push";

  const parts: string[] = [];
  let paid = "paid 1:1";
  if (single && hand) {
    const player = evaluate(hand.cards).total;
    const dealer = evaluate(round.dealerHand.cards).total;
    switch (single.result) {
      case "blackjack":
        parts.push(`Blackjack pays ${RATIO_WORDS[ratio]}.`);
        paid = `paid ${ratio}`;
        break;
      case "win":
        parts.push(dealerClause(round));
        parts.push(hand.doubled ? "Doubled bet pays 1 to 1." : "Pays 1 to 1.");
        break;
      case "bust":
        parts.push(`You busted with ${player}.`);
        break;
      case "lose":
        parts.push(dealerClause(round));
        parts.push(`${dealer} beats your ${player}.`);
        break;
      case "push":
        parts.push(`${player} each — your bet comes back.`);
        paid = "bet returned";
        break;
      case "surrender":
        parts.push("You surrendered: half the bet comes back.");
        paid = "half returned";
        break;
    }
  } else {
    const won = outcomes.filter((o) => o.net > 0).length;
    const lost = outcomes.filter((o) => o.net < 0).length;
    const pushed = outcomes.length - won - lost;
    parts.push(dealerClause(round));
    parts.push(
      `${outcomes.length} hands: ${won} won, ${lost} lost${pushed > 0 ? `, ${pushed} pushed` : ""}.`,
    );
    paid = "across all hands";
  }

  if (settlement && round.insurance.bet > 0) {
    const insurance = settlement.insuranceNet;
    parts.push(
      insurance > 0
        ? `Insurance won ${formatMoney(insurance)}.`
        : `Insurance lost ${formatMoney(-insurance)}.`,
    );
  }

  return { tone, headline, detail: parts.join(" "), paid };
}

// ---------------------------------------------------------------------------
// Bet sizing
// ---------------------------------------------------------------------------

/** The bankroll tip's rule of thumb, and the line past which a bet is called out. */
export const BET_GUIDE = 0.02;
export const BET_LIMIT = 0.05;

export interface BetSizing {
  readonly percent: number;
  readonly onPlan: boolean;
  /** "Bet sizing: $50 = 2% of bankroll" */
  readonly title: string;
  readonly detail: string;
}

/** The bet against the bankroll it was placed from. Not a scored Decision; advice only. */
export function betSizing(bet: number, bankroll: number): BetSizing {
  const fraction = bankroll > 0 ? bet / bankroll : 1;
  const percent = Math.round(fraction * 1000) / 10;
  const onPlan = fraction <= BET_LIMIT;
  return {
    percent,
    onPlan,
    title: `Bet sizing: ${formatMoney(bet)} = ${percent}% of bankroll`,
    detail: onPlan
      ? "On plan."
      : `Above ${BET_LIMIT * 100}% of your bankroll — a short losing run would hurt. Aim near ${BET_GUIDE * 100}%.`,
  };
}
