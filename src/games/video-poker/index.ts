/**
 * Video poker engine: Jacks or Better (9/6, 8/5, 7/5, 6/5), full-pay Deuces Wild and 9/6
 * Double Double Bonus.
 *
 * Pure TypeScript under the same rules as `src/engine` (ADR-0002, ADR-0004): no React, no
 * I/O, no clock, and randomness only through the injected seeded `Rng`.
 *
 * The exact return-to-player calculator is deliberately *not* exported here: it takes
 * seconds of CPU and ~25 MB, so a screen importing this barrel must never reach it by
 * accident. Tests and tooling import it directly from `./returns`
 * (`@/games/video-poker/returns`). Screens show `PayTable.publishedReturn`, which the
 * tests pin to it.
 */

export * from "./cards";
export * from "./evaluate";
export * from "./paytables";
export * from "./holds";
export * from "./game";
export * from "./coach";
