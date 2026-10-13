/**
 * The craps engine's public surface.
 *
 * Pure TypeScript, zero React / React Native / Expo / I/O dependencies (ADR-0002). Nothing here
 * reads a clock or calls `Math.random()`: dice come from the seeded Rng (ADR-0004).
 */

export * from "./dice";
export * from "./money";
export * from "./rules";
export * from "./bets";
export * from "./table";
export * from "./edge";
