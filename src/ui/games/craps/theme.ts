/**
 * Colours the craps table design (lUiCl) uses as literals rather than variables, named here so
 * the screen never carries a raw hex value (the same convention as `surfaces` in the DS).
 */

import { colors, surfaces } from "@/ui/ds/tokens";

export const craps = {
  /** The felt's radial gradient: a lit centre falling off to `--felt-deep`. */
  feltGlow: surfaces.feltGlow,
  feltDeep: colors.feltDeep,
  /** The roll call's sub-line on a result. */
  callSub: "#9FE3BF",
  /** Felt-chip rim and shadow. */
  chipRim: "#FFFFFFCC",
  chipShadow: "0px 2px 3px #00000088",
  /** The "ODDS 3x" tag under the odds chip. */
  oddsTag: "#0B2A20",
  /** Win tag: --correct with deep green ink. */
  win: colors.correct,
  winInk: "#06140D",
  winInkMuted: "#06140DB3",
  /** History chip sub-label on the gold (latest) chip. */
  latestSub: "#1A1406B3",
  /** The puck: white with dark ink when ON, dark with white ink when OFF. */
  puckOn: surfaces.diePip,
  puckOff: colors.chip100,
  /** Center bets button and sheet rows. */
  centerButton: surfaces.tableButton,
  /** A bet that is off this roll. */
  offWash: "#00000055",
} as const;
