import { describe, expect, it } from "vitest";
import {
  type Action,
  type RuleSet,
  DEFAULT_RULES,
  HI_LO,
  KO,
  ZEN,
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
import {
  DEFAULT_DEVIATION_CONFIG,
  deviationQuestion,
  nextDeviationQuestion,
  startDeviationDrill,
  submitDeviation,
} from "./deviation";
import { buildCountContext } from "./explanation";
import {
  toConversionCheckInput,
  toCountCheckInput,
  toDecisionInput,
  toIndexPlayInput,
  toRoundInput,
} from "./records";
import {
  DEFAULT_TRUE_COUNT_CONFIG,
  nextTrueCountQuestion,
  scoreTrueCount,
  startTrueCountDrill,
  submitTrueCount,
  trueCountQuestion,
  trueCountQuestionFrom,
} from "./trueCount";
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

  it("records an unbalanced system's Running Count and no True Count at all", () => {
    const drill = dealNextHand(
      startBasicStrategyDrill({ ...DEFAULT_BASIC_STRATEGY_CONFIG, system: KO }, 8),
    );
    const situation = currentSituation(drill.current);
    expect(situation).not.toBeNull();

    const result = scoreAgainstBasicStrategy(situation!, "hit", 0);
    const record = toDecisionInput(result, CONTEXT);

    expect(record.count.system).toBe("KO");
    expect(record.count.runningCount).toBe(situation!.count.runningCount);
    // KO never converts, so there is no True Count to store — null, not a 0 that would read
    // as a real one. The Running Count alongside it is the number that means something here.
    expect(situation!.count.trueCount).toBeNull();
    expect(record.count.trueCount).toBeNull();
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

describe("a ConversionCheck for the Session log (#27)", () => {
  it("carries the question's numbers, the rounding, and what regenerates the question", () => {
    // -7 over two decks is -3.5: truncation says -3, and a user who floors says -4.
    const config = { ...DEFAULT_TRUE_COUNT_CONFIG, decks: 6 };
    const question = trueCountQuestionFrom(config, { runningCount: -7, cardsRemaining: 104, index: 4 });
    const record = toConversionCheckInput(scoreTrueCount(question, -4, 77), 31);

    expect(record).toEqual({
      system: "Hi-Lo",
      decks: 6,
      runningCount: -7,
      cardsRemaining: 104,
      decksRemaining: 2,
      rounding: "truncate",
      statedTrueCount: -4,
      actualTrueCount: -3,
      runSeed: 31,
      questionIndex: 4,
      at: 77,
    });
    // The log derives the verdict; and no Shoe is named, because none was dealt.
    expect("verdict" in record).toBe(false);
    expect(record).not.toHaveProperty("shoeIndex");
  });

  it("regenerates the very question it was answered from, given the run seed and index", () => {
    let drill = startTrueCountDrill({ ...DEFAULT_TRUE_COUNT_CONFIG, system: ZEN }, 2_024);
    for (let i = 0; i < 3; i++) drill = nextTrueCountQuestion(drill);
    drill = submitTrueCount(drill, 1, 5);
    const record = toConversionCheckInput(drill.current.lastResult!, drill.current.seed);

    const again = trueCountQuestion(
      { ...DEFAULT_TRUE_COUNT_CONFIG, system: ZEN, decks: record.decks, rounding: record.rounding },
      record.runSeed,
      record.questionIndex,
    );
    expect(again.runningCount).toBe(record.runningCount);
    expect(again.cardsRemaining).toBe(record.cardsRemaining);
    expect(again.answer).toBe(record.actualTrueCount);
    expect(record.system).toBe("Zen Count");
  });
});

describe("an IndexPlay for the Session log (#27)", () => {
  function answered(seed: number, questions: number) {
    let drill = startDeviationDrill(DEFAULT_DEVIATION_CONFIG, seed);
    for (let i = 0; i < questions; i++) drill = nextDeviationQuestion(drill);
    const action = drill.current.question.kind === "insurance" ? "insurance" : "stand";
    return submitDeviation(drill, action, 900);
  }

  it("records the placed cards and where the question came from — never a dealt position", () => {
    const drill = answered(8, 2);
    const result = drill.current.lastResult!;
    const question = result.question;
    const record = toIndexPlayInput(result, drill.current.seed);

    expect(record.entryId).toBe(question.entry.id);
    expect(record.indexNumber).toBe(question.entry.index);
    expect(record.dealerUpcard).toEqual(question.dealerUpcard);
    expect(record.placedCards).toEqual(question.kind === "hand" ? question.hand.cards : []);
    expect(record.trueCount).toBe(question.trueCount);
    expect(record.firing).toBe(question.firing);
    expect(record.actionTaken).toBe(result.decision.actionTaken);
    expect(record.correctAction).toBe(result.decision.correctAction);
    expect(record.basicStrategyAction).toBe(result.decision.basicStrategyAction);
    expect(record.runSeed).toBe(8);
    expect(record.questionIndex).toBe(2);
    expect(record.cutShoeSeed).toBe(question.shoeSeed);
    expect(record.cutPosition).toBe(question.cutPosition);
    // Nothing that would let a reader take these cards for dealt ones: no Shoe index, no
    // dealt count, no round, and no `hand` shaped like a Decision's.
    for (const key of ["shoeIndex", "shoeDealtCount", "roundIndex", "hand", "verdict"]) {
      expect(record).not.toHaveProperty(key);
    }
  });

  it("regenerates the question from its run seed and index, shoe cut and all", () => {
    for (let questions = 0; questions < 6; questions++) {
      const drill = answered(41, questions);
      const record = toIndexPlayInput(drill.current.lastResult!, drill.current.seed);
      const again = deviationQuestion(
        DEFAULT_DEVIATION_CONFIG,
        drill.current.availability,
        record.runSeed,
        record.questionIndex,
      );
      expect(again.entry.id).toBe(record.entryId);
      expect(again.shoeSeed).toBe(record.cutShoeSeed);
      expect(again.cutPosition).toBe(record.cutPosition);
      expect(again.count.runningCount).toBe(record.runningCount);
      expect(again.dealerUpcard).toEqual(record.dealerUpcard);
    }
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
