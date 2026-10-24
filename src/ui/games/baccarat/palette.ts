/**
 * Colours the baccarat frame (gu3Mf, "08 Baccarat — Payout") uses as literals rather than
 * design variables, named once here so the components never carry a raw hex value. Bead
 * colours reuse the design's own tokens, as the frame does.
 */

import { colors, surfaces } from "@/ui/ds";

export const baccaratPalette = {
  /** Felt: radial glow (centre, 30% down) fading to `--felt-deep`. */
  feltGlow: surfaces.feltGlow,
  feltDeep: colors.feltDeep,
  /** Bead road fills. */
  beadPlayer: colors.coachAccent,
  beadBanker: colors.suitHeart,
  beadTie: colors.chip25,
  beadInk: "#FFFFFF",
  beadEmpty: "#FFFFFF14",
  roadWell: "#FFFFFF08",
  /** Hand-panel head dots (lighter than the beads, to read on felt). */
  dotPlayer: "#5B93F0",
  dotBanker: "#F08A80",
  /** The winning hand panel: gold at 10% with a 2pt gold edge. */
  winnerWash: "#D4AE621A",
  /** Outcome line check, and the win tag on a bet spot. */
  outcomeWin: "#9FE3BF",
  winTag: colors.correct,
  winTagInk: "#06140D",
  lossTag: colors.mistake,
  stakeTag: "#0B2A20E6",
} as const;
