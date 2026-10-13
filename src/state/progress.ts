/**
 * Progress: a game-agnostic record of training, behind the Lobby and Progress & Mastery screens.
 *
 * ## What it records
 *
 * - **Decisions** — one per graded player choice, tagged with a per-game category
 *   (`DECISION_CATEGORIES`): blackjack hard/soft/pairs/doubles/insurance-surrender, craps
 *   line/odds/come/place/payouts, video poker hold types, roulette and baccarat bet choices.
 *   `coached` marks a decision the coach had to correct.
 * - **Hands** — one per settled hand/round/spin/roll, with its practice-chip `net`.
 * - **Sessions** — a bounded run at one game (`startProgressSession` / `endProgressSession`).
 *   Decisions and hands recorded while a session of their game is open belong to it.
 * - Practice days, streaks and the practice-chip bankroll per game are *derived* from the above
 *   (`progressSelectors.ts`), never stored twice.
 *
 * ## API (for the game screens)
 *
 * Pure reducers, each returning a new `ProgressState`:
 *
 * ```ts
 * recordDecision(state, { game: "craps", category: "odds", correct: true, coached: false }, when)
 * recordHand(state, { game: "craps", net: 30, strategyName: "Iron Cross" }, when)
 * startProgressSession(state, { id, game: "craps", strategyName: "Iron Cross" }, when)
 * endProgressSession(state, id, when)
 * ```
 *
 * `when` is `{ at: epochMs, day: "YYYY-MM-DD" }` — the caller's clock and the player's *local*
 * date. Nothing in this module reads a clock, generates an id or draws randomness. The React
 * binding (`src/ui/progress/progressStore.ts`) supplies all three and exposes the same calls
 * as `recordDecision(input)` etc. without the `state`/`when` arguments.
 *
 * ## Blackjack
 *
 * Blackjack Play and the blackjack drills already keep a full Session log (`./types`). That log
 * is the source of truth: `blackjackProgress()` converts it into progress records at read time
 * and `mergeProgress()` lays them alongside the recorded ones. **Do not also call
 * `recordDecision`/`recordHand` for blackjack Play or the drills** — it would count twice.
 *
 * ## Storage
 *
 * One key, `PROGRESS_KEY`, holding the recorded (non-blackjack) state, through the injected
 * `KeyValueStore`. Logs are capped (`PROGRESS_LIMITS`); trimmed hands fold their net into
 * `bankrollBase` so the chip balance stays exact. Reads are paranoid: malformed entries are
 * dropped, never trusted. `createProgressStore` is the state machine the UI binds to; changes
 * made before storage answers are replayed over the loaded state, never written over defaults.
 */

import type { Decision, DecisionAction, IndexPlay, Session } from "./types";
import { GAMES, type GameId, isIsoDate } from "./profile";
import type { KeyValueStore } from "./store";
import { rankValue, type Card } from "@/engine/cards";

// ---------------------------------------------------------------------------------------------
// Categories

export interface CategoryDef {
  readonly id: string;
  readonly label: string;
}

/** Decision categories per game, in display order. */
export const DECISION_CATEGORIES: Readonly<Record<GameId, readonly CategoryDef[]>> = {
  blackjack: [
    { id: "hard", label: "Hard totals" },
    { id: "pairs", label: "Pairs & splits" },
    { id: "doubles", label: "Doubles" },
    { id: "soft", label: "Soft totals" },
    { id: "insurance-surrender", label: "Insurance & surrender" },
  ],
  craps: [
    { id: "line", label: "Line bets" },
    { id: "odds", label: "Odds" },
    { id: "come", label: "Come bets" },
    { id: "place", label: "Place bets" },
    { id: "payouts", label: "Payouts" },
  ],
  roulette: [
    { id: "inside", label: "Inside bets" },
    { id: "outside", label: "Outside bets" },
    { id: "payouts", label: "Payouts" },
  ],
  "video-poker": [
    { id: "made-hands", label: "Made hands" },
    { id: "pairs", label: "Pairs" },
    { id: "flush-draws", label: "Flush draws" },
    { id: "straight-draws", label: "Straight draws" },
    { id: "high-cards", label: "High cards" },
  ],
  baccarat: [
    { id: "bet-choice", label: "Banker vs player" },
    { id: "side-bets", label: "Side bets" },
    { id: "payouts", label: "Payouts & commission" },
  ],
};

export function isCategory(game: GameId, category: string): boolean {
  return DECISION_CATEGORIES[game].some((c) => c.id === category);
}

export function categoryLabel(game: GameId, category: string): string {
  return DECISION_CATEGORIES[game].find((c) => c.id === category)?.label ?? category;
}

export function isGame(value: unknown): value is GameId {
  return typeof value === "string" && (GAMES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------
// Records

/** The caller's clock: epoch milliseconds and the player's local calendar date. */
export interface When {
  readonly at: number;
  readonly day: string;
}

export interface ProgressDecision {
  readonly game: GameId;
  readonly category: string;
  readonly correct: boolean;
  /** The coach stepped in to correct this decision. */
  readonly coached: boolean;
  readonly at: number;
  readonly day: string;
  readonly sessionId: string | null;
}

export interface ProgressHand {
  readonly game: GameId;
  /** Practice chips won (positive) or lost (negative). 0 is a push. */
  readonly net: number;
  readonly strategyName: string | null;
  readonly at: number;
  readonly day: string;
  readonly sessionId: string | null;
}

export interface ProgressSession {
  readonly id: string;
  readonly game: GameId;
  readonly strategyName: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly day: string;
}

/** The recorded state (persisted), or a merged view of it (`mergeProgress`). */
export interface ProgressState {
  readonly decisions: readonly ProgressDecision[];
  readonly hands: readonly ProgressHand[];
  readonly sessions: readonly ProgressSession[];
  /** Net of hands trimmed off the log, per game, so the bankroll survives trimming. */
  readonly bankrollBase: Readonly<Partial<Record<GameId, number>>>;
}

export const EMPTY_PROGRESS: ProgressState = {
  decisions: [],
  hands: [],
  sessions: [],
  bankrollBase: {},
};

/** Every game's practice bankroll starts here. */
export const PRACTICE_BANKROLL_START = 2000;

export const PROGRESS_LIMITS = { decisions: 20_000, hands: 20_000, sessions: 1_000 } as const;

export interface DecisionInput {
  readonly game: GameId;
  readonly category: string;
  readonly correct: boolean;
  readonly coached?: boolean;
}

export interface HandInput {
  readonly game: GameId;
  readonly net: number;
  readonly strategyName?: string;
}

export interface SessionInput {
  /** Caller-generated, unique. */
  readonly id: string;
  readonly game: GameId;
  readonly strategyName?: string;
}

function assertWhen(when: When): void {
  if (!Number.isFinite(when.at) || !isIsoDate(when.day)) {
    throw new Error(`progress: invalid time ${JSON.stringify(when)}`);
  }
}

function openSessionId(state: ProgressState, game: GameId): string | null {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i]!;
    if (s.game === game && s.endedAt === null) return s.id;
  }
  return null;
}

/** Records one graded decision. Throws on an unknown game/category (a programming error). */
export function recordDecision(
  state: ProgressState,
  input: DecisionInput,
  when: When,
): ProgressState {
  assertWhen(when);
  if (!isGame(input.game) || !isCategory(input.game, input.category)) {
    throw new Error(`progress: unknown category ${input.game}/${input.category}`);
  }
  const decision: ProgressDecision = {
    game: input.game,
    category: input.category,
    correct: input.correct,
    coached: input.coached ?? false,
    at: when.at,
    day: when.day,
    sessionId: openSessionId(state, input.game),
  };
  return trim({ ...state, decisions: [...state.decisions, decision] });
}

/** Records one settled hand and its practice-chip net. */
export function recordHand(state: ProgressState, input: HandInput, when: When): ProgressState {
  assertWhen(when);
  if (!isGame(input.game) || !Number.isFinite(input.net)) {
    throw new Error(`progress: invalid hand ${JSON.stringify(input)}`);
  }
  const sessionId = openSessionId(state, input.game);
  const hand: ProgressHand = {
    game: input.game,
    net: input.net,
    strategyName: input.strategyName ?? null,
    at: when.at,
    day: when.day,
    sessionId,
  };
  let sessions = state.sessions;
  // The first named hand names a session that started without a strategy.
  if (sessionId && input.strategyName) {
    sessions = sessions.map((s) =>
      s.id === sessionId && s.strategyName === null
        ? { ...s, strategyName: input.strategyName! }
        : s,
    );
  }
  return trim({ ...state, sessions, hands: [...state.hands, hand] });
}

/**
 * Opens a session at `input.game`. Any session of that game still open is ended at `when`
 * first, so there is at most one open session per game. A repeated id is ignored.
 */
export function startProgressSession(
  state: ProgressState,
  input: SessionInput,
  when: When,
): ProgressState {
  assertWhen(when);
  if (!isGame(input.game)) throw new Error(`progress: unknown game ${String(input.game)}`);
  if (state.sessions.some((s) => s.id === input.id)) return state;
  const sessions = state.sessions.map((s) =>
    s.game === input.game && s.endedAt === null ? { ...s, endedAt: when.at } : s,
  );
  const session: ProgressSession = {
    id: input.id,
    game: input.game,
    strategyName: input.strategyName ?? null,
    startedAt: when.at,
    endedAt: null,
    day: when.day,
  };
  return trim({ ...state, sessions: [...sessions, session] });
}

/** Ends a session. Idempotent: an ended or unknown session is left alone. */
export function endProgressSession(state: ProgressState, id: string, when: When): ProgressState {
  assertWhen(when);
  if (!state.sessions.some((s) => s.id === id && s.endedAt === null)) return state;
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === id ? { ...s, endedAt: Math.max(when.at, s.startedAt) } : s,
    ),
  };
}

function trim(state: ProgressState): ProgressState {
  const { decisions, hands, sessions } = PROGRESS_LIMITS;
  let next = state;
  if (state.hands.length > hands) {
    const cut = state.hands.length - hands;
    const base: Partial<Record<GameId, number>> = { ...state.bankrollBase };
    for (const h of state.hands.slice(0, cut)) base[h.game] = (base[h.game] ?? 0) + h.net;
    next = { ...next, hands: state.hands.slice(cut), bankrollBase: base };
  }
  if (next.decisions.length > decisions) {
    next = { ...next, decisions: next.decisions.slice(next.decisions.length - decisions) };
  }
  if (next.sessions.length > sessions) {
    next = { ...next, sessions: next.sessions.slice(next.sessions.length - sessions) };
  }
  return next;
}

/** Lays several progress records side by side (recorded + blackjack), ordered by time. */
export function mergeProgress(...parts: readonly ProgressState[]): ProgressState {
  const byAt = <T extends { at: number }>(a: T, b: T) => a.at - b.at;
  const base: Partial<Record<GameId, number>> = {};
  for (const p of parts) {
    for (const g of GAMES) {
      const v = p.bankrollBase[g];
      if (v) base[g] = (base[g] ?? 0) + v;
    }
  }
  return {
    decisions: parts.flatMap((p) => p.decisions).sort(byAt),
    hands: parts.flatMap((p) => p.hands).sort(byAt),
    sessions: parts.flatMap((p) => p.sessions).sort((a, b) => a.startedAt - b.startedAt),
    bankrollBase: base,
  };
}

// ---------------------------------------------------------------------------------------------
// Blackjack bridge

/** The blackjack decision category of a play, from its cards and the correct action. */
export function blackjackCategory(input: {
  readonly cards: readonly Card[];
  readonly soft: boolean;
  readonly actionTaken: DecisionAction;
  readonly correctAction: DecisionAction;
  readonly insurance?: boolean;
}): string {
  const actions = [input.actionTaken, input.correctAction];
  const has = (a: DecisionAction) => actions.includes(a);
  if (input.insurance || has("insurance") || has("decline-insurance") || has("surrender")) {
    return "insurance-surrender";
  }
  const [a, b] = input.cards;
  const pair =
    input.cards.length === 2 &&
    a !== undefined &&
    b !== undefined &&
    rankValue(a.rank) === rankValue(b.rank);
  if (pair || has("split")) return "pairs";
  if (has("double")) return "doubles";
  return input.soft ? "soft" : "hard";
}

/** "Basic Strategy · 6D S17" — the Rule Set a blackjack Session was played under. */
export function blackjackStrategyName(session: Session): string {
  const s17 = session.rules.dealerSoft17 === "stand" ? "S17" : "H17";
  const base = `Basic Strategy · ${session.rules.decks}D ${s17}`;
  if (session.mode === "drill" && session.drillId) {
    const drill = session.drillId
      .split("-")
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join(" ");
    return `${drill} drill · ${session.rules.decks}D ${s17}`;
  }
  return base;
}

function decisionFromBlackjack(d: Decision): Omit<ProgressDecision, "day" | "sessionId"> {
  return {
    game: "blackjack",
    category: blackjackCategory({
      cards: d.hand.playerCards,
      soft: d.hand.soft,
      actionTaken: d.actionTaken,
      correctAction: d.correctAction,
    }),
    correct: d.verdict === "correct",
    // The table explains every wrong play on the spot: that is the coach's correction.
    coached: d.verdict === "incorrect",
    at: d.at,
  };
}

function decisionFromIndexPlay(p: IndexPlay): Omit<ProgressDecision, "day" | "sessionId"> {
  const soft = p.placedCards.some((c) => c.rank === "A") && p.placedCards.length >= 2;
  return {
    game: "blackjack",
    category: blackjackCategory({
      cards: p.placedCards,
      soft,
      actionTaken: p.actionTaken,
      correctAction: p.correctAction,
      insurance: p.kind === "insurance",
    }),
    correct: p.verdict === "correct",
    coached: p.verdict === "incorrect",
    at: p.at,
  };
}

/**
 * Blackjack progress, derived from the Session log (Play and the drills). `dayOf` maps an
 * epoch time to the player's local date; the caller supplies it (this module has no clock).
 * Count checks and True Count conversions are counting skills, not decisions, and are left out.
 */
export function blackjackProgress(
  sessions: readonly Session[],
  dayOf: (at: number) => string,
): ProgressState {
  const decisions: ProgressDecision[] = [];
  const hands: ProgressHand[] = [];
  const out: ProgressSession[] = [];
  for (const session of sessions) {
    if (session.endReason === "discarded") continue;
    const strategyName = blackjackStrategyName(session);
    const sessionId = `bj:${session.id}`;
    const records = [
      ...session.decisions.map(decisionFromBlackjack),
      ...session.indexPlays.map(decisionFromIndexPlay),
    ];
    for (const r of records) decisions.push({ ...r, day: dayOf(r.at), sessionId });
    for (const round of session.rounds) {
      for (const hand of round.hands) {
        hands.push({
          game: "blackjack",
          net: hand.net,
          strategyName,
          at: round.at,
          day: dayOf(round.at),
          sessionId,
        });
      }
    }
    if (records.length === 0 && session.rounds.length === 0) continue;
    out.push({
      id: sessionId,
      game: "blackjack",
      strategyName,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      day: dayOf(session.startedAt),
    });
  }
  return mergeProgress({ decisions, hands, sessions: out, bankrollBase: {} });
}

// ---------------------------------------------------------------------------------------------
// Persistence

export const PROGRESS_KEY = "tableside/progress/v1";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

function parseDecision(v: unknown): ProgressDecision | null {
  if (typeof v !== "object" || v === null) return null;
  const d = v as Record<string, unknown>;
  if (!isGame(d.game) || typeof d.category !== "string" || !isCategory(d.game, d.category)) {
    return null;
  }
  if (typeof d.correct !== "boolean" || !isNum(d.at) || !isIsoDate(d.day)) return null;
  if (!isStrOrNull(d.sessionId ?? null)) return null;
  return {
    game: d.game,
    category: d.category,
    correct: d.correct,
    coached: d.coached === true,
    at: d.at,
    day: d.day,
    sessionId: (d.sessionId as string | null | undefined) ?? null,
  };
}

function parseHand(v: unknown): ProgressHand | null {
  if (typeof v !== "object" || v === null) return null;
  const h = v as Record<string, unknown>;
  if (!isGame(h.game) || !isNum(h.net) || !isNum(h.at) || !isIsoDate(h.day)) return null;
  if (!isStrOrNull(h.strategyName ?? null) || !isStrOrNull(h.sessionId ?? null)) return null;
  return {
    game: h.game,
    net: h.net,
    strategyName: (h.strategyName as string | null | undefined) ?? null,
    at: h.at,
    day: h.day,
    sessionId: (h.sessionId as string | null | undefined) ?? null,
  };
}

function parseSession(v: unknown): ProgressSession | null {
  if (typeof v !== "object" || v === null) return null;
  const s = v as Record<string, unknown>;
  if (typeof s.id !== "string" || !isGame(s.game) || !isNum(s.startedAt)) return null;
  if (!(s.endedAt === null || isNum(s.endedAt)) || !isIsoDate(s.day)) return null;
  if (!isStrOrNull(s.strategyName ?? null)) return null;
  return {
    id: s.id,
    game: s.game,
    strategyName: (s.strategyName as string | null | undefined) ?? null,
    startedAt: s.startedAt,
    endedAt: s.endedAt as number | null,
    day: s.day,
  };
}

function list<T>(v: unknown, parse: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    const p = parse(x);
    if (p) out.push(p);
  }
  return out;
}

/** Parses stored progress. Never throws; malformed entries are dropped. */
export function parseProgress(raw: string | null): ProgressState | undefined {
  if (raw === null) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== "object" || data === null) return undefined;
  const d = data as Record<string, unknown>;
  if (d.version !== 1) return undefined;
  const base: Partial<Record<GameId, number>> = {};
  if (typeof d.bankrollBase === "object" && d.bankrollBase !== null) {
    for (const g of GAMES) {
      const v = (d.bankrollBase as Record<string, unknown>)[g];
      if (isNum(v)) base[g] = v;
    }
  }
  return {
    decisions: list(d.decisions, parseDecision),
    hands: list(d.hands, parseHand),
    sessions: list(d.sessions, parseSession),
    bankrollBase: base,
  };
}

export function serializeProgress(state: ProgressState): string {
  return JSON.stringify({ version: 1, ...state });
}

export interface ProgressRepository {
  load(): Promise<ProgressState | undefined>;
  save(state: ProgressState): Promise<void>;
  clear(): Promise<void>;
}

export function createProgressRepository(kv: KeyValueStore): ProgressRepository {
  return {
    load: async () => parseProgress(await kv.getItem(PROGRESS_KEY)),
    save: (state) => kv.setItem(PROGRESS_KEY, serializeProgress(state)),
    clear: () => kv.removeItem(PROGRESS_KEY),
  };
}

// ---------------------------------------------------------------------------------------------
// Store (state machine the React binding wraps)

export type ProgressStatus = "loading" | "stored" | "empty" | "unavailable";

export interface ProgressStoreState {
  readonly progress: ProgressState;
  /** False until storage has answered. Screens show their loading state until then. */
  readonly ready: boolean;
  readonly status: ProgressStatus;
}

export const INITIAL_PROGRESS_STATE: ProgressStoreState = {
  progress: EMPTY_PROGRESS,
  ready: false,
  status: "loading",
};

export type ProgressChange = (state: ProgressState) => ProgressState;

export interface ProgressStore {
  subscribe(listener: () => void): () => void;
  snapshot(): ProgressStoreState;
  /** Reads storage once. Idempotent. */
  load(): Promise<void>;
  /**
   * Applies a change (e.g. `s => recordHand(s, input, when)`) and persists the result.
   * Before storage answers, changes queue and are replayed over the stored state.
   */
  apply(change: ProgressChange): Promise<void>;
  /** Forgets all recorded progress. */
  clear(): Promise<void>;
}

/**
 * The progress state machine, free of React and platform storage (tested in Node). Like the
 * profile store: a change made before the stored progress has loaded is queued and replayed on
 * top of what storage returns, so an early hand never overwrites a returning player's history.
 */
export function createProgressStore(repo: ProgressRepository): ProgressStore {
  let state: ProgressStoreState = INITIAL_PROGRESS_STATE;
  const listeners = new Set<() => void>();
  let loading: Promise<void> | undefined;
  let pending: ProgressChange[] = [];
  let pendingClear = false;
  let writes: Promise<unknown> = Promise.resolve();

  const publish = (next: ProgressStoreState) => {
    state = next;
    for (const l of listeners) l();
  };
  const persist = (work: () => Promise<void>) => {
    writes = writes.then(work).catch(() => publish({ ...state, status: "unavailable" }));
    return writes.then(() => undefined);
  };
  const replay = (base: ProgressState, changes: readonly ProgressChange[]) =>
    changes.reduce((s, c) => c(s), base);

  function load(): Promise<void> {
    loading ??= repo.load().then(
      (stored) => {
        const base = pendingClear ? EMPTY_PROGRESS : (stored ?? EMPTY_PROGRESS);
        const changes = pending;
        const cleared = pendingClear;
        pending = [];
        pendingClear = false;
        const progress = replay(base, changes);
        if (changes.length > 0) {
          publish({ progress, ready: true, status: "stored" });
          return persist(() => repo.save(progress));
        }
        if (cleared) {
          publish({ progress, ready: true, status: "empty" });
          return persist(() => repo.clear());
        }
        publish({ progress, ready: true, status: stored ? "stored" : "empty" });
        return undefined;
      },
      () => {
        const progress = replay(EMPTY_PROGRESS, pending);
        pending = [];
        pendingClear = false;
        publish({ progress, ready: true, status: "unavailable" });
      },
    );
    return loading;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
    load,
    apply(change) {
      if (!state.ready) {
        pending.push(change);
        publish({ ...state, progress: change(state.progress) });
        return load();
      }
      const progress = change(state.progress);
      publish({
        ...state,
        progress,
        status: state.status === "unavailable" ? "unavailable" : "stored",
      });
      return persist(() => repo.save(progress));
    },
    clear() {
      if (!state.ready) {
        pendingClear = true;
        pending = [];
        publish({ ...state, progress: EMPTY_PROGRESS });
        return load();
      }
      publish({
        progress: EMPTY_PROGRESS,
        ready: true,
        status: state.status === "unavailable" ? "unavailable" : "empty",
      });
      return persist(() => repo.clear());
    },
  };
}
