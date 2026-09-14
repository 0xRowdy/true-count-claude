import { describe, expect, it } from "vitest";
import {
  type Card,
  type Rank,
  type RuleSet,
  DEFAULT_RULES,
  HI_LO,
  compositionWithout,
  createHand,
  fullShoeComposition,
} from "@/engine";
import {
  type DecisionSituation,
  type InsuranceSituation,
  buildCountContext,
} from "./explanation";
import {
  scoreAgainstBasicStrategy,
  scoreAgainstIndexPlay,
  scoreInsuranceAgainstBasicStrategy,
  scoreInsuranceAgainstIndexPlay,
} from "./scoring";

const S17_NO_SURRENDER: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand", surrender: "none" };

function card(rank: Rank, suit: Card["suit"] = "s"): Card {
  return { rank, suit };
}

function spot(
  player: readonly Rank[],
  upcard: Rank,
  runningCount = 0,
  cardsRemaining = 156,
): DecisionSituation {
  const cards = player.map((rank) => card(rank));
  const up = card(upcard, "h");
  return {
    rules: S17_NO_SURRENDER,
    system: HI_LO,
    hand: createHand(cards, 10),
    handIndex: 0,
    handCount: 1,
    dealerUpcard: up,
    bankroll: 10_000,
    composition: compositionWithout(fullShoeComposition(6), [...cards, up]),
    count: buildCountContext({ system: HI_LO, decks: 6, runningCount, cardsRemaining }),
  };
}

describe("scoring against Basic Strategy", () => {
  it("marks the chart play correct and charges it nothing", () => {
    const result = scoreAgainstBasicStrategy(spot(["10", "6"], "10"), "hit", 1_000);

    expect(result.verdict).toBe("correct");
    expect(result.correctAction).toBe("hit");
    expect(result.basicStrategyAction).toBe("hit");
    expect(result.gradedAgainst).toBe("basic-strategy");
    expect(result.evLoss).toBe(0);
    expect(result.at).toBe(1_000);
  });

  it("explains a correct answer as fully as a wrong one", () => {
    const right = scoreAgainstBasicStrategy(spot(["10", "6"], "10"), "hit", 0);
    const wrong = scoreAgainstBasicStrategy(spot(["10", "6"], "10"), "stand", 0);

    expect(right.explanation.evs).toEqual(wrong.explanation.evs);
    expect(right.explanation.cell).toEqual(wrong.explanation.cell);
    expect(right.explanation.dealer).toEqual(wrong.explanation.dealer);
    expect(right.explanation.ranked).toEqual(wrong.explanation.ranked);
  });

  it("prices a mistake in bets rather than only calling it wrong", () => {
    const result = scoreAgainstBasicStrategy(spot(["10", "6"], "10"), "stand", 0);

    expect(result.verdict).toBe("incorrect");
    expect(result.evLoss).toBeGreaterThan(0);
    expect(result.evLoss).toBeLessThan(0.1);
    const evs = result.explanation.evs;
    expect(result.evLoss).toBeCloseTo((evs.hit as number) - (evs.stand as number), 10);
  });

  it("stays on the chart at a count that would move an index, and says the index moved", () => {
    // True count +2 puts 16 vs 10 over the Illustrious 18 index of 0, but this drill grades
    // against Basic Strategy, so hitting is still the right answer here.
    const result = scoreAgainstBasicStrategy(spot(["10", "6"], "10", 12, 156), "hit", 0);

    expect(result.verdict).toBe("correct");
    expect(result.correctAction).toBe("hit");
    expect(result.correctWasDeparture).toBe(false);
    expect(result.indexWouldHaveDeparted).toBe(true);
    expect(result.explanation.index.fired).toBe(true);
    expect(result.explanation.countAwareAction).toBe("stand");
  });

  it("does not throw on an action the hand never offered", () => {
    // A mis-tap must not become a crash in the middle of a hand.
    const result = scoreAgainstBasicStrategy(spot(["10", "6"], "10"), "surrender", 0);

    expect(result.verdict).toBe("incorrect");
    expect(result.evLoss).toBeNull();
    expect(result.explanation.legalActions).not.toContain("surrender");
  });
});

describe("scoring against index play", () => {
  it("requires the departure once the count has crossed the index", () => {
    const situation = spot(["10", "6"], "10", 12, 156);

    const stood = scoreAgainstIndexPlay(situation, "stand", 0);
    expect(stood.verdict).toBe("correct");
    expect(stood.correctAction).toBe("stand");
    expect(stood.correctWasDeparture).toBe(true);
    expect(stood.gradedAgainst).toBe("index-play");

    const hit = scoreAgainstIndexPlay(situation, "hit", 0);
    expect(hit.verdict).toBe("incorrect");
    expect(hit.indexWouldHaveDeparted).toBe(true);
    expect(situation.count.trueCount).toBe(4);
    expect(hit.explanation.index.distanceToIndex).toBe(4);
  });

  it("requires the chart play while the count is on the other side of the index", () => {
    const situation = spot(["10", "6"], "10", -6, 156);
    expect(situation.count.trueCount).toBe(-2);

    const hit = scoreAgainstIndexPlay(situation, "hit", 0);
    expect(hit.verdict).toBe("correct");
    expect(hit.correctWasDeparture).toBe(false);

    const stood = scoreAgainstIndexPlay(situation, "stand", 0);
    expect(stood.verdict).toBe("incorrect");
    expect(stood.departedWithoutIndex).toBe(true);
    expect(stood.explanation.index.distanceToIndex).toBe(-2);
    expect(stood.explanation.index.skipped).toBe("count-on-basic-side");
  });

  it("agrees with Basic Strategy where no index covers the hand", () => {
    const situation = spot(["10", "9"], "6", 12, 156);

    expect(scoreAgainstIndexPlay(situation, "stand", 0).verdict).toBe("correct");
    expect(scoreAgainstBasicStrategy(situation, "stand", 0).verdict).toBe("correct");
    expect(scoreAgainstIndexPlay(situation, "stand", 0).explanation.index.skipped).toBe("no-entry");
  });
});

describe("scoring insurance", () => {
  const upcard = card("A", "h");

  function insuranceSpot(runningCount: number): InsuranceSituation {
    return {
      system: HI_LO,
      dealerUpcard: upcard,
      composition: compositionWithout(fullShoeComposition(6), [upcard]),
      count: buildCountContext({ system: HI_LO, decks: 6, runningCount, cardsRemaining: 156 }),
    };
  }

  it("is always wrong under Basic Strategy, however high the count", () => {
    const result = scoreInsuranceAgainstBasicStrategy(insuranceSpot(30), "insurance", 0);

    expect(result.verdict).toBe("incorrect");
    expect(result.correctAction).toBe("decline-insurance");
    // ...and the Explanation still says the index would have taken it, which is the honest
    // half of a verdict a user will otherwise think is a bug.
    expect(result.indexWouldHaveDeparted).toBe(false);
    expect(result.explanation.index.fired).toBe(true);
    expect(result.explanation.countAwareAction).toBe("insurance");
  });

  it("is right under Basic Strategy to decline", () => {
    const result = scoreInsuranceAgainstBasicStrategy(insuranceSpot(0), "decline-insurance", 0);
    expect(result.verdict).toBe("correct");
    expect(result.evLoss).toBe(0);
  });

  it("charges a losing insurance bet what it is actually worth", () => {
    const result = scoreInsuranceAgainstBasicStrategy(insuranceSpot(0), "insurance", 0);
    const ev = result.explanation.ev as number;

    expect(ev).toBeLessThan(0);
    expect(result.evLoss).toBeCloseTo(-ev, 10);
  });

  it("takes the bet under index play once the count reaches +3", () => {
    expect(scoreInsuranceAgainstIndexPlay(insuranceSpot(9), "insurance", 0).verdict).toBe(
      "correct",
    );
    expect(scoreInsuranceAgainstIndexPlay(insuranceSpot(9), "decline-insurance", 0).verdict).toBe(
      "incorrect",
    );
    expect(scoreInsuranceAgainstIndexPlay(insuranceSpot(5), "insurance", 0).verdict).toBe(
      "incorrect",
    );
  });
});
