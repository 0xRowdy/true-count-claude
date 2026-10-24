/**
 * Colours the live table's design (QEqUW) uses as literals rather than variables, named here
 * so the screen never carries a raw hex value (the same convention as `surfaces` in the DS).
 */

import { colors, surfaces } from "@/ui/ds/tokens";

export const live = {
  /** The felt's radial gradient: a lit centre falling off to `--felt-deep`. */
  feltGlow: surfaces.feltGlow,
  feltDeep: colors.feltDeep,
  /** The center-bets panel: deep felt at 60%. */
  centerPanel: "#0B2A2099",
  /** Center-bet boxes: felt line at 40%. */
  centerLine: "#EDE4CC66",
  /** Any Seven's red wash. */
  anySeven: "#B83A3333",
  /** Chip rim on the felt. */
  chipRim: "#FFFFFFCC",
  chipShadow: "0px 2px 3px #00000088",
  /** The puck: white with dark ink when ON, dark with white ink when OFF. */
  puckOn: surfaces.diePip,
  puckOff: colors.chip100,
  /** The "Live" badge's green wash (--correct at 12%). */
  liveWash: "#3FA8771F",
  /** Your seat's gold wash (--primary at 12%). */
  youWash: "#D4AE621F",
  white: surfaces.chipInkLight,
} as const;
