/**
 * Dice — the only source of randomness in craps.
 *
 * Every roll comes from the seeded `Rng` (ADR-0004), so a seed reproduces a whole session of
 * rolls. The probability tables here are exact rationals (ways out of 36); every house edge
 * in `edge.ts` is derived from them rather than typed in, so the published figures are a
 * test of this file, not a copy of it.
 */

import type { Rng } from "../../engine/rng";

export type Die = 1 | 2 | 3 | 4 | 5 | 6;

export interface Dice {
  readonly d1: Die;
  readonly d2: Die;
}

/** The six box numbers a point (or a come bet) can be on. */
export type PointNumber = 4 | 5 | 6 | 8 | 9 | 10;

/** The four numbers that can be rolled "the hard way" (as a pair). */
export type HardNumber = 4 | 6 | 8 | 10;

export const POINT_NUMBERS: readonly PointNumber[] = [4, 5, 6, 8, 9, 10];
export const HARD_NUMBERS: readonly HardNumber[] = [4, 6, 8, 10];

/** Every total from 2 to 12, in order. */
export const TOTALS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Builds a `Dice` from two faces, validating them. */
export function dice(d1: number, d2: number): Dice {
  if (!isDie(d1) || !isDie(d2)) throw new Error(`invalid dice ${d1}-${d2}`);
  return { d1, d2 };
}

function isDie(n: number): n is Die {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

/** Rolls two fair dice from the injected Rng. */
export function rollDice(rng: Rng): Dice {
  return { d1: (rng.nextInt(6) + 1) as Die, d2: (rng.nextInt(6) + 1) as Die };
}

export function diceTotal(roll: Dice): number {
  return roll.d1 + roll.d2;
}

/** A pair on 4, 6, 8 or 10 — "the hard way". Pairs on 2 and 12 are not hardways. */
export function isHard(roll: Dice): boolean {
  return roll.d1 === roll.d2 && isHardNumber(diceTotal(roll));
}

export function isPointNumber(n: number): n is PointNumber {
  return n === 4 || n === 5 || n === 6 || n === 8 || n === 9 || n === 10;
}

export function isHardNumber(n: number): n is HardNumber {
  return n === 4 || n === 6 || n === 8 || n === 10;
}

/** Number of the 36 equally likely dice combinations that total `n`. */
export function waysToRoll(n: number): number {
  if (!Number.isInteger(n) || n < 2 || n > 12) return 0;
  return 6 - Math.abs(n - 7);
}

/** Probability that a single roll totals `n`. */
export function probabilityOfTotal(n: number): number {
  return waysToRoll(n) / 36;
}

/** Probability that `n` is rolled before a seven, ignoring every other total. */
export function probabilityBeforeSeven(n: number): number {
  const ways = waysToRoll(n);
  return ways / (ways + 6);
}

/**
 * Probability that hard `n` is rolled before a seven or an easy `n` — the hardway bet.
 * There is exactly one way to roll a hardway pair.
 */
export function probabilityHardBeforeEasyOrSeven(n: HardNumber): number {
  return 1 / (waysToRoll(n) + 6);
}

/** All 36 ordered dice combinations, each equally likely. */
export function allDice(): Dice[] {
  const out: Dice[] = [];
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) out.push({ d1: d1 as Die, d2: d2 as Die });
  }
  return out;
}

/** The true odds against `n` before a seven, as [against, for] — 4 is 2:1, 5 is 3:2, 6 is 6:5. */
export function trueOdds(n: PointNumber): readonly [number, number] {
  switch (n) {
    case 4:
    case 10:
      return [2, 1];
    case 5:
    case 9:
      return [3, 2];
    case 6:
    case 8:
      return [6, 5];
  }
}

/**
 * Mixes a session seed with a counter into a fresh 32-bit seed, so a long-running table can be
 * stored as plain data (seed + roll index) rather than as a live Rng closure. Deterministic:
 * the same pair always yields the same seed.
 */
export function deriveSeed(seed: number, index: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (index >>> 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  h = (h + Math.imul(index + 1, 0x27d4eb2f)) >>> 0;
  return h >>> 0;
}
