/**
 * The persisted schema: a version stamp on every record, and the migration path that goes
 * with it.
 *
 * ADR-0003 ships the MVP with no backend, and accepts one risk explicitly: "we will need a
 * migration path when sync lands — mitigated by versioning the persisted schema from the
 * first commit." This is that mitigation. Version 1 is the shape shipped on day one; every
 * change to the persisted shape appends a `Migration` to `SESSION_MIGRATIONS` and bumps
 * `CURRENT_SCHEMA_VERSION`. Nothing else is needed, and nothing may skip it.
 *
 * The runner is pure and takes its chain as an argument, so it is testable without storage
 * and a Repository can be pointed at a different chain in a test.
 */

import type { CountingSystemChange, Decision, Session } from "./types";

/** The version this build writes. Bump on every change to the persisted shape. */
export const CURRENT_SCHEMA_VERSION = 3;

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
 * Counting Systems that version 1 builds shipped as unbalanced, by the published name a
 * `CountSnapshot` stores.
 *
 * Frozen here rather than read from `@/engine/counting`: a migration describes what an old
 * build *wrote*, so it must not change meaning if the engine later renames a system or adds
 * a new unbalanced one — a v1 record cannot contain a system v1 did not ship.
 */
export const V1_UNBALANCED_SYSTEMS: ReadonlySet<string> = new Set(["KO", "Red 7"]);

/**
 * 1→2: `CountSnapshot.trueCount` becomes `number | null` (#22).
 *
 * Version 1 typed it as a plain number, so where no True Count existed — an unbalanced
 * system, or no decks left to divide by — both writers stored a stand-in `0`. This step
 * turns that stand-in into `null`, and touches nothing else:
 *
 * - Only a stored `0` is a candidate. No v1 writer produced any other stand-in, and a
 *   non-zero number is not ours to reinterpret.
 * - A `0` becomes `null` only when the snapshot itself proves no True Count could exist:
 *   its system is one v1 shipped as unbalanced, or its `decksRemaining` is zero or less.
 * - A balanced system's `0` with decks remaining is a genuine True Count of 0 — the most
 *   common count in the shoe — and survives untouched.
 *
 * Defensive about shape because it runs before `isSession`: a mangled record must come out
 * the other side still mangled, and be reported there, rather than throw here.
 */
export const TRUE_COUNT_NULLABLE: Migration = {
  from: 1,
  to: 2,
  describe: "1→2: record an absent True Count as null instead of 0",
  migrate: (data) => {
    if (typeof data !== "object" || data === null) return data;
    const session = data as { decisions?: unknown };
    if (!Array.isArray(session.decisions)) return data;
    return { ...session, decisions: session.decisions.map(nullAbsentTrueCount) };
  },
};

function nullAbsentTrueCount(decision: unknown): unknown {
  if (typeof decision !== "object" || decision === null) return decision;
  const count = (decision as { count?: unknown }).count;
  if (typeof count !== "object" || count === null) return decision;

  const snapshot = count as { system?: unknown; trueCount?: unknown; decksRemaining?: unknown };
  if (snapshot.trueCount !== 0) return decision;

  const unbalanced =
    typeof snapshot.system === "string" && V1_UNBALANCED_SYSTEMS.has(snapshot.system);
  const exhausted = typeof snapshot.decksRemaining === "number" && snapshot.decksRemaining <= 0;
  if (!unbalanced && !exhausted) return decision;

  return { ...decision, count: { ...snapshot, trueCount: null } };
}

/**
 * 2→3: drill answers a Session could not hold, and Counting System changes it did not record
 * (#26, #27).
 *
 * - `conversionChecks` and `indexPlays` arrive empty. No version 2 build recorded either — the
 *   True Count and Deviation drills said NOT RECORDED — so there is nothing to recover.
 * - `countingSystem` meant "the system the Session opened with" and went stale the moment a
 *   user switched systems mid-Session. Version 3 means "the system in force now", with a log
 *   of changes. A version 2 build never wrote the moment of a change, but every Decision
 *   names the system it was taken under, so each change is inferred from the first Decision
 *   under the new system: it happened no later than that Decision, and the inferred change
 *   says which Decision it came from (`inferredFromDecision`). The Session's system becomes
 *   the last Decision's — the same answer the version 2 build itself resumed a table with.
 *
 * A change made after the last Decision, or in a Session with no Decisions at all, left no
 * trace in a version 2 record and cannot be recovered; the migration does not guess at one.
 *
 * Defensive about shape for the same reason as the 1→2 step.
 */
export const SESSION_RECORDS_V3: Migration = {
  from: 2,
  to: 3,
  describe:
    "2→3: add True Count and index-play records, and record Counting System changes",
  migrate: (data) => {
    if (typeof data !== "object" || data === null) return data;
    const session = data as {
      countingSystem?: unknown;
      decisions?: unknown;
      conversionChecks?: unknown;
      indexPlays?: unknown;
      countingSystemChanges?: unknown;
    };

    const base = {
      ...session,
      conversionChecks: Array.isArray(session.conversionChecks) ? session.conversionChecks : [],
      indexPlays: Array.isArray(session.indexPlays) ? session.indexPlays : [],
    };
    // Already carrying a change log: this record needs nothing inferred, and inferring would
    // overwrite a system switched to after its last Decision.
    if (Array.isArray(session.countingSystemChanges)) return base;
    if (typeof session.countingSystem !== "string" || !Array.isArray(session.decisions)) {
      return { ...base, countingSystemChanges: [] };
    }

    const inferred = inferSystemChanges(session.countingSystem, session.decisions);
    return { ...base, countingSystem: inferred.system, countingSystemChanges: inferred.changes };
  },
};

function inferSystemChanges(
  opened: string,
  decisions: readonly unknown[],
): { system: string; changes: CountingSystemChange[] } {
  let system = opened;
  const changes: CountingSystemChange[] = [];

  decisions.forEach((decision, position) => {
    if (typeof decision !== "object" || decision === null) return;
    const entry = decision as Partial<Decision>;
    const count: unknown = entry.count;
    const named =
      typeof count === "object" && count !== null ? (count as { system?: unknown }).system : null;
    if (typeof named !== "string" || named === system) return;

    changes.push({
      index: changes.length,
      from: system,
      to: named,
      roundIndex: numberOr(entry.roundIndex, 0),
      shoeIndex: typeof entry.shoeIndex === "number" ? entry.shoeIndex : null,
      shoeDealtCount: typeof entry.shoeDealtCount === "number" ? entry.shoeDealtCount : null,
      at: numberOr(entry.at, 0),
      inferredFromDecision: numberOr(entry.index, position),
    });
    system = named;
  });

  return { system, changes };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

/**
 * The shipped upgrade path for Session records, one single-version hop per entry, in order.
 */
export const SESSION_MIGRATIONS: readonly Migration[] = [TRUE_COUNT_NULLABLE, SESSION_RECORDS_V3];

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
    Array.isArray(s.rounds) &&
    Array.isArray(s.conversionChecks) &&
    Array.isArray(s.indexPlays) &&
    Array.isArray(s.countingSystemChanges)
  );
}
