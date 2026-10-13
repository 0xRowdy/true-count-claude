import { describe, expect, it } from "vitest";
import {
  EMPTY_PROGRESS,
  PRACTICE_BANKROLL_START,
  type ProgressDecision,
  type ProgressState,
  endProgressSession,
  recordDecision,
  recordHand,
  startProgressSession,
} from "./progress";
import {
  LEVELS,
  accuracy,
  accuracyDelta,
  achievements,
  addDays,
  bankroll,
  bankrollSeries,
  bestStreak,
  categoryAccuracy,
  chipBalance,
  dayNumber,
  evaluateCriterion,
  handRecord,
  mastery,
  mistakesLastSession,
  practiceStreak,
  previousWindow,
  rangeWindow,
  recentAccuracy,
  relativeDayLabel,
  sessionRows,
  sessionStats,
  weakestCategory,
  weekTicks,
  weekdayMon,
  weeklyAccuracy,
} from "./progressSelectors";
import { sampleProgress } from "./progressSample";

const TODAY = "2026-10-13"; // a Tuesday

function decisions(
  game: ProgressDecision["game"],
  category: string,
  pattern: readonly boolean[],
  day = TODAY,
  sessionId: string | null = null,
  at0 = 0,
): ProgressDecision[] {
  return pattern.map((correct, i) => ({
    game,
    category,
    correct,
    coached: !correct,
    at: at0 + i,
    day,
    sessionId,
  }));
}

const n = (count: number, correctEvery = 0): boolean[] =>
  Array.from({ length: count }, (_, i) => (correctEvery ? i % correctEvery !== 0 : true));

const withDecisions = (ds: ProgressDecision[]): ProgressState => ({
  ...EMPTY_PROGRESS,
  decisions: ds,
});

describe("calendar", () => {
  it("does date arithmetic on ISO days", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekdayMon(TODAY)).toBe(1);
    expect(weekdayMon("2026-10-12")).toBe(0);
    expect(weekdayMon("2026-10-18")).toBe(6);
    expect(dayNumber("2026-10-14") - dayNumber(TODAY)).toBe(1);
  });

  it("labels days relative to today", () => {
    expect(relativeDayLabel(TODAY, TODAY)).toBe("Today");
    expect(relativeDayLabel("2026-10-12", TODAY)).toBe("Yesterday");
    expect(relativeDayLabel("2026-10-09", TODAY)).toBe("Oct 9");
  });

  it("computes range windows", () => {
    expect(rangeWindow("7d", TODAY)).toEqual({ from: "2026-10-07", to: TODAY });
    expect(rangeWindow("all", TODAY)).toEqual({ from: null, to: TODAY });
    expect(previousWindow("7d", TODAY)).toEqual({ from: "2026-09-30", to: "2026-10-06" });
    expect(previousWindow("all", TODAY)).toBeNull();
  });
});

describe("accuracy", () => {
  it("is null, not 0, with no decisions", () => {
    expect(accuracy(EMPTY_PROGRESS, "all")).toEqual({ correct: 0, total: 0, rate: null });
  });

  it("filters by game and window", () => {
    const data = withDecisions([
      ...decisions("blackjack", "hard", [true, false], "2026-10-01"),
      ...decisions("craps", "odds", [true, true], TODAY),
    ]);
    expect(accuracy(data, "all").rate).toBe(0.75);
    expect(accuracy(data, "blackjack").rate).toBe(0.5);
    expect(accuracy(data, "all", rangeWindow("7d", TODAY))).toEqual({
      correct: 2,
      total: 2,
      rate: 1,
    });
    expect(recentAccuracy(data, "all", 3).total).toBe(3);
  });

  it("compares with the window before", () => {
    const data = withDecisions([
      ...decisions("craps", "odds", [true, false], "2026-10-01"),
      ...decisions("craps", "odds", [true, true, true, false], TODAY),
    ]);
    expect(accuracyDelta(data, "craps", "7d", TODAY)).toBeCloseTo(25);
    expect(accuracyDelta(data, "craps", "all", TODAY)).toBeNull();
    expect(accuracyDelta(data, "roulette", "7d", TODAY)).toBeNull();
  });

  it("breaks accuracy down by category over the last N decisions", () => {
    const data = withDecisions([
      ...decisions("blackjack", "soft", [false, false]),
      ...decisions("blackjack", "soft", [true, true, false], TODAY, null, 10),
      ...decisions("blackjack", "hard", [true], TODAY, null, 20),
    ]);
    const cats = categoryAccuracy(data, "blackjack", 4);
    expect(cats.map((c) => c.category)).toEqual([
      "hard",
      "pairs",
      "doubles",
      "soft",
      "insurance-surrender",
    ]);
    expect(cats.find((c) => c.category === "soft")).toMatchObject({ total: 3, correct: 2 });
    expect(cats.find((c) => c.category === "pairs")!.rate).toBeNull();
  });

  it("buckets weeks Monday to Sunday, this week last", () => {
    const data = withDecisions([
      ...decisions("blackjack", "hard", [true], "2026-10-12"),
      ...decisions("blackjack", "hard", [false], "2026-10-11"),
    ]);
    const weeks = weeklyAccuracy(data, "all", TODAY, 12);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toMatchObject({ label: "W12", start: "2026-10-12", rate: 1 });
    expect(weeks[10]).toMatchObject({ start: "2026-10-05", rate: 0 });
    expect(weeks[0]!.rate).toBeNull();
  });

  it("finds the best streak", () => {
    expect(
      bestStreak(decisions("craps", "odds", [true, true, false, true, true, true, false])),
    ).toBe(3);
    expect(bestStreak([])).toBe(0);
  });
});

describe("hands and bankroll", () => {
  it("leaves pushes out of the win rate", () => {
    const r = handRecord(
      [5, -5, 0, 10].map((net, i) => ({
        game: "craps" as const,
        net,
        strategyName: null,
        at: i,
        day: TODAY,
        sessionId: null,
      })),
    );
    expect(r).toEqual({ hands: 4, wins: 2, losses: 1, pushes: 1, winRate: 2 / 3, net: 10 });
    expect(handRecord([]).winRate).toBeNull();
  });

  it("keeps a bankroll per game and a total balance", () => {
    let s = recordHand(EMPTY_PROGRESS, { game: "craps", net: 30 }, { at: 1, day: TODAY });
    s = recordHand(s, { game: "roulette", net: -10 }, { at: 2, day: TODAY });
    expect(bankroll(s, "craps")).toBe(PRACTICE_BANKROLL_START + 30);
    expect(chipBalance(EMPTY_PROGRESS)).toBe(5 * PRACTICE_BANKROLL_START);
    expect(chipBalance(s)).toBe(5 * PRACTICE_BANKROLL_START + 20);
  });

  it("plots a bankroll series from the window's opening balance", () => {
    let s = recordHand(EMPTY_PROGRESS, { game: "craps", net: 100 }, { at: 1, day: "2026-09-01" });
    s = recordHand(s, { game: "craps", net: -20 }, { at: 2, day: TODAY });
    s = recordHand(s, { game: "craps", net: 50 }, { at: 3, day: TODAY });
    const series = bankrollSeries(s, "craps", rangeWindow("7d", TODAY));
    expect(series).toEqual({ start: 2100, now: 2130, points: [2100, 2080, 2130] });
    expect(bankrollSeries(EMPTY_PROGRESS, "craps", rangeWindow("7d", TODAY)).points).toEqual([
      2000,
    ]);
    const many = Array.from({ length: 500 }, (_, i) => i).reduce(
      (acc, i) => recordHand(acc, { game: "baccarat", net: 1 }, { at: i, day: TODAY }),
      EMPTY_PROGRESS,
    );
    const sampled = bankrollSeries(many, "baccarat", rangeWindow("7d", TODAY), 50);
    expect(sampled.points).toHaveLength(50);
    expect(sampled.now).toBe(2500);
    expect(sampled.start).toBe(2000);
  });
});

describe("practice days", () => {
  const onDays = (days: string[]) =>
    withDecisions(days.flatMap((d) => decisions("craps", "odds", [true], d)));

  it("counts a streak ending today, or yesterday before today's practice", () => {
    expect(practiceStreak(onDays(["2026-10-11", "2026-10-12", TODAY]), TODAY)).toBe(3);
    expect(practiceStreak(onDays(["2026-10-11", "2026-10-12"]), TODAY)).toBe(2);
    expect(practiceStreak(onDays(["2026-10-10"]), TODAY)).toBe(0);
    expect(practiceStreak(EMPTY_PROGRESS, TODAY)).toBe(0);
  });

  it("ticks the week Monday to Sunday", () => {
    const ticks = weekTicks(onDays(["2026-10-12"]), TODAY);
    expect(ticks.map((t) => t.label).join("")).toBe("MTWTFSS");
    expect(ticks.map((t) => t.state)).toEqual([
      "done",
      "today",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(weekTicks(EMPTY_PROGRESS, "2026-10-14")[0]!.state).toBe("missed");
  });
});

describe("levels", () => {
  it("is not started with no record", () => {
    const m = mastery(EMPTY_PROGRESS, "roulette");
    expect(m).toMatchObject({
      level: 0,
      started: false,
      title: "Not started",
      tableReadiness: 0,
      nextStep: "5-minute table intro",
    });
  });

  it("reaches level 1 by playing and climbs in order", () => {
    const data = withDecisions(decisions("blackjack", "hard", n(5)));
    expect(mastery(data, "blackjack")).toMatchObject({ level: 1, title: "First steps" });
    // 30 at 70%+ is level 2; 100 hard at 85%+ is level 3; level 4 needs doubles.
    const lvl3 = withDecisions(decisions("blackjack", "hard", n(100)));
    const m = mastery(lvl3, "blackjack");
    expect(m.level).toBe(3);
    expect(m.next!.title).toBe("Doubling down");
    expect(m.nextStep).toBe("Next: doubles");
  });

  it("evaluates a criterion over the most recent decisions", () => {
    const soft = { label: "Soft totals 95%+", category: "soft", target: 0.95, required: 200 };
    const data = withDecisions(decisions("blackjack", "soft", n(112, 7)));
    const c = evaluateCriterion(data, "blackjack", soft);
    expect(c.count).toBe(112);
    expect(c.met).toBe(false);
    expect(c.progress).toBeCloseTo((112 / 200) * (96 / 112 / 0.95));
    expect(c.phrase).toBe("soft totals hold 95% over 200 hands");
    const done = evaluateCriterion(
      withDecisions(decisions("blackjack", "soft", n(200))),
      "blackjack",
      soft,
    );
    expect(done).toMatchObject({ met: true, progress: 1 });
  });

  it("matches the design's blackjack ladder", () => {
    expect(LEVELS.blackjack.find((l) => l.level === 7)!.title).toBe("Table-ready");
    expect(LEVELS.blackjack.find((l) => l.level === 8)!.title).toBe("Shoe Reader");
    expect(LEVELS.craps[2]!.title).toBe("Learning the layout");
  });

  it("reports table readiness and the top level", () => {
    const all = (["hard", "soft", "pairs", "doubles", "insurance-surrender"] as const).flatMap(
      (cat, k) => decisions("blackjack", cat, n(1000), TODAY, null, k * 10_000),
    );
    const m = mastery(withDecisions(all), "blackjack");
    expect(m.level).toBe(10);
    expect(m.next).toBeNull();
    expect(m.tableReadiness).toBe(1);
    expect(m.nextStep).toBe("Top level reached");
  });
});

describe("weak spots", () => {
  it("picks the lowest category with enough decisions", () => {
    const data = withDecisions([
      ...decisions("blackjack", "hard", n(20, 10)),
      ...decisions("blackjack", "soft", n(20, 4), TODAY, "s1", 100),
      ...decisions("blackjack", "pairs", n(5, 2), TODAY, null, 200), // too few
      ...decisions("craps", "odds", n(20, 5), TODAY, null, 300),
    ]);
    const w = weakestCategory(data)!;
    expect(w).toMatchObject({
      game: "blackjack",
      category: "soft",
      label: "Soft totals",
      total: 20,
    });
    expect(w.mistakesLastSession).toBe(5);
    expect(weakestCategory(data, ["craps"])!.category).toBe("odds");
    expect(weakestCategory(EMPTY_PROGRESS)).toBeNull();
    expect(weakestCategory(withDecisions(decisions("craps", "odds", n(20))))).toBeNull();
  });

  it("counts mistakes of the last session that had the category", () => {
    const data = withDecisions([
      ...decisions("craps", "odds", [false, false], "2026-10-10", "a"),
      ...decisions("craps", "odds", [false, true], TODAY, "b", 10),
    ]);
    expect(mistakesLastSession(data, "craps", "odds")).toBe(1);
  });
});

describe("sessions", () => {
  function played(): ProgressState {
    const w = (at: number, day = TODAY) => ({ at, day });
    let s = startProgressSession(
      EMPTY_PROGRESS,
      { id: "a", game: "craps", strategyName: "Iron Cross" },
      w(0, "2026-10-12"),
    );
    s = recordDecision(
      s,
      { game: "craps", category: "odds", correct: true },
      w(1000, "2026-10-12"),
    );
    s = recordDecision(
      s,
      { game: "craps", category: "odds", correct: false, coached: true },
      w(2000, "2026-10-12"),
    );
    for (const [i, net] of [10, 10, -10, 0, 10].entries())
      s = recordHand(s, { game: "craps", net }, w(3000 + i, "2026-10-12"));
    s = endProgressSession(s, "a", w(600_000, "2026-10-12"));
    s = startProgressSession(s, { id: "b", game: "roulette" }, w(700_000));
    s = recordHand(s, { game: "roulette", net: -5 }, w(760_000));
    return s;
  }

  it("lists sessions newest first with their stats", () => {
    const rows = sessionRows(played(), "all");
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(rows[1]).toMatchObject({
      game: "craps",
      strategyName: "Iron Cross",
      hands: 5,
      accuracy: 0.5,
      net: 20,
      coached: 1,
      decisions: 2,
      durationMs: 600_000,
    });
    expect(rows[0]).toMatchObject({ hands: 1, accuracy: null, durationMs: 60_000 });
    expect(sessionRows(played(), "craps", rangeWindow("7d", TODAY))).toHaveLength(1);
    expect(sessionRows(played(), "all", { from: TODAY, to: TODAY })).toHaveLength(1);
  });

  it("summarises sessions, streaks and coaching", () => {
    const st = sessionStats(played(), "all");
    expect(st).toMatchObject({
      sessions: 2,
      longestWinStreak: 2,
      longestLosingStreak: 1,
      coachCorrections: 1,
      decisions: 2,
      decisionsPerCorrection: 2,
    });
    expect(st.avgMinutes).toBeCloseTo(5.5);
    expect(sessionStats(EMPTY_PROGRESS, "all")).toMatchObject({
      sessions: 0,
      avgMinutes: null,
      decisionsPerCorrection: null,
    });
  });
});

describe("achievements", () => {
  it("are all locked for a new player, and none is shown as earned", () => {
    const list = achievements(EMPTY_PROGRESS);
    expect(list.map((a) => a.id)).toEqual([
      "table-ready",
      "ice-cold",
      "hard-way",
      "remixed",
      "no-nudges",
      "royal-hold",
    ]);
    expect(list.every((a) => !a.unlocked && a.progress === 0)).toBe(true);
  });

  it("unlock from the record, unlocked first", () => {
    let s: ProgressState = withDecisions([
      ...decisions("blackjack", "hard", n(300)),
      ...decisions("video-poker", "pairs", n(40), TODAY, null, 1000),
    ]);
    s = startProgressSession(s, { id: "c", game: "craps" }, { at: 5000, day: TODAY });
    for (let i = 0; i < 3; i++) {
      s = recordDecision(
        s,
        { game: "craps", category: "odds", correct: true },
        { at: 5001 + i, day: TODAY },
      );
    }
    const list = achievements(s);
    const byId = Object.fromEntries(list.map((a) => [a.id, a]));
    expect(byId["table-ready"]!.unlocked).toBe(true);
    expect(byId["ice-cold"]).toMatchObject({
      unlocked: true,
      description: "343 correct decisions in a row",
    });
    expect(byId["hard-way"]!.unlocked).toBe(true);
    expect(byId["royal-hold"]).toMatchObject({ unlocked: false, progress: 0.4 });
    expect(byId.remixed!.unlocked).toBe(false);
    expect(list.slice(0, 3).every((a) => a.unlocked)).toBe(true);
  });

  it("No nudges needs a 50-hand session without a correction", () => {
    let s = startProgressSession(
      EMPTY_PROGRESS,
      { id: "x", game: "baccarat" },
      { at: 0, day: TODAY },
    );
    for (let i = 0; i < 25; i++)
      s = recordHand(s, { game: "baccarat", net: 1 }, { at: i + 1, day: TODAY });
    expect(achievements(s).find((a) => a.id === "no-nudges")!.progress).toBe(0.5);
  });
});

describe("sample history", () => {
  const sample = sampleProgress(TODAY, Date.parse("2026-10-13T19:00:00Z"));

  it("is deterministic", () => {
    expect(sampleProgress(TODAY, Date.parse("2026-10-13T19:00:00Z"))).toEqual(sample);
  });

  it("tells the design's story", () => {
    expect(practiceStreak(sample, TODAY)).toBe(4);
    const bj = mastery(sample, "blackjack");
    expect(bj.level).toBeGreaterThanOrEqual(6);
    expect(mastery(sample, "roulette").started).toBe(false);
    expect(mastery(sample, "craps").started).toBe(true);
    const weeks = weeklyAccuracy(sample, "blackjack", TODAY);
    expect(weeks[11]!.rate!).toBeGreaterThan(weeks[0]!.rate!);
    const rows = sessionRows(sample, "all");
    expect(rows[0]).toMatchObject({ game: "craps", day: TODAY });
    expect(rows[1]).toMatchObject({ game: "blackjack", day: TODAY });
    const ach = Object.fromEntries(achievements(sample).map((a) => [a.id, a.unlocked]));
    expect(ach).toMatchObject({
      "ice-cold": true,
      "hard-way": true,
      remixed: false,
      "royal-hold": false,
    });
    expect(weakestCategory(sample)).not.toBeNull();
    expect(sample.decisions.every((d) => d.at <= Date.parse("2026-10-13T19:00:00Z"))).toBe(true);
  });
});
