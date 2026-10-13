export type CardSize = "sm" | "md" | "lg";

/** md is the design's 58 × 82 card; the others scale it (k = scale factor). */
export const CARD_SIZES: Record<CardSize, { width: number; height: number; k: number }> = {
  sm: { width: 44, height: 62, k: 44 / 58 },
  md: { width: 58, height: 82, k: 1 },
  lg: { width: 72, height: 102, k: 72 / 58 },
};
