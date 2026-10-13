/**
 * Strategy chart colours, from the Strategy Builder's chart legend (RYP9O, "Legend" dedDM):
 * Hit on paper, Stand on the 1K-chip amber, Double on coach blue, Double-else-stand on a light
 * blue, Surrender on ink-muted. The design's legend has no Split swatch; Split takes the 500
 * chip's violet so the five families stay distinct.
 *
 * Kept apart from `tokens.ts` because these are one chart's semantics, not app-wide surfaces.
 */

import { colors, surfaces } from "./tokens";

/** The design's literal for the "Ds" swatch and its ink. */
const DOUBLE_STAND = "#7FA8F2";
const DOUBLE_STAND_INK = "#0B1A3A";

export type StrategySwatch = "hit" | "stand" | "double" | "doubleStand" | "split" | "surrender";

export const strategyColors: Readonly<Record<StrategySwatch, { bg: string; fg: string }>> = {
  hit: { bg: colors.paper2, fg: colors.ink },
  stand: { bg: colors.chip1k, fg: colors.ink },
  double: { bg: colors.coachAccent, fg: surfaces.chipInkLight },
  doubleStand: { bg: DOUBLE_STAND, fg: DOUBLE_STAND_INK },
  split: { bg: colors.chip500, fg: surfaces.chipInkLight },
  surrender: { bg: colors.inkMuted, fg: surfaces.chipInkLight },
};

/**
 * Informational text on the dark app surfaces. `--coach-accent` is too dark to read as text on
 * `--card`, so information reads in the chart's lighter blue instead.
 */
export const infoInk = DOUBLE_STAND;
