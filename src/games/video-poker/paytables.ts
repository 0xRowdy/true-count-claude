/**
 * Pay tables.
 *
 * Pays are **per coin bet**. Every machine pays the royal flush at 250 per coin for one to
 * four coins and 800 per coin at five (the 4,000-coin jackpot), which is why the published
 * returns below — and every optimal-strategy figure in this module — assume a five-coin bet.
 *
 * `publishedReturn` is the long-run return of perfect play at five coins, as published by the
 * Wizard of Odds video poker pages (https://wizardofodds.com/games/video-poker/tables/) to four
 * decimal places of a percent. `returns.test.ts` recomputes every one exactly from scratch
 * (`returns.ts`) and checks it against these. 6/5 Jacks or Better is usually quoted only as
 * "95.0%"; its four-place figure is our exact calculation, which agrees with that.
 */

import { HAND_RANKS, HAND_RANK_COUNT, type HandRank, type VideoPokerGame } from "./evaluate";

export interface PayRow {
  readonly hand: HandRank;
  /** The line as the machine prints it. */
  readonly label: string;
  /** Coins paid per coin bet, one to four coins. */
  readonly pays: number;
  /** Coins paid per coin bet at five coins, where that differs (the royal jackpot). */
  readonly paysAtMaxCoins?: number;
}

export type PayTableId =
  | "job-9-6"
  | "job-8-5"
  | "job-7-5"
  | "job-6-5"
  | "deuces-wild-full-pay"
  | "double-double-bonus-9-6";

export interface PayTable {
  readonly id: PayTableId;
  readonly game: VideoPokerGame;
  /** Full name, e.g. "9/6 Jacks or Better". */
  readonly name: string;
  /** Best-first, exactly the lines the machine shows. Hands not listed pay nothing. */
  readonly rows: readonly PayRow[];
  /** Return of perfect play at five coins, as a fraction (0.995439 = 99.5439%). */
  readonly publishedReturn: number;
}

export const MAX_COINS = 5;

function jacksOrBetter(
  id: PayTableId,
  fullHouse: number,
  flush: number,
  publishedReturn: number,
): PayTable {
  return {
    id,
    game: "jacks-or-better",
    name: `${fullHouse}/${flush} Jacks or Better`,
    rows: [
      { hand: "royal-flush", label: "Royal Flush", pays: 250, paysAtMaxCoins: 800 },
      { hand: "straight-flush", label: "Straight Flush", pays: 50 },
      { hand: "four-of-a-kind", label: "Four of a Kind", pays: 25 },
      { hand: "full-house", label: "Full House", pays: fullHouse },
      { hand: "flush", label: "Flush", pays: flush },
      { hand: "straight", label: "Straight", pays: 4 },
      { hand: "three-of-a-kind", label: "Three of a Kind", pays: 3 },
      { hand: "two-pair", label: "Two Pair", pays: 2 },
      { hand: "jacks-or-better", label: "Jacks or Better", pays: 1 },
    ],
    publishedReturn,
  };
}

export const PAY_TABLES: Readonly<Record<PayTableId, PayTable>> = {
  "job-9-6": jacksOrBetter("job-9-6", 9, 6, 0.995439),
  "job-8-5": jacksOrBetter("job-8-5", 8, 5, 0.972984),
  "job-7-5": jacksOrBetter("job-7-5", 7, 5, 0.961472),
  "job-6-5": jacksOrBetter("job-6-5", 6, 5, 0.949961),
  "deuces-wild-full-pay": {
    id: "deuces-wild-full-pay",
    game: "deuces-wild",
    name: "Full Pay Deuces Wild",
    rows: [
      { hand: "royal-flush", label: "Natural Royal Flush", pays: 250, paysAtMaxCoins: 800 },
      { hand: "four-deuces", label: "Four Deuces", pays: 200 },
      { hand: "wild-royal-flush", label: "Wild Royal Flush", pays: 25 },
      { hand: "five-of-a-kind", label: "Five of a Kind", pays: 15 },
      { hand: "straight-flush", label: "Straight Flush", pays: 9 },
      { hand: "four-of-a-kind", label: "Four of a Kind", pays: 5 },
      { hand: "full-house", label: "Full House", pays: 3 },
      { hand: "flush", label: "Flush", pays: 2 },
      { hand: "straight", label: "Straight", pays: 2 },
      { hand: "three-of-a-kind", label: "Three of a Kind", pays: 1 },
    ],
    publishedReturn: 1.00762,
  },
  "double-double-bonus-9-6": {
    id: "double-double-bonus-9-6",
    game: "double-double-bonus",
    name: "9/6 Double Double Bonus",
    rows: [
      { hand: "royal-flush", label: "Royal Flush", pays: 250, paysAtMaxCoins: 800 },
      { hand: "four-aces-with-kicker", label: "Four Aces + 2, 3, 4", pays: 400 },
      { hand: "four-2-4-with-kicker", label: "Four 2s, 3s, 4s + A, 2, 3, 4", pays: 160 },
      { hand: "four-aces", label: "Four Aces", pays: 160 },
      { hand: "four-2-4", label: "Four 2s, 3s, 4s", pays: 80 },
      { hand: "four-5-k", label: "Four 5s through Kings", pays: 50 },
      { hand: "straight-flush", label: "Straight Flush", pays: 50 },
      { hand: "full-house", label: "Full House", pays: 9 },
      { hand: "flush", label: "Flush", pays: 6 },
      { hand: "straight", label: "Straight", pays: 4 },
      { hand: "three-of-a-kind", label: "Three of a Kind", pays: 3 },
      { hand: "two-pair", label: "Two Pair", pays: 1 },
      { hand: "jacks-or-better", label: "Jacks or Better", pays: 1 },
    ],
    publishedReturn: 0.989808,
  },
};

export const PAY_TABLE_IDS = Object.keys(PAY_TABLES) as PayTableId[];

/** The table the design opens on: "9/6 Jacks or Better · 5 coins × $1". */
export const DEFAULT_PAY_TABLE_ID: PayTableId = "job-9-6";

export function getPayTable(id: PayTableId): PayTable {
  return PAY_TABLES[id];
}

export function assertValidCoins(coins: number): void {
  if (!Number.isInteger(coins) || coins < 1 || coins > MAX_COINS) {
    throw new RangeError(`Coins must be a whole number from 1 to ${MAX_COINS}, got ${coins}`);
  }
}

/** Coins paid per coin bet for a hand, at a given bet size. */
export function paysPerCoin(table: PayTable, hand: HandRank, coins: number): number {
  const row = table.rows.find((r) => r.hand === hand);
  if (!row) return 0;
  return coins === MAX_COINS && row.paysAtMaxCoins !== undefined ? row.paysAtMaxCoins : row.pays;
}

/** Total coins paid for a hand at a given bet — what the machine's pay table column shows. */
export function payout(table: PayTable, hand: HandRank, coins: number): number {
  assertValidCoins(coins);
  return paysPerCoin(table, hand, coins) * coins;
}

/** Per-coin pays indexed by hand-rank code, for the hot paths. */
export function payVector(table: PayTable, coins: number): Float64Array {
  assertValidCoins(coins);
  const out = new Float64Array(HAND_RANK_COUNT);
  HAND_RANKS.forEach((hand, code) => {
    out[code] = paysPerCoin(table, hand, coins);
  });
  return out;
}

/** The pay table as the machine displays it for a bet: each line with its total coins. */
export function payTableColumn(
  table: PayTable,
  coins: number,
): { hand: HandRank; label: string; coins: number }[] {
  assertValidCoins(coins);
  return table.rows.map((row) => ({
    hand: row.hand,
    label: row.label,
    coins: payout(table, row.hand, coins),
  }));
}
