import { describe, expect, it } from "vitest";
import { cardId } from "@/engine/cards";
import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";
import { currentLegalActions, dealerUpcard } from "@/engine/round";
import { dealNextHand, startBasicStrategyDrill } from "@/drills";
import { HI_LO } from "@/engine/counting";
import { type Session, openShoe, rebuildShoe, syncShoeProgress } from "@/state";
import { buildSession, buildSplitSession } from "@/state/fixtures";
import {
  type PlayTable,
  createPlayTable,
  currentShoe,
  dealRound,
  nextRound,
  playAction,
  takeInsurance,
} from "@/ui/table/usePlayTable";
import {
  type AppEnvironment,
  type BugReport,
  type BugReportInput,
  BUG_REPORT_KIND,
  MAX_ISSUE_URL_LENGTH,
  NEW_ISSUE_URL,
  buildBugReport,
  bugReportFileName,
  formatBugReport,
  issueBody,
  issueLink,
  replayRound,
  reproduceShoe,
} from "./bugReport";

const APP: AppEnvironment = { version: "0.1.0", platform: "web", osVersion: null };

/** What we actually receive: the report after it has been copied, pasted and parsed. */
function received(report: BugReport): BugReport {
  return JSON.parse(JSON.stringify(report)) as BugReport;
}

/** The JSON block out of the formatted text, parsed — the other form we receive. */
function pastedPayload(text: string): BugReport {
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  if (!match?.[1]) throw new Error("no JSON block in the formatted report");
  return JSON.parse(match[1]) as BugReport;
}

function tableInput(table: PlayTable, overrides: Partial<BugReportInput> = {}): BugReportInput {
  return {
    screen: "Play table",
    app: APP,
    rules: table.rules,
    countingSystem: table.system.name,
    table: {
      shoe: table.shoe,
      round: table.round,
      bankroll: table.bankroll,
      shoeIndex: table.shoeIndex,
    },
    session: null,
    ...overrides,
  };
}

/** A table dealt at the first seed that produces the situation a test needs. */
function tableWhere(predicate: (table: PlayTable) => boolean, rules: RuleSet = DEFAULT_RULES): PlayTable {
  for (let seed = 1; seed < 5000; seed++) {
    const table = dealRound(createPlayTable(rules, seed));
    if (predicate(table)) return table;
  }
  throw new Error("no seed under 5000 produces this situation");
}

/** Plays stand-on-everything through `rounds` rounds, so the Shoe is well into its cards. */
function playRounds(table: PlayTable, rounds: number): PlayTable {
  let current = table;
  for (let i = 0; i < rounds; i++) {
    current = dealRound(current);
    while (current.round && current.round.phase !== "settled") {
      current =
        current.round.phase === "insurance"
          ? takeInsurance(current, false)
          : playAction(current, "stand");
    }
    current = nextRound(current);
  }
  return current;
}

describe("a report rebuilds the Shoe from its seed", () => {
  it("reproduces a recorded Session's Shoe card for card, after a JSON round trip", () => {
    const session = buildSession({ rounds: 12, seed: 90210 });
    const report = received(
      buildBugReport({
        screen: "Statistics",
        app: APP,
        rules: session.rules,
        countingSystem: null,
        table: null,
        session,
      }),
    );

    const record = session.shoes[session.shoes.length - 1];
    expect(record).toBeDefined();
    expect(report.shoe?.source).toBe("session");
    expect(report.shoe?.seed).toBe(record?.seed);

    const original = rebuildShoe(session, session.shoes.length - 1);
    const rebuilt = reproduceShoe(report);
    expect(rebuilt.dealtCount).toBe(original.dealtCount);
    expect(rebuilt.cards).toEqual(original.cards);
    expect(rebuilt.cutIndex).toBe(original.cutIndex);
    expect(report.countingSystem).toBe("Hi-Lo");
  });

  it("carries every Shoe seed of the Session, so any earlier Shoe rebuilds too", () => {
    // A second Shoe opened and part-dealt, as the Play table does at the cut card.
    const session = syncShoeProgress(openShoe(buildSession({ rounds: 8, seed: 7 })).session, 17);
    expect(session.shoes).toHaveLength(2);
    const report = received(
      buildBugReport({
        screen: "Statistics",
        app: APP,
        rules: session.rules,
        countingSystem: null,
        table: null,
        session,
      }),
    );

    expect(report.session?.shoes).toHaveLength(2);
    for (const recorded of report.session?.shoes ?? []) {
      const rebuilt = reproduceShoe(
        { rules: report.rules, shoe: report.shoe && { ...report.shoe, seed: recorded.seed } },
        recorded.dealtCount,
      );
      const original = rebuildShoe(session, recorded.index);
      expect(rebuilt.cards).toEqual(original.cards);
      expect(rebuilt.dealtCount).toBe(original.dealtCount);
    }
  });

  it("reproduces the Play table's live Shoe mid-round, cards dealt so far included", () => {
    const table = tableWhere((candidate) => candidate.round?.phase === "player");
    const played = playAction(playRounds(table, 0), "hit");
    const deep = dealRound(playRounds(createPlayTable(DEFAULT_RULES, 31337), 9));

    for (const subject of [played, deep]) {
      const report = received(buildBugReport(tableInput(subject)));
      const live = currentShoe(subject);

      expect(report.shoe?.rebuildsFromSeed).toBe(true);
      expect(report.shoe?.dealtCount).toBe(live.dealtCount);
      const rebuilt = reproduceShoe(report);
      expect(rebuilt.cards).toEqual(live.cards);
      expect(rebuilt.cards.slice(0, rebuilt.dealtCount).map(cardId)).toEqual(
        live.cards.slice(0, live.dealtCount).map(cardId),
      );
    }
  });

  it("survives being pasted as text: the JSON block in the formatted report rebuilds the Shoe", () => {
    const table = dealRound(playRounds(createPlayTable(DEFAULT_RULES, 4040), 5));
    const text = formatBugReport(buildBugReport(tableInput(table)), "the count looked off");
    const payload = pastedPayload(text);

    expect(reproduceShoe(payload).cards).toEqual(currentShoe(table).cards);
    expect(payload.shoe?.dealtCount).toBe(currentShoe(table).dealtCount);
  });

  it("says so when its own seed does not rebuild its Shoe", () => {
    const table = dealRound(createPlayTable(DEFAULT_RULES, 55));
    const report = buildBugReport(tableInput(table, { rules: { ...DEFAULT_RULES, decks: 2 } }));
    expect(report.shoe?.rebuildsFromSeed).toBe(false);
    expect(formatBugReport(report)).toContain("DOES NOT rebuild from its seed");
  });

  it("uses the recorded seed, never a re-derived one — a drill's Shoe rebuilds too", () => {
    const drill = dealNextHand(
      startBasicStrategyDrill(
        { rules: DEFAULT_RULES, system: HI_LO, rounding: "truncate", bet: 10, bankroll: 1_000_000 },
        77,
      ),
    );
    const state = drill.current;
    const report = received(
      buildBugReport({
        screen: "Basic Strategy drill",
        app: APP,
        rules: state.config.rules,
        countingSystem: state.config.system.name,
        table: { shoe: state.shoe, round: state.round, bankroll: state.config.bankroll },
        session: null,
        details: { drill: "basic-strategy", runSeed: state.seed },
      }),
    );

    expect(report.shoe?.rebuildsFromSeed).toBe(true);
    expect(reproduceShoe(report).cards).toEqual(state.round?.shoe.cards);
    expect(report.round?.replaysFromActions).toBe(true);
    expect(report.details).toEqual({ drill: "basic-strategy", runSeed: 77 });
  });
});

describe("a report replays the round in progress", () => {
  it("replays a hand the user hit and stood on to the identical state", () => {
    const dealt = tableWhere((table) => {
      const round = table.round;
      return round?.phase === "player" && currentLegalActions(round).includes("hit");
    });
    const table = playAction(dealt, "hit");
    const report = received(buildBugReport(tableInput(table)));

    expect(report.round?.actions).toEqual(["hit"]);
    expect(report.round?.startDealtCount).toBe(dealt.shoe.dealtCount);
    expect(report.round?.replaysFromActions).toBe(true);
    expect(replayRound(report)).toEqual(table.round);
  });

  it("replays insurance, and shows the dealer's hole card only once it is turned", () => {
    const table = tableWhere((candidate) => candidate.round?.phase === "insurance");
    const pending = buildBugReport(tableInput(table));
    expect(pending.round?.phase).toBe("insurance");
    expect(pending.round?.dealerCards).toEqual([cardId(dealerUpcard(table.round!))]);
    expect(pending.round?.legalActions).toEqual([]);

    const insured = takeInsurance(table, true);
    const report = received(buildBugReport(tableInput(insured)));
    expect(report.round?.actions).toEqual(["insurance:take"]);
    expect(replayRound(report)).toEqual(insured.round);
    expect(report.round?.replaysFromActions).toBe(true);
  });

  it("replays a split, with the legal actions the table was offering", () => {
    const dealt = tableWhere((table) => {
      const round = table.round;
      return round?.phase === "player" && currentLegalActions(round).includes("split");
    });
    expect(buildBugReport(tableInput(dealt)).round?.legalActions).toContain("split");

    const split = playAction(dealt, "split");
    const report = received(buildBugReport(tableInput(split)));
    expect(report.round?.playerHands.length).toBeGreaterThanOrEqual(2);
    expect(replayRound(report)).toEqual(split.round);
  });

  it("describes a round it cannot replay rather than guessing a bankroll", () => {
    const table = dealRound(createPlayTable(DEFAULT_RULES, 12));
    const report = buildBugReport({
      ...tableInput(table),
      table: { shoe: table.shoe, round: table.round },
    });
    expect(report.round?.bankrollBefore).toBeNull();
    expect(report.round?.replaysFromActions).toBeNull();
    expect(() => replayRound(report)).toThrow(/bankroll/);
  });
});

describe("what the report carries", () => {
  it("names the build, the table, the system and the Session", () => {
    const session = buildSplitSession({ rounds: 6, id: "abc-123", seed: 99 });
    const table = dealRound(createPlayTable(session.rules, 1));
    const report = buildBugReport(
      tableInput(table, { session, app: { version: "0.1.0", platform: "ios", osVersion: "19.1" } }),
    );

    expect(report.kind).toBe(BUG_REPORT_KIND);
    expect(report.app).toEqual({ version: "0.1.0", platform: "ios", osVersion: "19.1" });
    expect(report.rules).toEqual(session.rules);
    expect(report.countingSystem).toBe("Hi-Lo");
    expect(report.session).toMatchObject({
      id: "abc-123",
      seed: 99,
      mode: "play",
      status: "recording",
      decisions: session.decisions.length,
      nextDecisionIndex: session.decisions.length,
      rounds: session.rounds.length,
    });
    expect(report.session?.lastDecision?.index).toBe(session.decisions.length - 1);
    // Recorded at the same table as the one reported, so the Rule Set is not repeated.
    expect(report.session).not.toHaveProperty("rules");
  });

  it("includes the Session's own Rule Set when it was recorded at a different table", () => {
    const session = buildSession({ rounds: 2 });
    const rules: RuleSet = { ...DEFAULT_RULES, decks: 1 };
    const report = buildBugReport({
      screen: "Shoe Integrity",
      app: APP,
      rules,
      countingSystem: "KO",
      table: null,
      session,
    });
    expect(report.session?.rules).toEqual(session.rules);
    expect(report.countingSystem).toBe("KO");
  });

  it("is game state only: no timestamp fields, and nothing but the documented fields", () => {
    const session: Session = buildSession({ rounds: 4, startedAt: 1_234_567_890_123 });
    const table = dealRound(createPlayTable(DEFAULT_RULES, 3));
    const report = buildBugReport(tableInput(table, { session }));
    const json = JSON.stringify(report);

    expect(Object.keys(report).sort()).toEqual(
      ["app", "countingSystem", "details", "format", "kind", "round", "rules", "screen", "session", "shoe", "table"].sort(),
    );
    expect(Object.keys(report.app).sort()).toEqual(["osVersion", "platform", "version"]);
    expect(json).not.toContain("1234567890123");
    expect(json).not.toMatch(/"(at|startedAt|endedAt)"/);
  });

  it("has no Shoe to rebuild on a screen without one and no Session", () => {
    const report = buildBugReport({
      screen: "Statistics",
      app: APP,
      rules: DEFAULT_RULES,
      countingSystem: null,
      table: null,
      session: null,
    });
    expect(report.shoe).toBeNull();
    expect(report.session).toBeNull();
    expect(() => reproduceShoe(report)).toThrow();
    expect(formatBugReport(report)).toContain("Shoe: none on this screen");
  });
});

describe("presenting the report", () => {
  const table = playAction(tableWhere((candidate) => candidate.round?.phase === "player"), "stand");
  const report = buildBugReport(tableInput(table));

  it("leads with a readable summary and the note, only when one was written", () => {
    const withNote = formatBugReport(report, "  Split was offered on 10-J  ");
    expect(withNote).toContain("**What went wrong:** Split was offered on 10-J");
    expect(withNote).toContain(`seed ${report.shoe?.seed}`);
    expect(withNote).toContain(`createShoe(rules, ${report.shoe?.seed})`);
    expect(formatBugReport(report)).not.toContain("What went wrong");
    // No headings of its own, so it nests under the template's "Report from the app".
    expect(formatBugReport(report)).not.toMatch(/^#/m);
  });

  it("names its file after the build and the Shoe", () => {
    expect(bugReportFileName(report)).toBe(
      `true-count-bug-0.1.0-seed-${report.shoe?.seed}-card-${report.shoe?.dealtCount}.md`,
    );
  });

  it("prefills a GitHub issue shaped like the template", () => {
    const link = issueLink(report, "Dealer stood on soft 17 at an H17 table");
    expect(link.prefilled).toBe(true);
    expect(link.url.startsWith(`${NEW_ISSUE_URL}?`)).toBe(true);

    const params = new URL(link.url).searchParams;
    expect(params.get("labels")).toBe("bug");
    expect(params.get("title")).toBe("Bug: Dealer stood on soft 17 at an H17 table");
    const body = params.get("body") ?? "";
    expect(body).toContain("## What went wrong\n\nDealer stood on soft 17 at an H17 table");
    expect(body).toContain("## What you expected");
    expect(body).toContain("## Report from the app");
    expect(reproduceShoe(pastedPayload(body)).cards).toEqual(currentShoe(table).cards);
  });

  it("falls back to a paste-it-in link when the report is too long for a URL", () => {
    const long = issueLink(report, "x".repeat(MAX_ISSUE_URL_LENGTH));
    expect(long.prefilled).toBe(false);
    expect(long.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    expect(new URL(long.url).searchParams.get("body")).toBe(
      issueBody("<!-- Paste the report you copied from the app here. -->"),
    );
  });
});
