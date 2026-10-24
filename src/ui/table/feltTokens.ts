/**
 * Colours the blackjack frames (CcmBm, N6Lcl, WSAfm, w7wLdL) use as literals rather than
 * design variables, named once here so the table's components never carry a raw hex value.
 * Everything that *is* a design variable comes from `@/ui/ds/tokens`.
 */
import { surfaces } from "@/ui/ds/tokens";

export const felt = {
  /** The felt's radial gradient: centre → edge (the edge is `--felt-deep`). */
  centre: "#22704F",
  /** Dealer tray, shoe, pills on the felt. */
  tray: "#0B2A20",
  pill: "#0B2A20E6",
  /** Hand outlines and the empty-hand hint. */
  outline: "#EDE4CC40",
  hint: surfaces.feltTextMuted,
  /** Printed rules and labels: the felt's one opaque ink (see `surfaces.feltTextMuted`). */
  ruleText: surfaces.feltTextMuted,
  /** "DEALER", "SHOE". */
  label: surfaces.feltTextMuted,
  /** The collect hint on the payout. */
  collect: surfaces.feltTextMuted,
  shoeEdge: "#D4AE6266",
  /** Bet spot wash. */
  spot: "#FFFFFF0A",
  /** Bankroll tip card: paper at 95%. */
  tip: "#F6F1E4F2",
  /** Ink on the green and orange pills. */
  onCorrect: "#06140D",
  onCorrectMuted: "#06140DB3",
  onMistake: "#2A0E06",
  onBadge: "#14100C",
} as const;
