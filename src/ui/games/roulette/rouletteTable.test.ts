import { describe, expect, it } from "vitest";
import { getLayout, getSpot, spinPocket } from "@/games/roulette";
import {
  type TableAction,
  type TableState,
  CELL_H,
  WHEEL_RULES,
  amountOn,
  betSummary,
  chipCaption,
  chipPoint,
  edgeLabel,
  gradeBets,
  initialTable,
  lastPockets,
  loupeOptions,
  needsReset,
  payoutRows,
  phaseIndex,
  pocketFacts,
  stackChip,
  stackLabel,
  tableReducer,
  totalBetLabel,
  winningSpotIds,
} from "./rouletteTable";

const run = (state: TableState, ...actions: TableAction[]) => actions.reduce(tableReducer, state);
const ready = (wheel: TableState["wheel"] = "european", bankroll = 2000) =>
  run(initialTable(wheel), { type: "seed", seed: 42 }, { type: "bankroll", bankroll });
const add = (spotId: string, coach: "asked" | "mistakes" | "every" = "mistakes"): TableAction => ({
  type: "add",
  spotId,
  coach,
});

describe("betting", () => {
  it("builds the design's layout: 17 straight · Red · 2nd dozen, $40, 2.7%", () => {
    const s = run(
      ready(),
      add("straight:17"),
      { type: "chip", chip: 25 },
      add("red"),
      { type: "chip", chip: 5 },
      add("dozen:2"),
      add("dozen:2"),
    );
    expect(totalBetLabel(s)).toBe("Total bet $40");
    expect(betSummary(s)).toBe("17 straight · Red · 2nd dozen");
    expect(edgeLabel(s)).toBe("House edge 2.7%");
    expect(chipCaption(5)).toBe("$5 selected · long-press any number for the bet loupe");
  });

  it("removes one chip, undoes, clears and rebets", () => {
    let s = run(ready(), add("red"), add("red"), add("odd"));
    expect(amountOn(s.bets, "red")).toBe(10);
    s = tableReducer(s, { type: "remove", spotId: "red" });
    expect(amountOn(s.bets, "red")).toBe(5);
    s = tableReducer(s, { type: "undo" });
    expect(amountOn(s.bets, "red")).toBe(10);
    s = tableReducer(s, { type: "clear" });
    expect(s.bets).toEqual([]);
    s = tableReducer(s, { type: "undo" });
    expect(s.bets).toHaveLength(2);
  });

  it("refuses chips over the table max or the bankroll, with the reason in place", () => {
    let s = run(ready("european", 30), { type: "chip", chip: 25 }, add("red"), add("black"));
    expect(amountOn(s.bets, "black")).toBe(0);
    expect(s.error).toMatch(/more than your \$30 practice bankroll/);
    s = run(ready(), { type: "chip", chip: 1000 }, add("red"), add("red"));
    expect(amountOn(s.bets, "red")).toBe(1000);
    expect(s.error).toMatch(/over the \$1,000 table maximum/);
  });

  it("validates limits with the engine at Spin", () => {
    const s = run(ready(), { type: "chip", chip: 1 }, add("red"), { type: "spin" });
    expect(s.phase).toBe("bet");
    expect(s.error).toMatch(/under the \$5 minimum/);
  });

  it("offers a reset only when the bankroll cannot cover a legal spin", () => {
    expect(needsReset(ready("european", 4))).toBe(true);
    expect(needsReset(ready("european", 5))).toBe(false);
  });
});

describe("a round", () => {
  it("runs Bet → Spin → Result → Payout → Bet, settles with the engine and keeps history", () => {
    let s = run(ready(), add("straight:17"), add("red"));
    s = tableReducer(s, { type: "spin" });
    expect(s.phase).toBe("spin");
    expect(phaseIndex(s.phase)).toBe(1);
    const pocket = spinPocket(WHEEL_RULES.european, 42, 0);
    expect(s.settlement!.pocket).toBe(pocket);
    s = tableReducer(s, { type: "reveal" });
    expect(s.phase).toBe("result");
    expect(lastPockets(s.history)).toEqual([pocket]);
    expect(winningSpotIds(WHEEL_RULES.european, pocket).has(`straight:${pocket}`)).toBe(true);
    s = tableReducer(s, { type: "payout" });
    expect(s.bankroll).toBe(2000 + s.settlement!.net);
    expect(payoutRows(s)).toHaveLength(2);
    s = tableReducer(s, { type: "next" });
    expect(s.phase).toBe("bet");
    expect(s.bets).toEqual([]);
    s = tableReducer(s, { type: "rebet", coach: "mistakes" });
    expect(s.bets).toHaveLength(2);
    s = run(s, { type: "spin" }, { type: "reveal" });
    expect(s.settlement!.pocket).toBe(spinPocket(WHEEL_RULES.european, 42, 1));
    expect(lastPockets(s.history)).toHaveLength(2);
  });

  it("pays a straight 35:1 and shows each bet's result", () => {
    const pocket = spinPocket(WHEEL_RULES.european, 42, 0);
    const id = `straight:${pocket}`;
    const s = run(ready(), add(id), { type: "spin" }, { type: "reveal" }, { type: "payout" });
    expect(s.settlement!.net).toBe(175);
    expect(payoutRows(s)[0]).toMatchObject({ outcome: "win", net: "+$175" });
    expect(s.bankroll).toBe(2175);
  });

  it("does not spin before the seed or with no bets", () => {
    expect(
      run(initialTable(), { type: "bankroll", bankroll: 10 }, add("red"), { type: "spin" }).phase,
    ).toBe("bet");
    expect(run(ready(), { type: "spin" }).error).toBe("Place a bet first.");
  });

  it("describes pockets", () => {
    expect(pocketFacts(WHEEL_RULES.european, 17)).toBe("Black · Odd · 1–18 · 2nd dozen");
    expect(pocketFacts(WHEEL_RULES.french, 0)).toMatch(/half back/);
  });
});

describe("coach", () => {
  it("catches the American top line as a mistake and offers to take it back", () => {
    let s = run(ready("american"), add("topLine:0-00-1-2-3"));
    expect(s.coach?.variant).toBe("mistake");
    expect(s.coach?.title).toBe("The top line costs 7.89%");
    expect(s.coach?.takeBack).toBe("topLine:0-00-1-2-3");
    expect(gradeBets(s)).toEqual([{ category: "inside", correct: false, coached: true }]);
    s = tableReducer(s, { type: "removeSpot", spotId: "topLine:0-00-1-2-3" });
    expect(s.bets).toEqual([]);
  });

  it("grades a taken-back top line as a coached mistake, however it leaves the felt", () => {
    const top = "topLine:0-00-1-2-3";
    const wrong = { category: "inside", correct: false, coached: true };
    const back = run(ready("american"), add(top), { type: "removeSpot", spotId: top }, add("red"));
    expect(gradeBets(back)).toEqual([
      { category: "outside", correct: true, coached: false },
      wrong,
    ]);
    const undone = run(ready("american"), add(top), { type: "undo" });
    expect(gradeBets(undone)).toEqual([wrong]);
    const cleared = run(ready("american"), add(top), { type: "clear" });
    expect(gradeBets(cleared)).toEqual([wrong]);
    // Kept: graded once, on the felt.
    expect(gradeBets(run(ready("american"), add(top), add(top)))).toEqual([wrong]);
  });

  it("dismisses the take-back note once the bet is removed some other way", () => {
    const top = "topLine:0-00-1-2-3";
    const s = run(ready("american"), add(top), { type: "remove", spotId: top });
    expect(s.coach).toBeNull();
    expect(
      tableReducer(
        { ...s, coach: { variant: "mistake", kind: "", title: "", body: "", takeBack: top } },
        { type: "removeSpot", spotId: top },
      ).coach,
    ).toBeNull();
  });

  it("runs the coach on a rebet", () => {
    const top = "topLine:0-00-1-2-3";
    let s = run(
      ready("american"),
      add(top, "asked"),
      { type: "spin" },
      { type: "reveal" },
      { type: "payout" },
      { type: "next" },
    );
    s = tableReducer(s, { type: "rebet", coach: "mistakes" });
    expect(s.coach?.variant).toBe("mistake");
    expect(gradeBets(s)).toEqual([{ category: "inside", correct: false, coached: true }]);
  });

  it("counts an asked-for mistake note as coached", () => {
    const top = "topLine:0-00-1-2-3";
    const s = run(ready("american"), add(top, "asked"), { type: "hint" });
    expect(gradeBets(s)).toEqual([{ category: "inside", correct: false, coached: true }]);
  });

  it("restarts hints on a wheel change", () => {
    const s = run(ready(), add("red", "every"), { type: "wheel", wheel: "french" });
    expect(s.hinted).toEqual([]);
    expect(tableReducer(s, add("red", "every")).coach?.variant).toBe("good");
  });

  it("stays quiet on the top line when coach is 'asked', but grades it", () => {
    const s = run(ready("american"), add("topLine:0-00-1-2-3", "asked"));
    expect(s.coach).toBeNull();
    expect(gradeBets(s)[0]).toEqual({ category: "inside", correct: false, coached: false });
    expect(tableReducer(s, { type: "hint" }).coach?.variant).toBe("mistake");
  });

  it("explains every decision with coach 'every', once per spot", () => {
    let s = run(ready(), add("straight:17", "every"));
    expect(s.coach?.kind).toBe("Hint · House edge");
    expect(s.coach?.body).toMatch(/same 2.7% house edge.*cover 1 of 37 pockets/);
    s = run(s, { type: "dismissCoach" }, add("straight:17", "every"));
    expect(s.coach).toBeNull();
    expect(gradeBets(s)).toEqual([{ category: "inside", correct: true, coached: false }]);
  });

  it("praises even money under La Partage and teaches no memory on a streak", () => {
    const s = run(ready("french"), add("red", "every"));
    expect(s.coach?.variant).toBe("good");
    expect(s.coach?.body).toMatch(/1.35%/);
    const streak = { ...ready(), history: [1, 3, 5] };
    expect(tableReducer(streak, add("black", "every")).coach?.title).toBe(
      "The wheel has no memory",
    );
  });

  it("keeps only the bets the new wheel has", () => {
    const s = run(ready("american"), add("topLine:0-00-1-2-3", "asked"), add("red"), {
      type: "wheel",
      wheel: "european",
    });
    expect(s.bets.map((b) => b.spotId)).toEqual(["red"]);
  });
});

describe("bet loupe and felt", () => {
  it("lists the inside bets touching 17 in the design's order", () => {
    const s = run(ready(), add("straight:17"));
    const opts = loupeOptions(s, 17);
    expect(opts.slice(0, 6).map((o) => [o.label, o.caption])).toEqual([
      ["17  · $5", "Straight 35:1"],
      ["16 | 17", "Split 17:1"],
      ["17 | 18", "Split 17:1"],
      ["14 | 17", "Split 17:1"],
      ["17 | 20", "Split 17:1"],
      ["16 · 17 · 18", "Street 11:1"],
    ]);
    expect(opts[11]!.caption).toBe("Six line 5:1");
    // Then the outside bets touching 17, so every spot has a button path.
    expect(opts.slice(12).map((o) => o.name)).toEqual([
      "2nd column",
      "2nd 12",
      "Black",
      "Odd",
      "1–18",
    ]);
    expect(opts[0]!.accessibilityLabel).toBe("Straight 17, pays 35 to 1, $5 bet");
  });

  it("puts split and corner chips on the grid lines", () => {
    const w = 260;
    const eu = WHEEL_RULES.european;
    const split = chipPoint(getSpot(eu, "split:16-17")!, "european", w);
    expect(split.x).toBeCloseTo((w - 4) / 3 + 1);
    const vsplit = chipPoint(getSpot(eu, "split:14-17")!, "european", w);
    expect(vsplit.y).toBeCloseTo((CELL_H + 2) * 6 - 1);
    const corner = chipPoint(getSpot(eu, "corner:13-14-16-17")!, "european", w);
    expect(corner).toEqual({ x: split.x, y: vsplit.y });
    expect(chipPoint(getSpot(eu, "street:16-17-18")!, "european", w).x).toBe(0);
  });

  it("spreads the American zero-row stacks so none overlap", () => {
    const us = WHEEL_RULES.american;
    const w = 262;
    const zeroRow =
      us.wheel &&
      getLayout(us).spots.filter(
        (s) => s.type !== "straight" && s.pockets.some((p) => p === 0 || p === "00"),
      );
    const pts = zeroRow.map((s) => chipPoint(s, "american", w));
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
        expect(d, `${zeroRow[i]!.id} vs ${zeroRow[j]!.id}`).toBeGreaterThanOrEqual(20);
      }
  });

  it("colours and labels stacks", () => {
    expect(stackChip(10)).toBe(5);
    expect(stackChip(40)).toBe(25);
    expect(stackLabel(1000)).toBe("1K");
    expect(stackLabel(1500)).toBe("1.5K");
  });
});
