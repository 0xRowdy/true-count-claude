/**
 * The roulette wheel: pockets, colours, physical order, and the table rules around it.
 *
 * Pure TypeScript (ADR-0002). Two wheels are modelled:
 *
 *   - European, single zero — 37 pockets. With La Partage (the "French" table) an even-money
 *     bet loses only half its stake when the ball lands on zero.
 *   - American, double zero — 38 pockets, the extra one being 00.
 *
 * A `Pocket` is a number 0–36 or the string "00". Keeping 00 a distinct literal (rather than
 * an encoded number such as 37 or -1) means it can never be mistaken for a real number in
 * arithmetic, and it renders as itself.
 */

export type Pocket = number | "00";

export const DOUBLE_ZERO = "00" as const;

export type WheelType = "european" | "american";

export type PocketColor = "red" | "black" | "green";

/** The 18 red numbers. Identical on both wheels. */
export const RED_NUMBERS: readonly number[] = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

const RED = new Set(RED_NUMBERS);

/** Clockwise pocket order on a European (single-zero) wheel, starting at 0. */
export const EUROPEAN_WHEEL_ORDER: readonly Pocket[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

/** Clockwise pocket order on an American (double-zero) wheel, starting at 0. */
export const AMERICAN_WHEEL_ORDER: readonly Pocket[] = [
  0,
  28,
  9,
  26,
  30,
  11,
  7,
  20,
  32,
  17,
  5,
  22,
  34,
  15,
  3,
  24,
  36,
  13,
  1,
  "00",
  27,
  10,
  25,
  29,
  12,
  8,
  19,
  31,
  18,
  6,
  21,
  33,
  16,
  4,
  23,
  35,
  14,
  2,
];

export function isZero(pocket: Pocket): boolean {
  return pocket === 0 || pocket === DOUBLE_ZERO;
}

export function pocketColor(pocket: Pocket): PocketColor {
  if (isZero(pocket)) return "green";
  return RED.has(pocket as number) ? "red" : "black";
}

export function pocketLabel(pocket: Pocket): string {
  return String(pocket);
}

/** Sort key that puts 0 first, 00 second, then 1–36 ascending — the order of the layout. */
export function pocketSortKey(pocket: Pocket): number {
  if (pocket === DOUBLE_ZERO) return -1;
  if (pocket === 0) return -2;
  return pocket;
}

export function comparePockets(a: Pocket, b: Pocket): number {
  return pocketSortKey(a) - pocketSortKey(b);
}

export function sortPockets(pockets: Iterable<Pocket>): Pocket[] {
  return [...pockets].sort(comparePockets);
}

/** Parse "00", "0" … "36". Returns undefined for anything else. */
export function parsePocket(text: string): Pocket | undefined {
  if (text === DOUBLE_ZERO) return DOUBLE_ZERO;
  if (!/^\d{1,2}$/.test(text)) return undefined;
  const n = Number(text);
  return n >= 0 && n <= 36 ? n : undefined;
}

/** Every pocket on the wheel, in layout order (0, 00, 1 … 36). */
export function wheelPockets(wheel: WheelType): readonly Pocket[] {
  return wheel === "american" ? AMERICAN_POCKETS : EUROPEAN_POCKETS;
}

/** Every pocket on the wheel, in the physical clockwise order of the wheel head. */
export function wheelOrder(wheel: WheelType): readonly Pocket[] {
  return wheel === "american" ? AMERICAN_WHEEL_ORDER : EUROPEAN_WHEEL_ORDER;
}

const NUMBERS_1_TO_36: readonly number[] = Array.from({ length: 36 }, (_, i) => i + 1);
const EUROPEAN_POCKETS: readonly Pocket[] = [0, ...NUMBERS_1_TO_36];
const AMERICAN_POCKETS: readonly Pocket[] = [0, DOUBLE_ZERO, ...NUMBERS_1_TO_36];

/**
 * Table limits.
 *
 * - `min` — the minimum for each outside bet (dozens, columns, even-money).
 * - `insideMin` — the minimum for the *combined* inside bets on a spin, the usual casino rule:
 *   five $1 straight-ups meet a $5 inside minimum.
 * - `max` — the maximum on any single bet spot.
 */
export interface TableLimits {
  readonly min: number;
  readonly max: number;
  readonly insideMin: number;
}

export interface RouletteRules {
  readonly wheel: WheelType;
  /**
   * La Partage: when the ball lands on a zero, even-money bets (red/black, odd/even,
   * 1–18/19–36) return half their stake instead of losing it all. Halves the edge on those
   * bets to 1.35%. A single-zero (European) rule only: `validateRouletteRules` rejects it
   * on the American wheel.
   */
  readonly laPartage: boolean;
  readonly limits: TableLimits;
}

export const DEFAULT_LIMITS: TableLimits = { min: 5, max: 1000, insideMin: 5 };

/** European single zero, no La Partage. The table in the design's Roulette screen. */
export const EUROPEAN_RULES: RouletteRules = {
  wheel: "european",
  laPartage: false,
  limits: DEFAULT_LIMITS,
};

/** European single zero with La Partage — the classic French table. */
export const FRENCH_RULES: RouletteRules = {
  wheel: "european",
  laPartage: true,
  limits: DEFAULT_LIMITS,
};

/** American double zero. */
export const AMERICAN_RULES: RouletteRules = {
  wheel: "american",
  laPartage: false,
  limits: DEFAULT_LIMITS,
};

export const DEFAULT_ROULETTE_RULES = EUROPEAN_RULES;

export function pocketCount(rules: RouletteRules | WheelType): number {
  const wheel = typeof rules === "string" ? rules : rules.wheel;
  return wheelPockets(wheel).length;
}

/** Problems with a rule set, as plain-language strings. Empty means the rules are usable. */
export function validateRouletteRules(rules: RouletteRules): string[] {
  const problems: string[] = [];
  const { min, max, insideMin } = rules.limits;
  for (const [name, value] of [
    ["Table minimum", min],
    ["Table maximum", max],
    ["Inside minimum", insideMin],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) problems.push(`${name} must be a positive amount.`);
  }
  if (max < min) problems.push("Table maximum must be at least the table minimum.");
  if (max < insideMin) problems.push("Table maximum must be at least the inside minimum.");
  if (rules.laPartage && rules.wheel !== "european") {
    problems.push("La Partage is a single-zero rule; American tables do not offer it.");
  }
  return problems;
}
