import { describe, expect, it } from "vitest";
import { buildSession } from "./fixtures";
import {
  CURRENT_SCHEMA_VERSION,
  type Migration,
  SESSION_MIGRATIONS,
  decodeSession,
  encodeSession,
  isSession,
  migrateRecord,
} from "./schema";
import type { Session } from "./types";

/**
 * A worked example of the upgrade path ADR-0003 requires, exercised through the same runner
 * the app uses. Version 1 is what ships today; these two steps stand in for the first real
 * shape changes, and prove the mechanism is wired rather than merely intended.
 */
const V1_TO_V2: Migration = {
  from: 1,
  to: 2,
  describe: "1→2: add the count-check log",
  migrate: (data) => ({ ...(data as object), countChecks: [] }),
};

const V2_TO_V3: Migration = {
  from: 2,
  to: 3,
  describe: "2→3: record the Basic Strategy play alongside the deviation-aware one",
  migrate: (data) => {
    const session = data as Session & { decisions: Record<string, unknown>[] };
    return {
      ...session,
      decisions: session.decisions.map((decision) => ({
        ...decision,
        basicStrategyAction: decision.correctAction,
      })),
    };
  },
};

const CHAIN = [V1_TO_V2, V2_TO_V3];

/** A Session as an older build would have written it: no count checks, no BS action. */
function legacyV1Payload(): unknown {
  const session = buildSession({ rounds: 3, seed: 5 });
  const { countChecks, ...rest } = session;
  void countChecks;
  return {
    ...rest,
    decisions: session.decisions.map((decision) => {
      const { basicStrategyAction, ...keep } = decision;
      void basicStrategyAction;
      return keep;
    }),
  };
}

describe("the persisted record carries its schema version", () => {
  it("stamps the current version on every write, from the first commit", () => {
    const record = JSON.parse(encodeSession(buildSession({ rounds: 1 })));

    expect(record.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(record.kind).toBe("session");
    expect(record.data.id).toBe("session-1");
  });

  it("reads back what it wrote, with no migrations needed at version 1", () => {
    const session = buildSession({ rounds: 2, seed: 17 });
    const outcome = decodeSession(encodeSession(session));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.applied).toEqual([]);
    expect(outcome.session).toEqual(JSON.parse(JSON.stringify(session)));
  });

  it("ships an upgrade path, empty today because version 1 is the first schema", () => {
    expect(SESSION_MIGRATIONS).toEqual([]);
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});

describe("upgrading an old record", () => {
  it("walks every step of the chain in order", () => {
    const outcome = migrateRecord<Session>(
      { schemaVersion: 1, kind: "session", data: legacyV1Payload() },
      CHAIN,
      3,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.applied).toEqual([V1_TO_V2.describe, V2_TO_V3.describe]);
    expect(outcome.data.countChecks).toEqual([]);
    expect(outcome.data.decisions[0]!.basicStrategyAction).toBe(
      outcome.data.decisions[0]!.correctAction,
    );
  });

  it("upgrades a stored v1 record all the way through decodeSession", () => {
    const raw = JSON.stringify({ schemaVersion: 1, kind: "session", data: legacyV1Payload() });
    const outcome = decodeSession(raw, CHAIN, 3);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.applied).toHaveLength(2);
    expect(isSession(outcome.session)).toBe(true);
    expect(outcome.session.decisions).toHaveLength(3);
  });

  it("stops at the requested version rather than running the whole chain", () => {
    const outcome = migrateRecord<Session>(
      { schemaVersion: 1, kind: "session", data: legacyV1Payload() },
      CHAIN,
      2,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.applied).toEqual([V1_TO_V2.describe]);
    expect(outcome.data.decisions[0]).not.toHaveProperty("basicStrategyAction");
  });

  it("reports a gap in the chain instead of guessing", () => {
    const outcome = migrateRecord({ schemaVersion: 1, kind: "session", data: {} }, [V2_TO_V3], 3);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/No migration from schema version 1/);
  });

  it("refuses a record from a newer build rather than dropping its fields", () => {
    const raw = JSON.stringify({ schemaVersion: 99, kind: "session", data: {} });
    const outcome = decodeSession(raw);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/newer than this build understands/);
  });
});

describe("decoding a damaged record", () => {
  it("returns a reason for malformed JSON instead of throwing", () => {
    const outcome = decodeSession("{not json");

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/Not valid JSON/);
  });

  it("rejects an unversioned value rather than assuming it is current", () => {
    const outcome = decodeSession(JSON.stringify({ id: "x", mode: "play" }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/no schemaVersion/);
  });

  it("rejects a record whose payload is not a Session", () => {
    const raw = JSON.stringify({ schemaVersion: 1, kind: "session", data: { id: 7 } });
    const outcome = decodeSession(raw);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/not a Session/);
  });
});
