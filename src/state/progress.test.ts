import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/engine";
import type { Card } from "@/engine/cards";
import { buildSession } from "./fixtures";
import {
  EMPTY_PROGRESS,
  PROGRESS_KEY,
  PROGRESS_LIMITS,
  type ProgressRepository,
  type ProgressState,
  blackjackCategory,
  blackjackProgress,
  blackjackStrategyName,
  createProgressRepository,
  createProgressStore,
  endProgressSession,
  mergeProgress,
  parseProgress,
  recordDecision,
  recordHand,
  resetPracticeBankroll,
  serializeProgress,
  startProgressSession,
} from "./progress";
import { bankroll } from "./progressSelectors";
import { endSession } from "./session";
import { createMemoryStore } from "./store";

const when = (at: number, day = "2026-10-13") => ({ at, day });
const c = (rank: Card["rank"], suit: Card["suit"] = "s"): Card => ({ rank, suit });

describe("recording", () => {
  it("records a decision with its category, coaching flag and time", () => {
    const s = recordDecision(
      EMPTY_PROGRESS,
      { game: "craps", category: "odds", correct: false, coached: true },
      when(1),
    );
    expect(s.decisions).toEqual([
      {
        game: "craps",
        category: "odds",
        correct: false,
        coached: true,
        at: 1,
        day: "2026-10-13",
        sessionId: null,
      },
    ]);
    expect(EMPTY_PROGRESS.decisions).toHaveLength(0);
  });

  it("defaults coached to false", () => {
    const s = recordDecision(
      EMPTY_PROGRESS,
      { game: "roulette", category: "inside", correct: true },
      when(1),
    );
    expect(s.decisions[0]!.coached).toBe(false);
  });

  it("rejects unknown categories, games and invalid times", () => {
    expect(() =>
      recordDecision(EMPTY_PROGRESS, { game: "craps", category: "soft", correct: true }, when(1)),
    ).toThrow();
    expect(() =>
      recordDecision(
        EMPTY_PROGRESS,
        { game: "poker" as never, category: "x", correct: true },
        when(1),
      ),
    ).toThrow();
    expect(() =>
      recordHand(EMPTY_PROGRESS, { game: "craps", net: 5 }, { at: 1, day: "13/10/2026" }),
    ).toThrow();
    expect(() => recordHand(EMPTY_PROGRESS, { game: "craps", net: Number.NaN }, when(1))).toThrow();
  });

  it("attaches records to the open session of their game only", () => {
    let s = startProgressSession(EMPTY_PROGRESS, { id: "a", game: "craps" }, when(1));
    s = recordDecision(s, { game: "craps", category: "line", correct: true }, when(2));
    s = recordDecision(s, { game: "roulette", category: "inside", correct: true }, when(3));
    s = recordHand(s, { game: "craps", net: 10, strategyName: "Iron Cross" }, when(4));
    expect(s.decisions.map((d) => d.sessionId)).toEqual(["a", null]);
    expect(s.hands[0]!.sessionId).toBe("a");
    // The first named hand names the session.
    expect(s.sessions[0]!.strategyName).toBe("Iron Cross");
    s = endProgressSession(s, "a", when(9));
    s = recordHand(s, { game: "craps", net: -10 }, when(10));
    expect(s.hands[1]!.sessionId).toBeNull();
  });

  it("keeps one open session per game and ignores a repeated id", () => {
    let s = startProgressSession(EMPTY_PROGRESS, { id: "a", game: "craps" }, when(1));
    s = startProgressSession(s, { id: "b", game: "craps" }, when(5));
    expect(s.sessions.map((x) => [x.id, x.endedAt])).toEqual([
      ["a", 5],
      ["b", null],
    ]);
    expect(startProgressSession(s, { id: "b", game: "craps" }, when(6))).toBe(s);
  });

  it("ends a session idempotently and never before it started", () => {
    let s = startProgressSession(EMPTY_PROGRESS, { id: "a", game: "baccarat" }, when(100));
    s = endProgressSession(s, "a", when(50));
    expect(s.sessions[0]!.endedAt).toBe(100);
    expect(endProgressSession(s, "a", when(200))).toBe(s);
    expect(endProgressSession(s, "zzz", when(200))).toBe(s);
  });

  it("trims the oldest hands into the bankroll base so the balance stays exact", () => {
    let s: ProgressState = {
      ...EMPTY_PROGRESS,
      hands: Array.from({ length: PROGRESS_LIMITS.hands }, (_, i) => ({
        game: "craps" as const,
        net: 1,
        strategyName: null,
        at: i,
        day: "2026-10-01",
        sessionId: null,
      })),
    };
    const before = bankroll(s, "craps");
    s = recordHand(s, { game: "craps", net: 5 }, when(PROGRESS_LIMITS.hands + 1));
    expect(s.hands).toHaveLength(PROGRESS_LIMITS.hands);
    expect(s.bankrollBase.craps).toBe(1);
    expect(bankroll(s, "craps")).toBe(before + 5);
  });

  it("resets one game's bankroll to the start without touching its hands or other games", () => {
    let s = recordHand(EMPTY_PROGRESS, { game: "roulette", net: -1995 }, when(1));
    s = recordHand(s, { game: "roulette", net: -5 }, when(2));
    s = recordHand(s, { game: "craps", net: 40 }, when(3));
    expect(bankroll(s, "roulette")).toBe(0);
    const reset = resetPracticeBankroll(s, "roulette");
    expect(bankroll(reset, "roulette")).toBe(2000);
    expect(bankroll(reset, "craps")).toBe(2040);
    expect(reset.hands).toBe(s.hands);
    const after = recordHand(reset, { game: "roulette", net: 35 }, when(4));
    expect(bankroll(after, "roulette")).toBe(2035);
    expect(bankroll(parseProgress(serializeProgress(after))!, "roulette")).toBe(2035);
  });
});

describe("blackjack bridge", () => {
  it("categorises plays", () => {
    const base = { soft: false, actionTaken: "stand", correctAction: "stand" } as const;
    expect(blackjackCategory({ ...base, cards: [c("10"), c("6")] })).toBe("hard");
    expect(blackjackCategory({ ...base, soft: true, cards: [c("A"), c("7")] })).toBe("soft");
    expect(blackjackCategory({ ...base, cards: [c("8"), c("8", "h")] })).toBe("pairs");
    expect(blackjackCategory({ ...base, cards: [c("K"), c("10")] })).toBe("pairs");
    expect(blackjackCategory({ ...base, cards: [c("6"), c("5")], correctAction: "double" })).toBe(
      "doubles",
    );
    expect(
      blackjackCategory({ ...base, cards: [c("A"), c("6")], soft: true, actionTaken: "double" }),
    ).toBe("doubles");
    expect(
      blackjackCategory({ ...base, cards: [c("10"), c("6")], correctAction: "surrender" }),
    ).toBe("insurance-surrender");
    expect(
      blackjackCategory({ ...base, cards: [c("10"), c("9")], actionTaken: "decline-insurance" }),
    ).toBe("insurance-surrender");
    expect(blackjackCategory({ ...base, cards: [], insurance: true })).toBe("insurance-surrender");
  });

  it("converts the Session log into decisions, hands and a session", () => {
    const session = endSession(buildSession({ id: "s1", rounds: 9 }), "user", 1_700_000_900_000);
    const p = blackjackProgress([session], () => "2026-10-12");
    expect(p.decisions).toHaveLength(session.decisions.length);
    expect(p.decisions.filter((d) => !d.correct)).toHaveLength(
      session.decisions.filter((d) => d.verdict === "incorrect").length,
    );
    expect(p.decisions.every((d) => d.coached === !d.correct)).toBe(true);
    const handCount = session.rounds.reduce((n, r) => n + r.hands.length, 0);
    expect(p.hands).toHaveLength(handCount);
    expect(p.hands.reduce((n, h) => n + h.net, 0)).toBe(
      session.rounds.reduce((n, r) => n + r.net, 0),
    );
    expect(p.sessions).toEqual([
      {
        id: "bj:s1",
        game: "blackjack",
        strategyName: "Basic Strategy · 6D H17",
        startedAt: session.startedAt,
        endedAt: 1_700_000_900_000,
        day: "2026-10-12",
      },
    ]);
    expect(p.decisions.every((d) => d.sessionId === "bj:s1" && d.day === "2026-10-12")).toBe(true);
  });

  it("counts drill decisions but not drill chips", () => {
    const played = endSession(buildSession({ id: "d1", rounds: 6 }), "user", 1_700_000_900_000);
    const drill = { ...played, mode: "drill" as const, drillId: "basic-strategy" };
    const p = blackjackProgress([drill], () => "2026-10-12");
    expect(p.decisions).toHaveLength(drill.decisions.length);
    expect(p.hands).toEqual([]);
    expect(p.sessions).toHaveLength(1);
  });

  it("labels index plays soft only for a real soft total", () => {
    const base = endSession(buildSession({ id: "ip", rounds: 0 }), "user", 2);
    const play = (cards: Card[]) =>
      ({
        index: 0,
        entryId: "x",
        entryLabel: "x",
        indexNumber: 0,
        system: "Hi-Lo",
        kind: "hand",
        placedCards: cards,
        dealerUpcard: c("9"),
        runningCount: 0,
        cardsRemaining: 52,
        rounding: "truncate",
        trueCount: 0,
        firing: false,
        actionTaken: "stand",
        correctAction: "stand",
        basicStrategyAction: "stand",
        verdict: "correct",
        runSeed: 1,
        questionIndex: 0,
        cutShoeSeed: null,
        cutPosition: null,
        at: 1,
      }) as const;
    const session = {
      ...base,
      indexPlays: [play([c("A"), c("6", "h"), c("10")]), play([c("A"), c("7", "h")])],
    };
    const p = blackjackProgress([session], () => "2026-10-12");
    expect(p.decisions.map((d) => d.category)).toEqual(["hard", "soft"]);
  });

  it("skips discarded and empty Sessions", () => {
    const discarded = endSession(buildSession({ id: "d", rounds: 3 }), "discarded", 2);
    const empty = buildSession({ id: "e", rounds: 0 });
    expect(blackjackProgress([discarded, empty], () => "2026-10-12").sessions).toEqual([]);
  });

  it("names drills and S17 tables", () => {
    const s = buildSession({
      id: "x",
      rounds: 0,
      rules: { ...DEFAULT_RULES, dealerSoft17: "stand" },
    });
    expect(blackjackStrategyName(s)).toBe("Basic Strategy · 6D S17");
    expect(blackjackStrategyName({ ...s, mode: "drill", drillId: "basic-strategy" })).toBe(
      "Basic Strategy drill · 6D S17",
    );
  });

  it("merges parts in time order and sums bankroll bases", () => {
    const a: ProgressState = {
      ...recordHand(EMPTY_PROGRESS, { game: "craps", net: 1 }, when(5)),
      bankrollBase: { craps: 10 },
    };
    const b: ProgressState = {
      ...recordHand(EMPTY_PROGRESS, { game: "craps", net: 2 }, when(3)),
      bankrollBase: { craps: 5 },
    };
    const m = mergeProgress(a, b);
    expect(m.hands.map((h) => h.at)).toEqual([3, 5]);
    expect(m.bankrollBase.craps).toBe(15);
  });
});

describe("persistence", () => {
  it("round-trips through the store", async () => {
    const kv = createMemoryStore();
    const repo = createProgressRepository(kv);
    let s = startProgressSession(EMPTY_PROGRESS, { id: "a", game: "craps" }, when(1));
    s = recordDecision(s, { game: "craps", category: "odds", correct: true }, when(2));
    s = recordHand(s, { game: "craps", net: 15 }, when(3));
    await repo.save(s);
    expect(await kv.getItem(PROGRESS_KEY)).toBe(serializeProgress(s));
    expect(await repo.load()).toEqual(s);
    await repo.clear();
    expect(await repo.load()).toBeUndefined();
  });

  it("drops malformed entries and refuses unknown versions", () => {
    expect(parseProgress(null)).toBeUndefined();
    expect(parseProgress("{nope")).toBeUndefined();
    expect(parseProgress(JSON.stringify({ version: 2 }))).toBeUndefined();
    const parsed = parseProgress(
      JSON.stringify({
        version: 1,
        decisions: [
          { game: "craps", category: "odds", correct: true, at: 1, day: "2026-10-01" },
          { game: "craps", category: "soft", correct: true, at: 1, day: "2026-10-01" },
          { game: "craps", category: "odds", correct: "yes", at: 1, day: "2026-10-01" },
        ],
        hands: [
          { game: "roulette", net: 5, at: 2, day: "bad" },
          { game: "roulette", net: -5, at: 2, day: "2026-10-01" },
        ],
        sessions: [
          { id: "x", game: "craps", startedAt: 1, endedAt: null, day: "2026-10-01" },
          { id: 3 },
        ],
        bankrollBase: { craps: 7, poker: 9, roulette: "x" },
      }),
    )!;
    expect(parsed.decisions).toHaveLength(1);
    expect(parsed.decisions[0]!.coached).toBe(false);
    expect(parsed.hands).toHaveLength(1);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.bankrollBase).toEqual({ craps: 7 });
  });
});

describe("store", () => {
  const hand = (net: number, at: number) => (s: ProgressState) =>
    recordHand(s, { game: "craps", net }, when(at));

  function deferredRepo(stored: ProgressState | undefined) {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const saved: ProgressState[] = [];
    let cleared = 0;
    const repo: ProgressRepository = {
      load: () => gate.then(() => stored),
      save: async (s) => {
        saved.push(s);
      },
      clear: async () => {
        cleared++;
      },
    };
    return { repo, saved, release, cleared: () => cleared };
  }

  it("starts loading with a fixed initial snapshot and loads stored progress", async () => {
    const stored = hand(10, 1)(EMPTY_PROGRESS);
    const { repo, release } = deferredRepo(stored);
    const store = createProgressStore(repo);
    expect(store.snapshot()).toMatchObject({ ready: false, status: "loading" });
    const loading = store.load();
    release();
    await loading;
    expect(store.snapshot()).toEqual({ progress: stored, ready: true, status: "stored" });
  });

  it("replays early changes over the stored state instead of writing over it", async () => {
    const stored = hand(10, 1)(EMPTY_PROGRESS);
    const { repo, release, saved } = deferredRepo(stored);
    const store = createProgressStore(repo);
    const seen: number[] = [];
    store.subscribe(() => seen.push(store.snapshot().progress.hands.length));
    const early = store.apply(hand(-5, 2));
    expect(saved).toHaveLength(0);
    release();
    await early;
    expect(store.snapshot().progress.hands.map((h) => h.net)).toEqual([10, -5]);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.hands).toHaveLength(2);
    expect(seen[0]).toBe(1); // optimistic, before storage answered
  });

  it("persists changes after load", async () => {
    const { repo, release, saved } = deferredRepo(undefined);
    const store = createProgressStore(repo);
    release();
    await store.load();
    expect(store.snapshot().status).toBe("empty");
    await store.apply(hand(5, 1));
    expect(store.snapshot().status).toBe("stored");
    expect(saved.at(-1)!.hands).toHaveLength(1);
    await store.clear();
    expect(store.snapshot()).toMatchObject({ status: "empty", progress: EMPTY_PROGRESS });
  });

  it("an early clear wins over stored data and pending changes", async () => {
    const { repo, release, cleared } = deferredRepo(hand(10, 1)(EMPTY_PROGRESS));
    const store = createProgressStore(repo);
    void store.apply(hand(3, 2));
    const p = store.clear();
    release();
    await p;
    expect(store.snapshot().progress).toEqual(EMPTY_PROGRESS);
    expect(cleared()).toBe(1);
  });

  it("a throwing early change throws to the caller, is never queued, and the store still loads", async () => {
    const { repo, release, saved } = deferredRepo(hand(10, 1)(EMPTY_PROGRESS));
    const store = createProgressStore(repo);
    const bad = (s: ProgressState) =>
      recordDecision(s, { game: "roulette", category: "soft", correct: true }, when(2));
    expect(() => store.apply(bad)).toThrow(/unknown category/);
    const good = store.apply(hand(-5, 3));
    release();
    await good;
    expect(store.snapshot()).toMatchObject({ ready: true, status: "stored" });
    expect(store.snapshot().progress.hands.map((h) => h.net)).toEqual([10, -5]);
    expect(saved.at(-1)!.hands).toHaveLength(2);
    expect(saved.at(-1)!.decisions).toHaveLength(0);
  });

  it("replay skips and drops a change that throws only on the stored state", async () => {
    const stored = startProgressSession(EMPTY_PROGRESS, { id: "x", game: "craps" }, when(1));
    const { repo, release, saved } = deferredRepo(stored);
    const store = createProgressStore(repo);
    let calls = 0;
    // Fine on the empty initial state, throws on the stored one.
    const flaky = (s: ProgressState) => {
      calls++;
      if (s.sessions.length > 0) throw new Error("boom");
      return s;
    };
    void store.apply(flaky);
    const good = store.apply(hand(7, 2));
    release();
    await good;
    expect(calls).toBe(2);
    expect(store.snapshot()).toMatchObject({ ready: true, status: "stored" });
    expect(store.snapshot().progress.hands.map((h) => h.net)).toEqual([7]);
    expect(saved.at(-1)!.sessions).toHaveLength(1);
  });

  it("keeps working when storage fails", async () => {
    const repo: ProgressRepository = {
      load: () => Promise.reject(new Error("no storage")),
      save: () => Promise.reject(new Error("no storage")),
      clear: () => Promise.resolve(),
    };
    const store = createProgressStore(repo);
    void store.apply(hand(4, 1));
    await store.load();
    expect(store.snapshot()).toMatchObject({ ready: true, status: "unavailable" });
    expect(store.snapshot().progress.hands).toHaveLength(1);
    await store.apply(hand(4, 2));
    expect(store.snapshot().progress.hands).toHaveLength(2);
    expect(store.snapshot().status).toBe("unavailable");
  });
});
