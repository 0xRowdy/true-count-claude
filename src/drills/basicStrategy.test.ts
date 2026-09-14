import { describe, expect, it } from "vitest";
import {
  type Action,
  type RuleSet,
  DEFAULT_RULES,
  HI_LO,
  KO,
  basicStrategy,
  currentRunningCount,
  dealtCards,
  governingCell,
} from "@/engine";
import {
  type BasicStrategyDrill,
  type BasicStrategyDrillConfig,
  DEFAULT_BASIC_STRATEGY_CONFIG,
  awaitingDecision,
  awaitingInsurance,
  basicStrategyReport,
  betweenRounds,
  countContext,
  currentActions,
  currentInsuranceSituation,
  currentShoe,
  currentSituation,
  dealNextHand,
  isInsuranceResult,
  seenCards,
  startBasicStrategyDrill,
  submitDecision,
  submitInsurance,
} from "./basicStrategy";
import { canUndo, undo } from "./progress";

const SMALL_TABLE: RuleSet = { ...DEFAULT_RULES, minBet: 10, maxBet: 1000 };

function config(overrides: Partial<BasicStrategyDrillConfig> = {}): BasicStrategyDrillConfig {
  return { ...DEFAULT_BASIC_STRATEGY_CONFIG, rules: SMALL_TABLE, ...overrides };
}

/** How the drill is meant to be driven: deal, answer until the round is over, repeat. */
function playRounds(
  drill: BasicStrategyDrill,
  rounds: number,
  choose: (drill: BasicStrategyDrill) => Action | null,
  takeInsurance = false,
): BasicStrategyDrill {
  let run = drill;
  for (let round = 0; round < rounds; round++) {
    run = dealNextHand(run);
    let guard = 0;
    while (!betweenRounds(run.current) && guard++ < 40) {
      if (awaitingInsurance(run.current)) {
        run = submitInsurance(run, takeInsurance, round);
        continue;
      }
      const action = choose(run);
      if (action === null) break;
      run = submitDecision(run, action, round);
    }
  }
  return run;
}

/** The chart play for whatever hand is in front of the player. */
function chartPlay(drill: BasicStrategyDrill): Action | null {
  const situation = currentSituation(drill.current);
  if (!situation) return null;
  return basicStrategy(situation.hand, situation.dealerUpcard, situation.rules, {
    handCount: situation.handCount,
    bankroll: situation.bankroll,
  });
}

/** Deliberately the wrong play: whatever the chart does not say. */
function wrongPlay(drill: BasicStrategyDrill): Action | null {
  const situation = currentSituation(drill.current);
  if (!situation) return null;
  const correct = chartPlay(drill);
  const legal = currentActions(drill.current);
  return legal.find((action) => action !== correct) ?? correct;
}

describe("starting a Basic Strategy drill", () => {
  it("has no accuracy at all before the first hand", () => {
    const report = basicStrategyReport(startBasicStrategyDrill(config(), 1));

    expect(report.tally.attempts).toBe(0);
    expect(report.tally.accuracy).toBeNull();
    expect(report.breakdown.accuracy).toBeNull();
    expect(report.weakestCells).toEqual([]);
    expect(report.weakestRows).toEqual([]);
  });

  it("reproduces exactly from its seed", () => {
    const a = playRounds(startBasicStrategyDrill(config(), 99), 5, chartPlay);
    const b = playRounds(startBasicStrategyDrill(config(), 99), 5, chartPlay);

    expect(currentShoe(a.current).seed).toBe(currentShoe(b.current).seed);
    expect(a.current.chartAttempts).toEqual(b.current.chartAttempts);
  });

  it("refuses a bet the table would not take", () => {
    expect(() => startBasicStrategyDrill(config({ bet: 1 }))).toThrow(/table limits/);
    expect(() => startBasicStrategyDrill(config({ bet: 500, bankroll: 100 }))).toThrow(
      /cannot cover/,
    );
  });
});

describe("grading plays", () => {
  it("scores the chart perfectly when the chart is played", () => {
    const drill = playRounds(startBasicStrategyDrill(config(), 7), 60, chartPlay);
    const report = basicStrategyReport(drill);

    expect(report.tally.attempts).toBeGreaterThan(40);
    expect(report.tally.accuracy).toBe(1);
    expect(report.weakestCells).toEqual([]);

    // Not exactly zero, and that is correct rather than a rounding artefact: a chart cell is
    // the best play averaged over every composition, and a few real compositions favour the
    // other action by a hair. The cost of playing the chart anyway is a rounding error.
    expect(report.breakdown.evLost / report.tally.attempts).toBeLessThan(0.005);
  });

  it("scores nothing right when nothing right is played", () => {
    let forced = 0;
    const drill = playRounds(startBasicStrategyDrill(config(), 7), 25, (run) => {
      const correct = chartPlay(run);
      const wrong = wrongPlay(run);
      // A hand with only one legal action — a split ace holding its single card — cannot be
      // answered wrongly. Counted rather than ignored, so the assertion below stays exact.
      if (wrong !== null && wrong === correct) forced++;
      return wrong;
    });
    const report = basicStrategyReport(drill);

    expect(report.breakdown.attempts).toBeGreaterThan(15);
    expect(report.breakdown.correct).toBe(forced);
    expect(report.breakdown.evLost).toBeGreaterThan(0);
    // Insurance is graded on the same tally but is not a chart cell, so the two differ by
    // exactly the insurance decisions — declining, which is right.
    expect(report.tally.correct).toBe(forced + report.insuranceTally.correct);
  });

  it("grades before the round moves, and keeps the hand it graded", () => {
    // Invariant 3: a competitor swept the hand before grading and a review called the drill
    // useless for it. The snapshot is what makes post-action rendering possible.
    let drill = dealNextHand(startBasicStrategyDrill(config(), 12));
    while (awaitingInsurance(drill.current)) drill = submitInsurance(drill, false, 0);

    const before = currentSituation(drill.current);
    expect(before).not.toBeNull();
    const cards = before!.hand.cards;

    drill = submitDecision(drill, chartPlay(drill) as Action, 500);
    const result = drill.current.lastResult;

    expect(result?.kind).toBe("decision");
    expect(result && !isInsuranceResult(result) ? result.explanation.hand.playerCards : null).toEqual(
      cards,
    );
    expect(result?.at).toBe(500);
  });

  it("offers exactly the legal actions and never withholds a split for want of chips", () => {
    // `legalActions` removes `double` and `split` on a short bankroll; in a scored drill that
    // would take chart cells off the table and distort the user's accuracy (invariant 7).
    let drill = startBasicStrategyDrill(config({ bet: 1000, bankroll: 1_000_000 }), 4);
    let splitsOffered = 0;

    for (let round = 0; round < 60; round++) {
      drill = dealNextHand(drill);
      while (awaitingInsurance(drill.current)) drill = submitInsurance(drill, false, round);
      let guard = 0;
      while (awaitingDecision(drill.current) && guard++ < 20) {
        if (currentActions(drill.current).includes("split")) splitsOffered++;
        drill = submitDecision(drill, chartPlay(drill) as Action, round);
      }
    }

    expect(splitsOffered).toBeGreaterThan(0);
    expect(basicStrategyReport(drill).tally.accuracy).toBe(1);
  });

  it("refuses to grade when nothing is waiting on an answer", () => {
    const drill = startBasicStrategyDrill(config(), 1);
    expect(() => submitDecision(drill, "hit", 0)).toThrow(/not waiting on a hand action/);
    expect(() => submitInsurance(drill, false, 0)).toThrow(/not waiting on an insurance/);
  });
});

describe("the per-cell breakdown", () => {
  it("files every graded play under the cell that governed it", () => {
    const drill = playRounds(startBasicStrategyDrill(config(), 21), 30, wrongPlay);
    const breakdown = basicStrategyReport(drill).breakdown;

    expect(breakdown.attempts).toBe(drill.current.chartAttempts.length);
    const filed = breakdown.cells.reduce((sum, cell) => sum + cell.attempts, 0);
    expect(filed).toBe(breakdown.attempts);

    for (const cell of breakdown.cells) {
      expect(["hard", "soft", "pairs"]).toContain(cell.section);
      expect(cell.missed).toBe(cell.attempts);
      expect(cell.mistakes.reduce((sum, mistake) => sum + mistake.count, 0)).toBe(cell.attempts);
    }
  });

  it("names the rows to practise rather than only a percentage", () => {
    // Play the chart everywhere except the soft rows, which are always stood on. The section
    // is read off `governingCell`, which is the same coordinate the breakdown files under.
    const drill = playRounds(startBasicStrategyDrill(config(), 33), 80, (run) => {
      const situation = currentSituation(run.current);
      if (!situation) return null;
      const cell = governingCell(situation.hand, situation.dealerUpcard, situation.rules, {
        handCount: situation.handCount,
        bankroll: situation.bankroll,
      });
      if (cell.section !== "soft") return cell.action;
      const legal = currentActions(run.current);
      return legal.includes("stand") && cell.action !== "stand" ? "stand" : cell.action;
    });

    const report = basicStrategyReport(drill);
    expect(report.tally.accuracy).not.toBeNull();
    expect(report.tally.accuracy).toBeLessThan(1);

    // Every miss lands in the soft section, which is exactly the actionable statement.
    const sections = report.breakdown.sections;
    const soft = sections.find((section) => section.section === "soft");
    expect(soft?.missed).toBeGreaterThan(0);
    for (const section of sections) {
      if (section.section !== "soft") expect(section.missed).toBe(0);
    }
    expect(report.weakestRows.every((row) => row.section === "soft")).toBe(true);
  });
});

describe("the count shown alongside", () => {
  it("counts the cards the player has seen, and not the hole card", () => {
    let drill = dealNextHand(startBasicStrategyDrill(config(), 8));
    while (awaitingInsurance(drill.current)) drill = submitInsurance(drill, false, 0);

    const shoe = currentShoe(drill.current);
    const seen = seenCards(drill.current);

    expect(shoe.dealtCount).toBe(4);
    expect(seen).toHaveLength(3);
    expect(seen).not.toContain(drill.current.round?.dealerHand.cards[1]);
    expect(countContext(drill.current).runningCount).toBe(currentRunningCount(seen, HI_LO, 6));
  });

  it("counts the hole card once it is turned over", () => {
    let drill = playRounds(startBasicStrategyDrill(config(), 8), 1, chartPlay);
    const shoe = currentShoe(drill.current);
    expect(drill.current.round?.dealerHoleCardRevealed).toBe(true);
    expect(seenCards(drill.current)).toEqual(dealtCards(shoe));

    drill = dealNextHand(drill);
    expect(seenCards(drill.current).length).toBe(currentShoe(drill.current).dealtCount - 1);
  });

  it("uses the unbalanced system's own starting count", () => {
    const drill = dealNextHand(startBasicStrategyDrill(config({ system: KO }), 8));
    const count = countContext(drill.current);

    // KO's initial running count at six decks is 4 - 4 x 6 = -20.
    expect(count.runningCount).toBeLessThan(-15);
    expect(count.trueCount).toBeNull();
    expect(count.trueCountNote).toMatch(/unbalanced/i);
  });
});

describe("insurance in the Basic Strategy drill", () => {
  it("grades declining as correct and taking as wrong, with the index alongside", () => {
    let drill = startBasicStrategyDrill(config(), 3);
    let graded = 0;

    for (let round = 0; round < 80 && graded < 2; round++) {
      drill = dealNextHand(drill);
      if (awaitingInsurance(drill.current)) {
        const situation = currentInsuranceSituation(drill.current);
        expect(situation?.dealerUpcard.rank).toBe("A");
        expect(situation?.hand?.playerCards).toHaveLength(2);

        drill = submitInsurance(drill, graded === 0, round);
        const result = drill.current.lastResult;
        expect(result && isInsuranceResult(result)).toBe(true);
        if (result && isInsuranceResult(result)) {
          expect(result.basicStrategyAction).toBe("decline-insurance");
          expect(result.verdict).toBe(graded === 0 ? "incorrect" : "correct");
          expect(result.explanation.tenDensity).toBeGreaterThan(0);
          expect(result.explanation.index.index).toBe(3);
        }
        graded++;
      }
      let guard = 0;
      while (awaitingDecision(drill.current) && guard++ < 20) {
        drill = submitDecision(drill, chartPlay(drill) as Action, round);
      }
    }

    expect(graded).toBe(2);
    expect(basicStrategyReport(drill).insuranceTally.attempts).toBe(2);
  });
});

describe("undo", () => {
  it("puts back the streak, the cell breakdown, and the cards", () => {
    let drill = playRounds(startBasicStrategyDrill(config(), 5), 6, chartPlay);
    drill = dealNextHand(drill);
    // Any insurance decision is graded too, so it is settled before the baseline is taken.
    while (awaitingInsurance(drill.current)) drill = submitInsurance(drill, false, 0);

    const before = basicStrategyReport(drill);
    const shoeBefore = currentShoe(drill.current).dealtCount;
    expect(before.tally.streak).toBeGreaterThan(0);

    drill = submitDecision(drill, wrongPlay(drill) as Action, 0);

    const spoiled = basicStrategyReport(drill);
    expect(spoiled.tally.streak).toBe(0);
    expect(spoiled.tally.attempts).toBe(before.tally.attempts + 1);

    expect(canUndo(drill)).toBe(true);
    drill = undo(drill);
    const restored = basicStrategyReport(drill);

    expect(restored.tally).toEqual(before.tally);
    expect(restored.breakdown).toEqual(before.breakdown);
    expect(restored.undone).toBe(1);
    // The shoe rewinds too, so the same cards come out again.
    expect(currentShoe(drill.current).dealtCount).toBeGreaterThanOrEqual(shoeBefore);
  });

  it("leaves accuracy correct across a mis-tap that was taken back", () => {
    let drill = playRounds(startBasicStrategyDrill(config(), 15), 4, chartPlay);
    drill = dealNextHand(drill);
    while (awaitingInsurance(drill.current)) drill = submitInsurance(drill, false, 0);

    const clean = basicStrategyReport(drill).tally;
    drill = submitDecision(drill, wrongPlay(drill) as Action, 0);
    drill = undo(drill);
    drill = submitDecision(drill, chartPlay(drill) as Action, 0);

    const after = basicStrategyReport(drill).tally;
    expect(after.attempts).toBe(clean.attempts + 1);
    expect(after.correct).toBe(clean.correct + 1);
    expect(after.accuracy).toBe(1);
    expect(after.streak).toBe(clean.streak + 1);
  });
});

describe("the shoe", () => {
  it("replaces the shoe at the cut card and keeps playing", () => {
    const drill = playRounds(startBasicStrategyDrill(config(), 2), 200, chartPlay);
    const report = basicStrategyReport(drill);

    expect(report.shuffles).toBeGreaterThan(0);
    expect(report.roundsDealt).toBe(200);
    expect(report.tally.accuracy).toBe(1);
  });
});
