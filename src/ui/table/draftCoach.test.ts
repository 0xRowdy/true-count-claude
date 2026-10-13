import { describe, expect, it } from "vitest";
import type { Action } from "@/engine/hand";
import { DEFAULT_RULES } from "@/engine/rules";
import type { DecisionResult } from "@/drills/scoring";
import { exampleBlackjack } from "@/ui/strategies/library";
import { cellKey, setCell } from "@/ui/strategies/blackjack";
import { draftAdvice, draftCellRef, draftPlay } from "./draftCoach";
import { gradeTablePlay } from "./tableExplanation";
import { type PlayTable, chooseBet, createPlayTable, dealRound } from "./usePlayTable";

const AT = 1_700_000_000_000;

/** A table whose hand sits on the builder's chart and where standing is wrong. */
function standIsWrongOnChart(): { table: PlayTable; result: DecisionResult } {
  for (let seed = 1; seed < 5000; seed++) {
    const table = dealRound(chooseBet(createPlayTable(DEFAULT_RULES, seed), 10));
    if (table.round?.phase !== "player") continue;
    const result = gradeTablePlay(table, "stand", AT);
    if (result?.kind !== "decision" || result.verdict !== "incorrect") continue;
    if (result.correctWasDeparture) continue; // keep the count out of it: chart against chart
    if (draftCellRef(result.explanation.cell)) return { table, result };
  }
  throw new Error("no seed matched");
}

describe("coaching against a strategy under test", () => {
  const { table, result } = standIsWrongOnChart();
  const ref = draftCellRef(result.explanation.cell)!;
  const note = "My chart stands here: I'd rather not draw to this.";
  const standing = {
    ...setCell(exampleBlackjack(), ref, "S"),
    notes: { [cellKey(ref)]: note },
  };

  it("maps the engine's chart cell to the builder's", () => {
    expect(draftCellRef({ ...result.explanation.cell, section: "soft", row: "A,7" })).toEqual({
      section: "soft",
      row: "18",
      upcard: result.explanation.cell.upcard,
    });
    expect(draftCellRef({ ...result.explanation.cell, section: "pairs", row: "A,A" })?.row).toBe(
      "A",
    );
    // Hard 5 is never printed by the builder: the draft follows the table there.
    expect(draftCellRef({ ...result.explanation.cell, section: "hard", row: "5" })).toBeNull();
    expect(draftPlay(standing, result.explanation)).toBe("stand");
  });

  it("does not stop the draft's play; shows its note and the EV it costs", () => {
    const advice = draftAdvice(standing, result.explanation, "stand", result.correctAction);
    expect(advice?.kind).toBe("follows");
    expect(advice?.eyebrow).toBe(`Your strategy · ${standing.title}`);
    expect(advice?.title).toMatch(/stand, as your strategy plays it\.$/);
    expect(advice?.body).toContain(note);
    expect(advice?.body).toMatch(/Stand gives up \d\.\d{3} bets per hand against/);
  });

  it("points out when the player leaves the draft for the table's play", () => {
    const right = gradeTablePlay(table, result.correctAction as Action, AT);
    if (right?.kind !== "decision") throw new Error("expected a playing decision");
    const advice = draftAdvice(standing, right.explanation, right.actionTaken, right.correctAction);
    expect(advice?.kind).toBe("departs");
    expect(advice?.title).toMatch(/your strategy plays stand here\.$/);
    expect(advice?.body).toContain(note);
  });

  it("stays quiet where the draft agrees with the table, or for a third move", () => {
    const agreeing = setCell(exampleBlackjack(), ref, result.explanation.cell.code);
    expect(draftAdvice(agreeing, result.explanation, "stand", result.correctAction)).toBeNull();
    const third = result.explanation.legalActions.find(
      (a) => a !== "stand" && a !== result.correctAction,
    );
    if (third) {
      expect(draftAdvice(standing, result.explanation, third, result.correctAction)).toBeNull();
    }
  });
});
