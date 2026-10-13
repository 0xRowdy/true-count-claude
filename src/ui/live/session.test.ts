import { describe, expect, it } from "vitest";
import { YOU, dice, liveRoll, seatStatus } from "@/games/craps";
import {
  FIXTURE_SEED,
  addOdds,
  botReply,
  canAddOdds,
  chatItems,
  chipText,
  chipsOn,
  closeBets,
  coachHint,
  leaderRows,
  openingTable,
  parseSeed,
  placeYourBet,
  postChat,
  railLayout,
  reseed,
  rulesSummary,
  specFor,
  timerLabel,
  yourLineTag,
  yourSeat,
  yourLine,
  yourStakeOn,
} from "./session";
import { liveTables, withReplayParams } from "./tables";

describe("the opening table matches design 11 (QEqUW)", () => {
  const s = openingTable();

  it("calls the 4 · 2 with the point on 8", () => {
    expect(s.table.point).toBe(8);
    expect(s.last?.record.dice).toEqual(dice(4, 2));
    expect(s.last?.call).toBe("Six, easy six. Point is still 8.");
    expect(s.last?.summary).toBe(
      "@dicecontrol_dee rolled 4 · 2 · Place 6 pays: Rita +$14, Mike +$14",
    );
  });

  it("seats read the design's bankrolls and status lines", () => {
    expect(s.seats.map((x) => [x.handle, x.bankroll, seatStatus(s, x)])).toEqual([
      ["@rail_rita", 4210, "Host · Pass + odds"],
      ["@dicecontrol_dee", 3380, "Shooter · rolling"],
      ["@vegas_val", 2905, "Don't pass"],
      ["@mtn_mike", 1770, "Iron Cross"],
      ["Carol (you)", 2641, "Pass + 3x odds"],
      ["@lucky_lou", 980, "Come + field"],
    ]);
    const rail = railLayout(s);
    expect(rail.top).toHaveLength(4);
    expect(rail.bottom.map((x) => x.handle)).toEqual(["Carol (you)", "@lucky_lou"]);
    expect(rail.openSeats).toBe(2);
  });

  it("your pass line carries $25 + 3x odds, drawn as two chips", () => {
    expect(yourLineTag(s.table, "pass")).toBe("YOU · $25 + 3x odds");
    const mine = chipsOn(s.table, { kind: "pass" }).filter((c) => c.mine);
    expect(mine.map((c) => c.amount)).toEqual([25, 75]);
    expect(yourStakeOn(s.table, { kind: "pass" })).toBe(100);
  });

  it("the bots' bets are down for the next roll, in their seat colours", () => {
    const six = chipsOn(s.table, { kind: "box", number: 6 });
    expect(six.some((c) => c.owner === "rail_rita" && c.amount === 12)).toBe(true);
    expect(six.some((c) => c.owner === "mtn_mike" && c.amount === 12)).toBe(true);
    expect(new Set(six.map((c) => c.color)).size).toBe(new Set(six.map((c) => c.owner)).size);
  });

  it("the coach nudges toward full odds", () => {
    expect(coachHint(s, null).text).toBe(
      "Point is 8: odds go up to 5x ($125). You have 3x ($75). Odds carry no house edge.",
    );
  });

  it("the leaderboard and chat read as the design", () => {
    expect(leaderRows(s, "decisions").map((r) => [r.handle, r.value, r.detail])).toEqual([
      ["@rail_rita", "98%", "41 decisions"],
      ["Carol (you)", "96%", "27 decisions"],
      ["@mtn_mike", "92%", "38 decisions"],
    ]);
    expect(leaderRows(s, "longest-roll")[0]).toMatchObject({
      handle: "@dicecontrol_dee",
      value: "22 rolls",
    });
    expect(chatItems(s).map((c) => c.text)).toEqual([
      "Point is 8 · @dicecontrol_dee is shooting",
      "Welcome Carol! Pass line and odds is the classic way to start.",
      "Thanks! Taking 3x. First time at a full table",
      "Pressing my 6 if she hits it again 🎲",
      "Dealer: Six, easy six. Place 6 pays $14",
    ]);
  });

  it("is the same table every time (the prerender and the client agree)", () => {
    expect(openingTable()).toEqual(openingTable(FIXTURE_SEED));
  });
});

describe("your actions", () => {
  it("bets the selected chip on a spot, graded by the coach", () => {
    const s = openingTable();
    const field = placeYourBet(s, specFor({ kind: "field" }, 25));
    expect(yourStakeOn(field.state.table, { kind: "field" })).toBe(25);
    expect(yourSeat(field.state).bankroll).toBe(2616);
    expect(field.notice?.tone).toBe("hint"); // the field is "fair": 5.56%

    const seven = placeYourBet(s, specFor({ kind: "oneRoll", bet: "anySeven" }, 5));
    expect(seven.notice?.tone).toBe("mistake");
    expect(seven.notice?.text).toContain("house edge");
    const me = (x: typeof s) => x.seats.find((y) => y.id === YOU)!.stats;
    expect(me(seven.state).decisions).toBe(me(s).decisions + 1);
    expect(me(seven.state).correct).toBe(me(s).correct);
  });

  it("refuses an illegal bet with the reason and leaves the table alone", () => {
    const s = openingTable();
    const r = placeYourBet(s, specFor({ kind: "pass" }, 25));
    expect(r.state).toBe(s);
    expect(r.notice).toEqual({
      tone: "hint",
      text: "Pass line bets go down before the come-out roll.",
    });
  });

  it("maps spots to bets", () => {
    expect(specFor({ kind: "box", number: 6 }, 12)).toEqual({
      kind: "place",
      number: 6,
      amount: 12,
    });
    expect(specFor({ kind: "hard", number: 8 }, 5)).toEqual({ kind: "hard", number: 8, amount: 5 });
    expect(specFor({ kind: "oneRoll", bet: "twelve" }, 5)).toEqual({ kind: "twelve", amount: 5 });
    expect(specFor({ kind: "dontPass" }, 10)).toEqual({ kind: "dontPass", amount: 10 });
  });

  it("adds odds a chip at a time, up to the table's limit, then stops offering it", () => {
    let s = openingTable();
    expect(canAddOdds(s.table)).toBe(true);
    s = addOdds(s, 25).state;
    expect(yourLineTag(s.table, "pass")).toBe("YOU · $25 + 4x odds");
    const full = addOdds(s, 100);
    expect(yourLineTag(full.state.table, "pass")).toBe("YOU · $25 + 5x odds");
    expect(full.notice?.text).toMatch(/^Full odds \(\$125\)/);
    expect(canAddOdds(full.state.table)).toBe(false);
    expect(coachHint(full.state, null).tone).toBe("good");
  });

  it("full-odds wording follows the side: lay odds on the don't pass", () => {
    // Seed 5 sevens out: the table comes out with no line bet of yours.
    let s = closeBets(reseed(openingTable(), 5)).state;
    s = placeYourBet(s, specFor({ kind: "dontPass" }, 25)).state;
    while (s.table.point === null) s = closeBets(s).state;
    expect(yourLine(s.table)?.kind).toBe("dontPass");
    expect(coachHint(s, null).text).toMatch(/you can lay up to/);
    while (canAddOdds(s.table)) s = addOdds(s, 500).state;
    const text = coachHint(s, null).text;
    expect(text).toMatch(/your don't pass has full lay odds/);
    expect(text).not.toMatch(/A come bet|full odds\./);
  });

  it("closing bets rolls the seeded dice, settles bankrolls and re-bets the bots", () => {
    const s = reseed(openingTable(), 7);
    const a = closeBets(s);
    expect(a).toEqual(closeBets(reseed(openingTable(), 7)));
    expect(a.state.rollIndex).toBe(s.rollIndex + 1);
    // Seed 7 makes the 8: the line pays $25 and its 3x odds $90; the odds come back, the flat
    // $25 stays up for the next come-out.
    expect(a.state.last?.call).toBe("Eight, easy eight. Point made, pay the line.");
    expect(yourSeat(a.state).bankroll).toBe(2641 + 75 + 25 + 90);
    expect(yourLineTag(a.state.table, "pass")).toBe("YOU · $25");
    expect(a.notice?.tone).toBe("good");
    expect(a.state.table.bets.some((b) => b.owner !== YOU)).toBe(true);
    expect(closeBets(reseed(openingTable(), 8)).state.last).not.toEqual(a.state.last);
  });

  it("the come-out coach line tells you where to start", () => {
    const s = closeBets(reseed(openingTable(), 7)).state;
    expect(coachHint(s, null).text).toMatch(/^Come-out roll. Your \$25 line bet wins on 7 or 11/);
    const fresh = reseed(openingTable(), 5); // seed 5 sevens out: the line is lost
    const out = closeBets(fresh).state;
    expect(out.last?.record.event).toBe("seven-out");
    expect(coachHint(out, null).text).toMatch(/^Come-out roll: pick a chip and tap PASS LINE/);
    expect(canAddOdds(s.table)).toBe(false);
  });
});

describe("chat", () => {
  it("posts your message and lets a seeded bot answer", () => {
    const s = postChat(openingTable(), "  Good luck everyone  ");
    const mine = chatItems(s).at(-1);
    expect(mine).toMatchObject({ type: "message", isYou: true, text: "Good luck everyone" });
    expect(postChat(s, "   ")).toBe(s);
    const replies = Array.from({ length: 20 }, (_, i) => botReply(reseed(s, i + 1), "Good luck"));
    expect(replies.some((r) => r.chat.length === s.chat.length + 1)).toBe(true);
    for (const r of replies) expect(r).toEqual(botReply(reseed(s, r.seed), "Good luck"));
    const answered = replies.find((r) => r.chat.length > s.chat.length)!;
    expect(answered.chat.at(-1)!.seatId).not.toBe(YOU);
  });

  it("muting hides the other players but never the dealer or you", () => {
    const s = postChat(openingTable(), "hi");
    const muted = chatItems(s, true);
    expect(muted.some((c) => c.type === "pill" && c.text.startsWith("Dealer:"))).toBe(true);
    expect(
      muted.filter((c) => c.type === "message").every((c) => c.type === "message" && c.isYou),
    ).toBe(true);
  });
});

describe("helpers", () => {
  it("formats the bet timer", () => {
    expect(timerLabel(12)).toBe("Bets close in 0:12");
    expect(timerLabel(5)).toBe("Bets close in 0:05");
    expect(timerLabel(-3)).toBe("Bets close in 0:00");
    expect(timerLabel(75)).toBe("Bets close in 1:15");
  });

  it("parses ?seed=", () => {
    expect(parseSeed("42")).toBe(42);
    expect(parseSeed(["7", "9"])).toBe(7);
    expect(parseSeed("4294967295")).toBe(4294967295);
    for (const bad of [undefined, null, "", "-1", "1.5", "abc", "99999999999"]) {
      expect(parseSeed(bad)).toBeNull();
    }
  });

  it("chip faces", () => {
    expect(chipText(75)).toBe("75");
    expect(chipText(1200)).toBe("1.2K");
    expect(chipText(2000)).toBe("2K");
  });

  it("the rules sheet says the table is simulated", () => {
    const rules = rulesSummary(openingTable());
    expect(rules).toContain("Odds: 3x on 4 and 10, 4x on 5 and 9, 5x on 6 and 8.");
    expect(rules.at(-1)).toMatch(/simulated/);
  });

  it("lists the live tables honestly", () => {
    const tables = liveTables();
    expect(tables.map((t) => [t.title, t.seats, t.href])).toEqual([
      ["Craps · Downtown rules", "6/8", "/live/craps"],
      ["Blackjack · 6 deck, S17", null, null],
      ["Roulette · European", null, null],
    ]);
    expect(tables.map((t) => t.soloHref)).toEqual(["/games/craps", "/play", "/games/roulette"]);
  });

  it("carries replay params from the list to the table, and nothing else", () => {
    expect(withReplayParams("/live/craps", "?seed=7&pace=manual&x=1")).toBe(
      "/live/craps?seed=7&pace=manual",
    );
    expect(withReplayParams("/live/craps", "")).toBe("/live/craps");
    expect(withReplayParams("/live/craps", "?seed=<script>")).toBe("/live/craps");
  });
});

it("liveRoll stays the engine's: a forced seven-out passes the dice", () => {
  const s = liveRoll(openingTable(), dice(3, 4));
  expect(s.last?.record.event).toBe("seven-out");
  expect(railLayout(s).top[2]!.handle).toBe("@vegas_val");
});
