import { describe, expect, it } from "vitest";
import { V1_COUNT_CASES, buildSession, buildV1Session } from "./fixtures";
import { DEFAULT_KEY_PREFIX, createSessionRepository } from "./repository";
import { type Migration, SESSION_MIGRATIONS } from "./schema";
import { endSession } from "./session";
import { createMemoryStore } from "./store";

/**
 * Every test here runs against an injected in-memory store, in plain Node, with no
 * AsyncStorage and nothing mocked. The AsyncStorage adapter is a four-line delegation
 * (`asyncStorage.ts`) precisely so that this is possible.
 */

describe("saving and restoring Sessions", () => {
  it("round-trips a Session through storage", async () => {
    const store = createMemoryStore();
    const repository = createSessionRepository({ store });
    const session = buildSession({ rounds: 4, seed: 61 });

    await repository.save(session);
    const loaded = await repository.load(session.id);

    expect(loaded).toEqual(JSON.parse(JSON.stringify(session)));
  });

  it("survives an app restart — a new repository over the same store sees everything", async () => {
    const store = createMemoryStore();
    const first = createSessionRepository({ store });
    await first.save(buildSession({ id: "a", rounds: 2, startedAt: 1_000 }));
    await first.save(buildSession({ id: "b", rounds: 2, startedAt: 2_000 }));

    // Relaunch: fresh repository, same device storage.
    const afterRestart = createSessionRepository({ store });
    const { sessions } = await afterRestart.loadAll();

    expect(sessions.map((session) => session.id)).toEqual(["b", "a"]);
  });

  it("returns null for a Session that was never saved", async () => {
    const repository = createSessionRepository({ store: createMemoryStore() });
    expect(await repository.load("nope")).toBeNull();
  });

  it("lists summaries newest first without the caller touching the log", async () => {
    const repository = createSessionRepository({ store: createMemoryStore() });
    await repository.save(buildSession({ id: "old", rounds: 3, startedAt: 1_000 }));
    await repository.save(buildSession({ id: "new", rounds: 6, startedAt: 5_000 }));

    const summaries = await repository.listSummaries();

    expect(summaries.map((summary) => summary.id)).toEqual(["new", "old"]);
    expect(summaries[0]!.stats.decisionsMade).toBe(6);
    expect(summaries[0]!.active).toBe(true);
  });

  it("isolates a corrupt record instead of losing the whole history", async () => {
    const store = createMemoryStore();
    const repository = createSessionRepository({ store });
    await repository.save(buildSession({ id: "good", rounds: 2 }));
    await store.setItem(`${DEFAULT_KEY_PREFIX}/session/broken`, "{ truncated");

    const { sessions, unreadable } = await repository.loadAll();

    expect(sessions.map((session) => session.id)).toEqual(["good"]);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]!.reason).toMatch(/Not valid JSON/);
  });

  it("removes one Session and clears them all", async () => {
    const store = createMemoryStore();
    const repository = createSessionRepository({ store });
    await repository.save(buildSession({ id: "a", rounds: 1 }));
    await repository.save(buildSession({ id: "b", rounds: 1 }));

    await repository.remove("a");
    expect((await repository.loadAll()).sessions.map((s) => s.id)).toEqual(["b"]);

    await repository.clear();
    expect((await repository.loadAll()).sessions).toEqual([]);
    expect(await store.getAllKeys()).toEqual([]);
  });
});

/**
 * The unfinished Session must be findable after a restart, and must disappear the instant —
 * and only the instant — the user explicitly ends it. ADR-0003.
 */
describe("the active Session pointer", () => {
  it("finds the unfinished Session after a restart", async () => {
    const store = createMemoryStore();
    await createSessionRepository({ store }).save(buildSession({ id: "live", rounds: 3 }));

    const active = await createSessionRepository({ store }).loadActiveSession();

    expect(active?.id).toBe("live");
    expect(active?.endedAt).toBeNull();
  });

  it("clears once the Session is explicitly ended and saved", async () => {
    const store = createMemoryStore();
    const repository = createSessionRepository({ store });
    const session = buildSession({ id: "live", rounds: 3 });
    await repository.save(session);

    await repository.save(endSession(session, "user", 99_000));

    expect(await repository.loadActiveSession()).toBeNull();
    // Ended, not deleted: the statistics and the Decision log stay in history.
    expect((await repository.load("live"))?.endReason).toBe("user");
  });

  it("treats a pointer to a deleted Session as stale rather than as a resume", async () => {
    const store = createMemoryStore();
    const repository = createSessionRepository({ store });
    await repository.save(buildSession({ id: "live", rounds: 1 }));

    await repository.remove("live");

    expect(await repository.loadActiveSession()).toBeNull();
  });
});

describe("export and import", () => {
  it("exports readable JSON and imports it into a clean device", async () => {
    const source = createSessionRepository({ store: createMemoryStore() });
    await source.save(endSession(buildSession({ id: "a", rounds: 3 }), "user", 20_000));
    await source.save(endSession(buildSession({ id: "b", rounds: 5 }), "user", 30_000));

    const json = await source.exportAll(50_000);
    expect(json).toContain("true-count.sessions");

    const destination = createSessionRepository({ store: createMemoryStore() });
    const report = await destination.importArchive(json);

    expect([...report.imported].sort()).toEqual(["a", "b"]);
    expect(report.unreadable).toEqual([]);
    expect((await destination.loadAll()).sessions).toHaveLength(2);
  });

  it("an import never destroys local history unless asked to", async () => {
    const store = createMemoryStore();
    const repository = createSessionRepository({ store });
    const local = endSession(buildSession({ id: "a", rounds: 6, seed: 1 }), "user", 10_000);
    await repository.save(local);

    const incoming = createSessionRepository({ store: createMemoryStore() });
    await incoming.save(endSession(buildSession({ id: "a", rounds: 2, seed: 2 }), "user", 1));
    const archive = await incoming.exportAll(2);

    const skipped = await repository.importArchive(archive);
    expect(skipped.skippedExisting).toEqual(["a"]);
    expect((await repository.load("a"))?.decisions).toHaveLength(6);

    const overwritten = await repository.importArchive(archive, { overwrite: true });
    expect(overwritten.imported).toEqual(["a"]);
    expect((await repository.load("a"))?.decisions).toHaveLength(2);
  });

  it("an imported unfinished Session does not become this device's active Session", async () => {
    const incoming = createSessionRepository({ store: createMemoryStore() });
    await incoming.save(buildSession({ id: "someone-elses", rounds: 2 }));
    const archive = await incoming.exportAll(1);

    const destination = createSessionRepository({ store: createMemoryStore() });
    await destination.importArchive(archive);

    expect(await destination.loadActiveSession()).toBeNull();
    expect(await destination.load("someone-elses")).not.toBeNull();
  });

  it("reports a file that is not a True Count archive", async () => {
    const repository = createSessionRepository({ store: createMemoryStore() });
    const report = await repository.importArchive(JSON.stringify({ format: "something-else" }));

    expect(report.imported).toEqual([]);
    expect(report.unreadable[0]!.reason).toMatch(/Not a True Count archive/);
  });
});

/**
 * The migration chain is injected, so this exercises a real upgrade through the same read
 * path the app uses — not a parallel test-only one.
 */
describe("reading through a migration chain", () => {
  /** A future step on top of the shipped chain, standing in for the next shape change. */
  const ADD_NOTE: Migration = {
    from: 2,
    to: 3,
    describe: "2→3: add a per-Session note",
    migrate: (data) => ({ ...(data as object), note: "" }),
  };
  const V3_CHAIN = [...SESSION_MIGRATIONS, ADD_NOTE];

  /** A repository as the version 1 build configured it: it wrote v1 and knew no migrations. */
  const v1Build = (store: ReturnType<typeof createMemoryStore>) =>
    createSessionRepository({ store, migrations: [], schemaVersion: 1 });

  it("upgrades a stored v1 Session on read, telling a stand-in 0 from a real 0", async () => {
    const store = createMemoryStore();
    // Written by the v1 build, stand-in zeros and all.
    await v1Build(store).save(buildV1Session({ id: "old" }));
    const stored = JSON.parse((await store.getItem(`${DEFAULT_KEY_PREFIX}/session/old`))!);
    expect(stored.schemaVersion).toBe(1);

    // This build reads the same device storage, through the app's own read path.
    const upgraded = await createSessionRepository({ store }).load("old");

    expect(upgraded).not.toBeNull();
    expect(upgraded!.decisions.map((decision) => decision.count)).toEqual([
      { ...V1_COUNT_CASES.koStandIn, trueCount: null },
      { ...V1_COUNT_CASES.red7StandIn, trueCount: null },
      { ...V1_COUNT_CASES.exhaustedStandIn, trueCount: null },
      // A balanced system's genuine True Count of 0 is a count, not an absence.
      V1_COUNT_CASES.hiLoRealZero,
      V1_COUNT_CASES.zenRealZero,
      V1_COUNT_CASES.omegaNonZero,
    ]);
  });

  it("persists the upgrade as a v2 record once the Session is saved again", async () => {
    const store = createMemoryStore();
    await v1Build(store).save(buildV1Session({ id: "old" }));

    const repository = createSessionRepository({ store });
    await repository.save((await repository.load("old"))!);

    const raw = JSON.parse((await store.getItem(`${DEFAULT_KEY_PREFIX}/session/old`))!);
    expect(raw.schemaVersion).toBe(2);
    expect(raw.data.decisions[0].count.trueCount).toBeNull();
    expect(raw.data.decisions[3].count.trueCount).toBe(0);
    // And it reads back unchanged, with no migration left to run.
    expect(await createSessionRepository({ store }).load("old")).toEqual(
      await repository.load("old"),
    );
  });

  it("walks a stored v1 Session through every later step too", async () => {
    const store = createMemoryStore();
    await v1Build(store).save(buildV1Session({ id: "old" }));

    const v3 = createSessionRepository({ store, migrations: V3_CHAIN, schemaVersion: 3 });
    const upgraded = await v3.load("old");

    expect(upgraded).not.toBeNull();
    expect((upgraded as unknown as { note: string }).note).toBe("");
    expect(upgraded!.decisions[0]!.count.trueCount).toBeNull();
    expect(upgraded!.decisions[3]!.count.trueCount).toBe(0);
  });

  it("refuses to read a newer record from an older build rather than dropping fields", async () => {
    const store = createMemoryStore();
    const v3 = createSessionRepository({ store, migrations: V3_CHAIN, schemaVersion: 3 });
    await v3.save(buildSession({ id: "future", rounds: 1 }));

    const current = createSessionRepository({ store });
    const { sessions, unreadable } = await current.loadAll();

    expect(sessions).toEqual([]);
    expect(unreadable[0]!.reason).toMatch(/newer than this build understands/);
  });
});
