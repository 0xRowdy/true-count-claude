import { describe, expect, it } from "vitest";
import { COUNTING_SYSTEMS } from "@/engine";
import { V1_COUNT_CASES, buildSession, buildV1Session } from "./fixtures";
import {
  CURRENT_SCHEMA_VERSION,
  type Migration,
  SESSION_MIGRATIONS,
  TRUE_COUNT_NULLABLE,
  V1_UNBALANCED_SYSTEMS,
  decodeSession,
  encodeSession,
  isSession,
  migrateRecord,
} from "./schema";
import type { Session } from "./types";

/**
 * A synthetic chain exercising the runner the app uses, independent of the shipped history:
 * two invented steps prove that a multi-step walk, a partial walk, and a gap all behave.
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

  it("reads back what it wrote, with no migrations needed at the current version", () => {
    const session = buildSession({ rounds: 2, seed: 17 });
    const outcome = decodeSession(encodeSession(session));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.applied).toEqual([]);
    expect(outcome.session).toEqual(JSON.parse(JSON.stringify(session)));
  });

  it("ships an unbroken upgrade path from version 1 to the current version", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
    expect(SESSION_MIGRATIONS.map((step) => [step.from, step.to])).toEqual([[1, 2]]);
  });
});

/**
 * #22: version 1 typed `CountSnapshot.trueCount` as a number, so an absent True Count was
 * stored as 0. The migration must tell that stand-in apart from a real True Count of 0 —
 * which is the most common count in any shoe — using only what the snapshot itself says.
 */
describe("1→2: an absent True Count becomes null, and a real 0 stays 0", () => {
  const upgrade = (session: Session): Session => {
    const outcome = migrateRecord<Session>(
      { schemaVersion: 1, kind: "session", data: JSON.parse(JSON.stringify(session)) },
      SESSION_MIGRATIONS,
    );
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.applied).toEqual([TRUE_COUNT_NULLABLE.describe]);
    return outcome.data;
  };

  const counts = (session: Session) => session.decisions.map((decision) => decision.count);

  it("nulls the stand-in 0 an unbalanced system recorded, for KO and Red 7", () => {
    const [ko, red7] = counts(upgrade(buildV1Session()));

    expect(ko).toEqual({ ...V1_COUNT_CASES.koStandIn, trueCount: null });
    expect(red7).toEqual({ ...V1_COUNT_CASES.red7StandIn, trueCount: null });
  });

  it("nulls the stand-in 0 recorded with no decks left to divide by, even for Hi-Lo", () => {
    const [, , exhausted] = counts(upgrade(buildV1Session()));
    expect(exhausted).toEqual({ ...V1_COUNT_CASES.exhaustedStandIn, trueCount: null });
  });

  it("keeps a balanced system's genuine True Count of 0 as 0, not null", () => {
    const [, , , hiLo, zen] = counts(upgrade(buildV1Session()));

    expect(hiLo).toEqual(V1_COUNT_CASES.hiLoRealZero);
    expect(hiLo?.trueCount).toBe(0);
    expect(zen).toEqual(V1_COUNT_CASES.zenRealZero);
    expect(zen?.trueCount).toBe(0);
  });

  it("leaves every non-zero True Count, and everything else in the Session, untouched", () => {
    const v1 = JSON.parse(JSON.stringify(buildV1Session())) as Session;
    const upgraded = upgrade(v1);

    expect(counts(upgraded)[5]).toEqual(V1_COUNT_CASES.omegaNonZero);
    const withoutCounts = (session: Session) => ({
      ...session,
      decisions: session.decisions.map((decision) => ({ ...decision, count: null })),
    });
    expect(withoutCounts(upgraded)).toEqual(withoutCounts(v1));
  });

  it("changes nothing in a Session whose Hi-Lo counts all had decks remaining", () => {
    const session = JSON.parse(JSON.stringify(buildSession({ rounds: 20, seed: 3 })));
    expect(upgrade(session)).toEqual(session);
  });

  it("is a no-op on data already in the version 2 shape", () => {
    const v2 = upgrade(buildV1Session());
    expect(TRUE_COUNT_NULLABLE.migrate(v2)).toEqual(v2);
  });

  it("passes a mangled record through for `isSession` to reject, rather than throwing", () => {
    for (const data of [null, 7, "x", {}, { decisions: "no" }, { decisions: [null, 3, {}] }]) {
      expect(() => TRUE_COUNT_NULLABLE.migrate(data)).not.toThrow();
    }
    expect(TRUE_COUNT_NULLABLE.migrate({ decisions: [{ count: null }] })).toEqual({
      decisions: [{ count: null }],
    });
  });

  it("freezes names that really are unbalanced systems, spelled as a snapshot stores them", () => {
    // Frozen in the migration on purpose, so a later engine change cannot alter what an old
    // record means. This pins that the freeze was not a typo — a misspelt name would quietly
    // leave every KO stand-in 0 in place — and that no balanced system is caught by it.
    for (const name of V1_UNBALANCED_SYSTEMS) {
      const system = COUNTING_SYSTEMS.find((candidate) => candidate.name === name);
      expect(system, `${name} is not a Counting System name`).toBeDefined();
      expect(system?.balanced).toBe(false);
    }
    expect(V1_UNBALANCED_SYSTEMS.size).toBe(2);
  });

  it("upgrades a stored v1 record through decodeSession with the shipped chain", () => {
    const raw = JSON.stringify({ schemaVersion: 1, kind: "session", data: buildV1Session() });
    const outcome = decodeSession(raw);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.applied).toEqual([TRUE_COUNT_NULLABLE.describe]);
    expect(outcome.session.decisions.map((decision) => decision.count.trueCount)).toEqual([
      null,
      null,
      null,
      0,
      0,
      -1.5,
    ]);
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
