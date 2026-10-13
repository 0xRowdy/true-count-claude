/**
 * Colours the landing, onboarding and pricing frames use as literals rather than design
 * variables, named here (as `surfaces` is in the design system) so screens carry no raw hex.
 */
export const marketing = {
  /** Felt radial gradient, centre → edge (hero table, onboarding "Your starting point"). */
  feltGlow: "#22704F",
  /** Hand-total pill on felt. */
  feltPill: "#0B2A20E6",
  /** "Dealer must stand…" on felt. */
  feltRule: "#EDE4CC80",
  /** Plan cards on paper. */
  paperCard: "#FFFFFF80",
  /** Paper text on the ink Plus card: price note and description. */
  paperMuted: "#F6F1E4B3",
  paperSoft: "#F6F1E4CC",
  /** Fork-lineage strip on the community gradient. */
  wash: "#FFFFFF08",
  /** Pricing's selected plan: primary at ~6%. */
  primaryWashSoft: "#D4AE6210",
  /** The wallet button: white with black ink. */
  wallet: "#FFFFFF",
  walletInk: "#000000",
  /** Raised pill shadow (hero session pill). */
  pillShadow: "0px 6px 18px #00000066",
} as const;
