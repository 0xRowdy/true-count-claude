import { describe, expect, it } from "vitest";
import {
  type BetSpec,
  type CrapsTable,
  type Dice,
  type RollOutcome,
  CRAPS_PRESETS,
  DOWNTOWN_RULES,
  checkPayoutAnswer,
  coachRoll,
  createPayoutDrill,
  createTable,
  dealerLine,
  dice,
  explainBet,
  fullOddsRule,
  maxOddsHint,
  multipleLabel,
  oddsExplanation,
  oddsNudge,
  oddsPayout,
  payoutCall,
  payoutLabel,
  placeBet,
  placePayout,
  reviewBet,
  roll,
  rollCall,
  rollDetail,
  rollHeadline,
  rollHistoryLabels,
  rollLabel,
  rolledBy,
  setOdds,
  tablePayoutCalls,
  verdictForEdge,
  winBadge,
} from "./index";

function bet(t: CrapsTable, spec: BetSpec): CrapsTable {
  const r = placeBet(t, spec);
  if (!r.ok) throw new Error(r.reason);
  return r.table;
}

function rollAll(t: CrapsTable, ds: Dice[]): { table: CrapsTable; outs: RollOutcome[] } {
  const outs: RollOutcome[] = [];
  for (const d of ds) {
    const o = roll(t, d);
    outs.push(o);
    t = o.table;
  }
  return { table: t, outs };
}

describe("roll calls", () => {
  it("history chips match the 06 frame: 6 hard · 8 · 11 · 4 · 5 · 6 point", () => {
    const { table } = rollAll(createTable(), [
      dice(4, 2), // 6 point
      dice(3, 2), // 5
      dice(3, 1), // 4
      dice(5, 6), // 11
      dice(5, 3), // 8
      dice(3, 3), // 6 hard, point made
    ]);
    expect(rollHistoryLabels(table.history).map((l) => l.text)).toEqual([
      "6 hard",
      "8",
      "11",
      "4",
      "5",
      "6 point",
    ]);
    expect(rollHistoryLabels(table.history, 2)).toHaveLength(2);
  });

  it("labels a seven-out", () => {
    const { outs } = rollAll(createTable(), [dice(4, 2), dice(4, 3)]);
    expect(rollLabel(outs[1]!.record)).toEqual({ total: 7, tag: "out", text: "7 out" });
  });

  it("headlines: 'Six, the hard way' and 'Six, easy six'", () => {
    expect(rollHeadline({ total: 6, hard: true, event: "point-made" })).toBe("Six, the hard way");
    expect(rollHeadline({ total: 6, hard: false, event: "roll" })).toBe("Six, easy six");
    expect(rollHeadline({ total: 8, hard: true, event: "roll" })).toBe("Eight, the hard way");
    expect(rollHeadline({ total: 10, hard: false, event: "roll" })).toBe("Ten, easy ten");
    expect(rollHeadline({ total: 4, hard: true, event: "roll" })).toBe("Four, the hard way");
    expect(rollHeadline({ total: 11, hard: false, event: "natural" })).toBe("Yo-leven");
    expect(rollHeadline({ total: 7, hard: false, event: "seven-out" })).toBe("Seven out");
    expect(rollHeadline({ total: 7, hard: false, event: "natural" })).toBe("Seven, winner seven");
    expect(rollHeadline({ total: 2, hard: false, event: "craps" })).toBe("Aces, snake eyes");
    expect(rollHeadline({ total: 3, hard: false, event: "craps" })).toBe("Three, ace-deuce");
    expect(rollHeadline({ total: 12, hard: false, event: "craps" })).toBe("Twelve, boxcars");
    expect(rollHeadline({ total: 5, hard: false, event: "roll" })).toBe("Five, no field five");
    expect(rollHeadline({ total: 9, hard: false, event: "roll" })).toBe("Nine, center field nine");
  });

  it("details and calls", () => {
    const { outs } = rollAll(createTable(), [
      dice(5, 3),
      dice(4, 2),
      dice(4, 4),
      dice(4, 3),
      dice(6, 5),
      dice(6, 6),
      dice(1, 2),
      dice(5, 4),
      dice(5, 5),
      dice(6, 1),
    ]);
    expect(rollDetail(outs[0]!.record)).toBe("Point is 8 · the puck is on");
    expect(rollCall(outs[1]!.record)).toBe("Six, easy six. Point is still 8.");
    expect(rollDetail(outs[1]!.record)).toBe("Point is still 8");
    expect(rollDetail(outs[2]!.record)).toBe("Point made · front line winner");
    expect(rollCall(outs[2]!.record)).toBe("Eight, the hard way. Point made, pay the line.");
    expect(rollDetail(outs[3]!.record)).toBe("Front line winner");
    expect(rollCall(outs[3]!.record)).toBe("Seven, winner seven. Front line winner.");
    expect(rollDetail(outs[4]!.record)).toBe("Yo · front line winner");
    expect(rollDetail(outs[5]!.record)).toBe("Craps · line away · bar 12 for the don't");
    expect(rollCall(outs[6]!.record)).toBe("Three, ace-deuce. Craps, line away.");
    expect(rollDetail(outs[6]!.record)).toBe("Craps · line away · don't pass wins");
    expect(rollCall(outs[7]!.record)).toBe("Nine, center field nine. The point is 9.");
    expect(rollDetail(outs[9]!.record)).toBe("Seven out · line away · new shooter");
    expect(rollCall(outs[9]!.record)).toBe("Seven out. Line away, new shooter.");
  });

  it("payout calls, grouped across the table", () => {
    let t = roll(createTable(), dice(5, 3)).table;
    t = bet(t, { kind: "place", number: 6, amount: 12, owner: "rail_rita" });
    t = bet(t, { kind: "place", number: 6, amount: 12, owner: "mtn_mike" });
    t = bet(t, { kind: "field", amount: 5, owner: "lucky_lou" });
    const out = roll(t, dice(4, 2));
    const names: Record<string, string> = { rail_rita: "Rita", mtn_mike: "Mike" };
    expect(tablePayoutCalls(out.resolutions, (o) => names[o] ?? o)).toEqual([
      "Place 6 pays: Rita +$14, Mike +$14",
    ]);
    expect(rolledBy("@dicecontrol_dee", out.record)).toBe("@dicecontrol_dee rolled 4 · 2");
    expect(dealerLine(out.record, out.resolutions)).toBe("Dealer: Six, easy six. Place 6 pays $14");
    expect(payoutCall(out.resolutions[2]!)).toBeNull();
    expect(dealerLine(roll(t, dice(5, 4)).record, [])).toBe("Dealer: Nine, center field nine.");
  });

  it("win badge: +$46 · 10 + 36 odds", () => {
    let t = bet(createTable(), { kind: "pass", amount: 10 });
    const id = t.bets[0]!.id;
    t = roll(t, dice(4, 2)).table;
    const o = setOdds(t, id, 30);
    if (!o.ok) throw new Error(o.reason);
    const out = roll(o.table, dice(3, 3));
    expect(winBadge(out.resolutions[0]!)).toEqual({ amount: "+$46", breakdown: "10 + 36 odds" });
    const lose = roll(o.table, dice(4, 3));
    expect(winBadge(lose.resolutions[0]!)).toBeNull();
  });
});

describe("coach", () => {
  it("writes the 11 frame's max-odds hint", () => {
    expect(maxOddsHint(DOWNTOWN_RULES, 8, 25, 75)).toBe(
      "Point is 8: odds go up to 5x ($125). You have 3x ($75). Odds carry no house edge.",
    );
    expect(maxOddsHint(DOWNTOWN_RULES, 4, 10, 0)).toBe(
      "Point is 4: odds go up to 3x ($30). You have no odds yet. Odds carry no house edge.",
    );
    expect(maxOddsHint(DOWNTOWN_RULES, 4, 10, 30)).toContain("You have full odds ($30).");
    expect(maxOddsHint(DOWNTOWN_RULES, 4, 10, 20, "dont")).toBe(
      "Point is 4: you can lay up to 6x ($60). You have 2x ($20). Odds carry no house edge.",
    );
    expect(maxOddsHint(CRAPS_PRESETS["10x"], 6, 10, 0)).toContain("odds go up to 10x ($100)");
  });

  it("praises odds after the 06 roll", () => {
    let t = bet(createTable(), { kind: "pass", amount: 10 });
    const id = t.bets[0]!.id;
    t = roll(t, dice(4, 2)).table;
    const o = setOdds(t, id, 30);
    if (!o.ok) throw new Error(o.reason);
    t = bet(o.table, { kind: "place", number: 8, amount: 12 });
    const note = coachRoll(roll(t, dice(3, 3)));
    expect(note).toEqual({
      tone: "good",
      tag: "GOOD CALL · ODDS",
      title: "Taking 3x odds was the best bet on the table.",
      body: "Odds pay true odds, so the house has no edge on that $30. Your place 8 stays up for the next roll.",
    });
  });

  it("tips a point made without odds", () => {
    let t = bet(createTable(), { kind: "pass", amount: 10 });
    t = roll(t, dice(4, 2)).table;
    const note = coachRoll(roll(t, dice(5, 1)));
    expect(note?.tag).toBe("TIP · ODDS");
    expect(note?.body).toBe(
      "With 5x odds ($50) on the 6, this roll would have paid $60 more at no house edge.",
    );
  });

  it("flags a losing center bet with its edge", () => {
    const t = bet(createTable(), { kind: "anySeven", amount: 5 });
    const note = coachRoll(roll(t, dice(3, 3)));
    expect(note?.tone).toBe("mistake");
    expect(note?.title).toBe("Any seven carries a 16.67% house edge.");
  });

  it("explains a seven-out, and says nothing on a quiet roll", () => {
    let t = bet(createTable(), { kind: "pass", amount: 10 });
    t = roll(t, dice(4, 2)).table;
    t = bet(t, { kind: "place", number: 8, amount: 12 });
    expect(coachRoll(roll(t, dice(4, 3)))?.title).toBe("A seven took $22 off the layout.");
    expect(coachRoll(roll(t, dice(4, 5)))).toBeNull();
  });

  it("nudges toward full odds before the roll", () => {
    let t = bet(createTable(), { kind: "pass", amount: 25 });
    expect(oddsNudge(t)).toBeNull();
    t = roll(t, dice(5, 3)).table;
    expect(oddsNudge(t)).toBe(
      "Point is 8: odds go up to 5x ($125). You have no odds yet. Odds carry no house edge.",
    );
    const full = setOdds(t, t.bets[0]!.id, 125);
    if (!full.ok) throw new Error(full.reason);
    expect(oddsNudge(full.table)).toBeNull();
  });

  it("reviews bets by edge and by exact units", () => {
    expect(reviewBet({ kind: "pass", amount: 10 }, DOWNTOWN_RULES)).toMatchObject({
      verdict: "good",
      correct: true,
    });
    expect(reviewBet({ kind: "place", number: 6, amount: 12 }, DOWNTOWN_RULES)).toMatchObject({
      verdict: "good",
      correct: true,
    });
    expect(reviewBet({ kind: "place", number: 6, amount: 10 }, DOWNTOWN_RULES)).toMatchObject({
      correct: false,
      message:
        "Place 6 for $10 pays only $11. Bet in steps of $6 so the 7:6 payout comes out exact.",
    });
    expect(reviewBet({ kind: "field", amount: 10 }, DOWNTOWN_RULES).verdict).toBe("fair");
    expect(reviewBet({ kind: "anySeven", amount: 5 }, DOWNTOWN_RULES)).toMatchObject({
      verdict: "costly",
      correct: false,
    });
    expect(verdictForEdge(0)).toBe("best");
    expect(verdictForEdge(0.0667)).toBe("costly");
  });

  it("explains every bet with its computed edge", () => {
    expect(explainBet("pass", DOWNTOWN_RULES)).toContain("house edge 1.41%");
    expect(explainBet("dontPass", DOWNTOWN_RULES)).toContain("1.36%");
    expect(explainBet("odds", DOWNTOWN_RULES)).toContain("0%");
    expect(explainBet("place", DOWNTOWN_RULES, 6)).toContain("steps of $6");
    expect(explainBet("field", { ...DOWNTOWN_RULES, fieldTwelvePays: 3 })).toContain(
      "12 pays triple",
    );
    for (const k of [
      "come",
      "dontCome",
      "buy",
      "lay",
      "hard",
      "anySeven",
      "anyCraps",
      "yo",
      "aces",
      "twelve",
      "aceDeuce",
    ] as const) {
      const n = k === "hard" ? 6 : k === "buy" || k === "lay" ? 4 : undefined;
      expect(explainBet(k, DOWNTOWN_RULES, n).length).toBeGreaterThan(20);
    }
  });

  it("labels payouts as the layout prints them", () => {
    expect(payoutLabel("place", 6)).toBe("7:6");
    expect(payoutLabel("place", 5)).toBe("7:5");
    expect(payoutLabel("place", 4)).toBe("9:5");
    expect(payoutLabel("hard", 8)).toBe("9:1");
    expect(payoutLabel("hard", 10)).toBe("7:1");
    expect(payoutLabel("anySeven")).toBe("4:1");
    expect(payoutLabel("anyCraps")).toBe("7:1");
    expect(payoutLabel("yo")).toBe("15:1");
    expect(payoutLabel("aces")).toBe("30:1");
    expect(payoutLabel("come")).toBe("1:1");
    expect(payoutLabel("odds", 6)).toBe("6:5");
    expect(payoutLabel("layOdds", 4)).toBe("1:2");
  });

  it("odds copy", () => {
    expect(oddsExplanation(30)).toBe("Odds pay true odds, so the house has no edge on that $30.");
    expect(fullOddsRule(DOWNTOWN_RULES)).toBe("Take full odds: 3x on 4/10, 4x on 5/9, 5x on 6/8");
    expect(fullOddsRule(CRAPS_PRESETS["100x"])).toBe("Take full odds: 100x on every point");
    expect(multipleLabel(75, 25)).toBe("3x");
    expect(multipleLabel(25, 10)).toBe("2.5x");
    expect(multipleLabel(5, 0)).toBe("0x");
  });
});

describe("payout drill", () => {
  it("is reproducible per seed and covers place 6/8 and odds on 4/10", () => {
    const a = createPayoutDrill(5);
    expect(a).toEqual(createPayoutDrill(5));
    expect(a).toHaveLength(20);
    expect(createPayoutDrill(6)).not.toEqual(a);
    for (const q of a) {
      expect(["place", "odds"]).toContain(q.topic);
      expect(Number.isInteger(q.answer)).toBe(true);
    }
  });

  it("answers match the payout table", () => {
    for (const q of createPayoutDrill(9, 200, ["place", "odds", "layOdds", "hard", "field"])) {
      const m = /\$(\d+)/.exec(q.prompt);
      const amount = Number(m![1]);
      if (q.topic === "place") {
        const n = Number(/Place (\d+)/.exec(q.prompt)![1]) as 6 | 8;
        expect(q.answer).toBe(placePayout(n, amount));
        expect((amount * 7) % 6).toBe(0);
      }
      if (q.topic === "odds") {
        const n = Number(/point is (\d+)/.exec(q.prompt)![1]) as 4 | 10;
        expect(q.answer).toBe(oddsPayout(n, amount));
      }
      expect(q.answer).toBeGreaterThan(0);
    }
  });

  it("explains right and wrong answers", () => {
    const q = createPayoutDrill(1, 1)[0]!;
    expect(checkPayoutAnswer(q, q.answer).correct).toBe(true);
    const wrong = checkPayoutAnswer(q, q.answer + 1);
    expect(wrong.correct).toBe(false);
    expect(wrong.message).toContain(`It pays $${q.answer}.`);
  });
});
