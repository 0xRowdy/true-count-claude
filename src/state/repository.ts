/**
 * The Session repository — everything that actually touches storage.
 *
 * One key per Session, each holding its own versioned record, plus one pointer key naming
 * the Session still in progress. Per-Session keys keep a single write small (Android's
 * AsyncStorage is SQLite-backed and unhappy with multi-megabyte values) and keep one
 * corrupt record from taking the history down with it.
 *
 * The store is injected (`store.ts`), as is the migration chain, so every test in this
 * module runs in plain Node with no AsyncStorage and no mocking.
 */

import { type SessionArchive, createArchive, parseArchive, serializeArchive } from "./archive";
import {
  CURRENT_SCHEMA_VERSION,
  type Migration,
  type PersistedRecord,
  SESSION_MIGRATIONS,
  decodeSession,
} from "./schema";
import { type SessionSummary, summarize } from "./stats";
import type { KeyValueStore } from "./store";
import type { Session } from "./types";

export const DEFAULT_KEY_PREFIX = "truecount/v1";

export interface RepositoryConfig {
  readonly store: KeyValueStore;
  /**
   * The upgrade path to run on read. Defaults to the shipped chain; injectable so a test
   * can exercise a real upgrade end-to-end through the same code the app uses.
   */
  readonly migrations?: readonly Migration[];
  /** The version this repository writes and migrates toward. Defaults to the current one. */
  readonly schemaVersion?: number;
  readonly keyPrefix?: string;
}

/** A record that could not be read. Surfaced, never swallowed. */
export interface UnreadableRecord {
  readonly key: string;
  readonly reason: string;
}

export interface LoadResult {
  readonly sessions: readonly Session[];
  readonly unreadable: readonly UnreadableRecord[];
}

export interface ImportReport {
  readonly imported: readonly string[];
  /** Ids already present locally and left alone, unless `overwrite` was set. */
  readonly skippedExisting: readonly string[];
  /** Entries in the archive that could not be read at all. */
  readonly unreadable: readonly UnreadableRecord[];
  readonly applied: readonly string[];
}

export interface SessionRepository {
  save(session: Session): Promise<void>;
  load(id: string): Promise<Session | null>;
  loadAll(): Promise<LoadResult>;
  listSummaries(): Promise<readonly SessionSummary[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  /** The Session still in progress after an app restart, or null. */
  loadActiveSession(): Promise<Session | null>;
  exportAll(exportedAt: number): Promise<string>;
  /** Parsed form of the same export, for the Shoe Integrity Panel (#9). */
  exportArchive(exportedAt: number): Promise<SessionArchive>;
  importArchive(raw: string, options?: ImportOptions): Promise<ImportReport>;
}

export interface ImportOptions {
  /** Replace local Sessions that share an id. Off by default: an import never destroys. */
  readonly overwrite?: boolean;
}

export function createSessionRepository(config: RepositoryConfig): SessionRepository {
  const { store } = config;
  const migrations = config.migrations ?? SESSION_MIGRATIONS;
  const target = config.schemaVersion ?? CURRENT_SCHEMA_VERSION;
  const prefix = config.keyPrefix ?? DEFAULT_KEY_PREFIX;

  const sessionKey = (id: string) => `${prefix}/session/${id}`;
  const activeKey = `${prefix}/active`;

  const write = async (session: Session): Promise<void> => {
    const record: PersistedRecord<Session> = {
      schemaVersion: target,
      kind: "session",
      data: session,
    };
    await store.setItem(sessionKey(session.id), JSON.stringify(record));
  };

  const read = async (key: string): Promise<Session | UnreadableRecord> => {
    const raw = await store.getItem(key);
    if (raw === null) return { key, reason: "Key disappeared between listing and reading." };
    const outcome = decodeSession(raw, migrations, target);
    return outcome.ok ? outcome.session : { key, reason: outcome.reason };
  };

  const sessionKeys = async (): Promise<string[]> => {
    const keys = await store.getAllKeys();
    return keys.filter((key) => key.startsWith(`${prefix}/session/`));
  };

  const save = async (session: Session): Promise<void> => {
    await write(session);
    // The pointer follows `endedAt`; it never decides it. A Session ends when `endSession`
    // is called and at no other time (ADR-0003).
    if (session.endedAt === null) {
      await store.setItem(activeKey, session.id);
    } else if ((await store.getItem(activeKey)) === session.id) {
      await store.removeItem(activeKey);
    }
  };

  const load = async (id: string): Promise<Session | null> => {
    const result = await read(sessionKey(id));
    return isSessionResult(result) ? result : null;
  };

  const loadAll = async (): Promise<LoadResult> => {
    const sessions: Session[] = [];
    const unreadable: UnreadableRecord[] = [];
    for (const key of await sessionKeys()) {
      const result = await read(key);
      if (isSessionResult(result)) sessions.push(result);
      else unreadable.push(result);
    }
    // Most recent first — the history screen's order, and the order a user expects.
    sessions.sort((a, b) => b.startedAt - a.startedAt);
    return { sessions, unreadable };
  };

  const exportArchive = async (exportedAt: number): Promise<SessionArchive> => {
    const { sessions } = await loadAll();
    return createArchive(sessions, exportedAt);
  };

  const importArchive = async (raw: string, options?: ImportOptions): Promise<ImportReport> => {
    const parsed = parseArchive(raw, migrations, target);
    if (!parsed.ok) {
      return {
        imported: [],
        skippedExisting: [],
        unreadable: [{ key: "<archive>", reason: parsed.reason }],
        applied: [],
      };
    }

    const existing = new Set(
      (await sessionKeys()).map((key) => key.slice(`${prefix}/session/`.length)),
    );
    const imported: string[] = [];
    const skippedExisting: string[] = [];

    for (const session of parsed.sessions) {
      if (existing.has(session.id) && options?.overwrite !== true) {
        skippedExisting.push(session.id);
        continue;
      }
      // Deliberately writes the Session without touching the active pointer: importing
      // someone else's unfinished run must not resume it on this device.
      await write(session);
      imported.push(session.id);
    }

    return {
      imported,
      skippedExisting,
      unreadable: parsed.skipped.map((entry) => ({
        key: entry.id ?? `<position ${entry.position}>`,
        reason: entry.reason,
      })),
      applied: parsed.applied,
    };
  };

  return {
    save,
    load,
    loadAll,
    exportArchive,
    importArchive,

    async listSummaries() {
      const { sessions } = await loadAll();
      return sessions.map(summarize);
    },

    async remove(id) {
      await store.removeItem(sessionKey(id));
      if ((await store.getItem(activeKey)) === id) await store.removeItem(activeKey);
    },

    async clear() {
      for (const key of await sessionKeys()) await store.removeItem(key);
      await store.removeItem(activeKey);
    },

    async loadActiveSession() {
      const id = await store.getItem(activeKey);
      if (id === null) return null;
      const session = await load(id);
      // A pointer to a Session that is gone or already ended is stale, not an active run.
      if (!session || session.endedAt !== null) return null;
      return session;
    },

    async exportAll(exportedAt) {
      return serializeArchive(await exportArchive(exportedAt));
    },
  };
}

function isSessionResult(value: Session | UnreadableRecord): value is Session {
  return !("reason" in value);
}
