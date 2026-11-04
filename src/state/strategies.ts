/**
 * Strategy drafts: the strategies a player builds or forks in the Strategy Builder, kept on
 * this device only (ADR-0003: local-first, no backend).
 *
 * A draft holds the strategy *and* the original it was forked from, so "Compare (n changes)"
 * and the credit line work offline and survive the original changing. Every shape here is
 * plain JSON: a blackjack chart is a map of cell overrides, a craps plan is the craps
 * engine's `BetPlan`, and a roulette layout is the roulette engine's bet list plus its
 * progression and session rules.
 *
 * Pure: parsing and the store's state machine run in plain Node against `createMemoryStore()`.
 * The React binding lives in `src/ui/strategies/draftStore.ts`, following the player profile
 * store (`createProfileStore`): reads wait for storage, and changes made before storage
 * answers are replayed on top of what it returns rather than written over it.
 */

import type { ChartCode, RuleSet } from "../engine";
import { validateRules } from "../engine";
import type { BetPlan } from "../games/craps";
import {
  type Bet,
  type ProgressionKind,
  type CustomProgression,
  type RouletteRules,
  type SessionRules,
  getSpot,
  validateRouletteRules,
  DEFAULT_CUSTOM_PROGRESSION,
  PROGRESSION_ACTIONS,
} from "../games/roulette";
import type { KeyValueStore } from "./store";

export const STRATEGY_GAMES = ["blackjack", "craps", "roulette"] as const;
export type StrategyGame = (typeof STRATEGY_GAMES)[number];

/** Who made the strategy a draft was forked from. Shown on every copy. */
export interface StrategyCredit {
  readonly id: string;
  readonly title: string;
  /** "Tableside Curated", "@rail_rita". */
  readonly author: string;
  readonly version: number;
}

interface DraftCommon {
  readonly id: string;
  readonly title: string;
  readonly forkedFrom: StrategyCredit | null;
  /** Coach notes, keyed by the change they explain (a chart cell, a plan rule, a bet). */
  readonly notes: Readonly<Record<string, string>>;
  /** ISO timestamp of the last autosave; null until the first edit is stored. */
  readonly savedAt: string | null;
}

/** A blackjack chart: the original's chart plus this draft's cell overrides. */
export interface ChartSource {
  readonly rules: RuleSet;
  /** Cells that differ from Basic Strategy for `rules`, keyed `section:row:upcard`. */
  readonly cells: Readonly<Record<string, ChartCode>>;
}

export interface BlackjackDraft extends DraftCommon {
  readonly game: "blackjack";
  /** The table the strategy is written for (and rules-checked against). */
  readonly rules: RuleSet;
  /** The chart it started from. */
  readonly base: ChartSource;
  /** Cells this draft sets, on top of the base chart. */
  readonly cells: Readonly<Record<string, ChartCode>>;
  /** Bet sizing by true count; absent until the player sets one. */
  readonly ramp?: BetRamp;
}

/** Bets by true count: `units[0]` at TC ≤ 0, then +1, +2 … `units[5]` at +5 or more. */
export interface BetRamp {
  /** One unit, in dollars. */
  readonly unit: number;
  readonly units: readonly number[];
}

export const RAMP_STEPS = 6;

function cleanRamp(v: unknown): BetRamp | undefined {
  if (!isObject(v) || typeof v.unit !== "number" || !(v.unit > 0) || !Array.isArray(v.units)) {
    return undefined;
  }
  const units = v.units.slice(0, RAMP_STEPS);
  if (
    units.length !== RAMP_STEPS ||
    !units.every((u) => Number.isInteger(u) && u >= 1 && u <= 100)
  ) {
    return undefined;
  }
  return { unit: v.unit, units: units as number[] };
}

export interface CrapsDraft extends DraftCommon {
  readonly game: "craps";
  readonly plan: BetPlan;
  readonly original: BetPlan;
}

/** A roulette strategy: the bets on every spin, how they change, and when to stop. */
export interface RouletteLayoutPlan {
  readonly rules: RouletteRules;
  readonly bets: readonly Bet[];
  readonly progression: ProgressionKind;
  readonly customProgression?: CustomProgression;
  readonly session: SessionRules;
}

/** The builder runs 200 sessions at once; cap saved plans to keep that work interactive. */
export const MAX_ROULETTE_DRAFT_SPINS = 1000;

export interface RouletteDraft extends DraftCommon {
  readonly game: "roulette";
  readonly layout: RouletteLayoutPlan;
  readonly original: RouletteLayoutPlan;
}

export type StrategyDraft = BlackjackDraft | CrapsDraft | RouletteDraft;

export const STRATEGIES_KEY = "tableside/strategies/v1";

/** Coach notes are short by design: the builder counts to 160. */
export const NOTE_LIMIT = 160;

const CHART_CODES: ReadonlySet<string> = new Set(["H", "S", "D", "Ds", "P", "Rh", "Rs", "Rp"]);
const PROGRESSIONS: ReadonlySet<string> = new Set(["flat", "martingale", "dalembert", "custom"]);

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";

function cleanCells(v: unknown): Record<string, ChartCode> | undefined {
  if (!isObject(v)) return undefined;
  const out: Record<string, ChartCode> = {};
  for (const [k, code] of Object.entries(v)) {
    if (isString(code) && CHART_CODES.has(code)) out[k] = code as ChartCode;
  }
  return out;
}

function cleanNotes(v: unknown): Record<string, string> {
  if (!isObject(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, note] of Object.entries(v)) {
    if (isString(note) && note.trim() !== "")
      out[k] = Array.from(note).slice(0, NOTE_LIMIT).join("");
  }
  return out;
}

function cleanCredit(v: unknown): StrategyCredit | null {
  if (!isObject(v)) return null;
  const { id, title, author, version } = v;
  if (!isString(id) || !isString(title) || !isString(author)) return null;
  return { id, title, author, version: typeof version === "number" ? version : 1 };
}

function isRuleSet(v: unknown): v is RuleSet {
  if (!isObject(v)) return false;
  try {
    return (
      validateRules(v as unknown as RuleSet).length === 0 && typeof v.dealerSoft17 === "string"
    );
  } catch {
    return false;
  }
}

function isRouletteRules(v: unknown): v is RouletteRules {
  if (!isObject(v) || !isObject(v.limits)) return false;
  return validateRouletteRules(v as unknown as RouletteRules).length === 0;
}

function isBetPlan(v: unknown): v is BetPlan {
  return (
    isObject(v) &&
    isString(v.name) &&
    isObject(v.rules) &&
    Array.isArray(v.comeOut) &&
    Array.isArray(v.pointOn) &&
    isObject(v.money) &&
    (v.placeWins === null || isObject(v.placeWins))
  );
}

function cleanCustomProgression(v: unknown): CustomProgression {
  if (!isObject(v)) return DEFAULT_CUSTOM_PROGRESSION;
  return {
    afterLoss: PROGRESSION_ACTIONS.find((a) => a === v.afterLoss) ?? "add",
    afterWin: PROGRESSION_ACTIONS.find((a) => a === v.afterWin) ?? "reset",
    units:
      typeof v.units === "number" && Number.isInteger(v.units) && v.units >= 1 && v.units <= 10
        ? v.units
        : 1,
  };
}

function cleanLayout(v: unknown): RouletteLayoutPlan | undefined {
  if (!isObject(v) || !isRouletteRules(v.rules) || !Array.isArray(v.bets)) return undefined;
  const rules = v.rules;
  const bets = v.bets.filter(
    (b): b is Bet =>
      isObject(b) &&
      isString(b.spotId) &&
      typeof b.amount === "number" &&
      Number.isFinite(b.amount) &&
      b.amount > 0 &&
      getSpot(rules, b.spotId) !== undefined,
  );
  const session = isObject(v.session) ? v.session : {};
  const maxSpins =
    typeof session.maxSpins === "number" &&
    Number.isInteger(session.maxSpins) &&
    session.maxSpins > 0
      ? Math.min(MAX_ROULETTE_DRAFT_SPINS, session.maxSpins)
      : 60;
  return {
    rules,
    bets: bets.map((b) => ({ spotId: b.spotId, amount: b.amount })),
    progression:
      isString(v.progression) && PROGRESSIONS.has(v.progression)
        ? (v.progression as ProgressionKind)
        : "flat",
    ...(v.progression === "custom" || v.customProgression !== undefined
      ? { customProgression: cleanCustomProgression(v.customProgression) }
      : {}),
    session: {
      maxSpins,
      ...(typeof session.stopWhenUp === "number" &&
      Number.isFinite(session.stopWhenUp) &&
      session.stopWhenUp > 0
        ? { stopWhenUp: session.stopWhenUp }
        : {}),
      ...(typeof session.stopWhenDown === "number" &&
      Number.isFinite(session.stopWhenDown) &&
      session.stopWhenDown > 0
        ? { stopWhenDown: session.stopWhenDown }
        : {}),
    },
  };
}

/** Cleans one stored draft. Returns undefined for anything that is not a usable draft. */
export function normalizeDraft(v: unknown): StrategyDraft | undefined {
  if (!isObject(v) || !isString(v.id) || v.id === "" || !isString(v.title)) return undefined;
  const common = {
    id: v.id,
    title: v.title.trim() === "" ? "Untitled strategy" : v.title,
    forkedFrom: cleanCredit(v.forkedFrom),
    notes: cleanNotes(v.notes),
    savedAt: isString(v.savedAt) ? v.savedAt : null,
  };
  switch (v.game) {
    case "blackjack": {
      const base = isObject(v.base) ? v.base : undefined;
      const cells = cleanCells(v.cells);
      const baseCells = cleanCells(base?.cells);
      if (!isRuleSet(v.rules) || !base || !isRuleSet(base.rules) || !cells || !baseCells) {
        return undefined;
      }
      const ramp = cleanRamp(v.ramp);
      return {
        ...common,
        game: "blackjack",
        rules: v.rules,
        base: { rules: base.rules, cells: baseCells },
        cells,
        ...(ramp ? { ramp } : {}),
      };
    }
    case "craps":
      if (!isBetPlan(v.plan) || !isBetPlan(v.original)) return undefined;
      return { ...common, game: "craps", plan: v.plan, original: v.original };
    case "roulette": {
      const layout = cleanLayout(v.layout);
      const original = cleanLayout(v.original);
      if (!layout || !original) return undefined;
      return { ...common, game: "roulette", layout, original };
    }
    default:
      return undefined;
  }
}

/** Parses the stored draft list. Never throws; unusable entries are dropped. */
export function parseDrafts(raw: string | null): StrategyDraft[] | undefined {
  if (raw === null) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isObject(data) || !Array.isArray(data.drafts)) return undefined;
  const seen = new Set<string>();
  const drafts: StrategyDraft[] = [];
  for (const entry of data.drafts) {
    const draft = normalizeDraft(entry);
    if (!draft || seen.has(draft.id)) continue;
    seen.add(draft.id);
    drafts.push(draft);
  }
  return drafts;
}

export interface DraftRepository {
  load(): Promise<StrategyDraft[] | undefined>;
  save(drafts: readonly StrategyDraft[]): Promise<void>;
}

export function createDraftRepository(kv: KeyValueStore): DraftRepository {
  return {
    load: async () => parseDrafts(await kv.getItem(STRATEGIES_KEY)),
    save: (drafts) => kv.setItem(STRATEGIES_KEY, JSON.stringify({ drafts })),
  };
}

/** A draft id that is not taken yet: `prefix`, then `prefix-2`, `prefix-3`… */
export function uniqueDraftId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(prefix)) return prefix;
  for (let n = 2; ; n++) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}

export type DraftsStatus = "loading" | "stored" | "empty" | "unavailable";

export interface DraftsState {
  /** Most recently saved first. Empty until storage answers. */
  readonly drafts: readonly StrategyDraft[];
  readonly ready: boolean;
  /** "unavailable": storage failed; edits work for this visit but will not survive a reload. */
  readonly status: DraftsStatus;
}

export const INITIAL_DRAFTS_STATE: DraftsState = { drafts: [], ready: false, status: "loading" };

type PendingOp = { type: "save"; draft: StrategyDraft } | { type: "remove"; id: string };

export interface DraftStore {
  subscribe(listener: () => void): () => void;
  snapshot(): DraftsState;
  /** Reads storage once. Idempotent. */
  load(): Promise<void>;
  /** Inserts or replaces a draft (by id) and moves it to the top. */
  save(draft: StrategyDraft): Promise<void>;
  remove(id: string): Promise<void>;
}

function applyOp(drafts: readonly StrategyDraft[], op: PendingOp): StrategyDraft[] {
  const rest = drafts.filter((d) => d.id !== (op.type === "save" ? op.draft.id : op.id));
  return op.type === "save" ? [op.draft, ...rest] : rest;
}

/**
 * The draft list's state machine, free of React and platform storage so it is testable in
 * Node. Saves made before storage has answered are queued and replayed on top of the stored
 * list, so an early autosave never erases drafts saved on an earlier visit.
 */
export function createDraftStore(repo: DraftRepository): DraftStore {
  let state: DraftsState = INITIAL_DRAFTS_STATE;
  const listeners = new Set<() => void>();
  let loading: Promise<void> | undefined;
  let pending: PendingOp[] = [];
  let writes: Promise<unknown> = Promise.resolve();

  const publish = (next: DraftsState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const persist = (drafts: readonly StrategyDraft[]) => {
    writes = writes
      .then(() => repo.save(drafts))
      .catch(() => publish({ ...state, status: "unavailable" }));
    return writes.then(() => undefined);
  };
  const statusFor = (drafts: readonly StrategyDraft[]): DraftsStatus =>
    state.status === "unavailable" ? "unavailable" : drafts.length > 0 ? "stored" : "empty";

  function load(): Promise<void> {
    loading ??= repo.load().then(
      (stored) => {
        const ops = pending;
        pending = [];
        const drafts = ops.reduce(applyOp, stored ?? []);
        // Queue the replayed write *before* publishing: a listener that reacts to the publish
        // with a newer save then queues after it, and the newer list wins on disk.
        const saved = ops.length > 0 ? persist(drafts) : undefined;
        publish({ drafts, ready: true, status: drafts.length > 0 ? "stored" : "empty" });
        return saved;
      },
      () => {
        const drafts = pending.reduce(applyOp, [] as StrategyDraft[]);
        pending = [];
        publish({ drafts, ready: true, status: "unavailable" });
      },
    );
    return loading;
  }

  function change(op: PendingOp): Promise<void> {
    const drafts = applyOp(state.drafts, op);
    if (!state.ready) {
      pending.push(op);
      publish({ ...state, drafts });
      return load();
    }
    const saved = persist(drafts);
    publish({ ...state, drafts, status: statusFor(drafts) });
    return saved;
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
    save: (draft) => change({ type: "save", draft }),
    remove: (id) => change({ type: "remove", id }),
  };
}
