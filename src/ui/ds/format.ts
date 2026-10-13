/**
 * The React-free logic beneath the design-system components: chip denominations, card labels,
 * number formatting. Kept pure so it runs under vitest (see vitest.config.ts) and so the
 * prerendered HTML and the client render always agree (no locale APIs: hydration).
 */

import type { Rank, Suit } from "@/engine/cards";
import { colors, surfaces } from "./tokens";

/** The six practice-chip denominations the design defines. */
export const CHIP_VALUES = [1, 5, 25, 100, 500, 1000] as const;
export type ChipValue = (typeof CHIP_VALUES)[number];

/** A chip's face value: thousands collapse to "K" so three characters fit on a chip ("1K"). */
export function chipLabel(value: number): string {
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}K`;
  return String(value);
}

const CHIP_FILL: Record<ChipValue, string> = {
  1: colors.chip1,
  5: colors.chip5,
  25: colors.chip25,
  100: colors.chip100,
  500: colors.chip500,
  1000: colors.chip1k,
};

/** Chip body colour and the ink that reads on it (dark ink on the light 1 and 1K chips). */
export function chipColors(value: ChipValue): { fill: string; ink: string } {
  const dark = value === 1 || value === 1000;
  return { fill: CHIP_FILL[value], ink: dark ? surfaces.chipInkDark : surfaces.chipInkLight };
}

/** `12450` → `"12,450"`. Deterministic, unlike `toLocaleString`. */
export function formatThousands(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const [whole = "0", fraction] = Math.abs(amount).toString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** `2450` → `"$2,450"`. */
export function formatMoney(amount: number): string {
  const text = formatThousands(Math.abs(amount));
  return `${amount < 0 ? "-" : ""}$${text}`;
}

/** Suit glyphs with U+FE0E so browsers draw text, not emoji. */
const SUIT_GLYPH: Record<Suit, string> = {
  s: "♠︎",
  h: "♥︎",
  d: "♦︎",
  c: "♣︎",
};
const SUIT_NAME: Record<Suit, string> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
const SUIT_COLOR: Record<Suit, string> = {
  s: colors.suitSpade,
  h: colors.suitHeart,
  d: colors.suitDiamond,
  c: colors.suitClub,
};
const RANK_NAME: Partial<Record<Rank, string>> = { A: "Ace", J: "Jack", Q: "Queen", K: "King" };

export function suitGlyph(suit: Suit): string {
  return SUIT_GLYPH[suit];
}

/** Four-colour deck: each suit has its own colour. */
export function suitColor(suit: Suit): string {
  return SUIT_COLOR[suit];
}

/** The accessible name of a card: "Ace of spades", "10 of diamonds". */
export function cardLabel(rank: Rank, suit: Suit): string {
  return `${RANK_NAME[rank] ?? rank} of ${SUIT_NAME[suit]}`;
}

/** Up to two initials: "Marcus" → "M", "@shoe_reader" → "SR". */
export function initials(name: string): string {
  const words = name
    .replace(/[@_.-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** A progress fraction clamped to 0–1, NaN as 0. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * SVG path for one segment of a ring centred in a `size` box: from `startDeg` to `endDeg`,
 * clockwise from 12 o'clock, between radii `inner` and `outer`. Draws a chip's edge spots.
 */
export function ringSegmentPath(
  size: number,
  inner: number,
  outer: number,
  startDeg: number,
  endDeg: number,
): string {
  const c = size / 2;
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${round(c + r * Math.sin(a))} ${round(c - r * Math.cos(a))}`;
  };
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${pt(outer, startDeg)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${pt(outer, endDeg)}`,
    `L ${pt(inner, endDeg)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${pt(inner, startDeg)}`,
    "Z",
  ].join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Chip edge spots per the design: six spots, each 7% of the turn, starting at 12 o'clock. */
export function chipSpotPaths(size: number): string[] {
  const outer = size / 2;
  const inner = outer * 0.78;
  return Array.from({ length: 6 }, (_, i) =>
    ringSegmentPath(size, inner, outer, i * 60, i * 60 + 0.07 * 360),
  );
}

/** Pip centres (0–1 of the face) for a die value, standard layout. */
export function diePips(value: 1 | 2 | 3 | 4 | 5 | 6): ReadonlyArray<readonly [number, number]> {
  const lo = 0.27;
  const mid = 0.5;
  const hi = 0.73;
  const layouts: Record<number, ReadonlyArray<readonly [number, number]>> = {
    1: [[mid, mid]],
    2: [
      [lo, lo],
      [hi, hi],
    ],
    3: [
      [lo, lo],
      [mid, mid],
      [hi, hi],
    ],
    4: [
      [lo, lo],
      [hi, lo],
      [lo, hi],
      [hi, hi],
    ],
    5: [
      [lo, lo],
      [hi, lo],
      [mid, mid],
      [lo, hi],
      [hi, hi],
    ],
    6: [
      [lo, lo],
      [hi, lo],
      [lo, mid],
      [hi, mid],
      [lo, hi],
      [hi, hi],
    ],
  };
  return layouts[value]!;
}
