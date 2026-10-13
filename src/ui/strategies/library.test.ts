import { describe, expect, it } from "vitest";
import { normalizeDraft } from "@/state/strategies";
import {
  LIBRARY,
  communityRanked,
  compactCount,
  draftChangeCount,
  exampleDraft,
  exportDraft,
  forkStrategy,
  gameLine,
  newStrategy,
  testInTrainerHref,
} from "./library";

describe("library fixtures", () => {
  it("every fixture and example survives a storage round trip", () => {
    const all = [
      ...LIBRARY.map((s) => s.draft),
      ...(["blackjack", "craps", "roulette"] as const).map(exampleDraft),
    ];
    for (const d of all) expect(normalizeDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("ranks community strategies by upvotes", () => {
    const ranked = communityRanked();
    expect(ranked[0]?.title).toBe("Low-Edge Place 6 & 8");
    expect(ranked.every((s, i) => i === 0 || (ranked[i - 1]?.votes ?? 0) >= s.votes)).toBe(true);
  });

  it("the design's examples carry their change counts", () => {
    expect(draftChangeCount(exampleDraft("blackjack"))).toBe(6);
    expect(draftChangeCount(exampleDraft("craps"))).toBe(3);
    expect(draftChangeCount(exampleDraft("roulette"))).toBe(2);
    expect(gameLine(exampleDraft("blackjack"))).toBe("Blackjack · 6 deck · H17");
  });
});

describe("fork, new, share", () => {
  it("a fork is credited to the author and starts with no changes", () => {
    const s = LIBRARY.find((x) => x.id === "community-roulette-bond")!;
    const fork = forkStrategy(s, ["fork-community-roulette-bond"]);
    expect(fork.id).toBe("fork-community-roulette-bond-2");
    expect(fork.forkedFrom).toEqual({
      id: s.id,
      title: s.title,
      author: "@wheelwatcher",
      version: 5,
    });
    expect(draftChangeCount(fork)).toBe(0);
    expect(testInTrainerHref(fork)).toBe("/games/roulette?strategy=fork-community-roulette-bond-2");
  });

  it("new strategies start clean for every game", () => {
    for (const game of ["blackjack", "craps", "roulette"] as const) {
      const d = newStrategy(game, []);
      expect(d.forkedFrom).toBeNull();
      expect(draftChangeCount(d)).toBe(0);
    }
  });

  it("exports JSON with the credit and the changes", () => {
    const json = JSON.parse(exportDraft(exampleDraft("blackjack")));
    expect(json.format).toBe("tableside-strategy");
    expect(json.forkedFrom.author).toBe("Tableside Curated");
    expect(json.changes).toBe(6);
    expect(json.chart.overrides).toEqual({});
    expect(compactCount(4812)).toBe("4.8k");
    expect(compactCount(905)).toBe("905");
  });
});
