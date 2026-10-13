import { describe, expect, it } from "vitest";
import {
  type BetPlan,
  type PointNumber,
  type TableAction,
  applyAction,
  notePlaced,
  CRAPS_PRESETS,
  DOWNTOWN_RULES,
  EMPTY_MEMORY,
  POINT_NUMBERS,
  SECTION_TITLES,
  checkPlan,
  comeAndFieldPlan,
  createTable,
  describePlan,
  dice,
  dontPassPlan,
  formatApproxEdge,
  formatEdge,
  hitActionFor,
  hitActionText,
  hitLabel,
  ironCrossPlan,
  layoutBreakdown,
  lowEdgePlaceSixEightPlan,
  passAndOddsPlan,
  passEdge,
  passTwoComePlan,
  placeAmountFor,
  placeBet,
  placeEdge,
  planActions,
  planAfterRoll,
  planBlendedEdge,
  pressNote,
  pressTheSixEightPlan,
  previewPlan,
  roll,
  simulatePlan,
  waysToRoll,
  worstSingleRoll,
} from "./index";

const PLAN = pressTheSixEightPlan(DOWNTOWN_RULES);

describe("the 10b bet plan: Pass, Odds & Press the 6/8", () => {
  it("describes its rules exactly as the builder lists them", () => {
    const rows = describePlan(PLAN).map((r) => ({
      section: r.section,
      when: r.when,
      text: r.text,
      edge: r.edge === null ? "—" : formatEdge(r.edge),
    }));
    expect(rows).toEqual([
      {
        section: "come-out",
        when: "Every come-out",
        text: "Bet $10 on the Pass line",
        edge: "1.41%",
      },
      {
        section: "point",
        when: "Point is on",
        text: "Take full odds: 3x on 4/10, 4x on 5/9, 5x on 6/8",
        edge: "0%",
      },
      {
        section: "point",
        when: "Point is on",
        text: "Place 6 and 8 for $12 each. If the point is 6 or 8, place only the other one",
        edge: "1.52%",
      },
      { section: "place-wins", when: "1st hit", text: "Collect the $14 win", edge: "—" },
      { section: "place-wins", when: "2nd hit", text: "Press to $18", edge: "1.52%" },
      {
        section: "place-wins",
        when: "3rd hit and after",
        text: "Collect. Take the bet down after 4 hits",
        edge: "—",
      },
      {
        section: "money",
        when: "Session",
        text: "Stop at −$200 or +$150, whichever comes first",
        edge: "—",
      },
    ]);
    expect(SECTION_TITLES["place-wins"]).toBe("WHEN A PLACE BET WINS");
  });

  it("previews 'Point is 6, after 2 hits': $78 on the table, −$78 worst roll", () => {
    const p = previewPlan(PLAN, 6, 2);
    expect(p.onTable).toBe(78);
    expect(p.breakdown).toBe("Pass $10 · odds $50 · place 8 $18");
    expect(p.worst).toEqual({ net: -78, total: 7, hard: false, note: "A seven ends it all" });
    expect(p.bets.find((b) => b.kind === "place")).toMatchObject({ number: 8, amount: 18 });
    expect(p.edge).toBeCloseTo((10 * passEdge() + 18 * placeEdge(8)) / 78, 12);
  });

  it("previews other points: both 6 and 8 when the point is 5", () => {
    const p = previewPlan(PLAN, 5, 0);
    expect(p.breakdown).toBe("Pass $10 · odds $40 · place 6 $12 · place 8 $12");
    expect(p.onTable).toBe(74);
    // Four hits take the bets down.
    const done = previewPlan(PLAN, 5, 4);
    expect(done.bets.filter((b) => b.kind === "place")).toHaveLength(0);
    expect(done.onTable).toBe(50);
    // Three hits: collected at $18.
    expect(previewPlan(PLAN, 4, 3).breakdown).toBe(
      "Pass $10 · odds $30 · place 6 $18 · place 8 $18",
    );
  });

  it("estimates the blended edge at ≈ 0.6% on money bet", () => {
    const edge = planBlendedEdge(PLAN);
    expect(formatApproxEdge(edge)).toBe("≈ 0.6%");
    // Same figure by hand: average the point-on layout over how often each point is set.
    let money = 0;
    let cost = 0;
    for (const p of POINT_NUMBERS) {
      const w = waysToRoll(p);
      const odds = p === 4 || p === 10 ? 30 : p === 5 || p === 9 ? 40 : 50;
      const place = p === 6 || p === 8 ? 12 : 24;
      money += w * (10 + odds + place);
      cost += w * (10 * passEdge() + place * placeEdge(6));
    }
    expect(edge).toBeCloseTo(cost / money, 12);
  });

  it("rules-checks clean for 3-4-5x craps", () => {
    expect(checkPlan(PLAN)).toEqual({
      ok: true,
      title: "Rules-checked for 3-4-5x craps",
      problems: [],
    });
  });

  it("writes the press note: $18 pays $21; pressing uses $6 of the $14 win and pockets $8", () => {
    expect(pressNote(8, 12, 18)).toBe(
      "$18 pays $21 on the next hit. Pressing uses $6 of the $14 win and pockets $8.",
    );
    expect(pressNote(6, 12, 30)).toBe(
      "$30 pays $35 on the next hit. Pressing uses the whole $14 win plus $4 from your rack.",
    );
    expect(pressNote(6, 18, 12)).toBe(
      "$12 pays $14 on the next hit. Regressing pockets the $21 win plus $6 of the bet.",
    );
  });
});

describe("rules check", () => {
  it("catches broken payouts, low bets and over-limit odds", () => {
    const bad: BetPlan = {
      ...PLAN,
      comeOut: [{ kind: "line", side: "pass", amount: 5 }],
      pointOn: [
        { kind: "odds", multiple: 4 },
        { kind: "place", numbers: [6, 8], amount: 10, skipPoint: true },
      ],
      placeWins: { ...PLAN.placeWins!, second: { kind: "press", to: 20 } },
    };
    const check = checkPlan(bad);
    expect(check.ok).toBe(false);
    expect(check.title).toBe("Check these amounts");
    expect(check.problems).toEqual([
      "The pass line bet is below the $10 minimum.",
      "4x odds is over the 3-4-5x limit on the 4.",
      "Place 6 for $10 pays $11, not an exact 7:6. Use steps of $6.",
      "Place 8 for $10 pays $11, not an exact 7:6. Use steps of $6.",
      "Pressing to $20 breaks the 7:6 payout on the 6. Use steps of $6.",
      "Pressing to $20 breaks the 7:6 payout on the 8. Use steps of $6.",
    ]);
  });

  it("10x odds tables accept 10x", () => {
    const plan = passAndOddsPlan(CRAPS_PRESETS["10x"], 10, 10);
    expect(checkPlan(plan).ok).toBe(true);
    expect(checkPlan(plan).title).toBe("Rules-checked for 10x craps");
  });
});

describe("hit rules", () => {
  it("maps hits to actions, with the take-down cap", () => {
    const rule = PLAN.placeWins!;
    expect(hitActionFor(rule, 1)).toEqual({ kind: "collect" });
    expect(hitActionFor(rule, 2)).toEqual({ kind: "press", to: 18 });
    expect(hitActionFor(rule, 3)).toEqual({ kind: "collect" });
    expect(hitActionFor(rule, 4)).toEqual({ kind: "takeDown" });
    expect(hitLabel(1)).toBe("1st hit");
    expect(hitLabel(3)).toBe("3rd hit and after");
    expect(hitActionText({ kind: "regress", to: 6 }, null)).toBe("Regress to $6");
    expect(hitActionText({ kind: "takeDown" }, null)).toBe("Take the bet down");
    expect(hitActionText({ kind: "collect" }, null)).toBe("Collect the win");
  });

  it("runs at a real table: odds and place on the point, press on hit 2, reset on a seven-out", () => {
    let t = createTable(DOWNTOWN_RULES);
    let memory = EMPTY_MEMORY;
    const run = (actions: readonly TableAction[]) => {
      for (const a of actions) {
        const r = applyAction(t, a);
        if (!r.ok) throw new Error(r.reason);
        t = r.table;
      }
    };
    run(planActions(PLAN, t, "you", memory));
    expect(t.bets.map((b) => b.kind)).toEqual(["pass"]);
    t = roll(t, dice(4, 2)).table; // point 6
    const pointActions = planActions(PLAN, t, "you", memory);
    expect(pointActions).toEqual([
      { type: "odds", betId: "b1", amount: 50 },
      { type: "bet", spec: { kind: "place", number: 8, amount: 12, owner: "you" } },
    ]);
    run(pointActions);
    memory = notePlaced(PLAN, t, memory);
    expect(planActions(PLAN, t, "you", memory)).toEqual([]); // nothing more to do

    const hit = () => {
      const out = roll(t, dice(5, 3));
      t = out.table;
      const after = planAfterRoll(PLAN, out, "you", memory);
      memory = after.memory;
      run(after.actions);
      return after.actions;
    };
    expect(hit()).toEqual([]); // 1st hit: collect
    expect(memory.hits[8]).toBe(1);
    expect(hit()).toEqual([{ type: "amount", betId: "b2", amount: 18 }]); // 2nd: press to $18
    expect(hit()).toEqual([]); // 3rd: collect
    expect(hit()).toEqual([{ type: "takeDown", betId: "b2" }]); // 4th: take down
    expect(memory.retired).toEqual([8]);
    expect(planActions(PLAN, t, "you", memory)).toEqual([]); // not re-placed this shooter

    const out = roll(t, dice(4, 3)); // seven-out
    memory = planAfterRoll(PLAN, out, "you", memory).memory;
    expect(memory).toEqual({ ...EMPTY_MEMORY });
  });
});

describe("simulation", () => {
  const NO_STOPS: BetPlan = {
    ...lowEdgePlaceSixEightPlan(DOWNTOWN_RULES),
    money: { stopLoss: null, stopWin: null },
  };

  it("is deterministic per seed and plays exactly N shooters", () => {
    const a = simulatePlan(NO_STOPS, { seed: 10, shooters: 10, bankroll: 5000 });
    const b = simulatePlan(NO_STOPS, { seed: 10, shooters: 10, bankroll: 5000 });
    expect(a).toEqual(b);
    expect(a.shooters).toHaveLength(10);
    expect(a.shooters.map((s) => s.shooter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const c = simulatePlan(NO_STOPS, { seed: 11, shooters: 10, bankroll: 5000 });
    expect(c.rolls).not.toEqual(a.rolls);
  });

  it("accounts for every dollar", () => {
    const r = simulatePlan(ironCrossPlan(DOWNTOWN_RULES), {
      seed: 3,
      shooters: 25,
      bankroll: 5000,
    });
    expect(r.endBankroll - r.startBankroll).toBe(r.net);
    expect(r.shooters.reduce((s, x) => s + x.net, 0)).toBe(r.net);
    expect(r.maxDrawdown).toBeLessThanOrEqual(0);
    expect(r.wagered).toBeGreaterThan(0);
  });

  it("stops at the money rules", () => {
    const tight: BetPlan = { ...PLAN, money: { stopLoss: 30, stopWin: 30 } };
    const r = simulatePlan(tight, { seed: 1, shooters: 500, bankroll: 1000 });
    expect(r.stoppedBy === "stop-loss" || r.stoppedBy === "stop-win").toBe(true);
    if (r.stoppedBy === "stop-loss") expect(r.net).toBeLessThanOrEqual(-30);
    if (r.stoppedBy === "stop-win") expect(r.net).toBeGreaterThanOrEqual(30);
    expect(r.shooters.length).toBeLessThan(500);
  });

  it("stops when the bankroll cannot cover the line", () => {
    const r = simulatePlan(passAndOddsPlan(DOWNTOWN_RULES), {
      seed: 4,
      shooters: 100_000,
      bankroll: 60,
    });
    expect(r.stoppedBy).toBe("bankroll");
    expect(r.endBankroll).toBeLessThan(DOWNTOWN_RULES.minBet + 60);
  });

  it("over many shooters, loses about what the edge predicts", () => {
    // Pass + full odds: expected loss is 1.41% of the $10 flat per pass decision, odds are free.
    const r = simulatePlan(passAndOddsPlan(DOWNTOWN_RULES, 10, "max"), {
      seed: 2026,
      shooters: 5_000,
      bankroll: 10_000_000,
      maxRolls: 1_000_000,
    });
    const decisions = r.rolls.filter((x) => x.event !== "point-set" && x.event !== "roll").length;
    const expected = -decisions * 10 * passEdge();
    // Odds add variance (σ ≈ $60 per decision); allow four standard errors.
    const sigma = 60 * Math.sqrt(decisions);
    expect(Math.abs(r.net - expected)).toBeLessThan(4 * sigma);
  });

  it("runs every ready-made plan", () => {
    for (const plan of [
      PLAN,
      lowEdgePlaceSixEightPlan(DOWNTOWN_RULES),
      passAndOddsPlan(DOWNTOWN_RULES),
      dontPassPlan(DOWNTOWN_RULES, 10, "max"),
      ironCrossPlan(DOWNTOWN_RULES),
      passTwoComePlan(DOWNTOWN_RULES),
      comeAndFieldPlan(DOWNTOWN_RULES),
    ]) {
      const r = simulatePlan(plan, { seed: 99, shooters: 5, bankroll: 2000 });
      expect(r.shooters.length + (r.stoppedBy ? 1 : 0)).toBeGreaterThan(0);
      expect(describePlan(plan).length).toBeGreaterThan(0);
    }
  });
});

describe("ready-made plans", () => {
  it("Iron Cross: field + place 5, 6, 8 — wins on every number but 7", () => {
    const p = previewPlan(ironCrossPlan(DOWNTOWN_RULES), 9);
    expect(p.breakdown).toBe("Place 5 $10 · place 6 $12 · place 8 $12 · field $10");
    const t = p.table;
    for (const total of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
      const d =
        total === 2
          ? dice(1, 1)
          : total === 12
            ? dice(6, 6)
            : dice(Math.min(6, total - 1), total - Math.min(6, total - 1));
      const out = roll(t, d);
      const net = out.resolutions.reduce((s, r) => s + r.won - r.lost, 0);
      expect(net).toBeGreaterThan(0);
    }
    expect(worstSingleRoll(t).net).toBe(-44);
  });

  it("Pass + 2 Come keeps two come bets working", () => {
    const plan = passTwoComePlan(DOWNTOWN_RULES);
    let t = createTable();
    const apply = () => {
      for (const a of planActions(plan, t, "you", EMPTY_MEMORY)) {
        if (a.type === "bet") {
          const r = placeBet(t, a.spec);
          if (r.ok) t = r.table;
        }
      }
    };
    apply();
    t = roll(t, dice(4, 1)).table; // point 5
    apply();
    t = roll(t, dice(4, 2)).table; // come → 6
    apply();
    expect(t.bets.filter((b) => b.kind === "come")).toHaveLength(2);
    apply();
    expect(t.bets.filter((b) => b.kind === "come")).toHaveLength(2);
  });

  it("takes the point's place bet down when the new point lands on it", () => {
    let t = createTable();
    let mem = EMPTY_MEMORY;
    const exec = (actions: ReturnType<typeof planActions>) => {
      for (const a of actions) {
        if (a.type === "bet") {
          const r = placeBet(t, a.spec);
          if (r.ok) t = r.table;
        } else if (a.type === "takeDown") {
          t = { ...t, bets: t.bets.filter((b) => b.id !== a.betId) };
        }
      }
    };
    exec(planActions(PLAN, t, "you", mem));
    t = roll(t, dice(4, 4)).table; // point 8 → place 6 only
    exec(planActions(PLAN, t, "you", mem));
    mem = { ...mem, placedFor: 8 };
    expect(
      t.bets.filter((b) => b.kind === "place").map((b) => ("number" in b ? b.number : 0)),
    ).toEqual([6]);
    const made = roll(t, dice(5, 3)); // point made
    mem = planAfterRoll(PLAN, made, "you", mem).memory;
    t = made.table;
    t = roll(t, dice(5, 1)).table; // new point 6
    const actions = planActions(PLAN, t, "you", mem);
    expect(actions.some((a) => a.type === "takeDown")).toBe(true);
    expect(
      actions.some((a) => a.type === "bet" && a.spec.kind === "place" && a.spec.number === 8),
    ).toBe(true);
  });

  it("place amounts round up to exact units", () => {
    expect(placeAmountFor(6, 10)).toBe(12);
    expect(placeAmountFor(5, 10)).toBe(10);
    expect(placeAmountFor(8, 25)).toBe(30);
    expect(placeAmountFor(4 as PointNumber, 1)).toBe(5);
  });

  it("layout breakdown names every kind", () => {
    expect(
      layoutBreakdown([
        { id: "1", owner: "you", kind: "dontPass", amount: 10, odds: 60 },
        { id: "2", owner: "you", kind: "come", amount: 10, point: 5, odds: 20 },
        { id: "3", owner: "you", kind: "hard", number: 6, amount: 5 },
        { id: "4", owner: "you", kind: "anySeven", amount: 5 },
      ]),
    ).toBe("Don't pass $10 · lay odds $60 · come 5 $10 · odds $20 · hard 6 $5 · any seven $5");
  });
});
