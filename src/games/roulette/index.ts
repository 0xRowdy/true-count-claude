/**
 * The roulette engine's public surface.
 *
 * Pure TypeScript (ADR-0002): no React, no I/O, no clock. Randomness only through the seeded
 * `Rng` from `src/engine/rng.ts` (ADR-0004).
 */

export * from "./wheel";
export * from "./layout";
export * from "./spin";
export * from "./analysis";
export * from "./plan";
export * from "./format";
export * from "./coach";
