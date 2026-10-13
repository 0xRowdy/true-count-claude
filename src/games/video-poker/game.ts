/**
 * One round of video poker: bet, deal five, hold, draw, pay.
 *
 * Every round is a fresh 52-card deck shuffled by the injected seeded `Rng` (ADR-0004), so a
 * seed reproduces the deal *and* the draw. The draw takes replacement cards from the top of
 * the shuffled stub in order, exactly as a machine does. Rounds are immutable values; each
 * step returns a new one.
 *
 * Money is practice money only (CONTEXT.md): stakes are integer cents so nothing here ever
 * rounds a fraction of a cent.
 */

import { freshDeck, type Card } from "../../engine/cards";
import { shuffleInPlace, type Rng } from "../../engine/rng";
import { evaluateHand, type HandRank } from "./evaluate";
import { assertValidCoins, getPayTable, payout, type PayTable, type PayTableId } from "./paytables";

export interface VideoPokerSettings {
  readonly payTableId: PayTableId;
  /** Coins bet, 1–5. Five coins unlocks the 4,000-coin royal. */
  readonly coins: number;
  /** Value of one coin in cents (25 = a quarter machine, 100 = $1). */
  readonly denominationCents: number;
}

/** The design's machine: "9/6 Jacks or Better · 5 coins × $1". */
export const DEFAULT_VIDEO_POKER_SETTINGS: VideoPokerSettings = {
  payTableId: "job-9-6",
  coins: 5,
  denominationCents: 100,
};

/** Common machine denominations, in cents. */
export const DENOMINATIONS_CENTS: readonly number[] = [5, 25, 100, 500];

export function assertValidSettings(settings: VideoPokerSettings): void {
  getPayTable(settings.payTableId);
  assertValidCoins(settings.coins);
  if (!Number.isInteger(settings.denominationCents) || settings.denominationCents <= 0) {
    throw new RangeError(
      `Denomination must be a positive whole number of cents, got ${settings.denominationCents}`,
    );
  }
}

/** Total stake of one hand, in cents. */
export function betCents(settings: VideoPokerSettings): number {
  return settings.coins * settings.denominationCents;
}

export interface DealtRound {
  readonly phase: "dealt";
  readonly settings: VideoPokerSettings;
  /** The five cards dealt, in screen order. */
  readonly dealt: readonly Card[];
  /** The rest of the shuffled deck; draws come off the front. */
  readonly stub: readonly Card[];
  readonly held: readonly boolean[];
}

export interface DrawnRound {
  readonly phase: "drawn";
  readonly settings: VideoPokerSettings;
  readonly dealt: readonly Card[];
  readonly stub: readonly Card[];
  readonly held: readonly boolean[];
  /** The final five cards, in screen order (held cards stay in place). */
  readonly final: readonly Card[];
  readonly result: HandRank;
  /** Coins paid (0 for a losing hand). Includes the returned stake, as a machine's does. */
  readonly coinsWon: number;
  readonly winCents: number;
  /** Win minus stake, in cents. Negative on a loss. */
  readonly netCents: number;
}

export type VideoPokerRound = DealtRound | DrawnRound;

/** Shuffle a fresh deck with `rng` and deal five. Nothing is held yet. */
export function dealRound(settings: VideoPokerSettings, rng: Rng): DealtRound {
  assertValidSettings(settings);
  const deck = shuffleInPlace(freshDeck(), rng);
  return {
    phase: "dealt",
    settings,
    dealt: deck.slice(0, 5),
    stub: deck.slice(5),
    held: [false, false, false, false, false],
  };
}

function assertPosition(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index > 4) {
    throw new RangeError(`Card position must be 0–4, got ${index}`);
  }
}

/** Toggle HOLD on one card. */
export function toggleHold(round: DealtRound, index: number): DealtRound {
  assertPosition(index);
  return { ...round, held: round.held.map((h, i) => (i === index ? !h : h)) };
}

/** Set every HOLD at once (e.g. the coach's "Hold these 4"). */
export function setHolds(round: DealtRound, held: readonly boolean[]): DealtRound {
  if (held.length !== 5) throw new RangeError(`Expected 5 hold flags, got ${held.length}`);
  return { ...round, held: [...held] };
}

/** Replace every card not held with the next card off the stub, then pay the result. */
export function drawRound(round: DealtRound): DrawnRound {
  let next = 0;
  const final = round.dealt.map((card, i) => {
    if (round.held[i]) return card;
    const drawn = round.stub[next++];
    if (!drawn) throw new Error("The stub ran out of cards");
    return drawn;
  });
  const table = getPayTable(round.settings.payTableId);
  const settled = settleHand(table, final, round.settings);
  return { ...round, phase: "drawn", final, ...settled };
}

/** Score five final cards for a bet. */
export function settleHand(
  table: PayTable,
  final: readonly Card[],
  settings: Pick<VideoPokerSettings, "coins" | "denominationCents">,
): { result: HandRank; coinsWon: number; winCents: number; netCents: number } {
  const result = evaluateHand(final, table.game);
  const coinsWon = payout(table, result, settings.coins);
  const winCents = coinsWon * settings.denominationCents;
  return {
    result,
    coinsWon,
    winCents,
    netCents: winCents - settings.coins * settings.denominationCents,
  };
}
