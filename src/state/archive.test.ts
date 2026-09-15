import { describe, expect, it } from "vitest";
import { ARCHIVE_FORMAT, createArchive, parseArchive, serializeArchive } from "./archive";
import { V1_COUNT_CASES, buildSession, buildV1Session, buildV2DriftedSession } from "./fixtures";
import {
  CURRENT_SCHEMA_VERSION,
  type Migration,
  SESSION_MIGRATIONS,
  SESSION_RECORDS_V3,
} from "./schema";
import { endSession } from "./session";
import { verifyReplay } from "./replay";

describe("the session archive", () => {
  it("stamps the format and the schema version it was written at", () => {
    const archive = createArchive([buildSession({ rounds: 1 })], 12_345);

    expect(archive.format).toBe(ARCHIVE_FORMAT);
    expect(archive.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(archive.exportedAt).toBe(12_345);
  });

  it("is indented JSON a user can read and attach to a bug report", () => {
    const json = serializeArchive(createArchive([buildSession({ rounds: 1 })], 1));
    expect(json.split("\n").length).toBeGreaterThan(10);
  });

  it("round-trips Sessions that still replay from their seeds", () => {
    const sessions = [
      endSession(buildSession({ id: "a", rounds: 5, seed: 7 }), "user", 1),
      endSession(buildSession({ id: "b", rounds: 3, seed: 8 }), "drill-complete", 2),
    ];

    const parsed = parseArchive(serializeArchive(createArchive(sessions, 99)));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sessions.map((session) => session.id)).toEqual(["a", "b"]);
    expect(parsed.exportedAt).toBe(99);
    // An exported Session is still a provable one (ADR-0004).
    for (const session of parsed.sessions) expect(verifyReplay(session).ok).toBe(true);
  });

  it("upgrades an archive exported by a version 1 build, nulling only its stand-in zeros", () => {
    const raw = JSON.stringify({
      format: ARCHIVE_FORMAT,
      schemaVersion: 1,
      exportedAt: 5,
      sessions: [buildV1Session({ id: "old" })],
    });

    const parsed = parseArchive(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.applied).toEqual(SESSION_MIGRATIONS.map((step) => step.describe));
    expect(parsed.sessions[0]!.decisions.map((decision) => decision.count.trueCount)).toEqual([
      null,
      null,
      null,
      0,
      0,
      V1_COUNT_CASES.omegaNonZero.trueCount,
    ]);
  });

  it("upgrades an archive exported by a version 2 build, repairing its Counting System", () => {
    const raw = JSON.stringify({
      format: ARCHIVE_FORMAT,
      schemaVersion: 2,
      exportedAt: 5,
      sessions: [buildV2DriftedSession({ id: "drifted" })],
    });

    const parsed = parseArchive(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.applied).toEqual([SESSION_RECORDS_V3.describe]);
    const [session] = parsed.sessions;
    expect(session!.countingSystem).toBe("Zen Count");
    expect(session!.countingSystemChanges).toHaveLength(3);
    expect(session!.conversionChecks).toEqual([]);
    expect(session!.indexPlays).toEqual([]);
    expect(verifyReplay(session!).ok).toBe(true);
  });

  it("upgrades an archive through every step of a longer chain", () => {
    const step: Migration = {
      from: 3,
      to: 4,
      describe: "3→4: add a per-Session note",
      migrate: (data) => ({ ...(data as object), note: "" }),
    };
    const raw = JSON.stringify({
      format: ARCHIVE_FORMAT,
      schemaVersion: 1,
      exportedAt: 5,
      sessions: [buildSession({ id: "old", rounds: 2 })],
    });

    const parsed = parseArchive(raw, [...SESSION_MIGRATIONS, step], 4);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.applied).toEqual([...SESSION_MIGRATIONS.map((s) => s.describe), step.describe]);
    expect((parsed.sessions[0] as unknown as { note: string }).note).toBe("");
  });

  it("imports the readable Sessions and reports the rest, rather than rejecting the file", () => {
    const raw = JSON.stringify({
      format: ARCHIVE_FORMAT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: 1,
      sessions: [buildSession({ id: "fine", rounds: 2 }), { id: "junk" }, null],
    });

    const parsed = parseArchive(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sessions.map((session) => session.id)).toEqual(["fine"]);
    expect(parsed.skipped.map((entry) => entry.id)).toEqual(["junk", null]);
    expect(parsed.skipped[0]!.reason).toMatch(/not a Session/);
  });

  it("rejects a file that is not ours, and one from a newer build", () => {
    expect(parseArchive("nope").ok).toBe(false);
    expect(parseArchive(JSON.stringify({ format: "other" })).ok).toBe(false);
    expect(
      parseArchive(JSON.stringify({ format: ARCHIVE_FORMAT, sessions: [] })).ok,
    ).toBe(false);

    const future = parseArchive(
      JSON.stringify({ format: ARCHIVE_FORMAT, schemaVersion: 99, exportedAt: 0, sessions: [{}] }),
    );
    expect(future.ok).toBe(true);
    if (!future.ok) return;
    expect(future.skipped[0]!.reason).toMatch(/newer than this build understands/);
  });
});
