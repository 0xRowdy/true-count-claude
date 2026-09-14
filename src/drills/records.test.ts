import { describe, expect, it } from "vitest";
import {
  type Action,
  type RuleSet,
  DEFAULT_RULES,
  HI_LO,
  KO,
  basicStrategy,
  compositionWithout,
  createHand,
  fullShoeComposition,
} from "@/engine";
import {
  type BasicStrategyDrill,
  DEFAULT_BASIC_STRATEGY_CONFIG,
  awaitingDecision,
  awaitingInsurance,
  betweenRounds,
  currentShoe,
  currentSituation,
  dealNextHand,
  startBasicStrategyDrill,
  submitDecision,
  submitInsurance,
} from "./basicStrategy";
import {
  countedCards,
  countingReadout,
  currentCheckSituation,
  dealNextStep,
  scoreCountCheck,
  startCountingDrill,
  DEFAULT_COUNTING_CONFIG,
} from "./counting";
import { buildCountContext } from "./explanation";
import { toCountCheckInput, toDecisionInput, toRoundInput } from "./records";
import { scoreAgainstBasicStrategy, scoreInsuranceAgainstBasicStrategy } from "./scoring";

const S17_NO_SURRENDER: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand", surrender: "none" };
const CONTEXT = { roundIndex: 3, shoeIndex: 1, shoeDealtCount: 42 };

function playToSettlement(seed: number): BasicStrategyDrill {
  let drill = dealNextHand(startBasicStrategyDrill(DEFAULT_BASIC_STRATEGY_CONFIG, seed));
  let guard = 0;
  while (!betweenRounds(drill.current) && guard++ < 40) {
    if (awaitingInsurance(drill.current)) {
      drill = submitInsurance(drill, false, 0);
      continue;
    }
    if (!awaitingDecision(drill.current)) break;
    const situation = currentSituation(drill.current);
    if (!situation) break;
    drill = submitDecision(
      drill,
      basicStrategy(situation.hand, situation.dealerUpcard, situation.rules, {
        handCount: situation.handCount,
        bankroll: situation.bankroll,
      }) as Action,
      0,
    );
  }
  return drill;
}

describe("a Decision for the Session log", () => {
  it("carries the hand, both answers, and the count as it stood", () => {
    const cards = [
      { rank: "10", suit: "s" },
      { rank: "6", suit: "h" },
    ] as const;
    const upcard = { rank: "10", suit: "d" } as const;

    const result = scoreAgainstBasicStrategy(
      {
        rules: S17_NO_SURRENDER,
        system: HI_LO,
        hand: createHand([...cards], 25),
        handIndex: 1,
        handCount: 2,
        dealerUpcard: upcard,
        bankroll: 500,
        composition: compositionWithout(fullShoeComposition(6), [...cards, upcard]),
        count: buildCountContext({
          system: HI_LO,
          decks: 6,
          runningCount: 12,
          cardsRemaining: 156,
        }),
      },
      "stand",
      1_700_000,
    );

    const record = toDecisionInput(result, CONTEXT);

    expect(record.roundIndex).toBe(3);
    expect(record.shoeIndex).toBe(1);
    expect(record.shoeDealtCount).toBe(42);
    expect(record.hand.handIndex).toBe(1);
    expect(record.hand.playerCards).toEqual([...cards]);
    expect(record.hand.total).toBe(16);
    expect(record.hand.soft).toBe(false);
    expect(record.hand.bet).toBe(25);
    expect(record.actionTaken).toBe("stand");
    expect(record.correctAction).toBe("hit");
    expect(record.basicStrategyAction).toBe("hit");
    expect(record.verdict).toBe("incorrect");
    expect(record.count).toEqual({
      system: "Hi-Lo",
      runningCount: 12,
      trueCount: 4,
      decksRemaining: 3,
    });
    expect(record.at).toBe(1_700_000);
  });

  it("records an unbalanced system's Running Count and a zero True Count it never uses", () => {
    const drill = dealNextHand(
      startBasicStrategyDrill({ ...DEFAULT_BASIC_STRATEGY_CONFIG, system: KO }, 8),
    );
    const situation = currentSituation(drill.current);
    expect(situation).not.toBeNull();

    const result = scoreAgainstBasicStrategy(situation!, "hit", 0);
    const record = toDecisionInput(result, CONTEXT);

    expect(record.count.system).toBe("KO");
    expect(record.count.runningCount).toBe(situation!.count.runningCount);
    // `CountSnapshot.trueCount` is not nullable, and KO never converts. The Running Count
    // alongside it is the number that means something for this system.
    expect(record.count.trueCount).toBe(0);
    expect(situation!.count.trueCount).toBeNull();
  });

  it("records an insurance decision, with the hand that was on the table", () => {
    const upcard = { rank: "A", suit: "s" } as const;
    const cards = [
      { rank: "9", suit: "h" },
      { rank: "7", suit: "d" },
    ] as const;

    const result = scoreInsuranceAgainstBasicStrategy(
      {
        system: HI_LO,
        dealerUpcard: upcard,
        hand: {
          handIndex: 0,
          playerCards: [...cards],
          dealerUpcard: upcard,
          total: 16,
          soft: false,
          fromSplit: false,
          bet: 10,
          handCount: 1,
        },
        composition: compositionWithout(fullShoeComposition(6), [upcard]),
        count: buildCountContext({ system: HI_LO, decks: 6, runningCount: 9, cardsRemaining: 156 }),
      },
      "insurance",
      500,
    );

    const record = toDecisionInput(result, CONTEXT);
    expect(record.actionTaken).toBe("insurance");
    expect(record.correctAction).toBe("decline-insurance");
    expect(record.basicStrategyAction).toBe("decline-insurance");
    expect(record.hand.playerCards).toEqual([...cards]);
  });

  it("refuses to record an insurance decision with no hand behind it", () => {
    const result = scoreInsuranceAgainstBasicStrategy(
      {
        system: HI_LO,
        dealerUpcard: { rank: "A", suit: "s" },
        composition: null,
        count: buildCountContext({ system: HI_LO, decks: 6, runningCount: 0, cardsRemaining: 156 }),
      },
      "decline-insurance",
      0,
    );

    expect(() => toDecisionInput(result, CONTEXT)).toThrow(/hand state/);
  });
});

describe("a CountCheck for the Session log", () => {
  it("carries the stated count and the truth, and lets the log derive the verdict", () => {
    let drill = startCountingDrill(DEFAULT_COUNTING_CONFIG, 6);
    for (let i = 0; i < 12; i++) drill = dealNextStep(drill);

    const truth = countingReadout(drill.current).runningCount;
    const result = scoreCountCheck(currentCheckSituation(drill.current), truth + 1, 900);
    const record = toCountCheckInput(result, CONTEXT);

    expect(record.statedRunningCount).toBe(truth + 1);
    expect(record.actualRunningCount).toBe(truth);
    expect(record.at).toBe(900);
    expect(record.shoeDealtCount).toBe(42);
    expect(countedCards(drill.current)).toHaveLength(12);
    expect("verdict" in record).toBe(false);
  });
});

describe("a RoundResult for the Session log", () => {
  it("records one hand result per settled hand, with the money", () => {
    const drill = playToSettlement(7);
    const round = drill.current.round;
    expect(round?.phase).toBe("settled");

    const record = toRoundInput(round!, { shoeIndex: 0, shoeStartIndex: 0, at: 1_234 });

    expect(record.hands).toHaveLength(round!.playerHands.length);
    expect(record.shoeEndIndex).toBe(currentShoe(drill.current).dealtCount);
    expect(record.dealerCards).toEqual(round!.dealerHand.cards);
    expect(record.at).toBe(1_234);
    for (const hand of record.hands) {
      expect(["win", "blackjack", "push", "loss", "surrender"]).toContain(hand.outcome);
    }
  });

  it("records a bust as a loss and keeps the bust on its own flag", () => {
    // The engine has a `"bust"` outcome and state does not; losing the distinction would
    // silently zero the bust rate in the statistics panel.
    let found = false;
    for (let seed = 1; seed < 80 && !found; seed++) {
      const drill = playToSettlement(seed);
      const round = drill.current.round;
      if (!round?.settlement) continue;
      const busted = round.settlement.outcomes.findIndex((o) => o.result === "bust");
      if (busted < 0) continue;

      const record = toRoundInput(round, { shoeIndex: 0, shoeStartIndex: 0, at: 0 });
      const hand = record.hands[busted];
      expect(hand?.outcome).toBe("loss");
      expect(hand?.busted).toBe(true);
      expect(hand?.finalTotal).toBeGreaterThan(21);
      found = true;
    }
    expect(found).toBe(true);
  });

  it("sums to the settlement's own net, insurance included", () => {
    for (let seed = 1; seed < 30; seed++) {
      const drill = playToSettlement(seed);
      const round = drill.current.round;
      if (!round?.settlement) continue;

      const record = toRoundInput(round, { shoeIndex: 0, shoeStartIndex: 0, at: 0 });
      const net = record.hands.reduce((sum, hand) => sum + hand.net, 0);
      expect(net).toBeCloseTo(round.settlement.net, 8);
    }
  });

  it("refuses a round that has not settled", () => {
    let drill = dealNextHand(startBasicStrategyDrill(DEFAULT_BASIC_STRATEGY_CONFIG, 12));
    while (awaitingInsurance(drill.current)) drill = submitInsurance(drill, false, 0);
    expect(betweenRounds(drill.current)).toBe(false);

    expect(() =>
      toRoundInput(drill.current.round!, { shoeIndex: 0, shoeStartIndex: 0, at: 0 }),
    ).toThrow(/has not settled/);
  });
});
