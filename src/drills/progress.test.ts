import { describe, expect, it } from "vitest";
import {
  EMPTY_TALLY,
  beginUndoable,
  canUndo,
  rate,
  recordVerdict,
  replace,
  step,
  undo,
} from "./progress";

describe("score tally", () => {
  it("has no accuracy at all before anything is attempted, rather than 0%", () => {
    expect(EMPTY_TALLY.attempts).toBe(0);
    expect(EMPTY_TALLY.accuracy).toBeNull();
  });

  it("counts correct and incorrect separately and derives the rate from both", () => {
    const tally = ["correct", "incorrect", "correct"].reduce(
      (acc, verdict) => recordVerdict(acc, verdict as "correct" | "incorrect"),
      EMPTY_TALLY,
    );

    expect(tally.attempts).toBe(3);
    expect(tally.correct).toBe(2);
    expect(tally.incorrect).toBe(1);
    expect(tally.accuracy).toBeCloseTo(2 / 3);
  });

  it("breaks the streak on a miss and remembers the best one", () => {
    let tally = EMPTY_TALLY;
    for (const verdict of ["correct", "correct", "correct", "incorrect", "correct"] as const) {
      tally = recordVerdict(tally, verdict);
    }

    expect(tally.streak).toBe(1);
    expect(tally.bestStreak).toBe(3);
  });

  it("never mutates the tally it is handed", () => {
    const before = recordVerdict(EMPTY_TALLY, "correct");
    recordVerdict(before, "incorrect");
    expect(before.attempts).toBe(1);
    expect(before.incorrect).toBe(0);
  });

  it("reports a null rate for a zero denominator", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(0, 4)).toBe(0);
  });
});

describe("undo", () => {
  it("restores the previous value exactly", () => {
    const run = step(step(beginUndoable("a"), "b"), "c");
    expect(run.current).toBe("c");
    expect(undo(run).current).toBe("b");
    expect(undo(undo(run)).current).toBe("a");
  });

  it("puts a streak back rather than compensating for it", () => {
    // Three right, then a mis-tap. Undoing the mis-tap must leave the streak at three, not
    // at zero with a point added back.
    let run = beginUndoable(EMPTY_TALLY);
    for (let i = 0; i < 3; i++) run = step(run, recordVerdict(run.current, "correct"));
    const beforeMistake = run.current;

    run = step(run, recordVerdict(run.current, "incorrect"));
    expect(run.current.streak).toBe(0);

    const undone = undo(run);
    expect(undone.current).toBe(beforeMistake);
    expect(undone.current.streak).toBe(3);
    expect(undone.current.attempts).toBe(3);
    expect(undone.current.accuracy).toBe(1);
  });

  it("counts how many steps were taken back, rather than hiding them", () => {
    const run = undo(step(step(beginUndoable(0), 1), 2));
    expect(run.undone).toBe(1);
  });

  it("is a no-op with nothing to undo, rather than throwing in the user's face", () => {
    const run = beginUndoable("only");
    expect(canUndo(run)).toBe(false);
    expect(undo(run)).toBe(run);
    expect(undo(undo(run)).current).toBe("only");
  });

  it("does not record a step for a replace", () => {
    const run = replace(step(beginUndoable("a"), "b"), "c");
    expect(run.current).toBe("c");
    expect(undo(run).current).toBe("a");
  });

  it("keeps the history bounded", () => {
    let run = beginUndoable(0, 3);
    for (let i = 1; i <= 10; i++) run = step(run, i);

    expect(run.past.length).toBe(3);
    expect(run.past).toEqual([7, 8, 9]);
  });

  it("refuses a nonsensical depth rather than silently disabling undo", () => {
    expect(() => beginUndoable("a", 0)).toThrow(/positive integer/);
  });
});
