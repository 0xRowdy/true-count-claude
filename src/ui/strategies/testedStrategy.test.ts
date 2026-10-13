import { describe, expect, it } from "vitest";
import { EXAMPLE_IDS, LIBRARY, exampleDraft, newStrategy, testInTrainerHref } from "./library";
import { findTestedStrategy, strategyParam } from "./testedStrategy";

describe("Test in trainer: finding the strategy again at the table", () => {
  it("reads the id the builder put in the link", () => {
    const draft = newStrategy("craps", []);
    const href = testInTrainerHref(draft);
    expect(strategyParam(href.slice(href.indexOf("?")))).toBe(draft.id);
    expect(strategyParam("?seed=4")).toBeNull();
    expect(strategyParam("?strategy=")).toBeNull();
  });

  it("finds the player's own draft, for its game only", () => {
    const mine = { ...newStrategy("blackjack", []), title: "My H17 chart" };
    expect(findTestedStrategy("blackjack", mine.id, [mine])?.title).toBe("My H17 chart");
    expect(findTestedStrategy("craps", mine.id, [mine])).toBeNull();
  });

  it("finds the design's example before it is first saved, and a saved copy after", () => {
    for (const game of ["blackjack", "craps", "roulette"] as const) {
      expect(findTestedStrategy(game, EXAMPLE_IDS[game], [])?.id).toBe(EXAMPLE_IDS[game]);
    }
    const edited = { ...exampleDraft("roulette"), title: "Edited" };
    expect(findTestedStrategy("roulette", EXAMPLE_IDS.roulette, [edited])?.title).toBe("Edited");
  });

  it("finds a library strategy opened read-only", () => {
    const s = LIBRARY.find((l) => l.draft.game === "roulette")!;
    expect(findTestedStrategy("roulette", s.id, [])?.game).toBe("roulette");
    expect(findTestedStrategy("roulette", "no-such-strategy", [])).toBeNull();
  });
});
