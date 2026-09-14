/**
 * The drills module's public surface.
 *
 * Four scored training exercises built on the engine: Basic Strategy, Counting, True Count,
 * and Deviations. Everything exported here is pure, synchronous and UI-free — no React, no
 * clock, no `Math.random()`, no storage. A screen drives a drill by calling these functions
 * and rendering what comes back; nothing in `src/drills` knows a screen exists.
 *
 * Three promises hold across all four drills, and they are the reason the API is shaped the
 * way it is:
 *
 *  1. **Every verdict carries an Explanation, right or wrong** (invariant 2). Every
 *     `score*` function returns structured data — per-action EVs, the governing chart cell,
 *     the index and the distance to it — never a sentence, and never only on a mistake.
 *  2. **Scoring is synchronous and callable at the moment of the decision** (invariant 3).
 *     `scoreAgainstBasicStrategy`, `scoreAgainstIndexPlay`, `scoreCountCheck`,
 *     `scoreTrueCount` and `scoreDeviationQuestion` all take a situation rather than a
 *     drill, so a screen can grade a tap before the table moves.
 *  3. **Undo restores.** `undo` from `progress.ts` serves all four drills, and it puts the
 *     previous state back whole — streak, shoe position and cell breakdown included.
 *
 * And one absence: nothing here models entitlement. A drill type is never a separate
 * purchase (invariant 1).
 *
 * ## The shape a screen drives
 *
 * Each drill is an `Undoable<ItsOwnState>`. The convention across all four:
 *
 *  - **Transitions take the run** and return a new one: `dealNextHand(drill)`,
 *    `submitDecision(drill, action, at)`, `undo(drill)`.
 *  - **Derived views take `drill.current`**: `currentSituation(state)`,
 *    `countingReadout(state)`, `awaitingDecision(state)`. They are pure reads, so a screen
 *    can call them during render without wondering whether they move anything.
 *  - **Reports take the run**, because they include `undone`.
 *  - **Only answers are undo points.** Dealing a hand, advancing the clock, revealing the
 *    count and moving to the next question all `replace` rather than `step`, so an undo tap
 *    takes back the last thing the user was *graded* on.
 *  - **Timestamps are passed in.** Nothing here reads a clock.
 */

export * from "./types";
export * from "./progress";
export * from "./explanation";
export * from "./scoring";
export * from "./chart";
export * from "./basicStrategy";
export * from "./counting";
export * from "./trueCount";
export * from "./deviation";
export * from "./records";
