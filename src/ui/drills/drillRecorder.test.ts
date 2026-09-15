/**
 * The drill recorder, driven through the real drill engines against real seeded Shoes.
 *
 * Nothing is hand-built: the tests play the actual drills, fold what they record onto a
 * Session, and then ask `src/state` whether that Session agrees with the cards its seeds
 * produce. The failure this exists to catch is a log that quietly disagrees with the game.
 */

import { describe, expect, it } from "vitest";
import { KO } from "@/engine/counting";
import { DEFAULT_RULES } from "@/engine/rules";
import { basicStrategy } from "@/engine/strategy";
import {
  type Session,
  aggregateStats,
  computeStats,
  createMemoryStore,
  createSessionRepository,
  endSession,
  startSession,
  verifyReplay,
} from "@/state";
import {
  type BasicStrategyDrill,
  DEFAULT_BASIC_STRATEGY_CONFIG,
  awaitingInsurance,
  basicStrategyReport,
  betweenRounds,
  currentActions,
  currentSituation,
  dealNextHand,
  startBasicStrategyDrill,
  submitDecision,
  submitInsurance,
} from "@/drills/basicStrategy";
import {
  DEFAULT_COUNTING_CONFIG,
  countingReport,
  countingReadout,
  dealNextStep,
  startCountingDrill,
  submitCountCheck,
} from "@/drills/counting";
import {
  DEFAULT_DEVIATION_CONFIG,
  type DeviationDrill,
  deviationReport,
  nextDeviationQuestion,
  startDeviationDrill,
  submitDeviation,
} from "@/drills/deviation";
import { canUndo } from "@/drills/progress";
import {
  DEFAULT_TRUE_COUNT_CONFIG,
  type TrueCountDrill,
  nextTrueCountQuestion,
  startTrueCountDrill,
  submitTrueCount,
  trueCountReport,
} from "@/drills/trueCount";
import {
  type RecordedRun,
  basicStrategyRecords,
  beginRun,
  countingRecords,
  dealtRoundRecords,
  deviationRecords,
  drillSessionFrom,
  openDrillSessions,
  replaceRun,
  sessionAccepts,
  stepRun,
  systemChangeRecord,
  trueCountRecords,
  undoRun,
  withoutActivePointer,
} from "./drillRecorder";

const AT = 1_700_000_000_000;

const BS_META = {
  id: "bs-1",
  drillId: "basic-strategy" as const,
  rules: DEFAULT_RULES,
  countingSystem: "Hi-Lo",
  seed: 7,
  startingBankroll: DEFAULT_BASIC_STRATEGY_CONFIG.bankroll,
};

type BsRun = RecordedRun<BasicStrategyDrill["current"]>;

/** Deals, recording a round that settles on the deal. */
function deal(run: BsRun, at: number): BsRun {
  const next = dealNextHand(run.drill);
  return replaceRun(run, next, dealtRoundRecords(next.current, at));
}

/** One graded tap, recorded. `wrong` picks a legal action other than the chart's. */
function answer(run: BsRun, at: number, wrong: boolean): BsRun {
  const before = run.drill.current;
  if (awaitingInsurance(before)) {
    const next = submitInsurance(run.drill, false, at);
    return stepRun(run, next, basicStrategyRecords(before, next.current));
  }
  const situation = currentSituation(before);
  if (!situation) throw new Error("not waiting on a decision");
  const chart = basicStrategy(situation.hand, situation.dealerUpcard, situation.rules, {
    handCount: situation.handCount,
    bankroll: situation.bankroll,
  });
  const legal = currentActions(before);
  const action = wrong ? (legal.find((candidate) => candidate !== chart) ?? chart) : chart;
  const next = submitDecision(run.drill, action, at);
  return stepRun(run, next, basicStrategyRecords(before, next.current));
}

function playRounds(seed: number, rounds: number): BsRun {
  let run = beginRun(startBasicStrategyDrill(DEFAULT_BASIC_STRATEGY_CONFIG, seed));
  let at = AT;
  let taps = 0;
  for (let round = 0; round < rounds; round++) {
    run = deal(run, at++);
    let guard = 0;
    while (!betweenRounds(run.drill.current) && guard++ < 40) {
      run = answer(run, at++, taps++ % 3 === 2);
    }
  }
  return run;
}

describe("a Basic Strategy drill, recorded", () => {
  it.each([1, 2, 3, 11, 42])("replays cleanly from its seeds (seed %i)", (seed) => {
    const run = playRounds(seed, 60);
    const session = drillSessionFrom(null, BS_META, run.log.current) as Session;
    expect(session).not.toBeNull();
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });

    const report = basicStrategyReport(run.drill);
    const stats = computeStats(session);
    // Every graded answer — plays and insurance — is one Decision in the log.
    expect(stats.decisionsMade).toBe(report.tally.attempts);
    expect(stats.correctDecisions).toBe(report.tally.correct);
    // Every hand dealt is a round, naturals included.
    expect(stats.roundsPlayed).toBe(report.roundsDealt);
    expect(session.mode).toBe("drill");
    expect(session.drillId).toBe("basic-strategy");
  });

  it("records a round's Decisions only once it settles", () => {
    let run = beginRun(startBasicStrategyDrill(DEFAULT_BASIC_STRATEGY_CONFIG, 5));
    // Find a hand where a hit leaves the round open.
    for (let attempt = 0; attempt < 50; attempt++) {
      run = deal(run, AT);
      if (awaitingInsurance(run.drill.current)) run = answer(run, AT, false);
      if (betweenRounds(run.drill.current)) continue;
      if (!currentActions(run.drill.current).includes("hit")) {
        while (!betweenRounds(run.drill.current)) run = answer(run, AT, false);
        continue;
      }
      const before = run.drill.current;
      const next = submitDecision(run.drill, "hit", AT);
      if (betweenRounds(next.current)) {
        run = stepRun(run, next, basicStrategyRecords(before, next.current));
        continue;
      }
      const open = stepRun(run, next, basicStrategyRecords(before, next.current));
      const prior = drillSessionFrom(null, BS_META, run.log.current);
      const session = drillSessionFrom(null, BS_META, open.log.current);
      expect(session?.decisions.length ?? 0).toBe(prior?.decisions.length ?? 0);
      return;
    }
    throw new Error("no open round found");
  });

  it("forgets an undone answer entirely, round and all", () => {
    const run = playRounds(9, 20);
    const before = drillSessionFrom(null, BS_META, run.log.current) as Session;
    const undone = undoRun(run);
    const after = drillSessionFrom(null, BS_META, undone.log.current) as Session;

    expect(undone.drill.current.tally.attempts).toBe(run.drill.current.tally.attempts - 1);
    // The answer that settled the last round is gone, and the round with it.
    expect(after.rounds.length).toBeLessThan(before.rounds.length);
    expect(after.decisions.length).toBeLessThan(before.decisions.length);
    // The Session never holds more answers than the drill remembers.
    expect(computeStats(after).decisionsMade).toBeLessThanOrEqual(undone.drill.current.tally.attempts);
    expect(verifyReplay(after)).toEqual({ ok: true, problems: [] });

    // And re-answering after the undo records the round once, not twice.
    let again = undone;
    let at = AT + 10_000;
    let guard = 0;
    while (!betweenRounds(again.drill.current) && guard++ < 40) again = answer(again, at++, false);
    const replayed = drillSessionFrom(null, BS_META, again.log.current) as Session;
    expect(computeStats(replayed).roundsPlayed).toBe(computeStats(before).roundsPlayed);
    expect(verifyReplay(replayed)).toEqual({ ok: true, problems: [] });
  });

  it("appends a later run onto a resumed Session, on a Shoe of its own", () => {
    const first = drillSessionFrom(null, BS_META, playRounds(3, 10).log.current) as Session;
    const second = playRounds(4, 10);
    const resumed = drillSessionFrom(first, BS_META, second.log.current) as Session;

    expect(resumed.id).toBe(first.id);
    expect(resumed.rounds.length).toBe(first.rounds.length + second.drill.current.roundsDealt);
    expect(resumed.shoes.length).toBeGreaterThan(first.shoes.length);
    expect(verifyReplay(resumed)).toEqual({ ok: true, problems: [] });
  });

  it("has no Session at all until something is recorded", () => {
    expect(drillSessionFrom(null, BS_META, [])).toBeNull();
  });
});

describe("a Counting drill, recorded", () => {
  const META = { ...BS_META, id: "count-1", drillId: "counting" as const, startingBankroll: 0 };

  function checks(system = DEFAULT_COUNTING_CONFIG.system) {
    let run = beginRun(startCountingDrill({ ...DEFAULT_COUNTING_CONFIG, system }, 21));
    const truth: number[] = [];
    for (let i = 0; i < 6; i++) {
      for (let card = 0; card < 7; card++) run = replaceRun(run, dealNextStep(run.drill));
      const actual = countingReadout(run.drill.current).runningCount;
      truth.push(actual);
      const before = run.drill.current;
      // Right on even checks, two high on odd ones.
      const next = submitCountCheck(run.drill, i % 2 === 0 ? actual : actual + 2, AT + i);
      run = stepRun(run, next, countingRecords(before, next.current));
    }
    return { run, truth };
  }

  it("gives counting accuracy a real number — the statistic that read — everywhere", () => {
    const { run } = checks();
    const session = drillSessionFrom(null, META, run.log.current) as Session;
    const stats = computeStats(session);
    expect(stats.countChecks).toBe(6);
    expect(stats.correctCountChecks).toBe(3);
    expect(stats.countingAccuracy).toBe(0.5);
    expect(countingReport(run.drill).tally.accuracy).toBe(0.5);
    expect(session.shoes).toHaveLength(1);
    expect(session.shoes[0]?.seed).toBe(run.drill.current.shoe.seed);
    expect(session.shoes[0]?.dealtCount).toBe(42);
    expect(verifyReplay(session).ok).toBe(true);
  });

  it("records an unbalanced system's count as the player holds it", () => {
    const { run, truth } = checks(KO);
    const session = drillSessionFrom(null, { ...META, countingSystem: "KO" }, run.log.current) as Session;
    expect(session.countChecks.map((check) => check.actualRunningCount)).toEqual(truth);
    // KO starts a six-deck shoe at -20, so a truth near zero here would be the tag sum alone.
    expect(truth[0]).toBeLessThan(-10);
  });

  it("undoes a check out of the Session", () => {
    const { run } = checks();
    const undone = undoRun(run);
    const session = drillSessionFrom(null, META, undone.log.current) as Session;
    expect(session.countChecks).toHaveLength(5);
  });
});

/**
 * #27: the two drills that said NOT RECORDED. Both are played through their real engines, and
 * both Sessions go through the same fold, the same replay check and the same repository as the
 * other two drills' — with the difference that neither may open a Shoe, because neither dealt.
 */
describe("a True Count drill, recorded", () => {
  const META = { ...BS_META, id: "tc-1", drillId: "true-count" as const, startingBankroll: 0 };
  type TcRun = RecordedRun<TrueCountDrill["current"]>;

  /** Answers `count` questions: right on even ones, one point high on odd ones. */
  function answers(count: number, seed = 17): TcRun {
    let run: TcRun = beginRun(startTrueCountDrill(DEFAULT_TRUE_COUNT_CONFIG, seed));
    for (let i = 0; i < count; i++) {
      if (i > 0) run = replaceRun(run, nextTrueCountQuestion(run.drill));
      const before = run.drill.current;
      const stated = before.question.answer + (i % 2 === 0 ? 0 : 1);
      const next = submitTrueCount(run.drill, stated, AT + i);
      run = stepRun(run, next, trueCountRecords(before, next.current));
    }
    return run;
  }

  it("puts every answer in the Session as a conversion check, scored as the drill scored it", () => {
    const run = answers(7);
    const session = drillSessionFrom(null, META, run.log.current) as Session;
    const report = trueCountReport(run.drill);

    expect(session.mode).toBe("drill");
    expect(session.drillId).toBe("true-count");
    expect(session.conversionChecks).toHaveLength(7);
    const stats = computeStats(session);
    expect(stats.conversionChecks).toBe(report.tally.attempts);
    expect(stats.correctConversionChecks).toBe(report.tally.correct);
    expect(stats.trueCountAccuracy).toBeCloseTo(4 / 7);
    expect(session.conversionChecks.map((check) => check.questionIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("opens no Shoe and claims no cards, and still passes replay verification", () => {
    const session = drillSessionFrom(null, META, answers(5).log.current) as Session;

    expect(session.shoes).toEqual([]);
    expect(session.decisions).toEqual([]);
    expect(session.rounds).toEqual([]);
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

  it("takes an undone answer back out of the Session, and records a re-answer once", () => {
    const run = answers(4);
    const undone = undoRun(run);
    const after = drillSessionFrom(null, META, undone.log.current) as Session;

    expect(after.conversionChecks).toHaveLength(3);
    expect(undone.drill.current.lastResult).toBeNull();

    const before = undone.drill.current;
    const next = submitTrueCount(undone.drill, before.question.answer, AT + 99);
    const again = stepRun(undone, next, trueCountRecords(before, next.current));
    const reanswered = drillSessionFrom(null, META, again.log.current) as Session;
    expect(reanswered.conversionChecks).toHaveLength(4);
    expect(reanswered.conversionChecks[3]!.verdict).toBe("correct");
    expect(verifyReplay(reanswered).ok).toBe(true);
  });

  it("forgets the Session entirely when every answer is undone", () => {
    const run = undoRun(answers(1));
    expect(drillSessionFrom(null, META, run.log.current)).toBeNull();
  });

  it("records nothing for a move to the next question", () => {
    const run = answers(2);
    const moved = replaceRun(run, nextTrueCountQuestion(run.drill));
    expect(moved.log).toBe(run.log);
  });
});

describe("a Deviation drill, recorded", () => {
  const META = { ...BS_META, id: "dev-1", drillId: "deviation" as const, startingBankroll: 0 };
  type DevRun = RecordedRun<DeviationDrill["current"]>;

  /** Answers `count` questions, standing on every hand and taking every insurance. */
  function answers(count: number, seed = 23): DevRun {
    let run: DevRun = beginRun(startDeviationDrill(DEFAULT_DEVIATION_CONFIG, seed));
    for (let i = 0; i < count; i++) {
      if (i > 0) run = replaceRun(run, nextDeviationQuestion(run.drill));
      const before = run.drill.current;
      const action = before.question.kind === "insurance" ? "insurance" : "stand";
      const next = submitDeviation(run.drill, action, AT + i);
      run = stepRun(run, next, deviationRecords(before, next.current));
    }
    return run;
  }

  it.each([23, 5, 77])("records every answer as an index play, scored as the drill scored it (seed %i)", (seed) => {
    const run = answers(12, seed);
    const session = drillSessionFrom(null, META, run.log.current) as Session;
    const report = deviationReport(run.drill);

    expect(session.indexPlays).toHaveLength(12);
    const stats = computeStats(session);
    expect(stats.indexPlays).toBe(report.tally.attempts);
    expect(stats.correctIndexPlays).toBe(report.tally.correct);
    expect(stats.indexPlayAccuracy).toBe(report.tally.accuracy);
  });

  it("never logs a placed hand as a Decision, and never opens a Shoe for one", () => {
    const session = drillSessionFrom(null, META, answers(12).log.current) as Session;

    // The Decision log asserts its cards were dealt; these were placed (ADR-0004).
    expect(session.decisions).toEqual([]);
    expect(session.shoes).toEqual([]);
    expect(session.rounds).toEqual([]);
    expect(computeStats(session).handsPlayed).toBe(0);
    // A replay check that tried to find these cards in a Shoe would throw on a Session with
    // no Shoes; it passes instead, having checked each play's count and verdict.
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

  it("keeps each question's provenance: the cut it came from reproduces from the record", () => {
    const run = answers(8);
    const session = drillSessionFrom(null, META, run.log.current) as Session;
    const cut = session.indexPlays.filter((play) => play.cutShoeSeed !== null);
    expect(cut.length).toBeGreaterThan(0);
    for (const play of session.indexPlays) {
      expect(play.runSeed).toBe(23);
      if (play.cutShoeSeed === null) expect(play.cutPosition).toBeNull();
    }
  });

  it("takes an undone answer back out of the Session", () => {
    const run = answers(5);
    const undone = undoRun(run);
    const after = drillSessionFrom(null, META, undone.log.current) as Session;
    expect(after.indexPlays).toHaveLength(4);
    expect(computeStats(after).indexPlays).toBe(undone.drill.current.tally.attempts);
  });

  it("survives the repository and a reload, and stays out of the Play table's pointer", async () => {
    const store = createMemoryStore();
    const drills = createSessionRepository({ store: withoutActivePointer(store) });
    const session = drillSessionFrom(null, META, answers(6).log.current) as Session;
    await drills.save(session);

    const reloaded = createSessionRepository({ store });
    expect(await reloaded.load("dev-1")).toEqual(JSON.parse(JSON.stringify(session)));
    expect(await reloaded.loadActiveSession()).toBeNull();
    const [summary] = await reloaded.listSummaries();
    expect(summary!.drillId).toBe("deviation");
    expect(summary!.stats.indexPlays).toBe(6);
    expect(openDrillSessions((await reloaded.loadAll()).sessions).deviation?.id).toBe("dev-1");
  });
});

/**
 * #26 for drills: a drill whose records name their system carries its Session on across a
 * switch, and the Session must then name the new system — not the one it opened with.
 */
describe("a drill Session carried on under another Counting System", () => {
  it("names the new system from the moment the run starts, and keeps it through every undo", () => {
    const first = drillSessionFrom(null, BS_META, playRounds(3, 10).log.current) as Session;
    const change = systemChangeRecord(first, "KO", AT + 500);
    expect(change).not.toBeNull();

    let run = beginRun(
      startBasicStrategyDrill({ ...DEFAULT_BASIC_STRATEGY_CONFIG, system: KO }, 4),
      [change!],
    );
    const meta = { ...BS_META, countingSystem: "KO" };

    // Before a single answer, the carried-on Session already says KO.
    const switched = drillSessionFrom(first, meta, run.log.current) as Session;
    expect(switched.countingSystem).toBe("KO");
    expect(switched.countingSystemChanges).toMatchObject([{ from: "Hi-Lo", to: "KO", at: AT + 500 }]);

    run = deal(run, AT + 600);
    while (!betweenRounds(run.drill.current)) run = answer(run, AT + 700, false);
    const played = drillSessionFrom(first, meta, run.log.current) as Session;
    expect(played.decisions.at(-1)!.count.system).toBe("KO");
    expect(verifyReplay(played)).toEqual({ ok: true, problems: [] });

    // Undo every answer of the new run: the change sits below every undo point.
    let undone = run;
    while (canUndo(undone.drill)) undone = undoRun(undone);
    const back = drillSessionFrom(first, meta, undone.log.current) as Session;
    expect(back.countingSystem).toBe("KO");
    expect(back.decisions).toHaveLength(first.decisions.length);
  });

  it("records no change without a Session to carry on, or without a change of system", () => {
    const session = drillSessionFrom(null, BS_META, playRounds(1, 2).log.current) as Session;
    expect(systemChangeRecord(null, "KO", AT)).toBeNull();
    expect(systemChangeRecord(session, "Hi-Lo", AT)).toBeNull();
  });
});

describe("where drill Sessions are stored", () => {
  const drillSession = (id: string, drillId: string, startedAt: number): Session =>
    startSession({
      id,
      mode: "drill",
      drillId,
      rules: DEFAULT_RULES,
      countingSystem: "Hi-Lo",
      seed: 1,
      startedAt,
      startingBankroll: 0,
    });

  it("never takes the active pointer the Play table resumes from", async () => {
    const store = createMemoryStore();
    const play = createSessionRepository({ store });
    const drills = createSessionRepository({ store: withoutActivePointer(store) });

    const playing = startSession({
      id: "play-1",
      mode: "play",
      rules: DEFAULT_RULES,
      countingSystem: "Hi-Lo",
      seed: 1,
      startedAt: AT,
      startingBankroll: 1000,
    });
    await play.save(playing);
    await drills.save(drillSession("drill-1", "counting", AT + 1));
    await drills.save(endSession(drillSession("drill-2", "counting", AT + 2), "user", AT + 3));

    expect((await play.loadActiveSession())?.id).toBe("play-1");
    // …and the drill Sessions are still ordinary Sessions in the history.
    expect((await play.loadAll()).sessions.map((session) => session.id).sort()).toEqual([
      "drill-1",
      "drill-2",
      "play-1",
    ]);
  });

  it("counts drill count checks in the lifetime statistics", () => {
    const run = (() => {
      let r = beginRun(startCountingDrill(DEFAULT_COUNTING_CONFIG, 3));
      for (let i = 0; i < 5; i++) r = replaceRun(r, dealNextStep(r.drill));
      const before = r.drill.current;
      const next = submitCountCheck(r.drill, countingReadout(before).runningCount, AT);
      return stepRun(r, next, countingRecords(before, next.current));
    })();
    const recorded = drillSessionFrom(
      null,
      { ...BS_META, drillId: "counting", id: "c" },
      run.log.current,
    ) as Session;
    expect(aggregateStats([recorded]).countingAccuracy).toBe(1);
  });

  it("finds the newest open Session for each drill", () => {
    const sessions = [
      drillSession("old", "counting", AT),
      drillSession("new", "counting", AT + 5),
      endSession(drillSession("closed", "basic-strategy", AT + 9), "user", AT + 10),
      drillSession("bs", "basic-strategy", AT + 1),
    ];
    const open = openDrillSessions(sessions);
    expect(open.counting?.id).toBe("new");
    expect(open["basic-strategy"]?.id).toBe("bs");
    expect(open["true-count"]).toBeUndefined();
  });

  it("accepts records only at the Session's own table, and system where it matters", () => {
    const session = drillSession("s", "counting", AT);
    expect(sessionAccepts(session, DEFAULT_RULES, "Hi-Lo")).toBe(true);
    expect(sessionAccepts(session, DEFAULT_RULES, "KO")).toBe(false);
    expect(sessionAccepts(session, DEFAULT_RULES)).toBe(true);
    expect(sessionAccepts(session, { ...DEFAULT_RULES, decks: 2 })).toBe(false);
    expect(sessionAccepts(endSession(session, "user", AT + 1), DEFAULT_RULES)).toBe(false);
  });
});
