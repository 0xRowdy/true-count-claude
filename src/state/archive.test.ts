import { describe, expect, it } from "vitest";
import { ARCHIVE_FORMAT, createArchive, parseArchive, serializeArchive } from "./archive";
import { buildSession } from "./fixtures";
import { CURRENT_SCHEMA_VERSION, type Migration } from "./schema";
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

  it("upgrades an archive written by an older build", () => {
    const step: Migration = {
      from: 1,
      to: 2,
      describe: "1→2: add a per-Session note",
      migrate: (data) => ({ ...(data as object), note: "" }),
    };
    const raw = JSON.stringify({
      format: ARCHIVE_FORMAT,
      schemaVersion: 1,
      exportedAt: 5,
      sessions: [buildSession({ id: "old", rounds: 2 })],
    });

    const parsed = parseArchive(raw, [step], 2);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.applied).toEqual([step.describe]);
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
