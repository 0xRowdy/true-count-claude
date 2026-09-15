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
  type RecordedRun,
  basicStrategyRecords,
  beginRun,
  countingRecords,
  dealtRoundRecords,
  drillSessionFrom,
  openDrillSessions,
  replaceRun,
  sessionAccepts,
  stepRun,
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
