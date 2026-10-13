/**
 * The betting layout: every legal bet spot on the felt, its pockets, and its payout.
 *
 * The number grid is 12 rows ("streets") of 3, with 0 (and 00 on the American wheel) across
 * the top. Number `n` sits in street `floor((n - 1) / 3)` and position `(n - 1) % 3` within
 * it (0 = the 1, 4, 7 … column; 2 = the 3, 6, 9 … column). Two numbers can share a split only
 * when they touch on that grid, which is why 3|4 is not a split even though 3 and 4 are
 * consecutive: 3 ends one street and 4 begins the next.
 *
 * Spots are enumerated once per wheel from that geometry, so "is this a legal bet?" is a
 * lookup, never a re-derivation.
 */

import {
  DOUBLE_ZERO,
  type Pocket,
  type RouletteRules,
  type WheelType,
  isZero,
  pocketColor,
  sortPockets,
  wheelPockets,
} from "./wheel";

export type InsideBetType =
  | "straight"
  | "split"
  | "street"
  | "trio"
  | "corner"
  | "firstFour"
  | "topLine"
  | "sixLine";

export type OutsideBetType = "column" | "dozen" | "red" | "black" | "odd" | "even" | "low" | "high";

export type BetType = InsideBetType | OutsideBetType;

/** Payout odds, "N to 1". A winning bet returns its stake plus `payout × stake`. */
export const PAYOUTS: Readonly<Record<BetType, number>> = {
  straight: 35,
  split: 17,
  street: 11,
  trio: 11,
  corner: 8,
  firstFour: 8,
  topLine: 6,
  sixLine: 5,
  column: 2,
  dozen: 2,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1,
  high: 1,
};

export const BET_TYPE_NAMES: Readonly<Record<BetType, string>> = {
  straight: "Straight",
  split: "Split",
  street: "Street",
  trio: "Trio",
  corner: "Corner",
  firstFour: "First four",
  topLine: "Top line",
  sixLine: "Six line",
  column: "Column",
  dozen: "Dozen",
  red: "Red",
  black: "Black",
  odd: "Odd",
  even: "Even",
  low: "1–18",
  high: "19–36",
};

const INSIDE_TYPES: ReadonlySet<BetType> = new Set<BetType>([
  "straight",
  "split",
  "street",
  "trio",
  "corner",
  "firstFour",
  "topLine",
  "sixLine",
]);

const EVEN_MONEY_TYPES: ReadonlySet<BetType> = new Set<BetType>([
  "red",
  "black",
  "odd",
  "even",
  "low",
  "high",
]);

export function isInsideBet(type: BetType): boolean {
  return INSIDE_TYPES.has(type);
}

/** The even-money bets — the ones La Partage applies to. */
export function isEvenMoneyBet(type: BetType): boolean {
  return EVEN_MONEY_TYPES.has(type);
}

export interface BetSpot {
  /** Stable, serialisable id: `"straight:17"`, `"split:16-17"`, `"dozen:2"`, `"red"`. */
  readonly id: string;
  readonly type: BetType;
  /** The pockets this bet wins on, in layout order (0, 00, 1 … 36). */
  readonly pockets: readonly Pocket[];
  /** "N to 1". */
  readonly payout: number;
  /** How the felt names the spot: "17", "16 | 17", "16 · 17 · 18", "13–18", "2nd 12", "Red". */
  readonly label: string;
}

export interface RouletteLayout {
  readonly wheel: WheelType;
  readonly pockets: readonly Pocket[];
  /** Every legal bet spot, inside bets first. */
  readonly spots: readonly BetSpot[];
  readonly byId: ReadonlyMap<string, BetSpot>;
}

// ---------------------------------------------------------------------------------------------
// Grid geometry
// ---------------------------------------------------------------------------------------------

/** Street (row of three) index 0–11 for a number 1–36. */
export function streetOf(n: number): number {
  return Math.floor((n - 1) / 3);
}

/** Position within its street: 0, 1 or 2. Equals the column index (0 = 1st column). */
export function columnOf(n: number): number {
  return (n - 1) % 3;
}

/** Dozen index 0–2 for a number 1–36. */
export function dozenOf(n: number): number {
  return Math.floor((n - 1) / 12);
}

/** The numbers that share an edge with `n` on the betting grid (1–36 only). */
export function gridNeighbours(n: number): number[] {
  const out: number[] = [];
  if (columnOf(n) > 0) out.push(n - 1);
  if (columnOf(n) < 2) out.push(n + 1);
  if (streetOf(n) > 0) out.push(n - 3);
  if (streetOf(n) < 11) out.push(n + 3);
  return out;
}

const ORDINALS = ["1st", "2nd", "3rd"] as const;

function spotId(type: BetType, pockets: readonly Pocket[]): string {
  return `${type}:${pockets.map(String).join("-")}`;
}

function insideSpot(type: InsideBetType, pockets: readonly Pocket[], label?: string): BetSpot {
  const sorted = sortPockets(pockets);
  const joiner = sorted.length === 2 ? " | " : " · ";
  return {
    id: spotId(type, sorted),
    type,
    pockets: sorted,
    payout: PAYOUTS[type],
    label: label ?? sorted.map(String).join(joiner),
  };
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function buildLayout(wheel: WheelType): RouletteLayout {
  const spots: BetSpot[] = [];

  // Straight ups, including the zero(s).
  for (const pocket of wheelPockets(wheel)) spots.push(insideSpot("straight", [pocket]));

  // Splits on the number grid: across a street, and between adjacent streets.
  for (let n = 1; n <= 36; n++) {
    if (columnOf(n) < 2) spots.push(insideSpot("split", [n, n + 1]));
    if (streetOf(n) < 11) spots.push(insideSpot("split", [n, n + 3]));
  }

  // Zero-row bets. The zero(s) touch the first street only.
  if (wheel === "european") {
    spots.push(insideSpot("split", [0, 1]));
    spots.push(insideSpot("split", [0, 2]));
    spots.push(insideSpot("split", [0, 3]));
    spots.push(insideSpot("trio", [0, 1, 2]));
    spots.push(insideSpot("trio", [0, 2, 3]));
    spots.push(insideSpot("firstFour", [0, 1, 2, 3]));
  } else {
    // 0 sits over 1–2, 00 over 2–3 (the boundary between them is above 2).
    spots.push(insideSpot("split", [0, DOUBLE_ZERO]));
    spots.push(insideSpot("split", [0, 1]));
    spots.push(insideSpot("split", [0, 2]));
    spots.push(insideSpot("split", [DOUBLE_ZERO, 2]));
    spots.push(insideSpot("split", [DOUBLE_ZERO, 3]));
    spots.push(insideSpot("trio", [0, 1, 2]));
    spots.push(insideSpot("trio", [0, DOUBLE_ZERO, 2]));
    spots.push(insideSpot("trio", [DOUBLE_ZERO, 2, 3]));
    spots.push(insideSpot("topLine", [0, DOUBLE_ZERO, 1, 2, 3]));
  }

  for (let s = 0; s < 12; s++) {
    const first = s * 3 + 1;
    spots.push(insideSpot("street", [first, first + 1, first + 2]));
  }

  // Corners: the top-left number of each 2×2 block.
  for (let n = 1; n <= 33; n++) {
    if (columnOf(n) < 2) spots.push(insideSpot("corner", [n, n + 1, n + 3, n + 4]));
  }

  for (let s = 0; s < 11; s++) {
    const first = s * 3 + 1;
    spots.push(insideSpot("sixLine", range(first, first + 5), `${first}–${first + 5}`));
  }

  // Outside bets.
  for (let c = 0; c < 3; c++) {
    spots.push({
      id: `column:${c + 1}`,
      type: "column",
      pockets: range(1, 36).filter((n) => columnOf(n) === c),
      payout: PAYOUTS.column,
      label: `${ORDINALS[c]} column`,
    });
  }
  for (let d = 0; d < 3; d++) {
    spots.push({
      id: `dozen:${d + 1}`,
      type: "dozen",
      pockets: range(d * 12 + 1, d * 12 + 12),
      payout: PAYOUTS.dozen,
      label: `${ORDINALS[d]} 12`,
    });
  }
  const numbers = range(1, 36);
  const outside: [OutsideBetType, number[]][] = [
    ["red", numbers.filter((n) => pocketColor(n) === "red")],
    ["black", numbers.filter((n) => pocketColor(n) === "black")],
    ["odd", numbers.filter((n) => n % 2 === 1)],
    ["even", numbers.filter((n) => n % 2 === 0)],
    ["low", range(1, 18)],
    ["high", range(19, 36)],
  ];
  for (const [type, pockets] of outside) {
    spots.push({ id: type, type, pockets, payout: PAYOUTS[type], label: BET_TYPE_NAMES[type] });
  }

  return {
    wheel,
    pockets: wheelPockets(wheel),
    spots,
    byId: new Map(spots.map((s) => [s.id, s])),
  };
}

const LAYOUTS: Readonly<Record<WheelType, RouletteLayout>> = {
  european: buildLayout("european"),
  american: buildLayout("american"),
};

export function getLayout(rules: RouletteRules | WheelType): RouletteLayout {
  return LAYOUTS[typeof rules === "string" ? rules : rules.wheel];
}

/** Look up a bet spot by id. Undefined when the id is not a legal bet on this wheel. */
export function getSpot(rules: RouletteRules | WheelType, id: string): BetSpot | undefined {
  return getLayout(rules).byId.get(id);
}

/**
 * Find the spot of a given type covering exactly `pockets`, if that bet exists on this
 * wheel's layout. This is the adjacency check: `findSpot(r, "split", [3, 4])` is undefined.
 */
export function findSpot(
  rules: RouletteRules | WheelType,
  type: InsideBetType,
  pockets: readonly Pocket[],
): BetSpot | undefined {
  return getSpot(rules, spotId(type, sortPockets(pockets)));
}

/** Ids for the outside bets, for callers that build them by name. */
export const OUTSIDE_SPOT_IDS = {
  red: "red",
  black: "black",
  odd: "odd",
  even: "even",
  low: "low",
  high: "high",
  dozen: (d: 1 | 2 | 3) => `dozen:${d}`,
  column: (c: 1 | 2 | 3) => `column:${c}`,
} as const;

export function straightId(pocket: Pocket): string {
  return `straight:${String(pocket)}`;
}

/** The order the bet loupe lists inside bets in. */
const LOUPE_ORDER: Readonly<Record<BetType, number>> = {
  straight: 0,
  split: 1,
  street: 2,
  trio: 3,
  corner: 4,
  firstFour: 5,
  topLine: 6,
  sixLine: 7,
  column: 8,
  dozen: 9,
  red: 10,
  black: 11,
  odd: 12,
  even: 13,
  low: 14,
  high: 15,
};

/**
 * Every legal bet that wins when the ball lands on `pocket` — the "bet loupe".
 *
 * Inside bets come first in the loupe's order: straight; the splits across the street, then
 * those to the streets above and below; street; trios; corners; six lines. For 17 that reads
 * 17, 16|17, 17|18, 14|17, 17|20, 16·17·18, then the four corners and two six lines.
 * Outside bets follow unless `insideOnly` is set.
 */
export function betsTouching(
  rules: RouletteRules | WheelType,
  pocket: Pocket,
  options: { insideOnly?: boolean } = {},
): BetSpot[] {
  const layout = getLayout(rules);
  if (!layout.pockets.includes(pocket)) return [];
  const touching = layout.spots.filter(
    (s) => s.pockets.includes(pocket) && (!options.insideOnly || isInsideBet(s.type)),
  );
  const splitRank = (s: BetSpot): number => {
    if (s.type !== "split" || typeof pocket !== "number" || isZero(pocket)) return 0;
    const other = s.pockets.find((p) => p !== pocket);
    if (typeof other !== "number" || isZero(other)) return 3;
    if (streetOf(other) === streetOf(pocket)) return other < pocket ? 0 : 1;
    return other < pocket ? 2 : 2.5;
  };
  return touching
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        LOUPE_ORDER[a.s.type] - LOUPE_ORDER[b.s.type] ||
        splitRank(a.s) - splitRank(b.s) ||
        a.i - b.i,
    )
    .map(({ s }) => s);
}
