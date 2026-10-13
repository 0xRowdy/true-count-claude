import { describe, expect, it } from "vitest";
import { analyzeHolds, getPayTable, holdMask } from "@/games/video-poker";
import type { Card } from "@/engine/cards";
import {
  INITIAL_VP_STATE,
  type VpState,
  askHint,
  betTag,
  changeBet,
  collect,
  deal,
  dealBlocker,
  decisionSummary,
  draw,
  handName,
  highlightedLine,
  historyLabel,
  holdBest,
  holdCategory,
  hintFor,
  hintVisible,
  houseEdgeText,
  isBroke,
  keepTags,
  mathRows,
  parseSeed,
  payLines,
  resolveMistake,
  resultHeadline,
  setCoins,
  setDenomination,
  setPayTable,
  statusLine,
  stepIndex,
  subtitle,
  toggle,
  withSeed,
} from "./model";

/** Seed 1981 deals 3♥ 9♠ A♥ 9♥ 5♥ first: the design's dilemma (a low pair vs four hearts). */
const SEED = 1981;
const seeded = (): VpState => withSeed(INITIAL_VP_STATE, SEED);
const dealt = () => deal(seeded());
const cards = (text: string): Card[] =>
  text.split(" ").map((t) => ({ rank: t.slice(0, -1), suit: t.slice(-1) }) as Card);

describe("bet", () => {
  it("opens on the design's machine", () => {
    expect(subtitle(INITIAL_VP_STATE.settings)).toBe("9/6 Jacks or Better · 5 coins × $1");
    expect(betTag(INITIAL_VP_STATE.settings)).toBe("BET 5");
    expect(stepIndex(INITIAL_VP_STATE.phase)).toBe(0);
    expect(statusLine(INITIAL_VP_STATE)).toBe("Choose your coins, then Deal.");
  });

  it("changes coins, denomination and game only between hands", () => {
    let s = setCoins(seeded(), 3);
    s = setDenomination(s, 25);
    expect(subtitle(s.settings)).toBe("9/6 Jacks or Better · 3 coins × 25¢");
    expect(setCoins(s, 6)).toBe(s);
    expect(setDenomination(s, 7)).toBe(s);
    s = setPayTable(s, "deuces-wild-full-pay");
    expect(subtitle(s.settings)).toBe("Full Pay Deuces Wild · 3 coins × 25¢");
    const held = deal(s);
    expect(setCoins(held, 1)).toBe(held);
    expect(setPayTable(held, "job-8-5")).toBe(held);
  });

  it("blocks a bet the bankroll can't cover, and offers a reset below the smallest bet", () => {
    expect(dealBlocker(INITIAL_VP_STATE, 2000)).toBe("Shuffling…");
    expect(dealBlocker(seeded(), undefined)).toBe("Shuffling…");
    expect(dealBlocker(seeded(), 5)).toBeNull();
    expect(dealBlocker(seeded(), 4.99)).toMatch(/^Not enough practice chips for a \$5 bet/);
    expect(isBroke(0.04)).toBe(true);
    expect(isBroke(0.05)).toBe(false);
  });

  it("parses ?seed=", () => {
    expect(parseSeed("1981")).toBe(1981);
    expect(parseSeed(["7"])).toBe(7);
    expect(parseSeed("x")).toBeNull();
    expect(parseSeed(undefined)).toBeNull();
  });

  it("deals nothing before the seed is known", () => {
    expect(deal(INITIAL_VP_STATE)).toBe(INITIAL_VP_STATE);
  });
});

describe("hold & draw", () => {
  it("deals the same hands from the same seed", () => {
    const a = dealt();
    expect(a.round!.dealt).toEqual(cards("3h 9s Ah 9h 5h"));
    expect(statusLine(a)).toBe("Dealt: pair of 9s, four hearts");
    expect(a.phase).toBe("hold");
    expect(stepIndex(a.phase)).toBe(1);
    expect(dealt().round!.dealt).toEqual(a.round!.dealt);
  });

  it("shows the hint at every deal with coach 'every', otherwise only when asked", () => {
    const s = dealt();
    expect(hintVisible(s, "every")).toBe(true);
    expect(hintVisible(s, "mistakes")).toBe(false);
    expect(hintVisible(s, "asked")).toBe(false);
    expect(hintVisible(askHint(s), "asked")).toBe(true);
    const hint = hintFor(s)!;
    expect(hint.tag).toBe("HINT · 9/6 JACKS OR BETTER");
    expect(hint.title).toBe("Keep the four hearts. Let the pair of 9s go.");
    expect(hint.holdLabel).toBe("Hold these 4");
    expect(keepTags(s, "every")).toEqual([true, false, true, true, true]);
    expect(keepTags(s, "mistakes")).toEqual([false, false, false, false, false]);
    expect(highlightedLine(s, "every")).toBe("flush");
  });

  it("'Hold these 4' sets the coach's holds and lights the target line", () => {
    const s = holdBest(dealt());
    expect(s.round!.held).toEqual([true, false, true, true, true]);
    expect(highlightedLine(s, "asked")).toBe("flush");
  });

  it("draws a correct hold straight away and records it", () => {
    const { state, record } = draw(holdBest(dealt()), "mistakes");
    expect(state.phase).toBe("result");
    expect(state.round!.phase).toBe("drawn");
    expect(record!.decision).toEqual({ category: "flush-draws", correct: true, coached: false });
    expect(record!.net).toBe(state.round!.phase === "drawn" ? state.round!.netCents / 100 : NaN);
    expect(state.history).toHaveLength(1);
    expect(state.decision!.correct).toBe(true);
  });

  it("marks a hold coached when the hint was on screen", () => {
    const { record } = draw(holdBest(dealt()), "every");
    expect(record!.decision.coached).toBe(true);
  });

  it("stops a worse hold with the mistake note before the draw", () => {
    let s = toggle(toggle(dealt(), 1), 3); // the pair of 9s
    const { state, record } = draw(s, "mistakes");
    expect(record).toBeNull();
    expect(state.phase).toBe("hold");
    expect(state.round!.phase).toBe("dealt");
    expect(state.mistake!.verdict).toBe("mistake");
    expect(state.mistake!.title).toBe("Keep the four hearts. Let the pair of 9s go.");
    expect(keepTags(state, "mistakes")).toEqual([true, false, true, true, true]);
    // Holds are frozen while the note is up.
    expect(toggle(state, 0)).toBe(state);
    s = state;
    const back = resolveMistake(s, "take-back");
    expect(back.state.phase).toBe("result");
    expect(holdMask(back.state.round!.held)).toBe(0b11101);
    expect(back.record!.decision).toEqual({
      category: "flush-draws",
      correct: false,
      coached: true,
    });
    expect(back.state.decision!.tookBack).toBe(true);
    const keep = resolveMistake(s, "keep");
    expect(holdMask(keep.state.round!.held)).toBe(0b01010);
    expect(keep.state.decision!.tookBack).toBe(false);
  });

  it("lets a worse hold through silently when the coach only speaks when asked", () => {
    const { state, record } = draw(toggle(toggle(dealt(), 1), 3), "asked");
    expect(state.phase).toBe("result");
    expect(record!.decision).toEqual({ category: "flush-draws", correct: false, coached: false });
  });

  it("ranks the math, marking the best and the player's hold", () => {
    const s = toggle(toggle(dealt(), 1), 3);
    const rows = mathRows(s.round!, 0b01010);
    expect(rows[0]).toMatchObject({
      rank: 1,
      best: true,
      cards: "3♥ A♥ 9♥ 5♥",
      concept: "four to a flush",
    });
    expect(rows.some((r) => r.yours && r.concept === "a low pair")).toBe(true);
  });
});

describe("result and payout", () => {
  const settled = () => draw(holdBest(dealt()), "mistakes").state;

  it("names the hand, shows the pay and moves to payout", () => {
    const s = settled();
    const round = s.round!;
    if (round.phase !== "drawn") throw new Error("not drawn");
    expect(statusLine(s)).toBe(
      `${handName(round.result, "job-9-6")}${round.coinsWon > 0 ? ` · pays ${round.coinsWon}` : ""}`,
    );
    expect(resultHeadline(round)).toMatch(/^(You win \$\d+|No win this hand|Push · \$5 back)$/);
    const p = collect(s);
    expect(p.phase).toBe("payout");
    expect(stepIndex(p.phase)).toBe(3);
    const again = deal(p);
    expect(again.phase).toBe("hold");
    expect(again.handNo).toBe(2);
    expect(again.round!.dealt).not.toEqual(round.dealt);
    expect(changeBet(p).phase).toBe("bet");
  });

  it("summarises the hold decision", () => {
    const s = settled();
    expect(decisionSummary(s.decision!, s.settings)).toEqual({
      title: "Hold: four to a flush. The best play.",
      detail: expect.stringMatching(/^Returns about \$\d+\.\d0 of your \$5 bet on average\.$/),
      correct: true,
    });
    const missed = resolveMistake(draw(toggle(toggle(dealt(), 1), 3), "mistakes").state, "keep");
    const summary = decisionSummary(missed.state.decision!, missed.state.settings);
    expect(summary.correct).toBe(false);
    expect(summary.title).toBe("Hold: a low pair.");
    expect(summary.detail).toMatch(
      /^Gave up about \$\d+\.\d0 a hand on average\. Counts as a miss\.$/,
    );
  });

  it("labels the LAST strip", () => {
    expect(historyLabel({ handNo: 1, result: "flush", netCents: 2500 })).toBe("W +25");
    expect(historyLabel({ handNo: 1, result: "nothing", netCents: -125 })).toBe("L -1.25");
    expect(historyLabel({ handNo: 1, result: "jacks-or-better", netCents: 0 })).toBe("P 0");
  });
});

describe("pay table", () => {
  it("prints the design's two columns for five coins with Flush lit", () => {
    const { left, right } = payLines(INITIAL_VP_STATE.settings, "flush");
    expect(left.map((l) => `${l.label} ${l.coins}`)).toEqual([
      "Royal Flush 4,000",
      "Straight Flush 250",
      "Four of a Kind 125",
      "Full House 45",
      "Flush 30",
    ]);
    expect(right.map((l) => `${l.label} ${l.coins}`)).toEqual([
      "Straight 20",
      "Three of a Kind 15",
      "Two Pair 10",
      "Jacks or Better 5",
    ]);
    expect(left.filter((l) => l.highlighted).map((l) => l.hand)).toEqual(["flush"]);
  });

  it("states the house edge of perfect play", () => {
    expect(houseEdgeText("job-9-6")).toBe("0.46%");
    expect(houseEdgeText("deuces-wild-full-pay")).toBe("−0.76%");
  });
});

describe("decision categories", () => {
  const category = (hand: string, id: Parameters<typeof getPayTable>[0] = "job-9-6") =>
    holdCategory(analyzeHolds(cards(hand), getPayTable(id), 5));

  it.each([
    ["5h 5s 9h Qh 2h", "flush-draws"],
    ["9c 9d 5h 5s Ac", "made-hands"],
    ["Jc Jd 5h 3s 2c", "pairs"],
    ["4c 5d 6h 7s Kd", "straight-draws"],
    ["Qc Ad 4d 9c 5h", "high-cards"],
    ["Th Jh Qh Kh Ah", "made-hands"],
  ] as const)("%s → %s", (hand, expected) => {
    expect(category(hand.replace(/T/g, "10"))).toBe(expected);
  });
});
