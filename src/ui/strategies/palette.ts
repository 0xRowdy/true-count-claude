/**
 * Colours for the Strategy Builder frames (RYP9O, GYRRl, D0h320). Everything maps to a design
 * token (`colors`, `surfaces`) where the design has one; the few the design file only uses as
 * literals (the Ds swatch, translucent washes, the felt highlight) are named here once, so the
 * screens never carry a raw hex value.
 */

import type { ChartCode } from "@/engine";
import { colors, surfaces } from "@/ui/ds";

/** Design literals with no variable in the .pen file. */
const literal = {
  doubleElseStand: "#7FA8F2",
  doubleElseStandInk: "#0B1A3A",
  splitInk: "#06140D",
  correctWash: "#3FA8771A",
  mistakeWash: "#E07A5F1A",
  primaryWashStrong: "#D4AE621F",
  primaryEdge: "#D4AE6240",
  feltHighlight: surfaces.feltGlow,
  feltLabel: "#0B2A20",
  feltCellEdge: "#EDE4CC55",
  chipShadow: "0px 2px 3px #00000088",
  uncoveredSwatch: "#1D1F2255",
  winMid: "#2E8A5F",
  winLight: "#7FD1A8",
} as const;

/** Chart cell fills and inks, per printed code. */
export const CELL: Readonly<
  Record<"H" | "S" | "D" | "Ds" | "P" | "R", { bg: string; fg: string }>
> = {
  H: { bg: colors.paper2, fg: colors.ink },
  S: { bg: colors.chip1k, fg: colors.ink },
  D: { bg: colors.coachAccent, fg: surfaces.chipInkLight },
  Ds: { bg: literal.doubleElseStand, fg: literal.doubleElseStandInk },
  P: { bg: colors.correct, fg: literal.splitInk },
  R: { bg: colors.inkMuted, fg: surfaces.chipInkLight },
};

export function cellColors(code: ChartCode) {
  const k = code === "Rh" || code === "Rs" || code === "Rp" ? "R" : code;
  return CELL[k];
}

export const builder = {
  primaryWash: surfaces.primaryWash,
  primaryWashStrong: literal.primaryWashStrong,
  primaryEdge: literal.primaryEdge,
  correctWash: literal.correctWash,
  mistakeWash: literal.mistakeWash,
  /** The check mark on a done step. */
  doneInk: literal.splitInk,
  /** Changed-dot ring: the card colour. */
  dotRing: colors.card,
  selectedCell: surfaces.chipInkLight,
  feltFrom: literal.feltHighlight,
  feltTo: colors.feltDeep,
  feltLabel: literal.feltLabel,
  feltCaption: surfaces.feltTextFaint,
  feltCellEdge: literal.feltCellEdge,
  chipEdge: surfaces.chipEdgeSpot,
  chipShadow: literal.chipShadow,
  pressedPuck: surfaces.chipInkLight,
  puckInk: colors.chip100,
  /** Roulette pockets: the chip reds and blacks, the $25 chip's green. */
  red: colors.chip5,
  black: colors.chip100,
  green: colors.chip25,
  coverEdge: surfaces.hairline,
  swatchEdge: surfaces.dieEdge,
  uncoveredSwatch: literal.uncoveredSwatch,
  /** Outcome shades: winners from strongest, then the loss colour. */
  winShades: [colors.correct, literal.winMid, literal.winLight, colors.chip25, colors.correctInk],
} as const;
