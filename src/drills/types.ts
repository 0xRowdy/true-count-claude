/**
 * The Drill vocabulary.
 *
 * A **Drill** is "a focused training exercise with scored, per-decision feedback"
 * (CONTEXT.md glossary), as distinct from **Play**, which is unscored. Everything in
 * `src/drills` is pure, synchronous and UI-free: a screen drives a drill by calling
 * functions and rendering the data they return, and every scoring function can be called
 * at the instant of the tap, while the cards are still on the table (invariant 3).
 *
 * Nothing here — and nothing anywhere else in this module — models entitlement. There is
 * no `price`, no `tier`, no `locked`, no `unlockedAt`. That absence is deliberate and is
 * invariant 1: gate breadth, never depth of training. 36% of the category's low-star
 * reviews are paywall friction, and the incumbent's specific failure is putting the
 * counting and basic-strategy trainers behind a subscription on top of a game purchase
 * (`docs/research/competitive-landscape.md`). A drill type is never a separate purchase,
 * so there is no field here for a screen to read one out of.
 */

import type { CountingSystemId } from "@/engine";

export type DrillId = "basic-strategy" | "counting" | "true-count" | "deviation";

/**
 * Right or wrong. Deliberately the same two strings `src/state` uses for a Decision's
 * verdict, so a drill result drops straight into a Session's log.
 */
export type Verdict = "correct" | "incorrect";

/** Which counting systems a drill works with. `"all"` means all six. */
export type DrillSystemSupport = "all" | readonly CountingSystemId[];

/**
 * One drill, as data. This is what a menu screen renders.
 *
 * `gradedAgainst` is not decoration: the user is told up front what the verdict is
 * measured against, because "scored against Basic Strategy" and "scored against the
 * Illustrious 18" disagree on purpose and a trainer that hides which one it is using is
 * the "wrong math" complaint waiting to happen.
 */
export interface DrillDefinition {
  readonly id: DrillId;
  readonly name: string;
  readonly summary: string;
  /** What a verdict is measured against, in the user's words. */
  readonly gradedAgainst: string;
  readonly systems: DrillSystemSupport;
}

/**
 * The four drills. Every one of them is included in the product, always.
 */
export const DRILLS: readonly DrillDefinition[] = [
  {
    id: "basic-strategy",
    name: "Basic Strategy",
    summary:
      "Play hands and have every decision graded against the chart for your Rule Set, with a per-cell breakdown of the cells you miss.",
    gradedAgainst: "Basic Strategy for the active Rule Set",
    systems: "all",
  },
  {
    id: "counting",
    name: "Counting",
    summary:
      "Cards come off the shoe at a speed you choose. Keep the Running Count, hide it, and check yourself whenever you like.",
    gradedAgainst: "the Running Count for the active Counting System",
    systems: "all",
  },
  {
    id: "true-count",
    name: "True Count",
    summary:
      "Convert a Running Count and a shoe state into a True Count. Negative counts and two-digit counts come up on purpose.",
    gradedAgainst: "Running Count divided by decks remaining",
    // Balanced systems only. KO and Red 7 are played off the Running Count against a pivot
    // and never convert, so drilling the conversion for them would teach the wrong
    // procedure — `trueCountDrillAvailability` says so in the user's own words.
    systems: ["hi-lo", "omega-ii", "wong-halves", "zen"],
  },
  {
    id: "deviation",
    name: "Deviations",
    summary:
      "Hands dealt at counts either side of a published index, graded on whether you departed from Basic Strategy at the right moment.",
    gradedAgainst: "the Illustrious 18 and Fab 4 index numbers",
    systems: ["hi-lo"],
  },
];

export function getDrill(id: DrillId): DrillDefinition {
  const drill = DRILLS.find((candidate) => candidate.id === id);
  if (!drill) {
    throw new Error(`Unknown drill "${id}". Known drills: ${DRILLS.map((d) => d.id).join(", ")}.`);
  }
  return drill;
}

/** True when a drill can be run with this Counting System. */
export function drillSupportsSystem(drill: DrillDefinition, system: CountingSystemId): boolean {
  return drill.systems === "all" || drill.systems.includes(system);
}
