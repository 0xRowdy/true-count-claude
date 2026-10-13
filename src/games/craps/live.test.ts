import { describe, expect, it } from "vitest";
import {
  type LiveTableState,
  DOWNTOWN_BOTS,
  QUICK_REPLIES,
  STYLE_LABELS,
  YOU,
  advanceLiveTable,
  botsBet,
  createLiveTable,
  dice,
  leaderboard,
  liveRoll,
  liveTableSubtitle,
  nextDice,
  occupancyLabel,
  planForStyle,
  seatOnTable,
  seatStatus,
  sendChat,
  shooterOf,
  yourAction,
  DOWNTOWN_RULES,
  checkPlan,
} from "./index";

function totalChips(s: LiveTableState): number {
  return s.seats.reduce((sum, seat) => sum + seat.bankroll + seatOnTable(s, seat.id), 0);
}

describe("live table setup (design 11)", () => {
  const s = createLiveTable({ seed: 8 });

  it("seats the design's players in order, with Carol fifth and Dee shooting", () => {
    expect(s.seats.map((x) => x.handle)).toEqual([
      "@rail_rita",
      "@dicecontrol_dee",
      "@vegas_val",
      "@mtn_mike",
      "Carol (you)",
      "@lucky_lou",
    ]);
    expect(s.seats.map((x) => x.bankroll)).toEqual([4210, 3380, 2905, 1770, 2641, 980]);
    expect(shooterOf(s).handle).toBe("@dicecontrol_dee");
    expect(occupancyLabel(s)).toBe("Live · 6 of 8 at the rail");
    expect(liveTableSubtitle(s)).toBe(
      "Hosted by @rail_rita · 3-4-5x odds · $10 minimum · practice chips only",
    );
  });

  it("shows each seat's status line", () => {
    const status = s.seats.map((x) => seatStatus(s, x));
    expect(status).toEqual([
      "Host · Pass + odds",
      "Shooter · rolling",
      "Don't pass",
      "Iron Cross",
      "Pass + 3x odds",
      "Come + field",
    ]);
  });

  it("opens the chat with the host's welcome", () => {
    expect(s.chat).toEqual([
      {
        id: 1,
        kind: "player",
        seatId: "rail_rita",
        text: "Welcome Carol! Pass line and odds is the classic way to start.",
      },
    ]);
    expect(QUICK_REPLIES).toEqual(["Nice roll!", "Good luck", "👏"]);
  });

  it("ranks the leaderboard by decision accuracy: Rita 98%, Carol 96%, Mike 92%", () => {
    expect(leaderboard(s).map((r) => [r.handle, r.decisions, r.accuracy])).toEqual([
      ["@rail_rita", 41, 98],
      ["Carol (you)", 27, 96],
      ["@mtn_mike", 38, 92],
    ]);
    expect(leaderboard(s, "longest-roll")[0]!.handle).toBe("@dicecontrol_dee");
  });

  it("every bot style is a rules-checked plan", () => {
    for (const bot of DOWNTOWN_BOTS) {
      expect(checkPlan(planForStyle(bot.style, DOWNTOWN_RULES)).ok).toBe(true);
    }
    expect(Object.keys(STYLE_LABELS)).toHaveLength(6);
    expect(planForStyle("pass-3x", DOWNTOWN_RULES).name).toBe("Pass + 3x odds");
  });
});

describe("playing the live table", () => {
  it("bots bet per their style on the come-out", () => {
    const s = botsBet(createLiveTable({ seed: 8 }));
    const kinds = (id: string) => s.table.bets.filter((b) => b.owner === id).map((b) => b.kind);
    expect(kinds("rail_rita")).toContain("pass");
    expect(kinds("vegas_val")).toContain("dontPass");
    expect(kinds("mtn_mike")).toEqual([]); // Iron Cross waits for a point
    expect(s.seats.find((x) => x.id === "rail_rita")!.bankroll).toBeLessThanOrEqual(4200);
  });

  it("the design's moment: 4 · 2 with the point on 8 pays Rita and Mike $14 on the place 6", () => {
    let s = createLiveTable({ seed: 8 });
    s = advanceLiveTable(s, dice(5, 3)); // point 8
    s = botsBet(s);
    const r = yourAction(s, { type: "bet", spec: { kind: "field", amount: 10 } });
    expect(r.ok).toBe(true);
    s = liveRoll(r.ok ? r.state : s, dice(4, 2));
    expect(s.last!.call).toBe("Six, easy six. Point is still 8.");
    const placeSix = s.last!.payoutCalls.find((c) => c.startsWith("Place 6 pays:"));
    expect(placeSix).toBeDefined();
    expect(placeSix).toContain("Rita +$14");
    expect(placeSix).toContain("Mike +$14");
    expect(s.last!.summary.startsWith("@dicecontrol_dee rolled 4 · 2")).toBe(true);
    expect(
      s.chat.some((c) => c.kind === "dealer" && c.text.startsWith("Dealer: Six, easy six.")),
    ).toBe(true);
    expect(s.chat.some((c) => c.text === "Point is 8 · @dicecontrol_dee is shooting")).toBe(true);
  });

  it("passes the dice to the next seat on a seven-out", () => {
    let s = createLiveTable({ seed: 8 });
    s = advanceLiveTable(s, dice(5, 3));
    s = advanceLiveTable(s, dice(4, 3));
    expect(s.last!.record.event).toBe("seven-out");
    expect(shooterOf(s).handle).toBe("@vegas_val");
    expect(s.chat.some((c) => c.text === "New shooter: @vegas_val")).toBe(true);
  });

  it("is deterministic: same seed, same table after 300 rolls", () => {
    const run = (seed: number) => {
      let s = createLiveTable({ seed });
      for (let i = 0; i < 300; i++) s = advanceLiveTable(s);
      return s;
    };
    const a = run(1234);
    expect(JSON.stringify(run(1234))).toBe(JSON.stringify(a));
    expect(JSON.stringify(run(1235))).not.toBe(JSON.stringify(a));
    expect(a.rollIndex).toBe(300);
    expect(a.table.rollCount).toBe(300);
    expect(a.chat.length).toBeLessThanOrEqual(60);
  });

  it("nextDice depends only on seed and roll index", () => {
    const a = createLiveTable({ seed: 5 });
    const b = createLiveTable({ seed: 5, you: { name: "Sam", bankroll: 100 } });
    expect(nextDice(a)).toEqual(nextDice(b));
  });

  it("conserves chips: the table total moves only by the house's wins and losses", () => {
    let s = createLiveTable({ seed: 42 });
    let houseNet = 0;
    const start = totalChips(s);
    for (let i = 0; i < 400; i++) {
      s = botsBet(s);
      s = liveRoll(s);
      for (const r of s.last!.resolutions) houseNet -= r.won - r.lost;
      expect(totalChips(s) + houseNet).toBe(start);
    }
  });

  it("grades your decisions and refuses what you can't do or afford", () => {
    let s = createLiveTable({
      seed: 3,
      you: { name: "Carol", bankroll: 30, stats: { decisions: 0, correct: 0, longestRoll: 0 } },
    });
    const bad = yourAction(s, { type: "bet", spec: { kind: "pass", amount: 50 } });
    expect(bad).toMatchObject({ ok: false, reason: "Not enough practice chips." });
    const pass = yourAction(s, { type: "bet", spec: { kind: "pass", amount: 10 } });
    if (!pass.ok) throw new Error(pass.reason);
    s = pass.state;
    const prop = yourAction(s, { type: "bet", spec: { kind: "anySeven", amount: 5 } });
    if (!prop.ok) throw new Error(prop.reason);
    s = prop.state;
    const me = s.seats.find((x) => x.id === YOU)!;
    expect(me.stats).toEqual({ decisions: 2, correct: 1, longestRoll: 0 });
    expect(me.bankroll).toBe(15);
    const theirs = s.table.bets.find((b) => b.owner !== YOU);
    if (theirs) {
      expect(yourAction(s, { type: "takeDown", betId: theirs.id })).toMatchObject({ ok: false });
    }
    expect(yourAction(s, { type: "bet", spec: { kind: "come", amount: 10 } })).toMatchObject({
      ok: false,
    });
  });

  it("chat: your messages are trimmed and empty ones ignored", () => {
    let s = createLiveTable({ seed: 1 });
    const before = s.chat.length;
    s = sendChat(s, "   ");
    expect(s.chat.length).toBe(before);
    s = sendChat(s, "  Nice roll!  ");
    expect(s.chat[s.chat.length - 1]).toMatchObject({
      kind: "player",
      seatId: YOU,
      text: "Nice roll!",
    });
  });

  it("bots chat sometimes, and the longest-roll board updates after a seven-out", () => {
    let s = createLiveTable({ seed: 77 });
    for (let i = 0; i < 200; i++) s = advanceLiveTable(s);
    expect(s.chat.some((c) => c.kind === "player" && c.seatId !== "rail_rita")).toBe(true);
    const longest = leaderboard(s, "longest-roll", 6);
    expect(longest).toHaveLength(6);
    for (let i = 1; i < longest.length; i++) {
      expect(longest[i - 1]!.longestRoll).toBeGreaterThanOrEqual(longest[i]!.longestRoll);
    }
  });
});
