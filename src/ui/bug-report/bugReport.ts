/**
 * The bug report — a reproduction, not a description.
 *
 * Invariant 10 asks for in-app bug reporting that captures hand state. The incumbent's most
 * detailed negative review ends *"I looked all over your website and couldn't find anything
 * short of DMing yall on IG"* (`docs/research/competitive-landscape.md`), and even a user who
 * does find a channel can only say "the split looked wrong". ADR-0004 is what lets us do
 * better: the Shoe is built from a seed, so a seed, a Rule Set and a card index regenerate
 * every card the user saw, and a round's action log replays what they did with them.
 *
 * So the report carries exactly that and is checked as it is built. `rebuildsFromSeed` and
 * `replaysFromActions` are computed here, from the live objects, at the moment the user
 * decides something is wrong — a report whose own seed does not reproduce its own Shoe is
 * the most useful report we could receive, and it should say so rather than leave us to find
 * out.
 *
 * Game state only. There is no name, no device identifier, no locale, no timestamp field and
 * no user agent in here, and nothing leaves the device unless the user copies or shares it
 * (ADR-0003). One field is a clock reading in disguise — a Session id is its start time in
 * base 36 (`usePlaySession`'s `newSessionId`) — and the sheet says so rather than hiding it.
 * The one field a person writes is the optional note, and it is shown to them in the preview
 * alongside everything else before anything is shared.
 *
 * Pure and React-free, so the claim "this payload rebuilds the Shoe" is asserted in CI
 * (`bugReport.test.ts`) rather than merely rendered.
 */

import { cardId } from "@/engine/cards";
import type { Card } from "@/engine/cards";
import type { Action } from "@/engine/hand";
import { type RuleSet, describeRules } from "@/engine/rules";
import {
  type RoundAction,
  type RoundState,
  applyAction,
  currentLegalActions,
  startRound,
  visibleDealerCards,
} from "@/engine/round";
import { type Shoe, createShoe, deal } from "@/engine/shoe";
import type { Decision, Session } from "@/state";

/** Where the public issue list lives. Linked from inside the app, which the incumbent never did. */
export const KNOWN_ISSUES_URL = "https://github.com/0xRowdy/true-count-claude/issues";

/** Where a new issue is opened. `.github/ISSUE_TEMPLATE/bug_report.md` shapes the page. */
export const NEW_ISSUE_URL = `${KNOWN_ISSUES_URL}/new`;

/**
 * GitHub serves a prefilled issue from a query string, and long URLs are refused or truncated
 * somewhere past ~8,000 characters depending on the browser and proxy. Past this length the
 * link opens the template empty and the user pastes the report they copied instead.
 */
export const MAX_ISSUE_URL_LENGTH = 7500;

export const BUG_REPORT_KIND = "true-count-bug-report";
export const BUG_REPORT_FORMAT = 1;

/** Which build this is. Supplied by the caller — this module reads no platform API. */
export interface AppEnvironment {
  readonly version: string;
  /** `Platform.OS`: "web", "ios" or "android". */
  readonly platform: string;
  /** The OS version on native. `null` on web, where the only source is the user agent. */
  readonly osVersion: string | null;
}

/**
 * What a screen is dealing, handed over as the live objects.
 *
 * Shaped to match both the Play table and every Drill: each keeps a between-rounds `shoe` and
 * a live `round` dealt from it, and neither has to translate anything to report a bug.
 */
export interface BugReportTable {
  /**
   * The Shoe *between rounds* — the one the round in progress was dealt from. While a round is
   * live, `round.shoe` is further along; that is where the report reads cards-dealt-so-far.
   */
  readonly shoe: Shoe;
  readonly round?: RoundState | null;
  /**
   * Chips before the round was dealt. Needed to replay it, because affordability decides
   * which doubles, splits and insurance offers were legal. Omit it and the round is still
   * described, but `replaysFromActions` is `null` rather than a guess.
   */
  readonly bankroll?: number;
  /** Which Shoe of the run this is, when the screen counts them. */
  readonly shoeIndex?: number;
}

/** Screen-specific facts — a drill's id, a question index. Flat, and game state only. */
export type BugReportDetails = Readonly<Record<string, string | number | boolean | null>>;

export interface BugReportInput {
  /** Where the user was, in their words: "Play table", "Basic Strategy drill". */
  readonly screen: string;
  readonly app: AppEnvironment;
  /** The Rule Set the reported Shoe was built at. */
  readonly rules: RuleSet;
  /** Counting System name in force. Falls back to the Session's when `null`. */
  readonly countingSystem: string | null;
  readonly table: BugReportTable | null;
  readonly session: Session | null;
  readonly details?: BugReportDetails;
}

export interface ShoeReport {
  /** `screen` when the screen handed over its live Shoe, `session` when read off the log. */
  readonly source: "screen" | "session";
  readonly seed: number;
  readonly shoeIndex: number | null;
  readonly decks: number;
  readonly cards: number;
  readonly cutIndex: number;
  /** Cards dealt so far, the in-progress round included. The card index of the repro. */
  readonly dealtCount: number;
  /**
   * `createShoe(rules, seed)` checked card for card against the Shoe on screen. `false` is a
   * bug on its own. `null` when there was no live Shoe to check against.
   */
  readonly rebuildsFromSeed: boolean | null;
}

/**
 * A round action, as text: "hit", "stand", "double", "split", "surrender", "insurance:take",
 * "insurance:decline". Text rather than the engine's objects so the report reads at a glance.
 */
export type ReportedAction = Action | "insurance:take" | "insurance:decline";

export interface RoundReport {
  readonly phase: RoundState["phase"];
  /** The Shoe's `dealtCount` before the round's first card. */
  readonly startDealtCount: number;
  readonly bet: number;
  /** Chips before the deal, or `null` when the screen did not say. */
  readonly bankrollBefore: number | null;
  /** Every action applied, in order. With `startDealtCount` and the seed, a complete replay. */
  readonly actions: readonly ReportedAction[];
  readonly playerHands: readonly (readonly string[])[];
  readonly activeHandIndex: number;
  /** The dealer's cards the user could see. The hole card appears only once it is turned. */
  readonly dealerCards: readonly string[];
  /** The buttons the table was offering. What the user saw is often exactly the bug. */
  readonly legalActions: readonly Action[];
  /** The round rebuilt from seed and actions, compared to the one on screen. */
  readonly replaysFromActions: boolean | null;
}

export interface DecisionReport {
  readonly index: number;
  readonly roundIndex: number;
  readonly shoeIndex: number;
  readonly shoeDealtCount: number;
  readonly playerCards: readonly string[];
  readonly dealerUpcard: string;
  readonly actionTaken: string;
  readonly correctAction: string;
  readonly verdict: string;
}

export interface SessionReport {
  readonly id: string;
  readonly mode: Session["mode"];
  readonly drillId: string | null;
  readonly seed: number;
  readonly countingSystem: string;
  readonly status: "recording" | "ended";
  readonly endReason: Session["endReason"];
  readonly rounds: number;
  readonly decisions: number;
  readonly countChecks: number;
  /** The index the next Decision will take. A seed plus a Decision index is a repro. */
  readonly nextDecisionIndex: number;
  /** Every Shoe the Session opened, by recorded seed — enough for `rebuildShoe`. */
  readonly shoes: readonly { index: number; seed: number; dealtCount: number }[];
  readonly lastDecision: DecisionReport | null;
  /** Present only when the Session was recorded at a different table from the reported one. */
  readonly rules?: RuleSet;
}

export interface BugReport {
  readonly kind: typeof BUG_REPORT_KIND;
  readonly format: typeof BUG_REPORT_FORMAT;
  readonly app: AppEnvironment;
  readonly screen: string;
  readonly table: string;
  readonly rules: RuleSet;
  readonly countingSystem: string | null;
  readonly shoe: ShoeReport | null;
  readonly round: RoundReport | null;
  readonly session: SessionReport | null;
  readonly details: BugReportDetails;
}

// --- Building ----------------------------------------------------------------------------

export function buildBugReport(input: BugReportInput): BugReport {
  const { table, session, rules } = input;
  const round = table?.round ?? null;

  return {
    kind: BUG_REPORT_KIND,
    format: BUG_REPORT_FORMAT,
    app: input.app,
    screen: input.screen,
    table: describeRules(rules),
    rules,
    countingSystem: input.countingSystem ?? session?.countingSystem ?? null,
    shoe: table ? shoeFromTable(table, rules) : session ? shoeFromSession(session) : null,
    round: table && round ? roundReport(table, round, rules) : null,
    session: session ? sessionReport(session, rules) : null,
    details: input.details ?? {},
  };
}

function shoeFromTable(table: BugReportTable, rules: RuleSet): ShoeReport {
  const { shoe } = table;
  const live = table.round?.shoe ?? shoe;
  return {
    source: "screen",
    seed: shoe.seed,
    shoeIndex: table.shoeIndex ?? null,
    decks: shoe.decks,
    cards: shoe.cards.length,
    cutIndex: shoe.cutIndex,
    dealtCount: live.dealtCount,
    rebuildsFromSeed: sameCards(createShoe(rules, shoe.seed), live),
  };
}

function shoeFromSession(session: Session): ShoeReport | null {
  const record = session.shoes[session.shoes.length - 1];
  if (!record) return null;
  return {
    source: "session",
    seed: record.seed,
    shoeIndex: record.index,
    decks: record.decks,
    cards: record.decks * 52,
    cutIndex: record.cutIndex,
    dealtCount: record.dealtCount,
    rebuildsFromSeed: null,
  };
}

function roundReport(table: BugReportTable, round: RoundState, rules: RuleSet): RoundReport {
  const actions = round.actionLog.map(actionText);
  const bankrollBefore = table.bankroll ?? null;
  const partial = {
    startDealtCount: table.shoe.dealtCount,
    bet: round.bet,
    bankrollBefore,
    actions,
  };

  let replaysFromActions: boolean | null = null;
  if (bankrollBefore !== null) {
    try {
      const replayed = replayRound({
        rules,
        shoe: { seed: table.shoe.seed },
        round: partial,
      });
      replaysFromActions = sameRound(replayed, round);
    } catch {
      replaysFromActions = false;
    }
  }

  return {
    phase: round.phase,
    ...partial,
    playerHands: round.playerHands.map((hand) => hand.cards.map(cardId)),
    activeHandIndex: round.activeHandIndex,
    dealerCards: visibleDealerCards(round).map(cardId),
    legalActions: currentLegalActions(round),
    replaysFromActions,
  };
}

function sessionReport(session: Session, rules: RuleSet): SessionReport {
  const last = session.decisions[session.decisions.length - 1];
  return {
    id: session.id,
    mode: session.mode,
    drillId: session.drillId,
    seed: session.seed,
    countingSystem: session.countingSystem,
    status: session.endedAt === null ? "recording" : "ended",
    endReason: session.endReason,
    rounds: session.rounds.length,
    decisions: session.decisions.length,
    countChecks: session.countChecks.length,
    nextDecisionIndex: session.decisions.length,
    shoes: session.shoes.map((shoe) => ({
      index: shoe.index,
      seed: shoe.seed,
      dealtCount: shoe.dealtCount,
    })),
    lastDecision: last ? decisionReport(last) : null,
    ...(sameRules(session.rules, rules) ? {} : { rules: session.rules }),
  };
}

function decisionReport(decision: Decision): DecisionReport {
  return {
    index: decision.index,
    roundIndex: decision.roundIndex,
    shoeIndex: decision.shoeIndex,
    shoeDealtCount: decision.shoeDealtCount,
    playerCards: decision.hand.playerCards.map(cardId),
    dealerUpcard: cardId(decision.hand.dealerUpcard),
    actionTaken: decision.actionTaken,
    correctAction: decision.correctAction,
    verdict: decision.verdict,
  };
}

// --- Reproducing -------------------------------------------------------------------------

/**
 * The Shoe a report describes, rebuilt from nothing but the report: the seed, the Rule Set,
 * and the card index. This is the whole promise of ADR-0004 in one function, and it accepts
 * a report that has been through `JSON.parse` — the form we actually receive.
 */
export function reproduceShoe(report: Pick<BugReport, "rules" | "shoe">, dealtCount?: number): Shoe {
  if (!report.shoe) {
    throw new Error("This report was made on a screen with no Shoe, so there is none to rebuild.");
  }
  return dealTo(createShoe(report.rules, report.shoe.seed), dealtCount ?? report.shoe.dealtCount);
}

/**
 * The round a report describes, replayed: the Shoe rebuilt to where the round was dealt, the
 * deal, and every action in order. Throws when the report lacks the bankroll the deal needs,
 * or when an action was not legal — which, in a report, is itself the finding.
 */
export function replayRound(report: {
  readonly rules: RuleSet;
  readonly shoe: Pick<ShoeReport, "seed"> | null;
  readonly round: Pick<RoundReport, "startDealtCount" | "bet" | "bankrollBefore" | "actions"> | null;
}): RoundState {
  const { round, shoe } = report;
  if (!round || !shoe) throw new Error("This report has no round in progress to replay.");
  if (round.bankrollBefore === null) {
    throw new Error("This report does not record the bankroll the round was dealt from.");
  }

  let state = startRound({
    rules: report.rules,
    shoe: dealTo(createShoe(report.rules, shoe.seed), round.startDealtCount),
    bet: round.bet,
    bankroll: round.bankrollBefore,
  });
  for (const action of round.actions) state = applyAction(state, parseAction(action));
  return state;
}

// --- Presenting --------------------------------------------------------------------------

/**
 * The report as the user sees it and shares it: a short human summary, then the full payload
 * as JSON. Written to sit under the "Report from the app" heading of the issue template, so it
 * carries no headings of its own and nests cleanly when pasted.
 */
export function formatBugReport(report: BugReport, note = ""): string {
  const lines: string[] = [`**True Count bug report** (format ${report.format})`, ""];

  const trimmed = note.trim();
  if (trimmed) lines.push(`**What went wrong:** ${trimmed}`, "");

  lines.push(`- Screen: ${report.screen}`);
  lines.push(`- App: True Count ${report.app.version} on ${platformText(report.app)}`);
  lines.push(`- Table: ${report.table}`);
  lines.push(`- Counting System: ${report.countingSystem ?? "none"}`);
  lines.push(`- Shoe: ${shoeText(report.shoe)}`);
  if (report.round) lines.push(`- Round: ${roundText(report.round)}`);
  lines.push(`- Session: ${sessionText(report.session)}`);
  for (const [key, value] of Object.entries(report.details)) {
    lines.push(`- ${key}: ${String(value)}`);
  }

  const recipe = reproductionText(report);
  if (recipe) lines.push("", recipe);

  lines.push("", "```json", JSON.stringify(report, null, 2), "```");
  return lines.join("\n");
}

/** A file name that sorts by build and names the Shoe, so two reports never collide. */
export function bugReportFileName(report: BugReport): string {
  const shoe = report.shoe ? `seed-${report.shoe.seed}-card-${report.shoe.dealtCount}` : "no-shoe";
  return `true-count-bug-${report.app.version}-${shoe}.md`;
}

export interface IssueLink {
  readonly url: string;
  /** False when the report was too long for a URL and has to be pasted in by hand. */
  readonly prefilled: boolean;
}

/**
 * A GitHub "new issue" link with the report already in it, shaped like the issue template.
 *
 * An extra, never the path: it needs a network and a GitHub account, and ADR-0003 says neither
 * is required to *produce* a report. Copy and share work offline; this is for users who have
 * both and would rather not paste.
 */
export function issueLink(report: BugReport, note = ""): IssueLink {
  const headline = note.trim().split("\n")[0]?.slice(0, 80) ?? "";
  const title = `Bug: ${headline || `on the ${report.screen}`}`;
  const params = (body: string) =>
    `?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

  const full = `${NEW_ISSUE_URL}${params(issueBody(formatBugReport(report), note))}`;
  if (full.length <= MAX_ISSUE_URL_LENGTH) return { url: full, prefilled: true };

  // The copied report already carries the note, so the short form leaves both to the paste.
  const pasteHere = "<!-- Paste the report you copied from the app here. -->";
  return { url: `${NEW_ISSUE_URL}${params(issueBody(pasteHere))}`, prefilled: false };
}

/** The issue template's three sections, filled. Keep in step with `bug_report.md`. */
export function issueBody(reportText: string, note = ""): string {
  return [
    "## What went wrong",
    "",
    note.trim() || "<!-- One or two sentences. What did you see? -->",
    "",
    "## What you expected",
    "",
    "<!-- What should have happened instead? -->",
    "",
    "## Report from the app",
    "",
    reportText,
    "",
  ].join("\n");
}

// --- Helpers -----------------------------------------------------------------------------

function platformText(app: AppEnvironment): string {
  return app.osVersion ? `${app.platform} ${app.osVersion}` : app.platform;
}

function shoeText(shoe: ShoeReport | null): string {
  if (!shoe) return "none on this screen";
  const which = shoe.shoeIndex === null ? "" : ` (Shoe #${shoe.shoeIndex + 1})`;
  const check =
    shoe.rebuildsFromSeed === null
      ? ""
      : shoe.rebuildsFromSeed
        ? " — rebuilds from its seed"
        : " — DOES NOT rebuild from its seed";
  return (
    `seed ${shoe.seed}${which}, ${shoe.dealtCount} of ${shoe.cards} cards dealt, ` +
    `cut card at ${shoe.cutIndex}${check}`
  );
}

function roundText(round: RoundReport): string {
  const actions = round.actions.length === 0 ? "no actions yet" : round.actions.join(", ");
  const check =
    round.replaysFromActions === null
      ? ""
      : round.replaysFromActions
        ? " — replays exactly"
        : " — DOES NOT replay";
  return `${round.phase}, dealt from card ${round.startDealtCount}, bet ${round.bet}, ${actions}${check}`;
}

function sessionText(session: SessionReport | null): string {
  if (!session) return "none";
  return (
    `${session.id} (${session.mode}, seed ${session.seed}), ${session.status}, ` +
    `${session.rounds} rounds, ${session.decisions} Decisions logged — the next is #${session.nextDecisionIndex}`
  );
}

function reproductionText(report: BugReport): string | null {
  const { shoe, round } = report;
  if (!shoe) return null;
  const rebuild = `To reproduce: \`createShoe(rules, ${shoe.seed})\` and deal ${shoe.dealtCount} cards`;
  if (!round) return `${rebuild}.`;
  return (
    `${rebuild}; the round was dealt at card ${round.startDealtCount} ` +
    `(\`startRound\` with bet ${round.bet}) and its actions applied in order.`
  );
}

function actionText(action: RoundAction): ReportedAction {
  if (action.type === "insurance") return action.take ? "insurance:take" : "insurance:decline";
  return action.type;
}

function parseAction(action: ReportedAction): RoundAction {
  if (action === "insurance:take") return { type: "insurance", take: true };
  if (action === "insurance:decline") return { type: "insurance", take: false };
  return { type: action };
}

function dealTo(shoe: Shoe, dealtCount: number): Shoe {
  if (dealtCount > shoe.cards.length) {
    throw new Error(`The report says ${dealtCount} cards were dealt from a ${shoe.cards.length}-card Shoe.`);
  }
  let current = shoe;
  while (current.dealtCount < dealtCount) current = deal(current).shoe;
  return current;
}

function sameCards(a: Shoe, b: Shoe): boolean {
  if (a.cards.length !== b.cards.length || a.cutIndex !== b.cutIndex) return false;
  return a.cards.every((card, index) => sameCard(card, b.cards[index]));
}

function sameCard(a: Card, b: Card | undefined): boolean {
  return b !== undefined && a.rank === b.rank && a.suit === b.suit;
}

function sameRound(a: RoundState, b: RoundState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameRules(a: RuleSet, b: RuleSet): boolean {
  return (Object.keys(a) as (keyof RuleSet)[]).every((key) => a[key] === b[key]);
}
