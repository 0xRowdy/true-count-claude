import { describe, expect, it } from "vitest";
import type { Action } from "@/engine/hand";
import { evaluate } from "@/engine/hand";
import { DEFAULT_RULES } from "@/engine/rules";
import { currentLegalActions, dealerUpcard } from "@/engine/round";
import {
  type CoachedDecision,
  catchesMistakes,
  hintCopy,
  hintsEveryDecision,
  mistakeCopy,
  offersHintButton,
  reviewRows,
  shouldCatch,
  takeBackAction,
} from "./coach";
import { gradeTablePlay } from "./tableExplanation";
import { type PlayTable, chooseBet, createPlayTable, dealRound } from "./usePlayTable";

const AT = 1_700_000_000_000;

/** The first seed whose opening hand waits on a play and satisfies `want`. */
function findTable(want: (table: PlayTable) => boolean, limit = 5000): PlayTable {
  for (let seed = 1; seed < limit; seed++) {
    const table = dealRound(chooseBet(createPlayTable(DEFAULT_RULES, seed), 10));
    if (table.round?.phase === "player" && want(table)) return table;
  }
  throw new Error("no seed matched");
}

/** A table where standing is wrong. */
const standIsWrong = (table: PlayTable) =>
  gradeTablePlay(table, "stand", AT)?.verdict === "incorrect";

describe("when the coach speaks", () => {
  it("follows the profile's coach frequency", () => {
    expect(catchesMistakes("asked")).toBe(false);
    expect(catchesMistakes("mistakes")).toBe(true);
    expect(catchesMistakes("every")).toBe(true);
    expect(hintsEveryDecision("every")).toBe(true);
    expect(hintsEveryDecision("mistakes")).toBe(false);
    expect(offersHintButton("asked")).toBe(true);
    expect(offersHintButton("every")).toBe(false);
  });

  it("catches a wrong play unless the player only wants help when asked", () => {
    const table = findTable(standIsWrong);
    const wrong = gradeTablePlay(table, "stand", AT);
    expect(shouldCatch("mistakes", wrong)).toBe(true);
    expect(shouldCatch("every", wrong)).toBe(true);
    expect(shouldCatch("asked", wrong)).toBe(false);
    const right = gradeTablePlay(table, wrong!.correctAction as Action, AT);
    expect(shouldCatch("mistakes", right)).toBe(false);
    expect(shouldCatch("mistakes", null)).toBe(false);
  });
});

describe("the mistake note", () => {
  it("names the hand and the right play, from the explanation engine", () => {
    const table = findTable(standIsWrong);
    const wrong = gradeTablePlay(table, "stand", AT)!;
    const replacement = takeBackAction(wrong, currentLegalActions(table.round!));
    expect(replacement).toBe(wrong.correctAction);
    const copy = mistakeCopy(wrong, replacement);
    const correct = String(wrong.correctAction);
    expect(copy.title).toMatch(/^Hold on: (hard|soft|\d)/);
    expect(copy.title).toMatch(new RegExp(`vs [^ ]+ is a ${correct}\\.$`));
    expect(copy.takeBackLabel).toBe(`Take it back & ${correct}`);
    expect(copy.keepLabel).toBe("Keep my stand");
    // Invariant 2: a wrong verdict is never shown without its why.
    expect(copy.body.length).toBeGreaterThan(20);
  });

  it("says soft 17 against a 5 is a double, as the design does", () => {
    const table = findTable((t) => {
      const round = t.round!;
      const hand = round.playerHands[0]!;
      const value = evaluate(hand.cards);
      return value.soft && value.total === 17 && dealerUpcard(round).rank === "5";
    });
    const wrong = gradeTablePlay(table, "stand", AT)!;
    expect(wrong.verdict).toBe("incorrect");
    expect(wrong.correctAction).toBe("double");
    const copy = mistakeCopy(wrong, "double");
    expect(copy.title).toBe("Hold on: soft 17 (A,6) vs 5 is a double.");
    expect(copy.takeBackLabel).toBe("Take it back & double");
    expect(copy.keepLabel).toBe("Keep my stand");
    expect(copy.body).toMatch(/A dealer 5 busts \d+\.\d% of the time on this shoe\./);
  });

  it("offers no take-back when the right play is not among the buttons", () => {
    const table = findTable(standIsWrong);
    const wrong = gradeTablePlay(table, "stand", AT)!;
    expect(takeBackAction(wrong, ["stand"])).toBeNull();
    expect(mistakeCopy(wrong, null).takeBackLabel).toBeNull();
  });
});

describe("the hint note", () => {
  it("states the right play for the hand in front of the player", () => {
    const table = findTable(() => true);
    const hint = hintCopy(table)!;
    const right = gradeTablePlay(table, "stand", AT)!.correctAction as Action;
    expect(hint.title.endsWith(`: ${right}.`)).toBe(true);
    expect(hint.kind).toMatch(/^Hint · /);
    expect(hint.body).toMatch(/against a dealer/);
  });

  it("has nothing to say between rounds", () => {
    expect(hintCopy(createPlayTable(DEFAULT_RULES, 1))).toBeNull();
  });
});

describe("decisions this hand", () => {
  it("marks a right play, a taken-back miss and a kept miss", () => {
    const table = findTable(standIsWrong);
    const wrong = gradeTablePlay(table, "stand", AT)!;
    const right = gradeTablePlay(table, wrong.correctAction as Action, AT)!;
    const decisions: CoachedDecision[] = [
      { result: right, playedInstead: null },
      { result: wrong, playedInstead: wrong.correctAction },
      { result: wrong, playedInstead: null },
    ];
    const rows = reviewRows(decisions);
    expect(rows.map((row) => row.mark)).toEqual(["correct", "replayed", "miss"]);
    expect(rows[1]!.title).toMatch(new RegExp(`: stood, replayed as ${wrong.correctAction}$`));
    expect(rows[1]!.detail).toBe("Counts as a miss.");
    expect(rows[2]!.detail).toBe(`Counts as a miss. The play was ${wrong.correctAction}.`);
    expect(rows[0]!.detail).toMatch(/^Correct/);
  });
});
