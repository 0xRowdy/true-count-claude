import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RULES } from "@/engine/rules";
import {
  createMemoryStore,
  createSessionRepository,
  parseArchive,
  recordConversionCheck,
  startSession,
  type Session,
} from "@/state";

function answeredSession(id: string): Session {
  return answer(
    startSession({
      id,
      mode: "drill",
      drillId: "true-count",
      rules: DEFAULT_RULES,
      countingSystem: "Hi-Lo",
      seed: 7,
      startedAt: 1_000,
      startingBankroll: 200,
    }),
  );
}

function answer(session: Session): Session {
  return recordConversionCheck(session, {
    system: "Hi-Lo",
    decks: 6,
    runningCount: 4,
    cardsRemaining: 104,
    decksRemaining: 2,
    rounding: "truncate",
    actualTrueCount: 2,
    statedTrueCount: 2,
    runSeed: 7,
    questionIndex: session.conversionChecks.length,
    at: 2_000 + session.conversionChecks.length,
  });
}

async function setup() {
  const memory = createMemoryStore();
  const store = {
    ...memory,
    getAllKeys: vi.fn(memory.getAllKeys),
    setItem: vi.fn(memory.setItem),
    removeItem: vi.fn(memory.removeItem),
  };
  // Only replace the platform adapter. Exercise the real queue, repository and backup path.
  vi.doMock("@/state/asyncStorage", () => ({ createAsyncStorageStore: () => store }));
  const drills = await import("./drillSessionStore");
  const { createSessionBackup } = await import("../session/sessionStore");
  return { store, drills, createSessionBackup, repository: createSessionRepository({ store }) };
}

beforeEach(() => vi.resetModules());

describe("drill write recovery before a session backup", () => {
  it("allows a fresh backup read after the initial history read failed", async () => {
    const { store, drills, createSessionBackup, repository } = await setup();
    const saved = answeredSession("saved");
    await repository.save(saved);
    store.getAllKeys.mockRejectedValueOnce(new Error("History temporarily unavailable"));
    drills.loadOpenDrillSessions();
    // Let the initial load finish before requesting a backup with its own fresh read.
    await repository.loadAll();
    const backup = await createSessionBackup();
    const archive = parseArchive(backup.contents);
    expect(archive.ok && archive.sessions).toEqual([saved]);
  });

  it("exports the latest complete snapshot after the same session's failed write recovers", async () => {
    const { store, drills, createSessionBackup, repository } = await setup();
    const first = answeredSession("first");
    store.setItem.mockRejectedValueOnce(new Error("Storage temporarily unavailable"));
    drills.saveDrillSession("true-count", first);
    await expect(createSessionBackup()).rejects.toThrow("Storage temporarily unavailable");
    expect(await repository.load(first.id)).toBeNull();

    const latest = answer(first);
    drills.saveDrillSession("true-count", latest);
    const backup = await createSessionBackup();
    expect(backup.count).toBe(1);
    const archive = parseArchive(backup.contents);
    expect(archive.ok && archive.sessions).toEqual([latest]);
  });

  it("does not clear another session's unsaved data when a later session succeeds", async () => {
    const { store, drills, createSessionBackup, repository } = await setup();
    const first = answeredSession("first");
    const second = answeredSession("second");
    store.setItem.mockRejectedValueOnce(new Error("First session was not saved"));
    drills.saveDrillSession("true-count", first);
    drills.saveDrillSession("true-count", second);
    await expect(createSessionBackup()).rejects.toThrow("First session was not saved");
    expect(await repository.load(first.id)).toBeNull();
    expect(await repository.load(second.id)).toEqual(second);

    drills.endDrillSession("true-count", first);
    await expect(createSessionBackup()).resolves.toMatchObject({ count: 2 });
  });

  it("keeps a failed undo deletion blocking backups until that session is removed", async () => {
    const { store, drills, createSessionBackup, repository } = await setup();
    const first = answeredSession("first");
    drills.saveDrillSession("true-count", first);
    await drills.flushDrillSessionWrites();
    store.removeItem.mockRejectedValueOnce(new Error("Undo was not saved"));
    drills.discardDrillSession("true-count", first.id);
    drills.saveDrillSession("true-count", answeredSession("second"));
    await expect(createSessionBackup()).rejects.toThrow("Undo was not saved");
    expect(await repository.load(first.id)).toEqual(first);

    drills.discardDrillSession("true-count", first.id);
    await expect(createSessionBackup()).resolves.toMatchObject({ count: 1 });
    expect(await repository.load(first.id)).toBeNull();
  });

  it("does not mistake a successful history load for recovery of an unsaved session", async () => {
    const { store, drills, createSessionBackup, repository } = await setup();
    store.setItem.mockRejectedValueOnce(new Error("Answer was not saved"));
    drills.saveDrillSession("true-count", answeredSession("first"));
    await expect(createSessionBackup()).rejects.toThrow("Answer was not saved");
    drills.loadOpenDrillSessions();
    await repository.loadAll();
    await expect(createSessionBackup()).rejects.toThrow("Answer was not saved");
  });
});
