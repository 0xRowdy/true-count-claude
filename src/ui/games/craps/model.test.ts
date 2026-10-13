import { describe, expect, it } from "vitest";
import { betsOf, dice, isLineBet, onTable } from "@/games/craps";
import {
  type GameState,
  type Spot,
  BETS_CLOSED,
  afterReset,
  askCoach,
  breakageCheck,
  canRebet,
  clearWindow,
  coachHint,
  editBet,
  fixAmount,
  historyLabels,
  initialGame,
  lineChips,
  nextDice,
  numberChips,
  placeChip,
  rebet,
  removeChip,
  rollCallFor,
  rollLabel,
  rollNetLabel,
  shownPoint,
  shownTable,
  showPayout,
  showResult,
  startingMinimum,
  takeBack,
  takeMaxOdds,
  throwDice,
  undo,
  winTags,
  withSeed,
} from "./model";

const PASS: Spot = { kind: "pass" };
const BANK = 2000;

function bet(
  s: GameState,
  spot: Spot,
  amount: number,
  coach: "asked" | "mistakes" | "every" = "mistakes",
) {
  return placeChip(s, spot, amount, BANK - onTable(s.table), coach);
}

function roll(
  s: GameState,
  d1: number,
  d2: number,
  coach: "asked" | "mistakes" | "every" = "mistakes",
) {
  const r = throwDice(s, coach, dice(d1, d2));
  return { ...r, state: showPayout(showResult(r.state)) };
}

/** The design's state (lUiCl): $10 pass, point 6 with 3x odds ($30), place 8 for $12. */
function designTable(coach: "asked" | "mistakes" | "every" = "every") {
  let s = withSeed(initialGame(), 7);
  s = bet(s, PASS, 10, coach);
  s = roll(s, 4, 2, coach).state; // point 6
  s = bet(s, PASS, 25, coach); // odds behind the line
  s = bet(s, PASS, 5, coach);
  s = bet(s, { kind: "place", number: 8 }, 12, coach);
  return s;
}

describe("betting", () => {
  it("bets the line on the come-out and odds behind it once a point is on", () => {
    const s = designTable();
    const line = lineChips(s.table, "pass");
    expect(line).toEqual({ flat: 10, odds: 30, oddsLabel: "ODDS 3x" });
    expect(numberChips(s.table, 8)).toEqual([expect.objectContaining({ amount: 12 })]);
    expect(onTable(s.table)).toBe(52);
    expect(rollLabel(s)).toBe("Roll");
  });

  it("shows the engine's reason in place for an illegal bet", () => {
    let s = withSeed(initialGame(), 1);
    s = bet(s, { kind: "come" }, 10);
    expect(s.error).toMatch(/Come bets are made once a point is on/);
    expect(s.table.bets).toHaveLength(0);
  });

  it("starts a new line or place bet at the table minimum", () => {
    let s = bet(withSeed(initialGame(), 1), PASS, 5);
    expect(lineChips(s.table, "pass").flat).toBe(10);
    expect(s.notice).toBe("Pass line starts at the $10 table minimum.");
    s = bet(s, PASS, 5);
    expect(lineChips(s.table, "pass").flat).toBe(15);
    expect(s.notice).toBeNull();
  });

  it("starts a new place 6 or 8 at $12, the lowest exact-paying amount, and never grades it as a mistake", () => {
    let s = designTable("mistakes");
    s = bet(s, { kind: "place", number: 6 }, 5, "mistakes");
    expect(betsOf(s.table).find((b) => b.kind === "place" && b.number === 6)?.amount).toBe(12);
    expect(s.notice).toBe(
      "Place 6 starts at $12, the lowest amount at or above the $10 minimum that pays exactly.",
    );
    expect(breakageCheck(s, "mistakes", 1000)).toBeNull();
    const { effects } = roll(s, 2, 3, "mistakes");
    expect(effects.decisions).toContainEqual({ category: "place", correct: true, coached: false });
    expect(effects.decisions).not.toContainEqual(expect.objectContaining({ correct: false }));
    expect(startingMinimum(s.table, { kind: "place", number: 5 })).toBe(10);
  });

  it("won't take a chip off when that leaves a bet under the minimum", () => {
    let s = designTable();
    s = removeChip(s, { kind: "place", number: 8 }, 5);
    expect(s.error).toBe(
      "Place 8 can't go under the $10 minimum. Take it down instead (Edit bets).",
    );
    expect(numberChips(s.table, 8)[0]?.amount).toBe(12);
    s = removeChip(s, { kind: "place", number: 8 }, 25);
    expect(numberChips(s.table, 8)).toEqual([]);
  });

  it("closes betting while the dice are out and the result shows", () => {
    const thrown = throwDice(designTable(), "mistakes", dice(2, 3)).state;
    for (const st of [thrown, showResult(thrown)]) {
      const s = bet(st, { kind: "field" }, 5);
      expect(s.phase).toBe(st.phase);
      expect(s.table).toBe(st.table);
      expect(s.notice).toBe(BETS_CLOSED);
    }
    const paid = showPayout(showResult(thrown));
    expect(bet(paid, { kind: "field" }, 5).phase).toBe("bet");
  });

  it("never bets more than the practice chips left", () => {
    const s = placeChip(withSeed(initialGame(), 1), PASS, 25, 20, "mistakes");
    expect(s.error).toBe("You have $20 in practice chips left.");
    expect(placeChip(s, PASS, 25, 0, "mistakes").error).toBe("You're out of practice chips.");
  });

  it("enforces the 3-4-5x odds limit", () => {
    let s = designTable();
    s = bet(s, PASS, 25);
    expect(s.error).toBe("Odds on the 6 go up to $50 here.");
    s = takeMaxOdds(s, "mistakes");
    expect(lineChips(s.table, "pass").odds).toBe(50);
  });

  it("long-press takes chips off, odds first on a contract line", () => {
    let s = designTable();
    s = removeChip(s, PASS, 25);
    expect(lineChips(s.table, "pass").odds).toBe(5);
    s = removeChip(s, PASS, 25);
    expect(lineChips(s.table, "pass").odds).toBe(0);
    s = removeChip(s, PASS, 25);
    expect(s.error).toMatch(/contract bet/);
    expect(lineChips(s.table, "pass").flat).toBe(10);
  });

  it("undo, clear and rebet work on the betting window", () => {
    let s = withSeed(initialGame(), 3);
    s = bet(s, PASS, 10);
    s = bet(s, { kind: "field" }, 5);
    expect(undo(s).table.bets).toHaveLength(1);
    expect(clearWindow(s).table.bets).toHaveLength(0);
    s = roll(s, 6, 6).state; // craps 12: pass and field settle
    expect(betsOf(s.table)).toHaveLength(0);
    expect(canRebet(s)).toBe(true);
    s = rebet(s, BANK, "mistakes");
    expect(betsOf(s.table).map((b) => [b.kind, b.amount])).toEqual([
      ["pass", 10],
      ["field", 5],
    ]);
    expect(canRebet(s)).toBe(false);
    expect(undo(s).table.bets).toHaveLength(0);
  });
});

describe("the coach", () => {
  it("catches a center bet as a mistake, suggests odds, and takes it back", () => {
    let s = designTable("mistakes");
    s = bet(s, { kind: "hard", number: 6 }, 5, "mistakes");
    expect(s.note).toMatchObject({
      variant: "mistake",
      kind: "Mistake · Center bet",
      title: "Hard 6 carries a 9.09% house edge.",
      primary: "takeBack",
    });
    expect(s.note?.body).toMatch(/as odds behind your pass line carries no house edge/);
    s = takeBack(s, { kind: "hard", number: 6 });
    expect(s.note).toBeNull();
    expect(betsOf(s.table).some((b) => b.kind === "hard")).toBe(false);
    const { effects } = roll(s, 2, 3, "mistakes");
    expect(effects.decisions).toContainEqual({ category: "place", correct: false, coached: true });
  });

  it("catches a place bet whose payout breaks before the roll, and fixes it", () => {
    let s = bet(designTable("mistakes"), { kind: "place", number: 6 }, 12, "mistakes");
    s = bet(s, { kind: "place", number: 6 }, 5, "mistakes"); // the player's $17
    expect(s.note).toBeNull(); // chips may still be going down
    const caught = breakageCheck(s, "mistakes", 1000)!;
    expect(caught.note).toMatchObject({
      variant: "mistake",
      title: "Place 6 for $17 pays only $19.",
      primary: "fixAmount",
      secondary: "rollAnyway",
      fixTo: 18,
    });
    expect(caught.note?.body).toMatch(/steps of \$6.*Make it \$18\?$/);
    expect(breakageCheck(caught, "mistakes", 1000)).toBeNull(); // asked once
    expect(breakageCheck(s, "asked", 1000)).toBeNull();
    s = fixAmount(caught, { kind: "place", number: 6 }, 18);
    const { effects } = roll(s, 2, 3, "mistakes");
    expect(effects.decisions).toContainEqual({ category: "place", correct: false, coached: true });
  });

  it("still records a caught mistake that is undone or cleared", () => {
    for (const out of [undo, clearWindow]) {
      let s = designTable("mistakes");
      s = bet(s, { kind: "anySeven" }, 5, "mistakes");
      expect(s.note?.variant).toBe("mistake");
      s = out(s);
      expect(betsOf(s.table).some((b) => b.kind === "anySeven")).toBe(false);
      const { effects } = roll(s, 2, 3, "mistakes");
      expect(effects.decisions).toContainEqual({
        category: "place",
        correct: false,
        coached: true,
      });
    }
  });

  it("stays quiet at coach level 'asked' but still grades the decision", () => {
    let s = designTable("asked");
    s = bet(s, { kind: "anySeven" }, 5, "asked");
    expect(s.note).toBeNull();
    const { effects } = roll(s, 2, 3, "asked");
    expect(effects.decisions).toContainEqual({ category: "place", correct: false, coached: false });
    expect(coachHint(s).kind).toBe("Hint · Odds");
  });

  it("counts bets made after asking the coach as coached", () => {
    let s = askCoach(designTable("asked"));
    expect(s.note?.kind).toBe("Hint · Odds");
    s = takeMaxOdds(s, "asked");
    s = bet(s, { kind: "place", number: 6 }, 12, "asked");
    const { effects, state } = roll(s, 2, 3, "asked");
    expect(effects.decisions).toContainEqual({ category: "odds", correct: true, coached: true });
    expect(effects.decisions).toContainEqual({ category: "place", correct: true, coached: true });
    expect(state.hinted).toBe(false);
  });

  it("drops an odds decision when the odds are undone", () => {
    let s = bet(designTable(), PASS, 10); // odds $40
    for (let i = 0; i < 4; i++) s = undo(s); // place 8, then all three odds chips
    expect(betsOf(s.table).some((b) => b.kind === "place")).toBe(false);
    expect(lineChips(s.table, "pass").odds).toBe(0);
    const { effects } = roll(s, 2, 3);
    expect(effects.decisions.some((d) => d.category === "odds")).toBe(false);
  });

  it("clears the out-of-chips error after a reset", () => {
    const s = placeChip(withSeed(initialGame(), 1), PASS, 5, 0, "mistakes");
    expect(s.error).toBe("You're out of practice chips.");
    expect(afterReset(s).error).toBeNull();
  });

  it("praises good bets at coach level 'every'", () => {
    const s = bet(withSeed(initialGame(), 1), PASS, 10, "every");
    expect(s.note).toMatchObject({ variant: "good", kind: "Good call · Line" });
  });

  it("asks for odds when the line has less than full odds", () => {
    let s = withSeed(initialGame(), 1);
    s = bet(s, PASS, 10);
    s = roll(s, 5, 3).state;
    const hint = coachHint(showPayout(s));
    expect(hint.title).toBe("Back your line with full odds.");
    expect(hint.body).toBe(
      "Point is 8: odds go up to 5x ($50). You have no odds yet. Odds carry no house edge.",
    );
  });
});

describe("rolling", () => {
  it("plays the design's roll: six the hard way, point made, +$46 with 10 + 36 odds", () => {
    const s0 = designTable();
    const { state: s, effects } = roll(s0, 3, 3, "every");
    expect(rollCallFor(s)).toEqual({
      headline: "Six, the hard way",
      detail: "Point made · front line winner",
    });
    expect(winTags(s).pass).toEqual({ amount: "+$46", breakdown: "10 + 36 odds" });
    expect(rollNetLabel(s)).toBe("+$46");
    expect(s.note).toMatchObject({
      variant: "good",
      kind: "GOOD CALL · ODDS",
      title: "Taking 3x odds was the best bet on the table.",
      body: "Odds pay true odds, so the house has no edge on that $30. Your place 8 stays up for the next roll.",
      secondary: "oddsHelp",
    });
    expect(historyLabels(s).map((l) => l.text)).toEqual(["6 hard", "6 point"]);
    // The puck is still on while the call is made, and comes off for the payout.
    expect(shownPoint({ ...s, phase: "result" })).toBe(6);
    expect(rollLabel(s)).toBe("Come-out roll");
    expect(shownPoint(s)).toBeNull();
    expect(effects.hand).toBe(46);
    expect(effects.decisions).toEqual(
      expect.arrayContaining([
        { category: "odds", correct: true, coached: false },
        { category: "place", correct: true, coached: false },
      ]),
    );
  });

  it("shows the pre-roll layout while the dice tumble", () => {
    const s0 = designTable();
    const { state } = throwDice(s0, "mistakes", dice(1, 6));
    expect(state.phase).toBe("roll");
    expect(shownTable(state)).toBe(s0.table);
    expect(rollCallFor(state).headline).toBe("Dice are out…");
    const res = showResult(state);
    expect(rollCallFor(res)).toEqual({
      headline: "Seven out",
      detail: "Seven out · line away · new shooter",
    });
    expect(res.last?.net).toBe(-52);
  });

  it("records no hand when nothing was in action", () => {
    const { effects } = throwDice(withSeed(initialGame(), 9), "mistakes");
    expect(effects.hand).toBeNull();
  });

  it("rolls the same dice for the same seed and roll number", () => {
    const a = withSeed(initialGame(), 42);
    expect(nextDice(a)).toEqual(nextDice(withSeed(initialGame(), 42)));
    const after = throwDice(a, "mistakes").state;
    expect(after.table.rollCount).toBe(1);
  });

  it("lets the Edit bets sheet call a place bet off", () => {
    let s = designTable();
    const place = betsOf(s.table).find((b) => b.kind === "place")!;
    s = editBet(s, { type: "working", betId: place.id, working: false }, "mistakes");
    const { state } = roll(s, 4, 4);
    expect(state.last?.mine.find((r) => r.bet.kind === "place")?.outcome).toBe("off");
    expect(betsOf(state.table).some((b) => isLineBet(b))).toBe(true);
  });
});
