/**
 * Colours the Strategy Builder frames (RYP9O, GYRRl, D0h320) use as literals rather than
 * design variables, named here so the screens never carry a raw hex value (as `surfaces` does
 * for the design system's components).
 */

import type { ChartCode } from "@/engine";
import { colors } from "@/ui/ds";

/** Chart cell fills and inks, per printed code. */
export const CELL: Readonly<
  Record<"H" | "S" | "D" | "Ds" | "P" | "R", { bg: string; fg: string }>
> = {
  H: { bg: "#EDE6D4", fg: "#1E1A14" },
  S: { bg: "#D99A2B", fg: "#1E1A14" },
  D: { bg: "#2D6CDF", fg: "#FFFFFF" },
  Ds: { bg: "#7FA8F2", fg: "#0B1A3A" },
  P: { bg: "#3FA877", fg: "#06140D" },
  R: { bg: "#5E574B", fg: "#FFFFFF" },
};

export function cellColors(code: ChartCode) {
  const k = code === "Rh" || code === "Rs" || code === "Rp" ? "R" : code;
  return CELL[k];
}

export const builder = {
  /** Primary at 8% (attribution bar, selected rule, felt highlight). */
  primaryWash: "#D4AE6214",
  primaryWashStrong: "#D4AE621F",
  primaryEdge: "#D4AE6240",
  /** Correct at 10%: the rules-checked panel. */
  correctWash: "#3FA8771A",
  mistakeWash: "#E07A5F1A",
  /** The check mark on a done step. */
  doneInk: "#06140D",
  /** Changed-dot ring: the card colour. */
  dotRing: colors.card,
  selectedCell: "#FFFFFF",
  /** Felt gradient and details. */
  feltFrom: "#22704F",
  feltTo: "#123F2F",
  feltLabel: "#0B2A20",
  feltCaption: "#F1EAD6A6",
  feltCellEdge: "#EDE4CC55",
  chipEdge: "#FFFFFFCC",
  chipShadow: "0px 2px 3px #00000088",
  pressedPuck: "#FFFFFF",
  puckInk: "#1D1F22",
  /** Roulette pockets. */
  red: "#B83A33",
  black: "#1D1F22",
  green: colors.chip25,
  coverEdge: "#FFFFFF22",
  swatchEdge: "#FFFFFF33",
  uncoveredSwatch: "#1D1F2255",
  /** Outcome shades: winners from strongest, then the loss colour. */
  winShades: ["#3FA877", "#2E8A5F", "#7FD1A8", "#5FBF8F", "#246B4A"],
} as const;
