import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/rng";
import {
  type ActionResult,
  type BetSpec,
  type CrapsTable,
  type Dice,
  type RollOutcome,
  DOWNTOWN_RULES,
  HISTORY_LIMIT,
  applyAction,
  canTakeDown,
  createTable,
  creditOf,
  creditsByOwner,
  dice,
  findBet,
  isWorking,
  netByOwner,
  oddsLimit,
  onTable,
  phaseOf,
  placeBet,
  roll,
  rollEvent,
  rollWith,
  setAmount,
  setOdds,
  setWorking,
  takeDown,
} from "./index";

function ok(res: ActionResult): Extract<ActionResult, { ok: true }> {
  if (!res.ok) throw new Error(res.reason);
  return res;
}

function bet(table: CrapsTable, spec: BetSpec): CrapsTable {
  return ok(placeBet(table, spec)).table;
}

function lastId(table: CrapsTable): string {
  return table.bets[table.bets.length - 1]!.id;
}

/** Rolls a sequence of dice, returning every outcome. */
function rolls(table: CrapsTable, ...ds: Dice[]): RollOutcome[] {
  const out: RollOutcome[] = [];
  let t = table;
  for (const d of ds) {
    const o = roll(t, d);
    out.push(o);
    t = o.table;
  }
  return out;
}

const SIX_EASY = dice(4, 2);
const SIX_HARD = dice(3, 3);
const EIGHT_EASY = dice(5, 3);
const EIGHT_HARD = dice(4, 4);
const SEVEN = dice(4, 3);
const ELEVEN = dice(5, 6);
const TWO = dice(1, 1);
const THREE = dice(1, 2);
const TWELVE = dice(6, 6);
const FOUR_EASY = dice(3, 1);
const FOUR_HARD = dice(2, 2);
const FIVE = dice(3, 2);
const NINE = dice(5, 4);
const TEN_HARD = dice(5, 5);

describe("state machine", () => {
  it("starts on the come-out with shooter 1", () => {
    const t = createTable();
    expect(phaseOf(t)).toBe("come-out");
    expect(t.point).toBeNull();
    expect(t.shooter).toEqual({ number: 1, rolls: 0 });
  });

  it("classifies every roll by phase", () => {
    expect(rollEvent(null, 7)).toBe("natural");
    expect(rollEvent(null, 11)).toBe("natural");
    for (const t of [2, 3, 12]) expect(rollEvent(null, t)).toBe("craps");
    for (const t of [4, 5, 6, 8, 9, 10]) expect(rollEvent(null, t)).toBe("point-set");
    expect(rollEvent(6, 6)).toBe("point-made");
    expect(rollEvent(6, 7)).toBe("seven-out");
    for (const t of [2, 3, 4, 5, 8, 9, 10, 11, 12]) expect(rollEvent(6, t)).toBe("roll");
  });

  it("sets, keeps and makes the point; history records it", () => {
    const [set, still, made] = rolls(createTable(), SIX_EASY, EIGHT_EASY, SIX_HARD);
    expect(set!.record.event).toBe("point-set");
    expect(set!.table.point).toBe(6);
    expect(still!.record.event).toBe("roll");
    expect(still!.record.pointBefore).toBe(6);
    expect(made!.record.event).toBe("point-made");
    expect(made!.record.hard).toBe(true);
    expect(made!.table.point).toBeNull();
    expect(made!.table.history.map((r) => r.total)).toEqual([6, 8, 6]);
    expect(made!.table.history.map((r) => r.index)).toEqual([0, 1, 2]);
    // Point made does not change the shooter.
    expect(made!.table.shooter).toEqual({ number: 1, rolls: 3 });
  });

  it("a seven-out passes the dice", () => {
    const outs = rolls(createTable(), FIVE, NINE, SEVEN, EIGHT_EASY);
    expect(outs[2]!.record.event).toBe("seven-out");
    expect(outs[2]!.record.shooter).toBe(1);
    expect(outs[2]!.record.shooterRoll).toBe(3);
    expect(outs[2]!.table.shooter).toEqual({ number: 2, rolls: 0 });
    expect(outs[3]!.record.shooter).toBe(2);
    expect(outs[3]!.record.shooterRoll).toBe(1);
    expect(outs[3]!.record.event).toBe("point-set");
  });

  it("naturals and craps on the come-out keep the shooter and leave no point", () => {
    const outs = rolls(createTable(), SEVEN, ELEVEN, TWO, THREE, TWELVE);
    expect(outs.map((o) => o.record.event)).toEqual([
      "natural",
      "natural",
      "craps",
      "craps",
      "craps",
    ]);
    expect(outs[4]!.table.point).toBeNull();
    expect(outs[4]!.table.shooter).toEqual({ number: 1, rolls: 5 });
  });

  it("is deterministic per seed", () => {
    const play = (seed: number) => {
      const rng = createRng(seed);
      let t = createTable();
      for (let i = 0; i < 200; i++) t = rollWith(t, rng).table;
      return t.history.map((r) => `${r.dice.d1}${r.dice.d2}:${r.event}`);
    };
    expect(play(11)).toEqual(play(11));
    expect(play(11)).not.toEqual(play(12));
  });

  it("never mutates the table it is given", () => {
    const t = bet(createTable(), { kind: "pass", amount: 10 });
    const snapshot = JSON.stringify(t);
    roll(t, SIX_EASY);
    placeBet(t, { kind: "field", amount: 10 });
    expect(JSON.stringify(t)).toBe(snapshot);
  });
});

describe("line bets", () => {
  it("pass: natural wins, craps loses, and the flat stays up", () => {
    const t = bet(createTable(), { kind: "pass", amount: 10 });
    const win = roll(t, SEVEN);
    expect(win.resolutions[0]).toMatchObject({ outcome: "win", won: 10, lost: 0 });
    expect(win.table.bets).toHaveLength(1);
    expect(creditOf(win.resolutions[0]!)).toBe(10);
    for (const d of [TWO, THREE, TWELVE]) {
      const lose = roll(t, d);
      expect(lose.resolutions[0]).toMatchObject({ outcome: "lose", lost: 10, won: 0 });
      expect(lose.table.bets).toHaveLength(0);
    }
  });

  it("don't pass: 2 and 3 win, 12 is barred, 7 and 11 lose", () => {
    const t = bet(createTable(), { kind: "dontPass", amount: 10 });
    expect(roll(t, TWO).resolutions[0]).toMatchObject({ outcome: "win", won: 10 });
    expect(roll(t, THREE).resolutions[0]).toMatchObject({ outcome: "win", won: 10 });
    const bar = roll(t, TWELVE);
    expect(bar.resolutions[0]).toMatchObject({ outcome: "push", won: 0, lost: 0 });
    expect(bar.table.bets).toHaveLength(1);
    expect(roll(t, SEVEN).resolutions[0]).toMatchObject({ outcome: "lose", lost: 10 });
    expect(roll(t, ELEVEN).resolutions[0]).toMatchObject({ outcome: "lose", lost: 10 });
  });

  it("the design's roll: pass $10 + 3x odds on the 6, six the hard way pays +$46 (10 + 36 odds)", () => {
    let t = bet(createTable(), { kind: "pass", amount: 10 });
    const passId = lastId(t);
    t = roll(t, SIX_EASY).table;
    t = ok(setOdds(t, passId, 30)).table;
    t = bet(t, { kind: "place", number: 8, amount: 12 });
    expect(onTable(t)).toBe(52); // "Edit bets · $52"
    const out = roll(t, SIX_HARD);
    const pass = out.resolutions.find((r) => r.bet.kind === "pass")!;
    expect(pass).toMatchObject({ outcome: "win", won: 46, wonFlat: 10, wonOdds: 36, returned: 30 });
    const place = out.resolutions.find((r) => r.bet.kind === "place")!;
    expect(place.outcome).toBe("stay");
    expect(out.table.bets.find((b) => b.kind === "place")).toBeDefined(); // "stays up"
    expect(out.table.bets.find((b) => b.kind === "pass")).toMatchObject({ amount: 10, odds: 0 });
  });

  it("pass with odds loses everything on a seven-out", () => {
    let t = bet(createTable(), { kind: "pass", amount: 25 });
    t = roll(t, EIGHT_EASY).table;
    t = ok(setOdds(t, lastId(t), 75)).table;
    const out = roll(t, SEVEN);
    expect(out.resolutions[0]).toMatchObject({ outcome: "lose", lost: 100 });
  });

  it("don't pass with lay odds wins on the seven", () => {
    let t = bet(createTable(), { kind: "dontPass", amount: 10 });
    t = roll(t, FOUR_EASY).table;
    t = ok(setOdds(t, lastId(t), 60)).table;
    const out = roll(t, SEVEN);
    expect(out.resolutions[0]).toMatchObject({
      outcome: "win",
      wonFlat: 10,
      wonOdds: 30,
      returned: 60,
    });
    const lose = roll(t, FOUR_HARD);
    expect(lose.resolutions[0]).toMatchObject({ outcome: "lose", lost: 70 });
  });

  it("line bets only go down on the come-out", () => {
    let t = bet(createTable(), { kind: "pass", amount: 10 });
    t = roll(t, FIVE).table;
    expect(placeBet(t, { kind: "pass", amount: 10 }).ok).toBe(false);
    expect(placeBet(t, { kind: "dontPass", amount: 10 }).ok).toBe(false);
  });

  it("enforces the table minimum and maximum", () => {
    const t = createTable();
    expect(placeBet(t, { kind: "pass", amount: 5 })).toMatchObject({ ok: false });
    expect(placeBet(t, { kind: "pass", amount: 2001 })).toMatchObject({ ok: false });
    expect(placeBet(t, { kind: "pass", amount: 10.5 })).toMatchObject({ ok: false });
    expect(placeBet(t, { kind: "pass", amount: -10 })).toMatchObject({ ok: false });
  });
});

describe("odds", () => {
  function onPoint(point: Dice, kind: "pass" | "dontPass" = "pass", amount = 10) {
    let t = bet(createTable(), { kind, amount });
    const id = lastId(t);
    t = roll(t, point).table;
    return { t, id };
  }

  it("cannot be taken before there is a point", () => {
    const t = bet(createTable(), { kind: "pass", amount: 10 });
    expect(setOdds(t, lastId(t), 10)).toMatchObject({ ok: false });
  });

  it("enforces 3-4-5x", () => {
    const four = onPoint(FOUR_EASY);
    expect(oddsLimit(four.t, findBet(four.t, four.id)!)).toBe(30);
    expect(setOdds(four.t, four.id, 30).ok).toBe(true);
    expect(setOdds(four.t, four.id, 31).ok).toBe(false);
    const five = onPoint(FIVE);
    expect(setOdds(five.t, five.id, 40).ok).toBe(true);
    expect(setOdds(five.t, five.id, 41).ok).toBe(false);
    const eight = onPoint(EIGHT_EASY, "pass", 25);
    const res = setOdds(eight.t, eight.id, 126);
    expect(res).toMatchObject({ ok: false, reason: "Odds on the 8 go up to $125 here." });
    expect(setOdds(eight.t, eight.id, 125).ok).toBe(true);
  });

  it("lay odds up to 6x at 3-4-5x", () => {
    const four = onPoint(FOUR_EASY, "dontPass");
    expect(setOdds(four.t, four.id, 60).ok).toBe(true);
    expect(setOdds(four.t, four.id, 61).ok).toBe(false);
  });

  it("can be changed and taken down for a refund", () => {
    const { t, id } = onPoint(SIX_EASY);
    const first = ok(setOdds(t, id, 30));
    expect(first.cash).toBe(-30);
    const more = ok(setOdds(first.table, id, 50));
    expect(more.cash).toBe(-20);
    const off = ok(setOdds(more.table, id, 0));
    expect(off.cash).toBe(50);
  });

  it("is refused on bets that take no odds", () => {
    let t = bet(createTable(), { kind: "field", amount: 10 });
    t = roll(t, SIX_EASY).table;
    expect(setOdds(t, "nope", 10).ok).toBe(false);
    const p = bet(t, { kind: "place", number: 8, amount: 12 });
    expect(setOdds(p, lastId(p), 10).ok).toBe(false);
  });
});

describe("come and don't come", () => {
  function pointOn(): CrapsTable {
    return roll(createTable(), FIVE).table;
  }

  it("come bets need a point", () => {
    expect(placeBet(createTable(), { kind: "come", amount: 10 }).ok).toBe(false);
    expect(placeBet(createTable(), { kind: "dontCome", amount: 10 }).ok).toBe(false);
  });

  it("come: 7/11 win, 2/3/12 lose on its own come-out", () => {
    const t = bet(pointOn(), { kind: "come", amount: 10 });
    expect(roll(t, ELEVEN).resolutions[0]).toMatchObject({
      outcome: "win",
      won: 10,
      returned: 10,
      remains: null,
    });
    for (const d of [TWO, THREE, TWELVE]) {
      expect(roll(t, d).resolutions[0]).toMatchObject({ outcome: "lose", lost: 10 });
    }
    // A seven wins the new come bet while sevening-out the line.
    const seven = roll(t, SEVEN);
    expect(seven.record.event).toBe("seven-out");
    expect(seven.resolutions[0]).toMatchObject({ outcome: "win", won: 10 });
  });

  it("travels to its number, takes odds, and wins when it repeats", () => {
    let t = bet(pointOn(), { kind: "come", amount: 10 });
    const id = lastId(t);
    const travel = roll(t, EIGHT_EASY);
    expect(travel.resolutions[0]!.outcome).toBe("travel");
    t = travel.table;
    expect(findBet(t, id)).toMatchObject({ kind: "come", point: 8 });
    t = ok(setOdds(t, id, 50)).table;
    const win = roll(t, EIGHT_HARD);
    expect(win.resolutions[0]).toMatchObject({
      outcome: "win",
      wonFlat: 10,
      wonOdds: 60,
      returned: 60,
      remains: null,
    });
  });

  it("come odds are off on the come-out: a seven loses the flat and returns the odds", () => {
    let t = bet(pointOn(), { kind: "come", amount: 10 });
    const id = lastId(t);
    t = roll(t, EIGHT_EASY).table; // come to 8
    t = ok(setOdds(t, id, 50)).table;
    t = roll(t, FIVE).table; // point made → come-out
    expect(t.point).toBeNull();
    const seven = roll(t, SEVEN);
    expect(seven.resolutions[0]).toMatchObject({ outcome: "lose", lost: 10, returned: 50 });
    const eight = roll(t, EIGHT_EASY);
    expect(eight.resolutions[0]).toMatchObject({
      outcome: "win",
      wonFlat: 10,
      wonOdds: 0,
      returned: 60,
    });
  });

  it("come odds can be called working on the come-out", () => {
    let t = bet(pointOn(), { kind: "come", amount: 10 });
    const id = lastId(t);
    t = roll(t, EIGHT_EASY).table;
    t = ok(setOdds(t, id, 50)).table;
    t = roll(t, FIVE).table;
    t = ok(setWorking(t, id, true)).table;
    expect(roll(t, EIGHT_EASY).resolutions[0]).toMatchObject({ wonOdds: 60 });
    expect(roll(t, SEVEN).resolutions[0]).toMatchObject({ lost: 60, returned: 0 });
  });

  it("don't come: 2/3 win, 12 bars, 7/11 lose, then wins on the seven with lay odds working", () => {
    const t = bet(pointOn(), { kind: "dontCome", amount: 10 });
    const id = lastId(t);
    expect(roll(t, THREE).resolutions[0]).toMatchObject({ outcome: "win", won: 10 });
    expect(roll(t, TWELVE).resolutions[0]).toMatchObject({ outcome: "push" });
    expect(roll(t, ELEVEN).resolutions[0]).toMatchObject({ outcome: "lose", lost: 10 });
    let moved = roll(t, FOUR_EASY).table;
    expect(findBet(moved, id)).toMatchObject({ point: 4 });
    moved = ok(setOdds(moved, id, 60)).table;
    const seven = roll(moved, SEVEN);
    expect(seven.resolutions[0]).toMatchObject({
      outcome: "win",
      wonFlat: 10,
      wonOdds: 30,
      returned: 70,
    });
    const four = roll(moved, FOUR_HARD);
    expect(four.resolutions[0]).toMatchObject({ outcome: "lose", lost: 70 });
  });

  it("every come bet is its own contract", () => {
    let t = bet(pointOn(), { kind: "come", amount: 10 });
    t = bet(t, { kind: "come", amount: 10 });
    expect(t.bets.filter((b) => b.kind === "come")).toHaveLength(2);
  });
});

describe("place, buy and lay", () => {
  function pointOn(): CrapsTable {
    return roll(createTable(), FIVE).table;
  }

  it("place 6 for $12 pays $14 and stays up", () => {
    const t = bet(pointOn(), { kind: "place", number: 6, amount: 12 });
    const out = roll(t, SIX_EASY);
    expect(out.resolutions[0]).toMatchObject({ outcome: "win", won: 14, returned: 0 });
    expect(out.table.bets).toHaveLength(1);
    expect(creditOf(out.resolutions[0]!)).toBe(14);
    expect(roll(t, SEVEN).resolutions[0]).toMatchObject({ outcome: "lose", lost: 12 });
    expect(roll(t, EIGHT_EASY).resolutions[0]!.outcome).toBe("stay");
  });

  it("place bets are off on the come-out unless called working", () => {
    let t = bet(createTable(), { kind: "place", number: 6, amount: 12 });
    expect(isWorking(t.bets[0]!, null, DOWNTOWN_RULES)).toBe(false);
    expect(roll(t, SEVEN).resolutions[0]!.outcome).toBe("off");
    expect(roll(t, SEVEN).table.bets).toHaveLength(1);
    expect(roll(t, SIX_EASY).resolutions[0]!.outcome).toBe("off");
    t = ok(setWorking(t, t.bets[0]!.id, true)).table;
    expect(roll(t, SEVEN).resolutions[0]!.outcome).toBe("lose");
    // And may be called off while the point is on.
    let p = bet(pointOn(), { kind: "place", number: 6, amount: 12 });
    p = ok(setWorking(p, lastId(p), false)).table;
    expect(roll(p, SIX_EASY).resolutions[0]!.outcome).toBe("off");
    // Undefined restores the default.
    p = ok(setWorking(p, lastId(p), undefined)).table;
    expect(roll(p, SIX_EASY).resolutions[0]!.outcome).toBe("win");
  });

  it("adds chips to an existing place bet", () => {
    let t = bet(pointOn(), { kind: "place", number: 6, amount: 12 });
    const res = ok(placeBet(t, { kind: "place", number: 6, amount: 6 }));
    t = res.table;
    expect(res.cash).toBe(-6);
    expect(t.bets).toHaveLength(1);
    expect(t.bets[0]!.amount).toBe(18);
  });

  it("press and regress", () => {
    let t = bet(pointOn(), { kind: "place", number: 8, amount: 12 });
    const id = lastId(t);
    const press = ok(setAmount(t, id, 18));
    expect(press.cash).toBe(-6);
    t = press.table;
    expect(placeAndRoll(t, EIGHT_EASY)).toBe(21);
    const regress = ok(setAmount(t, id, 12));
    expect(regress.cash).toBe(6);
    expect(setAmount(t, id, 5)).toMatchObject({ ok: false }); // below minimum
    expect(ok(setAmount(t, id, 0)).bet).toBeNull(); // 0 = take down
  });

  function placeAndRoll(t: CrapsTable, d: Dice): number {
    return roll(t, d).resolutions[0]!.won;
  }

  it("buy pays true odds less 5% of the bet", () => {
    const t = bet(pointOn(), { kind: "buy", number: 4, amount: 20 });
    expect(roll(t, FOUR_EASY).resolutions[0]).toMatchObject({
      outcome: "win",
      wonFlat: 40,
      commission: 1,
      won: 39,
    });
    const ten = bet(pointOn(), { kind: "buy", number: 10, amount: 25 });
    expect(roll(ten, TEN_HARD).resolutions[0]).toMatchObject({ won: 49 });
  });

  it("buy with vig up front charges on placement and per decision", () => {
    const rules = {
      ...DOWNTOWN_RULES,
      buyCommission: { ...DOWNTOWN_RULES.buyCommission, timing: "upfront" as const },
    };
    let t = roll(createTable(rules), FIVE).table;
    const placed = ok(placeBet(t, { kind: "buy", number: 4, amount: 20 }));
    expect(placed.cash).toBe(-21);
    t = placed.table;
    expect(roll(t, FOUR_EASY).resolutions[0]).toMatchObject({
      wonFlat: 40,
      commission: 1,
      won: 39,
    });
  });

  it("lay wins on the seven, less 5% of the win, and always works", () => {
    const t = bet(createTable(), { kind: "lay", number: 4, amount: 40 });
    expect(isWorking(t.bets[0]!, null, DOWNTOWN_RULES)).toBe(true);
    const out = roll(t, SEVEN);
    expect(out.resolutions[0]).toMatchObject({
      outcome: "win",
      wonFlat: 20,
      commission: 1,
      won: 19,
    });
    expect(out.table.bets).toHaveLength(1);
    expect(roll(t, FOUR_HARD).resolutions[0]).toMatchObject({ outcome: "lose", lost: 40 });
  });
});

describe("hardways", () => {
  const pointOn = () => roll(createTable(), FIVE).table;

  it("win on the pair, lose on easy or seven, stay up after a win", () => {
    const t = bet(pointOn(), { kind: "hard", number: 6, amount: 5 });
    const win = roll(t, SIX_HARD);
    expect(win.resolutions[0]).toMatchObject({ outcome: "win", won: 45 });
    expect(win.table.bets).toHaveLength(1);
    expect(roll(t, SIX_EASY).resolutions[0]).toMatchObject({ outcome: "lose", lost: 5 });
    expect(roll(t, SEVEN).resolutions[0]).toMatchObject({ outcome: "lose", lost: 5 });
    expect(roll(t, EIGHT_HARD).resolutions[0]!.outcome).toBe("stay");
    const four = bet(pointOn(), { kind: "hard", number: 4, amount: 5 });
    expect(roll(four, FOUR_HARD).resolutions[0]).toMatchObject({ won: 35 });
  });

  it("are off on the come-out by default; the table can turn them on", () => {
    const t = bet(createTable(), { kind: "hard", number: 8, amount: 5 });
    expect(roll(t, SEVEN).resolutions[0]!.outcome).toBe("off");
    const on = bet(createTable({ ...DOWNTOWN_RULES, hardwaysWorkOnComeOut: true }), {
      kind: "hard",
      number: 8,
      amount: 5,
    });
    expect(roll(on, SEVEN).resolutions[0]!.outcome).toBe("lose");
  });

  it("only 4, 6, 8, 10", () => {
    expect(placeBet(createTable(), { kind: "hard", number: 5 as 4, amount: 5 }).ok).toBe(false);
  });
});

describe("one-roll bets", () => {
  const t0 = createTable();

  it("field pays even money, double on 2 and 12, and comes down", () => {
    const t = bet(t0, { kind: "field", amount: 10 });
    for (const [d, won] of [
      [THREE, 10],
      [FOUR_EASY, 10],
      [NINE, 10],
      [TEN_HARD, 10],
      [ELEVEN, 10],
      [TWO, 20],
      [TWELVE, 20],
    ] as const) {
      const r = roll(t, d).resolutions[0]!;
      expect(r).toMatchObject({ outcome: "win", won, returned: 10, remains: null });
    }
    for (const d of [FIVE, SIX_EASY, SEVEN, EIGHT_EASY]) {
      expect(roll(t, d).resolutions[0]).toMatchObject({ outcome: "lose", lost: 10 });
    }
    const triple = bet(createTable({ ...DOWNTOWN_RULES, fieldTwelvePays: 3 }), {
      kind: "field",
      amount: 10,
    });
    expect(roll(triple, TWELVE).resolutions[0]!.won).toBe(30);
  });

  it("center bets pay 4:1, 7:1, 15:1, 30:1", () => {
    const cases: [BetSpec["kind"], Dice, number][] = [
      ["anySeven", SEVEN, 20],
      ["anyCraps", TWO, 35],
      ["anyCraps", THREE, 35],
      ["anyCraps", TWELVE, 35],
      ["yo", ELEVEN, 75],
      ["aces", TWO, 150],
      ["aceDeuce", THREE, 75],
      ["twelve", TWELVE, 150],
    ];
    for (const [kind, d, won] of cases) {
      const t = bet(t0, { kind, amount: 5 } as BetSpec);
      expect(roll(t, d).resolutions[0]).toMatchObject({ outcome: "win", won });
      expect(roll(t, SIX_EASY).resolutions[0]).toMatchObject({ outcome: "lose", lost: 5 });
    }
  });

  it("can be called off", () => {
    let t = bet(t0, { kind: "yo", amount: 5 });
    t = ok(setWorking(t, lastId(t), false)).table;
    expect(roll(t, ELEVEN).resolutions[0]!.outcome).toBe("off");
  });
});

describe("taking bets down", () => {
  it("pass is a contract bet once the point is on; don't pass is not", () => {
    let t = bet(createTable(), { kind: "pass", amount: 10 });
    const passId = lastId(t);
    t = bet(t, { kind: "dontPass", amount: 10 });
    const dpId = lastId(t);
    expect(canTakeDown(t, findBet(t, passId)!)).toBe(true);
    t = roll(t, FIVE).table;
    expect(takeDown(t, passId)).toMatchObject({ ok: false });
    expect(setAmount(t, passId, 20)).toMatchObject({ ok: false });
    t = ok(setOdds(t, dpId, 30)).table;
    const down = ok(takeDown(t, dpId));
    expect(down.cash).toBe(40);
  });

  it("a come bet on its number stays, but its odds come down", () => {
    let t = roll(createTable(), FIVE).table;
    t = bet(t, { kind: "come", amount: 10 });
    const id = lastId(t);
    t = roll(t, SIX_EASY).table;
    t = ok(setOdds(t, id, 50)).table;
    expect(takeDown(t, id).ok).toBe(false);
    expect(ok(setOdds(t, id, 0)).cash).toBe(50);
  });

  it("place, hardway and one-roll bets come down any time", () => {
    let t = roll(createTable(), FIVE).table;
    t = bet(t, { kind: "place", number: 6, amount: 12 });
    expect(ok(takeDown(t, lastId(t))).cash).toBe(12);
    t = bet(t, { kind: "hard", number: 6, amount: 5 });
    expect(ok(takeDown(t, lastId(t))).cash).toBe(5);
    expect(takeDown(t, "missing").ok).toBe(false);
  });

  it("line bets cannot be called off", () => {
    const t = bet(createTable(), { kind: "pass", amount: 10 });
    expect(setWorking(t, lastId(t), false).ok).toBe(false);
  });
});

describe("multiple players", () => {
  it("settles each owner's bets and sums their credits", () => {
    let t = roll(createTable(), EIGHT_EASY).table;
    t = bet(t, { kind: "place", number: 6, amount: 12, owner: "rita" });
    t = bet(t, { kind: "place", number: 6, amount: 12, owner: "mike" });
    t = bet(t, { kind: "field", amount: 5, owner: "lou" });
    expect(t.bets).toHaveLength(3); // same spot, different owners: separate bets
    const out = roll(t, SIX_EASY);
    expect(creditsByOwner(out.resolutions)).toEqual({ rita: 14, mike: 14, lou: 0 });
    expect(netByOwner(out.resolutions)).toEqual({ rita: 14, mike: 14, lou: -5 });
    expect(onTable(out.table, "rita")).toBe(12);
  });

  it("chips are conserved: every dollar is on the layout, won from or lost to the house", () => {
    const rng = createRng(77);
    let t = createTable();
    let bankroll = 10_000;
    let houseNet = 0;
    const exec = (r: ActionResult) => {
      if (r.ok) {
        t = r.table;
        bankroll += r.cash;
      }
    };
    for (let i = 0; i < 3000; i++) {
      if (t.point === null) {
        if (!t.bets.some((b) => b.kind === "pass")) exec(placeBet(t, { kind: "pass", amount: 10 }));
      } else {
        const pass = t.bets.find((b) => b.kind === "pass");
        if (pass && "odds" in pass && pass.odds === 0)
          exec(setOdds(t, pass.id, oddsLimit(t, pass)));
        if (t.bets.filter((b) => b.kind === "come").length < 2)
          exec(placeBet(t, { kind: "come", amount: 10 }));
        if (!t.bets.some((b) => b.kind === "place"))
          exec(placeBet(t, { kind: "place", number: 6, amount: 12 }));
        exec(placeBet(t, { kind: "field", amount: 10 }));
        exec(placeBet(t, { kind: "hard", number: 8, amount: 1 }));
      }
      const out = rollWith(t, rng);
      for (const r of out.resolutions) {
        bankroll += creditOf(r);
        houseNet -= r.won - r.lost;
      }
      t = out.table;
      expect(bankroll + onTable(t) + houseNet).toBe(10_000);
    }
  });
});

describe("applyAction", () => {
  it("dispatches every action type", () => {
    let t = bet(createTable(), { kind: "pass", amount: 10 });
    const id = lastId(t);
    t = roll(t, SIX_EASY).table;
    t = ok(applyAction(t, { type: "odds", betId: id, amount: 50 })).table;
    t = ok(applyAction(t, { type: "bet", spec: { kind: "place", number: 8, amount: 12 } })).table;
    const placeId = lastId(t);
    t = ok(applyAction(t, { type: "amount", betId: placeId, amount: 18 })).table;
    t = ok(applyAction(t, { type: "working", betId: placeId, working: false })).table;
    expect(findBet(t, placeId)).toMatchObject({ amount: 18, working: false });
    t = ok(applyAction(t, { type: "takeDown", betId: placeId })).table;
    expect(findBet(t, placeId)).toBeUndefined();
  });
});

describe("history cap", () => {
  it("keeps the most recent HISTORY_LIMIT rolls while rollCount keeps counting", () => {
    const rng = createRng(5);
    let t = createTable();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) t = rollWith(t, rng).table;
    expect(t.history).toHaveLength(HISTORY_LIMIT);
    expect(t.rollCount).toBe(HISTORY_LIMIT + 20);
    expect(t.history[t.history.length - 1]!.index).toBe(HISTORY_LIMIT + 19);
  });
});
