/**
 * The persisted schema: a version stamp on every record, and the migration path that goes
 * with it.
 *
 * ADR-0003 ships the MVP with no backend, and accepts one risk explicitly: "we will need a
 * migration path when sync lands — mitigated by versioning the persisted schema from the
 * first commit." This is that mitigation. Version 1 is the shape shipped on day one; every
 * future change to the persisted shape appends a `Migration` to `SESSION_MIGRATIONS` and
 * bumps `CURRENT_SCHEMA_VERSION`. Nothing else is needed, and nothing may skip it.
 *
 * The runner is pure and takes its chain as an argument, so it is testable without storage
 * and a Repository can be pointed at a different chain in a test.
 */

import type { Session } from "./types";

/** The version this build writes. Bump on every change to the persisted shape. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * What a stored value looks like on disk. The version travels with the data, not beside it,
 * so a record can never be separated from the schema that explains it. A value with no
 * version is refused outright rather than assumed to be current — that assumption is how
 * silent corruption starts.
 */
export interface PersistedRecord<T = unknown> {
  readonly schemaVersion: number;
  readonly kind: "session";
  readonly data: T;
}

/**
 * One step of the upgrade path. Steps are single-version hops so the chain reads as a
 * history and each step can be tested in isolation.
 */
export interface Migration {
  readonly from: number;
  readonly to: number;
  /** Shown in diagnostics and in the import report. */
  readonly describe: string;
  migrate(data: unknown): unknown;
}

/**
 * The shipped upgrade path for Session records.
 *
 * Empty today: version 1 is the first schema, so there is nothing yet to upgrade *from*.
 * It is declared, exported, and wired through the Repository from the first commit so that
 * adding the first real migration is a one-line change rather than an architecture change.
 */
export const SESSION_MIGRATIONS: readonly Migration[] = [];

export type MigrationOutcome<T> =
  | { readonly ok: true; readonly data: T; readonly applied: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Upgrades a record to `target`, applying each step in turn.
 *
 * A record from the *future* is refused rather than read: an older build must never
 * silently drop fields a newer one wrote, because with a sync layer that is data loss on
 * someone else's device.
 */
export function migrateRecord<T = unknown>(
  record: PersistedRecord,
  migrations: readonly Migration[],
  target: number = CURRENT_SCHEMA_VERSION,
): MigrationOutcome<T> {
  if (record.schemaVersion > target) {
    return {
      ok: false,
      reason:
        `Record is schema version ${record.schemaVersion}, newer than this build understands ` +
        `(${target}). Refusing to read it rather than discarding fields. Update the app.`,
    };
  }

  let version = record.schemaVersion;
  let data: unknown = record.data;
  const applied: string[] = [];

  while (version < target) {
    const step = migrations.find((candidate) => candidate.from === version);
    if (!step) {
      return {
        ok: false,
        reason: `No migration from schema version ${version} to ${target}.`,
      };
    }
    data = step.migrate(data);
    version = step.to;
    applied.push(step.describe);
  }

  return { ok: true, data: data as T, applied };
}

/** Wraps a Session for storage at the version this build writes. */
export function encodeSession(session: Session): string {
  const record: PersistedRecord<Session> = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: "session",
    data: session,
  };
  return JSON.stringify(record);
}

export type DecodeOutcome =
  | { readonly ok: true; readonly session: Session; readonly applied: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Parses, migrates, and shape-checks a stored Session.
 *
 * Returns a reason rather than throwing: a single corrupt record must never take down the
 * history screen, and the user still deserves to be told which Session could not be read.
 */
export function decodeSession(
  raw: string,
  migrations: readonly Migration[] = SESSION_MIGRATIONS,
  target: number = CURRENT_SCHEMA_VERSION,
): DecodeOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: `Not valid JSON: ${(error as Error).message}` };
  }

  const record = asRecord(parsed);
  if (!record) return { ok: false, reason: "Not a versioned record — no schemaVersion field." };

  const outcome = migrateRecord(record, migrations, target);
  if (!outcome.ok) return outcome;

  if (!isSession(outcome.data)) {
    return { ok: false, reason: "Migrated data is not a Session." };
  }
  return { ok: true, session: outcome.data, applied: outcome.applied };
}

function asRecord(value: unknown): PersistedRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<PersistedRecord>;
  if (typeof candidate.schemaVersion !== "number") return null;
  return { schemaVersion: candidate.schemaVersion, kind: "session", data: candidate.data };
}

/**
 * A structural check, not a deep validation. It exists to keep a mangled record from
 * crashing a screen — the arrays it guards are the ones every consumer iterates.
 */
export function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<Session>;
  return (
    typeof s.id === "string" &&
    (s.mode === "play" || s.mode === "drill") &&
    typeof s.seed === "number" &&
    typeof s.startedAt === "number" &&
    (s.endedAt === null || typeof s.endedAt === "number") &&
    typeof s.rules === "object" &&
    s.rules !== null &&
    Array.isArray(s.shoes) &&
    Array.isArray(s.decisions) &&
    Array.isArray(s.countChecks) &&
    Array.isArray(s.rounds)
  );
}
