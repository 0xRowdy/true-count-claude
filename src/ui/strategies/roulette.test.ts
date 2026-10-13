import { describe, expect, it } from "vitest";
import { exampleRoulette } from "./library";
import {
  applyPreset,
  betPanel,
  checkBet,
  coverage,
  layoutChanges,
  outcomeTable,
  progressionWarning,
  sessionCards,
  stepBet,
  tapSpot,
  testLayout,
  widenOptions,
} from "./roulette";

const draft = exampleRoulette();
const SIX = "sixLine:13-14-15-16-17-18";

describe("the D0h320 example: High Side + Six Line + Zero", () => {
  it("covers 25 of 37 and reproduces the outcome table", () => {
    expect(coverage(draft.layout).label).toBe("Covers 25 of 37 numbers");
    const t = outcomeTable(draft.layout);
    expect(t.rows.map((r) => [r.title, r.pockets, r.percent, r.net])).toEqual([
      ["Ball lands 19–36", "18 pockets", "48.6%", "+$40"],
      ["Ball lands 13–18 (six line)", "6 pockets", "16.2%", "+$50"],
      ["Ball lands 0", "1 pocket", "2.7%", "+$80"],
      ["Ball lands 1–12", "12 pockets", "32.4%", "−$100"],
    ]);
    expect(t.average).toBe("−$2.70");
    expect(t.averageCaption).toBe("2.7% house edge, same as any single bet");
    expect(t.uncovered).toBe("Not covered: 1–12");
    expect(t.caption).toBe("37 pockets, each equally likely");
  });

  it("shows the selected six line as the design does", () => {
    const p = betPanel(draft.layout, draft.original, SIX);
    expect(p).toMatchObject({
      title: "Six line 13–18",
      pays: "5 to 1",
      wins: "6 of 37 · 16.2%",
      ifItHits: "+$125",
      amount: "$25",
      original: "Original: $50 of $200",
      yours: "Yours: $25 of $100",
      matchesOriginalShare: true,
    });
    expect(p?.covers.map((c) => c.label)).toEqual(["13", "14", "15", "16", "17", "18"]);
    expect(checkBet(draft.layout, draft.original, SIX)).toEqual({
      ok: true,
      title: "Rules-checked for European roulette",
      body: "Meets the $5 inside minimum. Same 25% share of the spin as the original, so the payouts scale exactly.",
    });
  });

  it("warns about Martingale with the design's numbers", () => {
    expect(progressionWarning(draft.layout)).toBe(
      "Progressions change how you lose, not how much on average. With Martingale, 6 losses in a row ask for a $6,400 bet, past most table limits. Flat betting is the honest default.",
    );
    expect(sessionCards(draft.layout).map((c) => c.value)).toEqual(["+$200", "−$300", "60"]);
  });

  it("has two changes: spin size and the stop-loss", () => {
    expect(layoutChanges(draft.layout, draft.original).map((c) => `${c.title}: ${c.from} → ${c.to}`)).toEqual([
      "Spin size: $200 per spin → $100 per spin",
      "Stop when down: −$600 → −$300",
    ]);
  });
});

describe("editing", () => {
  it("steps a bet and the outcome table follows", () => {
    const more = stepBet(draft.layout, SIX, 1);
    expect(outcomeTable(more).rows[1]?.net).toBe("+$75");
    expect(checkBet(more, draft.original, SIX).body).toMatch(/29% of the spin; the original put 25% here/);
    const back = applyPreset(more, draft.original, SIX, "match");
    expect(back.bets.find((b) => b.spotId === SIX)?.amount).toBe(25);
    expect(applyPreset(draft.layout, draft.original, SIX, "half").bets[1]?.amount).toBe(13);
  });

  it("tapping a number adds a straight up and coverage grows", () => {
    const next = tapSpot(draft.layout, "straight:7");
    expect(next.bets.at(-1)).toEqual({ spotId: "straight:7", amount: 5 });
    expect(coverage(next).covered).toBe(26);
    expect(widenOptions(next, "straight:7").map((s) => s.type)).toEqual(["split", "street", "corner", "sixLine"]);
  });

  it("simulates 50 spins reproducibly", () => {
    expect(testLayout(draft.layout, 5)).toEqual(testLayout(draft.layout, 5));
  });
});
