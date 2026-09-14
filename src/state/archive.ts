/**
 * Export and import of Session history.
 *
 * ADR-0003 accepts one cost of having no backend — "clearing app data loses progress" —
 * and names the mitigation: "an export/import of session history, which we want regardless
 * for the Shoe Integrity Panel." This is both. The archive is plain JSON: a user can read
 * it, diff it, attach it to a bug report, and replay it, which is the same argument as the
 * seeded Shoe (ADR-0004).
 *
 * Pure: no storage, no clock. The Repository supplies the timestamp.
 */

import {
  CURRENT_SCHEMA_VERSION,
  type Migration,
  SESSION_MIGRATIONS,
  isSession,
  migrateRecord,
} from "./schema";
import type { Session } from "./types";

/** Identifies the file as ours before we try to read anything out of it. */
export const ARCHIVE_FORMAT = "true-count.sessions";

export interface SessionArchive {
  readonly format: typeof ARCHIVE_FORMAT;
  /** The schema version the contained Sessions are written in. */
  readonly schemaVersion: number;
  readonly exportedAt: number;
  readonly sessions: readonly Session[];
}

export function createArchive(sessions: readonly Session[], exportedAt: number): SessionArchive {
  return {
    format: ARCHIVE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    sessions,
  };
}

/** Indented, because a user who exports their history should be able to read it. */
export function serializeArchive(archive: SessionArchive): string {
  return JSON.stringify(archive, null, 2);
}

/** A Session that could not be read, kept so an import can report rather than silently drop. */
export interface SkippedSession {
  readonly position: number;
  readonly id: string | null;
  readonly reason: string;
}

export type ArchiveParseOutcome =
  | {
      readonly ok: true;
      readonly exportedAt: number;
      readonly sessions: readonly Session[];
      readonly skipped: readonly SkippedSession[];
      /** Migration steps applied on the way in, for the import report. */
      readonly applied: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Reads an archive, upgrading its Sessions through the migration path if it was written by
 * an older build. A partially readable archive still imports: one bad Session is reported
 * in `skipped`, not grounds for rejecting the other two hundred.
 */
export function parseArchive(
  raw: string,
  migrations: readonly Migration[] = SESSION_MIGRATIONS,
  target: number = CURRENT_SCHEMA_VERSION,
): ArchiveParseOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: `Not valid JSON: ${(error as Error).message}` };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "Archive is not an object." };
  }
  const candidate = parsed as Partial<SessionArchive>;
  if (candidate.format !== ARCHIVE_FORMAT) {
    return { ok: false, reason: `Not a True Count archive (format: ${String(candidate.format)}).` };
  }
  if (typeof candidate.schemaVersion !== "number") {
    return { ok: false, reason: "Archive carries no schemaVersion." };
  }
  if (!Array.isArray(candidate.sessions)) {
    return { ok: false, reason: "Archive has no sessions array." };
  }

  const sessions: Session[] = [];
  const skipped: SkippedSession[] = [];
  const applied = new Set<string>();

  candidate.sessions.forEach((entry: unknown, position: number) => {
    const outcome = migrateRecord(
      { schemaVersion: candidate.schemaVersion as number, kind: "session", data: entry },
      migrations,
      target,
    );
    if (!outcome.ok) {
      skipped.push({ position, id: idOf(entry), reason: outcome.reason });
      return;
    }
    if (!isSession(outcome.data)) {
      skipped.push({ position, id: idOf(entry), reason: "Entry is not a Session." });
      return;
    }
    for (const step of outcome.applied) applied.add(step);
    sessions.push(outcome.data);
  });

  return {
    ok: true,
    exportedAt: typeof candidate.exportedAt === "number" ? candidate.exportedAt : 0,
    sessions,
    skipped,
    applied: [...applied],
  };
}

function idOf(entry: unknown): string | null {
  if (typeof entry !== "object" || entry === null) return null;
  const id = (entry as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}
