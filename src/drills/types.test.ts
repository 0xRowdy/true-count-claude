import { describe, expect, it } from "vitest";
import { COUNTING_SYSTEMS } from "@/engine";
import { DRILLS, drillSupportsSystem, getDrill } from "./types";

describe("the drill catalog", () => {
  it("ships all four drills", () => {
    expect(DRILLS.map((drill) => drill.id)).toEqual([
      "basic-strategy",
      "counting",
      "true-count",
      "deviation",
    ]);
  });

  it("models no entitlement of any kind", () => {
    // Invariant 1: gate breadth, never depth of training. A drill type is never a separate
    // purchase, so there is deliberately no field a screen could read a price or a lock out
    // of — 36% of the category's low-star reviews are paywall friction, and the incumbent's
    // specific failure is charging for the trainers on top of the game.
    const forbidden = ["price", "cost", "tier", "plan", "locked", "unlocked", "premium", "pro"];
    for (const drill of DRILLS) {
      for (const key of Object.keys(drill)) {
        expect(forbidden).not.toContain(key.toLowerCase());
      }
    }
  });

  it("says what each drill grades against, rather than leaving it implied", () => {
    for (const drill of DRILLS) {
      expect(drill.gradedAgainst.length).toBeGreaterThan(0);
      expect(drill.summary.length).toBeGreaterThan(0);
    }
  });

  it("offers every counting system where the drill really works with every system", () => {
    const counting = getDrill("counting");
    expect(counting.systems).toBe("all");
    for (const system of COUNTING_SYSTEMS) {
      expect(drillSupportsSystem(counting, system.id)).toBe(true);
    }
  });

  it("restricts the true-count drill to the systems that convert", () => {
    const trueCount = getDrill("true-count");
    for (const system of COUNTING_SYSTEMS) {
      expect(drillSupportsSystem(trueCount, system.id)).toBe(system.balanced);
    }
  });

  it("restricts the deviation drill to the one system with published indices", () => {
    const deviation = getDrill("deviation");
    for (const system of COUNTING_SYSTEMS) {
      expect(drillSupportsSystem(deviation, system.id)).toBe(system.id === "hi-lo");
    }
  });

  it("names the drills it does not know", () => {
    // @ts-expect-error — the whole point is the runtime guard behind the type.
    expect(() => getDrill("betting-spread")).toThrow(/Known drills/);
  });
});
