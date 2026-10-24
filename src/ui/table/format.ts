/**
 * Display formatting for the Play table.
 *
 * The engine settles in exact, unrounded floats on purpose — a casino rounding down to the
 * chip is a presentation rule, not an engine one (see the note in `round.ts`). Rounding
 * therefore lives here and nowhere else, so the bankroll the user sees can never drift from
 * the bankroll the engine holds by more than the last decimal place shown.
 */

import { type Hand, evaluate, isBlackjack } from "@/engine/hand";
import type { HandResult } from "@/engine/round";

/** Chips, to at most two decimals, with the trailing zeros dropped. `12.5` renders "$12.50". */
export function formatChips(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const magnitude = Math.abs(amount);
  const fixed = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(2);
  return `${sign}$${fixed}`;
}

/** A profit or loss, always signed, so a zero net reads as a push rather than as nothing. */
export function formatNet(amount: number): string {
  if (amount === 0) return "$0";
  return `${amount > 0 ? "+" : ""}${formatChips(amount)}`;
}

/** A count, always signed. A running count of zero is "0", never "+0" or "-0". */
export function formatCount(count: number): string {
  if (count === 0) return "0";
  const rendered = Number.isInteger(count) ? String(Math.abs(count)) : Math.abs(count).toFixed(1);
  return `${count > 0 ? "+" : "-"}${rendered}`;
}

/** A settled hand's result, as the felt and the review name it. */
export const RESULT_LABEL: Record<HandResult, string> = {
  blackjack: "Blackjack",
  win: "Win",
  push: "Push",
  lose: "Lose",
  bust: "Bust",
  surrender: "Surrendered",
};

/** A hand total in the words a player uses: "soft 18", "20", "Bust 23", "Blackjack". */
export function describeTotal(hand: Hand): string {
  if (isBlackjack(hand)) return "Blackjack";
  const value = evaluate(hand.cards);
  if (value.busted) return `Bust ${value.total}`;
  return value.soft ? `Soft ${value.total}` : `${value.total}`;
}
