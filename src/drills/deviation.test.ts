import { describe, expect, it } from "vitest";
import {
  type RuleSet,
  DEFAULT_RULES,
  FAB_4,
  HI_LO,
  ILLUSTRIOUS_18,
  KO,
  OMEGA_II,
  RED_7,
  WONG_HALVES,
  ZEN,
  evaluate,
  isSplittablePair,
  trueCount,
} from "@/engine";
import {
  type DeviationDrillConfig,
  DEFAULT_DEVIATION_CONFIG,
  deviationDrillAvailability,
  deviationQuestion,
  deviationReport,
  nextDeviationQuestion,
  scoreDeviationQuestion,
  startDeviationDrill,
  submitDeviation,
} from "./deviation";
import { undo } from "./progress";

/** The game the Illustrious 18 is published against: S17, DAS, and no surrender in the chart. */
const S17_NO_SURRENDER: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand", surrender: "none" };

function config(overrides: Partial<DeviationDrillConfig> = {}): DeviationDrillConfig {
  return { ...DEFAULT_DEVIATION_CONFIG, ...overrides };
}

function questions(count: number, cfg = config(), seed = 5) {
  const availability = deviationDrillAvailability(cfg.rules, cfg.system);
  return Array.from({ length: count }, (_, index) =>
    deviationQuestion(cfg, availability, seed, index),
  );
}

describe("availability", () => {
  it("declines every system that publishes no indices, and names the one that does", () => {
    for (const system of [KO, OMEGA_II, WONG_HALVES, ZEN, RED_7]) {
      const availability = deviationDrillAvailability(DEFAULT_RULES, system);

      expect(availability.available).toBe(false);
      expect(availability.playable).toEqual([]);
      expect(availability.note).toContain(system.name);
      expect(availability.note).toMatch(/Hi-Lo/);
      expect(availability.systemsWithIndexes).toEqual(["hi-lo"]);
      expect(() => startDeviationDrill(config({ system }))).toThrow(/Hi-Lo/);
    }
  });

  it("drills the whole published set in the game it was published against", () => {
    const availability = deviationDrillAvailability(S17_NO_SURRENDER, HI_LO);

    expect(availability.available).toBe(true);
    expect(availability.indexSet).toMatch(/Illustrious 18/);
    // Every I18 entry applies in an S17 game with no surrender in the chart.
    for (const entry of ILLUSTRIOUS_18) {
      expect(availability.playable.map((e) => e.id)).toContain(entry.id);
    }
  });

  it("names the entries this table takes off the board, and why", () => {
    // Six-deck H17 with late surrender. Basic Strategy already surrenders 16 vs 10, 16 vs 9
    // and 15 vs 10, and already doubles 11 vs A, so those indices have nothing to depart from.
    const availability = deviationDrillAvailability(DEFAULT_RULES, HI_LO);
    const excluded = new Map(availability.excluded.map((e) => [e.entry.id, e.reason]));

    expect(excluded.get("16v10")).toBe("outside-published-rules");
    expect(excluded.get("16v9")).toBe("outside-published-rules");
    expect(excluded.get("15v10")).toBe("outside-published-rules");
    expect(excluded.get("11vA")).toBe("outside-published-rules");
    // The Fab 4's 15 vs 10 has no rule set it can fire in: its index of 0 is the average
    // count, and any surrender game already surrenders the hand.
    expect(excluded.get("15v10R")).toBe("outside-published-rules");

    expect(availability.playable.length + availability.excluded.length).toBe(
      ILLUSTRIOUS_18.length + FAB_4.length,
    );
    expect(availability.playable.map((e) => e.id)).not.toContain("16v10");
  });

  it("drills the surrender indices only where surrender is on offer", () => {
    const withSurrender = deviationDrillAvailability(DEFAULT_RULES, HI_LO);
    const without = deviationDrillAvailability(S17_NO_SURRENDER, HI_LO);

    expect(withSurrender.playable.map((e) => e.id)).toContain("14v10R");
    expect(without.playable.map((e) => e.id)).not.toContain("14v10R");
    expect(
      without.excluded.find((e) => e.entry.id === "14v10R")?.reason,
    ).toBe("action-not-legal");
  });

  it("keeps insurance, which no rule can move", () => {
    expect(deviationDrillAvailability(DEFAULT_RULES, HI_LO).playable.map((e) => e.id)).toContain(
      "insurance",
    );
  });
});

describe("generating questions", () => {
  it("reproduces a question exactly from the run's seed and its index", () => {
    const [first] = questions(1, config(), 77);
    const availability = deviationDrillAvailability(DEFAULT_RULES, HI_LO);
    expect(deviationQuestion(config(), availability, 77, 0)).toEqual(first);
  });

  it("poses every question within the configured spread of its index", () => {
    for (const question of questions(120, config({ spread: 2 }))) {
      expect(Math.abs(question.distanceToIndex)).toBeLessThanOrEqual(2);
      expect(question.trueCount).toBe(question.entry.index + question.distanceToIndex);
    }
  });

  it("poses both sides of the index, including the boundary itself", () => {
    const drawn = questions(150);
    const firing = drawn.filter((question) => question.firing);

    expect(firing.length).toBeGreaterThan(30);
    expect(drawn.length - firing.length).toBeGreaterThan(30);
    expect(drawn.some((question) => question.distanceToIndex === 0)).toBe(true);
  });

  it("cuts each question from a real shoe whose count actually is the stated one", () => {
    let backed = 0;
    for (const question of questions(60)) {
      if (question.composition === null) continue;
      backed++;

      expect(question.shoeSeed).not.toBeNull();
      expect(question.cutPosition).not.toBeNull();
      expect(question.count.trueCount).toBe(question.trueCount);
      expect(
        trueCount(question.count.runningCount, question.count.decksRemaining, question.rounding),
      ).toBe(question.trueCount);

      // The unseen pack is the shoe less the four cards of the opening deal, plus the hole
      // card, which nobody has seen: one more than the decks-remaining divisor implies.
      const unseen = Object.values(question.composition).reduce((sum, held) => sum + held, 0);
      expect(unseen).toBe(question.count.cardsRemaining + 1);
      for (const held of Object.values(question.composition)) expect(held).toBeGreaterThanOrEqual(0);
    }
    expect(backed).toBeGreaterThan(50);
  });

  it("builds a hand that lands on the entry's own chart coordinate", () => {
    for (const question of questions(120)) {
      if (question.kind !== "hand") continue;
      const value = evaluate(question.hand.cards);
      const coordinate = question.entry.hand;

      if (coordinate.kind === "hard") {
        expect(value.soft).toBe(false);
        expect(value.total).toBe(coordinate.total);
        expect(isSplittablePair(question.hand)).toBe(false);
      }
      if (coordinate.kind === "pair") {
        expect(isSplittablePair(question.hand)).toBe(true);
      }
    }
  });

  it("varies the ten-ranked upcard, so a jack is not a different card from a ten", () => {
    const tens = questions(150)
      .filter((question) => question.entry.upcard === 10)
      .map((question) => question.dealerUpcard.rank);

    expect(new Set(tens).size).toBeGreaterThan(1);
  });
});

describe("grading", () => {
  const availability = deviationDrillAvailability(S17_NO_SURRENDER, HI_LO);
  const s17 = config({ rules: S17_NO_SURRENDER });

  function questionFor(entryId: string, firing: boolean) {
    for (let index = 0; index < 400; index++) {
      const question = deviationQuestion(s17, availability, 9, index);
      if (question.entry.id === entryId && question.firing === firing) return question;
    }
    throw new Error(`No ${firing ? "firing" : "holding"} question generated for ${entryId}`);
  }

  it("requires the departure once the index has been crossed", () => {
    const question = questionFor("16v10", true);
    expect(question.trueCount).toBeGreaterThanOrEqual(0);

    const stood = scoreDeviationQuestion(question, "stand", 0);
    expect(stood.verdict).toBe("correct");
    expect(stood.decision.correctWasDeparture).toBe(true);
    expect(stood.decision.basicStrategyAction).toBe("hit");

    const hit = scoreDeviationQuestion(question, "hit", 0);
    expect(hit.verdict).toBe("incorrect");
    expect(hit.decision.indexWouldHaveDeparted).toBe(true);
  });

  it("requires the chart play while the count is on the other side", () => {
    const question = questionFor("16v10", false);
    expect(question.trueCount).toBeLessThan(0);

    expect(scoreDeviationQuestion(question, "hit", 0).verdict).toBe("correct");
    const stood = scoreDeviationQuestion(question, "stand", 0);
    expect(stood.verdict).toBe("incorrect");
    expect(stood.decision.departedWithoutIndex).toBe(true);
  });

  it("carries the index, the distance to it and the per-action EVs into the Explanation", () => {
    const question = questionFor("12v3", true);
    const result = scoreDeviationQuestion(question, "hit", 0);
    const explanation = result.decision.explanation;

    expect(explanation.kind).toBe("decision");
    if (explanation.kind !== "decision") throw new Error("expected a decision explanation");

    expect(explanation.index.entry?.id).toBe("12v3");
    expect(explanation.index.index).toBe(2);
    expect(explanation.index.distanceToIndex).toBe(question.trueCount - 2);
    expect(explanation.index.flipsAt).toBe(2);
    expect(explanation.cell.row).toBe("12");
    expect(explanation.cell.upcard).toBe(3);
    expect(Object.keys(explanation.evs).length).toBeGreaterThan(1);
    expect(explanation.dealer).not.toBeNull();
  });

  it("explains a correct answer just as fully", () => {
    const question = questionFor("12v3", true);
    const right = scoreDeviationQuestion(question, "stand", 0);
    const wrong = scoreDeviationQuestion(question, "hit", 0);

    expect(right.verdict).toBe("correct");
    expect(right.decision.explanation).toEqual(wrong.decision.explanation);
  });

  it("grades the insurance index as its own question", () => {
    let insurance = null;
    for (let index = 0; index < 400 && insurance === null; index++) {
      const question = deviationQuestion(s17, availability, 9, index);
      if (question.kind === "insurance" && question.firing) insurance = question;
    }
    expect(insurance).not.toBeNull();

    const taken = scoreDeviationQuestion(insurance!, "insurance", 0);
    expect(taken.verdict).toBe("correct");
    expect(taken.decision.kind).toBe("insurance");
    expect(taken.decision.basicStrategyAction).toBe("decline-insurance");
    expect(scoreDeviationQuestion(insurance!, "decline-insurance", 0).verdict).toBe("incorrect");
  });

  it("does not throw on an answer the hand never offered", () => {
    const question = questionFor("12v3", true);
    const result = scoreDeviationQuestion(question, "insurance", 0);

    expect(result.verdict).toBe("incorrect");
    expect(result.decision.evLoss).toBeNull();
  });
});

describe("the run", () => {
  it("has no accuracy before the first answer", () => {
    const report = deviationReport(startDeviationDrill(config(), 3));

    expect(report.tally.accuracy).toBeNull();
    expect(report.departures.accuracy).toBeNull();
    expect(report.holds.accuracy).toBeNull();
    expect(report.byEntry).toEqual([]);
  });

  it("leaves the question on screen after grading, and advances only when asked", () => {
    let drill = startDeviationDrill(config(), 3);
    const posed = drill.current.question;

    drill = submitDeviation(drill, "hit", 0);
    expect(drill.current.question).toBe(posed);
    expect(drill.current.lastResult?.question).toBe(posed);

    drill = nextDeviationQuestion(drill);
    expect(drill.current.question.index).toBe(posed.index + 1);
    expect(drill.current.lastResult).toBeNull();
  });

  it("ignores a double-tapped answer", () => {
    let drill = submitDeviation(startDeviationDrill(config(), 3), "hit", 0);
    const once = drill;
    drill = submitDeviation(drill, "stand", 1);

    expect(drill).toBe(once);
    expect(drill.current.tally.attempts).toBe(1);
  });

  it("separates missed departures from departures made too early", () => {
    // Always play Basic Strategy: correct whenever the count has not crossed the index,
    // wrong every time it has.
    let drill = startDeviationDrill(config({ rules: S17_NO_SURRENDER }), 13);
    for (let i = 0; i < 40; i++) {
      const chart = scoreDeviationQuestion(drill.current.question, "hit", i).decision
        .basicStrategyAction;
      drill = nextDeviationQuestion(submitDeviation(drill, chart, i));
    }

    const report = deviationReport(drill);
    expect(report.departures.attempts).toBeGreaterThan(5);
    expect(report.holds.attempts).toBeGreaterThan(5);
    expect(report.holds.accuracy).toBe(1);
    expect(report.departures.accuracy).toBe(0);
    expect(report.missedDepartures).toBe(report.departures.attempts);
    expect(report.earlyDepartures).toBe(0);
  });

  it("reports which published indices are being missed", () => {
    let drill = startDeviationDrill(config({ entryIds: ["12v3", "12v2"] }), 21);
    for (let i = 0; i < 20; i++) {
      drill = nextDeviationQuestion(submitDeviation(drill, "hit", i));
    }

    const report = deviationReport(drill);
    expect(report.byEntry.map((entry) => entry.entryId).sort()).toEqual(["12v2", "12v3"]);
    for (const entry of report.byEntry) {
      expect(entry.attempts).toBeGreaterThan(0);
      expect(entry.accuracy).not.toBeNull();
      expect(entry.indexNumber).toBeGreaterThan(0);
    }
  });

  it("refuses a pool of entries this table cannot drill", () => {
    expect(() => startDeviationDrill(config({ entryIds: ["16v10"] }))).toThrow();
  });

  it("takes a mis-tap back without breaking the streak", () => {
    let drill = startDeviationDrill(config(), 8);
    for (let i = 0; i < 3; i++) {
      const correct = scoreDeviationQuestion(drill.current.question, "hit", i).decision
        .correctAction;
      drill = nextDeviationQuestion(submitDeviation(drill, correct, i));
    }
    const before = deviationReport(drill);
    expect(before.tally.streak).toBe(3);

    drill = submitDeviation(drill, "insurance", 9);
    expect(drill.current.tally.streak).toBe(0);

    drill = undo(drill);
    expect(deviationReport(drill).tally).toEqual(before.tally);
    expect(deviationReport(drill).attempts).toEqual(before.attempts);
    expect(drill.current.lastResult).toBeNull();
  });
});
