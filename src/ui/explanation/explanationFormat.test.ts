/**
 * The Explanation's words, checked against the Explanation's numbers.
 *
 * Every Explanation here is built by `explainDecision` / `explainInsurance` from a real
 * situation, exactly as a screen receives one — nothing is hand-assembled. What is asserted is
 * that the sentences say what the data says: the right side of the index, the right sign on
 * the distance, the honest refusal where there is no number, and a near-tie that does not
 * read like a blunder.
 */

import { describe, expect, it } from "vitest";
import {
  type Card,
  type CountingSystem,
  type Rank,
  type RuleSet,
  DEFAULT_RULES,
  HI_LO,
  KO,
  OMEGA_II,
  compositionWithout,
  createHand,
  fullShoeComposition,
  strategyChart,
} from "@/engine";
import {
  type DecisionSituation,
  buildCountContext,
  explainDecision,
  explainInsurance,
} from "@/drills/explanation";
import {
  scoreAgainstIndexPlay,
  scoreInsuranceAgainstIndexPlay,
} from "@/drills/scoring";
import { sectionRows } from "@/ui/rules/chartChanges";
import {
  EV_GAP_THRESHOLDS,
  cellView,
  chartWindow,
  closeness,
  countView,
  decisionVerdict,
  distanceSentence,
  evGapTier,
  evRows,
  formatBets,
  formatEv,
  formatSignedCount,
  handContext,
  handTitle,
  indexRule,
  indexScaleGeometry,
  indexView,
  insuranceVerdict,
  insuranceView,
  insuranceWhatWouldChange,
  lossBarFraction,
  whatWouldChange,
} from "./explanationFormat";

function card(rank: Rank, suit: Card["suit"] = "s"): Card {
  return { rank, suit };
}

interface Spec {
  readonly player: readonly Rank[];
  readonly upcard: Rank;
  readonly rules?: RuleSet;
  readonly system?: CountingSystem;
  readonly runningCount?: number;
  /** Defaults to three decks left, so a running count of 3n is a true count of n. */
  readonly cardsRemaining?: number;
  readonly fromSplit?: boolean;
  readonly handCount?: number;
}

function situation(spec: Spec): DecisionSituation {
  const rules = spec.rules ?? DEFAULT_RULES;
  const system = spec.system ?? HI_LO;
  const cards = spec.player.map((rank) => card(rank));
  const upcard = card(spec.upcard, "h");
  return {
    rules,
    system,
    hand: { ...createHand(cards, 10), fromSplit: spec.fromSplit ?? false },
    handIndex: 0,
    handCount: spec.handCount ?? 1,
    dealerUpcard: upcard,
    bankroll: 10_000,
    composition: compositionWithout(fullShoeComposition(rules.decks), [...cards, upcard]),
    count: buildCountContext({
      system,
      decks: rules.decks,
      runningCount: spec.runningCount ?? 0,
      cardsRemaining: spec.cardsRemaining ?? 156,
    }),
  };
}

const explain = (spec: Spec) => explainDecision(situation(spec));
const grade = (spec: Spec, action: Parameters<typeof scoreAgainstIndexPlay>[1]) =>
  scoreAgainstIndexPlay(situation(spec), action, 0);

describe("numbers", () => {
  it("signs an EV and keeps three places", () => {
    expect(formatEv(0.12035)).toBe("+0.120");
    expect(formatEv(-0.53443)).toBe("-0.534");
    expect(formatEv(0.0001)).toBe("0.000");
  });

  it("never prints a real loss as zero", () => {
    expect(formatBets(0)).toBe("0 bets");
    expect(formatBets(0.0002)).toBe("under 0.001 bets");
    expect(formatBets(0.0431)).toBe("0.043 bets");
  });

  it("signs counts the way the index tables do, zero included", () => {
    expect(formatSignedCount(0)).toBe("+0");
    expect(formatSignedCount(2)).toBe("+2");
    expect(formatSignedCount(-1)).toBe("-1");
    expect(formatSignedCount(7 / 3)).toBe("+2.3");
  });
});

describe("how close the call was", () => {
  it("puts a near-tie and a blunder in different tiers", () => {
    expect(evGapTier(0)).toBe("best");
    expect(evGapTier(0.003)).toBe("near-tie");
    expect(evGapTier(0.0065)).toBe("close");
    expect(evGapTier(0.043)).toBe("clear");
    expect(evGapTier(0.4)).toBe("severe");
    expect(evGapTier(EV_GAP_THRESHOLDS.clear)).toBe("severe");
  });

  it("draws a near-tie as a sliver and a blunder as most of the track, on a fixed scale", () => {
    expect(lossBarFraction(0)).toBe(0);
    const tie = lossBarFraction(0.003);
    const blunder = lossBarFraction(0.4);
    expect(tie).toBeGreaterThan(0.03);
    expect(tie).toBeLessThan(0.1);
    expect(blunder).toBeGreaterThan(0.6);
    expect(lossBarFraction(3)).toBe(1);
    expect(lossBarFraction(0.02)).toBeLessThan(lossBarFraction(0.03));
  });

  it("lists exactly the engine's ranked actions, best first, with the loss behind the best", () => {
    const explanation = explain({ player: ["10", "2"], upcard: "3" });
    const rows = evRows(explanation, {
      actionTaken: "stand",
      correctAction: "hit",
      gradedAgainst: "index-play",
    });

    expect(rows.map((row) => row.action)).toEqual(explanation.ranked.map((r) => r.action));
    expect(rows[0]?.loss).toBe(0);
    expect(rows[0]?.best).toBe(true);
    expect(rows[0]?.lossText).toBe("best");
    const stand = rows.find((row) => row.action === "stand");
    expect(stand?.chosen).toBe(true);
    expect(stand?.tier).toBe("close");
    expect(rows.find((row) => row.action === "hit")?.chart).toBe(true);
  });

  it("marks the count play only when it departs from the chart", () => {
    const fired = evRows(explain({ player: ["4", "3", "9"], upcard: "10", runningCount: 3 }));
    expect(fired.find((row) => row.countPlay)?.action).toBe("stand");
    const plain = evRows(explain({ player: ["10", "2"], upcard: "3" }));
    expect(plain.some((row) => row.countPlay)).toBe(false);
  });

  it("says a near-tie is a near-tie and a lopsided call is not close", () => {
    const tie = closeness(explain({ player: ["4", "3", "9"], upcard: "10", runningCount: 3 }));
    expect(tie?.tier).toBe("near-tie");
    expect(tie?.text).toMatch(/Stand beats Hit by 0\.00\d bets — effectively a coin flip/);

    const lopsided = closeness(explain({ player: ["10", "10"], upcard: "6" }));
    expect(lopsided?.tier).toBe("severe");
  });
});

describe("the verdict", () => {
  it("explains a correct answer too, and says when it is also the best by EV", () => {
    const result = grade({ player: ["10", "2"], upcard: "3" }, "hit");
    const view = decisionVerdict(result.explanation, result);
    expect(view.correct).toBe(true);
    expect(view.tone).toBe("good");
    expect(view.headline).toBe("You hit — correct.");
    expect(view.detail).toMatch(/highest-EV play/);
    expect(view.standard).toMatch(/index plays/);
  });

  it("prices a big mistake in bets and as a share of the bet", () => {
    const result = grade({ player: ["10", "10"], upcard: "6" }, "hit");
    const view = decisionVerdict(result.explanation, result);
    expect(view.correct).toBe(false);
    expect(view.tone).toBe("bad");
    expect(view.headline).toBe("You hit. The play was Stand.");
    expect(view.tier).toBe("severe");
    expect(view.detail).toMatch(/^Hitting gives up \d\.\d{3} bets \(\d+\.\d% of the bet\)/);
    expect(view.detail).toMatch(/big mistake/);
  });

  it("does not paint a near-tie mistake like a blunder", () => {
    const result = grade({ player: ["4", "3", "9"], upcard: "10", runningCount: 3 }, "hit");
    const view = decisionVerdict(result.explanation, result);
    expect(view.correct).toBe(false);
    expect(view.tier).toBe("near-tie");
    expect(view.tone).toBe("warn");
  });

  it("uses a caller's evLoss when one is supplied", () => {
    const result = grade({ player: ["10", "10"], upcard: "6" }, "hit");
    const view = decisionVerdict(result.explanation, { ...result, evLoss: 0.003 });
    expect(view.tier).toBe("near-tie");
  });
});

describe("the hand", () => {
  it("names the hand the way its chart row does", () => {
    expect(handTitle(explain({ player: ["10", "6"], upcard: "10" }))).toBe("Hard 16 vs 10");
    expect(handTitle(explain({ player: ["A", "7"], upcard: "9" }))).toBe("Soft 18 (A,7) vs 9");
    expect(handTitle(explain({ player: ["8", "8"], upcard: "A" }))).toBe("8,8 vs A");
  });

  it("says which hand of a split it was", () => {
    expect(handContext(explain({ player: ["10", "6"], upcard: "10" }))).toBeNull();
    expect(
      handContext(explain({ player: ["8", "3"], upcard: "6", fromSplit: true, handCount: 2 })),
    ).toBe("Hand 1 of 2 · after a split");
  });
});

describe("the chart cell", () => {
  const hands: Spec[] = [
    { player: ["10", "6"], upcard: "10" },
    { player: ["A", "7"], upcard: "9" },
    { player: ["8", "8"], upcard: "A" },
    { player: ["5", "6"], upcard: "2" },
    { player: ["9", "9"], upcard: "7" },
    { player: ["A", "2"], upcard: "5" },
  ];

  it.each(hands)("names a printed cell that holds the governing code: %o", (spec) => {
    const explanation = explain(spec);
    const view = cellView(explanation);
    const row = sectionRows(strategyChart(explanation.rules), view.section).find(
      (candidate) => candidate.label === view.rowLabel,
    );
    expect(row?.cells[view.upcard]).toBe(view.code);
  });

  it("explains a fallback rather than showing a cell that disagrees with the play", () => {
    const view = cellView(explain({ player: ["4", "3", "9"], upcard: "10" }));
    expect(view.code).toBe("Rh");
    expect(view.fallbackNote).toMatch(/3 cards.*Hit/);
    expect(cellView(explain({ player: ["10", "6"], upcard: "10" })).fallbackNote).toBeNull();
  });

  it("windows the rows around the governing one, clamped at both ends", () => {
    const labels = ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"];
    expect(chartWindow(labels, "16", 2)).toEqual({ start: 9, end: 14, index: 11, found: true });
    expect(chartWindow(labels, "5", 2)).toEqual({ start: 0, end: 5, index: 0, found: true });
    expect(chartWindow(labels, "20", 2)).toEqual({ start: 11, end: 16, index: 15, found: true });
    expect(chartWindow(labels, "21", 2)).toMatchObject({ start: 11, end: 16, found: false });
    expect(chartWindow(labels, "4", 2)).toMatchObject({ start: 0, end: 5, found: false });
  });
});

describe("the count", () => {
  it("shows the division, not just its answer", () => {
    const view = countView(
      buildCountContext({ system: HI_LO, decks: 6, runningCount: 7, cardsRemaining: 156 }),
    );
    expect(view.division).toBe("+7 ÷ 3.0 = +2.3");
    expect(view.trueCount).toBe("+2");
    expect(view.rounding).toBe("truncated toward zero");
    expect(view.note).toBeNull();
  });

  it("gives the reason instead of a number for an unbalanced system", () => {
    const view = countView(
      buildCountContext({ system: KO, decks: 6, runningCount: -12, cardsRemaining: 156 }),
    );
    expect(view.trueCount).toBeNull();
    expect(view.division).toBeNull();
    expect(view.note).toMatch(/unbalanced/);
  });
});

describe("the index", () => {
  it("reads both directions of an index rule", () => {
    const sixteen = explain({ player: ["4", "3", "9"], upcard: "10", runningCount: 3 });
    expect(indexRule(sixteen.index.entry!)).toBe("Stand at +0 or higher, otherwise hit.");
    const thirteen = explain({ player: ["10", "3"], upcard: "2" });
    expect(indexRule(thirteen.index.entry!)).toBe("Hit below -1, otherwise stand.");
  });

  it("keeps the sign of the distance in the words", () => {
    expect(distanceSentence(2, 2)).toBe("The true count is +2 — 2 above the index.");
    expect(distanceSentence(-1, -3)).toBe("The true count is -1 — 3 below the index.");
    expect(distanceSentence(0, 0)).toBe("The true count is +0 — exactly at the index.");
  });

  it("says when the count changed the play", () => {
    const explanation = explain({ player: ["4", "3", "9"], upcard: "10", runningCount: 3 });
    const view = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);
    expect(view.status).toBe("fired");
    expect(view.headline).toBe("The count changes the play: stand instead of hit.");
    expect(view.entryLabel).toBe("Illustrious 18 #2 · 16 vs 10");
    expect(view.distance).toBe("The true count is +1 — 1 above the index.");
    expect(view.scale).toEqual({ index: 0, trueCount: 1, direction: "at-or-above" });
  });

  it("says when the count is on the chart's side", () => {
    const explanation = explain({ player: ["10", "2"], upcard: "3" });
    const view = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);
    expect(view.status).toBe("basic-side");
    expect(view.distance).toBe("The true count is +0 — 2 below the index.");
  });

  it("fires a negative index below it, not above", () => {
    const explanation = explain({ player: ["10", "3"], upcard: "2", runningCount: -6 });
    const view = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);
    expect(view.status).toBe("fired");
    expect(view.headline).toBe("The count changes the play: hit instead of stand.");
    expect(view.distance).toBe("The true count is -2 — 1 below the index.");
  });

  it("does not quote a distance to an index that belongs to a different game", () => {
    // 6D H17 late surrender: the chart surrenders 16 vs 10, so the stand index has nothing to
    // depart from.
    const explanation = explain({ player: ["10", "6"], upcard: "10", runningCount: 6 });
    const view = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);
    expect(view.status).toBe("not-this-game");
    expect(view.distance).toBeNull();
    expect(view.scale).toBeNull();
    expect(view.headline).toMatch(/already says surrender/);
  });

  it("says no index covers a hand rather than inventing one", () => {
    const explanation = explain({ player: ["A", "7"], upcard: "9" });
    const view = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);
    expect(view.status).toBe("no-entry");
    expect(view.rule).toBeNull();
    expect(view.distance).toBeNull();
  });

  it("shows the refusal for a system with no index set, with no borrowed number", () => {
    const explanation = explain({ player: ["4", "3", "9"], upcard: "10", system: OMEGA_II, runningCount: 9 });
    const view = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);
    expect(view.status).toBe("no-index-set");
    expect(view.headline).toMatch(/Omega II publishes no index numbers/);
    expect(view.rule).toBeNull();
    expect(view.scale).toBeNull();
    expect(view.notes.join(" ")).toMatch(/Hi-Lo/);
  });

  it("shows the refusal for an unbalanced system", () => {
    const explanation = explain({ player: ["4", "3", "9"], upcard: "10", system: KO, runningCount: 2 });
    const view = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);
    expect(view.status).toBe("no-index-set");
    expect(view.scale).toBeNull();
    expect(countView(explanation.count).note).toMatch(/pivot/);
  });
});

describe("what would have to change", () => {
  it("names the count at which a correct chart play would flip", () => {
    const result = grade({ player: ["10", "2"], upcard: "3" }, "hit");
    const change = whatWouldChange(result.explanation, result);
    expect(change.other).toBe("stand");
    expect(change.lines[0]).toBe("Stand would be right at a true count of +2 or higher. It is +0.");
    expect(change.lines[1]).toMatch(/^On this shoe Stand trails Hit by 0\.0\d\d bets\.$/);
  });

  it("names the count at which a fired departure would go back to the chart", () => {
    const result = grade({ player: ["4", "3", "9"], upcard: "10", runningCount: 3 }, "stand");
    const change = whatWouldChange(result.explanation, result);
    expect(change.other).toBe("hit");
    expect(change.lines[0]).toBe("Hit would be right at a true count below +0. It is +1.");
    expect(change.lines.join(" ")).toMatch(/first choice/);
  });

  it("gets the direction right for a negative index", () => {
    const result = grade({ player: ["10", "3"], upcard: "2" }, "hit");
    const change = whatWouldChange(result.explanation, result);
    expect(result.verdict).toBe("incorrect");
    expect(change.other).toBe("hit");
    expect(change.lines[0]).toBe("Hit would be right at a true count below -1. It is +0.");
    // A wrong answer's cost is the verdict's headline, not repeated here.
    expect(change.lines.some((line) => /trails/.test(line))).toBe(false);
  });

  it("still names the count play for a hand when the mistake itself had none", () => {
    // 14 vs 10 under late surrender: standing is simply wrong, but surrendering is Fab 4 #1.
    const result = grade({ player: ["5", "9"], upcard: "10" }, "stand");
    const change = whatWouldChange(result.explanation, result);
    expect(change.lines[0]).toMatch(/No published index makes Stand the play/);
    expect(change.lines).toContain(
      "The count does move this hand: Surrender becomes the play at a true count of +3 or higher. It is +0.",
    );
  });

  it("says plainly when no count makes the other play right", () => {
    const result = grade({ player: ["A", "7"], upcard: "9" }, "stand");
    const change = whatWouldChange(result.explanation, result);
    expect(change.other).toBe("stand");
    expect(change.lines[0]).toMatch(/No published index makes Stand the play/);
  });

  it("does not offer a count for a system that publishes no index", () => {
    const result = grade({ player: ["10", "2"], upcard: "3", system: OMEGA_II }, "hit");
    const change = whatWouldChange(result.explanation, result);
    expect(change.lines[0]).toMatch(/Omega II has no index numbers/);
    expect(change.lines.join(" ")).not.toMatch(/true count of/);
  });

  it("works without a verdict, as a hint", () => {
    const change = whatWouldChange(explain({ player: ["10", "2"], upcard: "3" }));
    expect(change.other).toBe("stand");
  });
});

describe("insurance", () => {
  const insuranceSpot = (runningCount: number, system: CountingSystem = HI_LO) => ({
    system,
    dealerUpcard: card("A", "h"),
    composition: compositionWithout(fullShoeComposition(6), [card("A", "h")]),
    count: buildCountContext({ system, decks: 6, runningCount, cardsRemaining: 156 }),
  });

  it("puts the ten density beside the one-in-three break-even", () => {
    const view = insuranceView(explainInsurance(insuranceSpot(0)));
    expect(view.density).toMatch(/^30\.\d% of the unseen cards are tens\.$/);
    expect(view.breakEven).toBe("33.3%");
    expect(view.take).toBe(false);
    expect(view.evLine).toMatch(/-0\.0\d\d bets/);
  });

  it("grades and explains a correct decline", () => {
    const result = scoreInsuranceAgainstIndexPlay(insuranceSpot(0), "decline-insurance", 0);
    const view = insuranceVerdict(result.explanation, result);
    expect(view.headline).toBe("You declined insurance — correct.");
    expect(insuranceWhatWouldChange(result.explanation)[0]).toBe(
      "Insuring would be right at a true count of +3 or higher. It is +0.",
    );
  });

  it("names the index when the count says insure", () => {
    const result = scoreInsuranceAgainstIndexPlay(insuranceSpot(12), "decline-insurance", 0);
    const view = insuranceVerdict(result.explanation, result);
    expect(view.correct).toBe(false);
    expect(view.headline).toBe("You declined insurance. The play was to take insurance.");
    expect(insuranceWhatWouldChange(result.explanation)[0]).toBe(
      "Declining would be right at a true count below +3. It is +4.",
    );
  });

  it("refuses to borrow an index for a system without one", () => {
    const lines = insuranceWhatWouldChange(explainInsurance(insuranceSpot(0, OMEGA_II)));
    expect(lines[0]).toMatch(/publishes no insurance index/);
  });
});

describe("the index number line", () => {
  it("keeps both marks inside the track with margin, and shades the firing side", () => {
    const above = indexScaleGeometry({ index: 0, trueCount: 2, direction: "at-or-above" });
    expect(above.high - above.low).toBeGreaterThanOrEqual(8);
    expect(above.indexAt).toBeGreaterThan(0);
    expect(above.countAt).toBeLessThan(1);
    expect(above.countAt).toBeGreaterThan(above.indexAt);
    expect(above.zoneFrom).toBe(above.indexAt);
    expect(above.zoneTo).toBe(1);

    const below = indexScaleGeometry({ index: -1, trueCount: -3, direction: "below" });
    expect(below.zoneFrom).toBe(0);
    expect(below.zoneTo).toBe(below.indexAt);
    expect(below.countAt).toBeLessThan(below.indexAt);
  });

  it("stretches for a count far from the index and thins its ticks", () => {
    const far = indexScaleGeometry({ index: 5, trueCount: -9, direction: "at-or-above" });
    expect(far.low).toBeLessThanOrEqual(-11);
    expect(far.high).toBeGreaterThanOrEqual(7);
    expect(far.ticks.length).toBeLessThanOrEqual(10);
    expect(far.countAt).toBeGreaterThanOrEqual(0);
  });
});
