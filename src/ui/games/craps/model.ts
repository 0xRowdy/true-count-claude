/**
 * The single-player craps table (/games/craps, frame lUiCl) as a pure view model.
 *
 * Everything the screen shows and does is a function of `GameState`: the betting window with
 * undo / clear / rebet, the spots on the felt, the roll (seeded dice from the engine), the coach
 * notes and the decisions and hand the roll records. No React, no clock, no randomness: the
 * seed is handed in after mount, and every die comes from `deriveSeed(seed, rollCount)`.
 *
 * Coach (CONTEXT.md invariants 2 and 3): each bet is graded by its house edge when it goes
 * down. A costly bet (center bets, place 4/10) or one whose payout breaks is a mistake; the
 * mistake note names a lower-edge alternative and can take the bet back before the roll.
 */

import { createRng } from "@/engine/rng";
import {
  type ActionResult,
  type Bet,
  type BetResolution,
  type BetSpec,
  type CoachNote as EngineNote,
  type CrapsRules,
  type CrapsTable,
  type Dice,
  type HardNumber,
  type OneRollKind,
  type PointNumber,
  type RollLabel,
  type RollOutcome,
  type TableAction,
  DOWNTOWN_RULES,
  YOU,
  applyAction,
  betName,
  betsOf,
  coachRoll,
  createTable,
  deriveSeed,
  exactStep,
  explainBet,
  formatDollars,
  formatEdge,
  formatSignedDollars,
  houseEdge,
  isComeBet,
  isLineBet,
  maxOddsHint,
  multipleLabel,
  netOf,
  oddsLimit,
  oddsNudge,
  onTable,
  passEdge,
  placeBet,
  placeEdge,
  reviewBet,
  roll as rollTable,
  rollDice,
  rollDetail,
  rollHeadline,
  rollHistoryLabels,
  setAmount,
  setOdds,
  tableEdge,
  takeDown,
  winBadge,
} from "@/games/craps";

// ---------------------------------------------------------------------------------------------
// Spots

export type CenterKind = Exclude<OneRollKind, "field">;

/** A betting area on the felt or in the Center bets sheet. */
export type Spot =
  | { readonly kind: "pass" | "dontPass" | "come" | "dontCome" | "field" }
  | { readonly kind: "place"; readonly number: PointNumber }
  | { readonly kind: "hard"; readonly number: HardNumber }
  | { readonly kind: CenterKind };

export const CENTER_KINDS: readonly CenterKind[] = [
  "anySeven",
  "anyCraps",
  "yo",
  "aceDeuce",
  "aces",
  "twelve",
];

export function spotKey(spot: Spot): string {
  return "number" in spot ? `${spot.kind}-${spot.number}` : spot.kind;
}

export function specFor(spot: Spot, amount: number): BetSpec {
  return { ...spot, amount } as BetSpec;
}

export function spotName(spot: Spot): string {
  return betName(specFor(spot, 1));
}

export function isCenterSpot(spot: Spot): boolean {
  return spot.kind === "hard" || (CENTER_KINDS as readonly string[]).includes(spot.kind);
}

/** The progress category a decision on this spot belongs to (DECISION_CATEGORIES.craps). */
export type CrapsCategory = "line" | "odds" | "come" | "place" | "payouts";

/**
 * Line bets are "line", come bets "come"; everything off the line (place, field, hardways and
 * the one-roll center bets) is graded under "place", the progress store's bets-off-the-line.
 */
export function categoryOf(spot: Spot): CrapsCategory {
  switch (spot.kind) {
    case "pass":
    case "dontPass":
      return "line";
    case "come":
    case "dontCome":
      return "come";
    default:
      return "place";
  }
}

/** Your bet on a spot, if any. Come spots hold only the come bet that has not travelled yet. */
export function betAt(table: CrapsTable, spot: Spot): Bet | undefined {
  return betsOf(table).find((b) => {
    if (b.kind !== spot.kind) return false;
    if (isComeBet(b)) return b.point === null;
    if ("number" in spot) return "number" in b && b.number === spot.number;
    return true;
  });
}

/** The spot a bet sits on, for rebet (buy and lay are not offered on this table). */
export function spotOf(bet: Bet): Spot | null {
  switch (bet.kind) {
    case "pass":
    case "dontPass":
    case "come":
    case "dontCome":
    case "field":
      return { kind: bet.kind };
    case "place":
      return { kind: "place", number: bet.number };
    case "hard":
      return { kind: "hard", number: bet.number };
    case "buy":
    case "lay":
      return null;
    default:
      return { kind: bet.kind };
  }
}

/**
 * Adds `amount` to a spot. With the point on, chips on your own pass or don't pass line go
 * behind it as odds (the flat bet is a contract by then); a second chip on the come adds to
 * the come bet that has not travelled yet.
 */
export function addToSpot(
  table: CrapsTable,
  spot: Spot,
  amount: number,
): ActionResult & { odds?: boolean } {
  const existing = betAt(table, spot);
  if ((spot.kind === "pass" || spot.kind === "dontPass") && table.point !== null && existing) {
    if (isLineBet(existing))
      return { ...setOdds(table, existing.id, existing.odds + amount), odds: true };
  }
  if ((spot.kind === "come" || spot.kind === "dontCome") && existing) {
    return setAmount(table, existing.id, existing.amount + amount);
  }
  return placeBet(table, specFor(spot, amount));
}

/** The smallest a bet of this kind may be: the table minimum for line, come and place bets. */
export function minimumFor(table: CrapsTable, kind: Spot["kind"]): number {
  return ["pass", "dontPass", "come", "dontCome", "place"].includes(kind) ? table.rules.minBet : 1;
}

/**
 * Whether taking `amount` off this bet would leave it under its minimum (then the whole bet has
 * to come down, which is "Take down", never a silent side effect of "take $1 off").
 */
export function wouldDropBelowMinimum(table: CrapsTable, bet: Bet, amount: number): boolean {
  const left = bet.amount - amount;
  return left > 0 && left < minimumFor(table, bet.kind as Spot["kind"]);
}

/** Takes `amount` off a spot (odds first on a line with the point on). */
export function removeFromSpot(table: CrapsTable, spot: Spot, amount: number): ActionResult {
  const bet = betAt(table, spot);
  if (!bet) return { ok: false, reason: `You have no bet on ${spotName(spot)}.` };
  if (isLineBet(bet) && bet.odds > 0) {
    return setOdds(table, bet.id, Math.max(0, bet.odds - amount));
  }
  const left = bet.amount - amount;
  if (left <= 0) return takeDown(table, bet.id);
  if (wouldDropBelowMinimum(table, bet, amount)) {
    return {
      ok: false,
      reason: `${spotName(spot)} can't go under the ${formatDollars(minimumFor(table, spot.kind))} minimum. Take it down instead (Edit bets).`,
    };
  }
  return setAmount(table, bet.id, left);
}

// ---------------------------------------------------------------------------------------------
// Grading

export type CoachLevel = "asked" | "mistakes" | "every";
export type NoteVariant = "hint" | "mistake" | "good";
export type NoteAction =
  | "takeBack"
  | "keep"
  | "gotIt"
  | "oddsHelp"
  | "maxOdds"
  | "fixAmount"
  | "rollAnyway";

export interface Note {
  readonly variant: NoteVariant;
  /** Small caps tag under the dealer's name: "GOOD CALL · ODDS". */
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly primary: NoteAction;
  readonly secondary?: NoteAction;
  /** For a take-back: the spot the caught bet is on. */
  readonly spot?: Spot;
  /** For "fixAmount": the exact-paying amount to set. */
  readonly fixTo?: number;
}

export const NOTE_ACTION_LABEL: Record<NoteAction, string> = {
  takeBack: "Take it back",
  keep: "Keep it",
  gotIt: "Got it",
  oddsHelp: "How odds work",
  maxOdds: "Take max odds",
  fixAmount: "Fix the amount",
  rollAnyway: "Roll anyway",
};

interface Grade {
  readonly category: CrapsCategory;
  readonly mistake: boolean;
  readonly note: Note;
}

/** Whether a place bet's amount breaks its payout (place 6 for $10 pays $11, not $11.67). */
function breaks(spot: Spot, amount: number): boolean {
  return spot.kind === "place" && amount % exactStep("place", spot.number) !== 0;
}

/** The lower-edge alternative the mistake note suggests. */
export function alternativeFor(table: CrapsTable, spot: Spot, amount: number): string {
  const line = betsOf(table).find(isLineBet);
  if (line && isLineBet(line) && table.point !== null && line.odds < oddsLimit(table, line)) {
    return `The same ${formatDollars(amount)} as odds behind your ${line.kind === "pass" ? "pass line" : "don't pass"} carries no house edge at all (0%).`;
  }
  if (spot.kind === "place") {
    return `Place the 6 or 8 instead: ${formatEdge(placeEdge(6))} house edge at 7:6.`;
  }
  return `The pass line (${formatEdge(passEdge())}) or place 6 and 8 (${formatEdge(placeEdge(6))}) cost a fraction of that per roll.`;
}

/** Grades the bet now on `spot` by its house edge (and whether its payout breaks). */
/**
 * Grades the bet on `spot`. While chips are still going down (`final` false) only the edge
 * counts: a place 8 built up chip by chip passes through amounts that break its payout.
 */
export function gradeSpot(table: CrapsTable, spot: Spot, final = true): Grade | null {
  const bet = betAt(table, spot);
  if (!bet) return null;
  const rules = table.rules;
  const spec = specFor(spot, bet.amount);
  const review = reviewBet(spec, rules);
  const category = categoryOf(spot);
  const name = spotName(spot);
  const broken = final && breaks(spot, bet.amount);
  const mistake = review.verdict === "costly" || broken;
  if (!final && !mistake && review.verdict === "fair" && spot.kind === "place") {
    // The breakage message is for the final amount; mid-build, grade the edge alone.
    return {
      category,
      mistake,
      note: {
        variant: "hint",
        kind: `Tip · ${CATEGORY_TAG[category]}`,
        title: `${name} has a ${formatEdge(review.edge)} house edge.`,
        body: explainBet(spec.kind, rules, "number" in spot ? spot.number : undefined),
        primary: "gotIt",
      },
    };
  }
  if (mistake) {
    const center = isCenterSpot(spot);
    const [first, ...rest] = review.message.split(/(?<=\.) /);
    return {
      category,
      mistake,
      note: {
        variant: "mistake",
        kind: center ? "Mistake · Center bet" : `Mistake · ${name}`,
        title: broken
          ? (first ?? review.message)
          : `${name} carries a ${formatEdge(review.edge)} house edge.`,
        body: broken
          ? `${rest.join(" ")} Take it back before the roll?`
          : `${alternativeFor(table, spot, bet.amount)} Take it back before the roll?`,
        primary: "takeBack",
        secondary: "keep",
        spot,
      },
    };
  }
  const good = review.verdict === "best" || review.verdict === "good";
  return {
    category,
    mistake,
    note: {
      variant: good ? "good" : "hint",
      kind: `${good ? "Good call" : "Tip"} · ${CATEGORY_TAG[category]}`,
      title: review.message,
      body: explainBet(spec.kind, rules, "number" in spot ? spot.number : undefined),
      primary: "gotIt",
    },
  };
}

const CATEGORY_TAG: Record<CrapsCategory, string> = {
  line: "Line",
  odds: "Odds",
  come: "Come",
  place: "Off the line",
  payouts: "Payouts",
};

function oddsNote(table: CrapsTable, bet: Bet): Note {
  const point = table.point ?? (isComeBet(bet) ? bet.point : null);
  const odds = isLineBet(bet) || isComeBet(bet) ? bet.odds : 0;
  return {
    variant: "good",
    kind: "Good call · Odds",
    title: `Taking ${multipleLabel(odds, bet.amount)} odds is the best bet on the table.`,
    body: point
      ? maxOddsHint(
          table.rules,
          point,
          bet.amount,
          odds,
          bet.kind === "pass" || bet.kind === "come" ? "do" : "dont",
        )
      : "Odds pay true odds, so the house has no edge on them.",
    primary: "gotIt",
    secondary: "oddsHelp",
  };
}

// ---------------------------------------------------------------------------------------------
// State

export type Phase = "bet" | "roll" | "result" | "payout";
export const PHASE_STEPS = ["Bet", "Roll", "Result", "Payout"] as const;
export const PHASE_INDEX: Record<Phase, number> = { bet: 0, roll: 1, result: 2, payout: 3 };

/** A graded choice waiting for the roll to be recorded. */
interface Pending {
  readonly category: CrapsCategory;
  readonly spot: Spot | null;
  /** The coach caught it as a mistake (recorded wrong and coached, whatever happens next). */
  readonly coached: boolean;
  /** Made after asking the coach for a hint (recorded as coached). */
  readonly hinted?: boolean;
  /** For odds: the line or come bet they sit behind. */
  readonly betId?: string;
  readonly takenBack: boolean;
  /** The pre-roll breakage check has already caught it. */
  readonly warned?: boolean;
}

/** What a rebet puts back: chips on a spot (odds, on a line with the point on). */
export interface RebetItem {
  readonly spot: Spot;
  readonly amount: number;
}

export interface LastRoll {
  /** The table as it stood when the dice were thrown. */
  readonly before: CrapsTable;
  readonly outcome: RollOutcome;
  /** Your resolutions this roll. */
  readonly mine: readonly BetResolution[];
  /** Your net this roll (won − lost). */
  readonly net: number;
  /** You had money in action (the roll is recorded as a hand). */
  readonly inAction: boolean;
}

export interface GameState {
  readonly seed: number | null;
  readonly table: CrapsTable;
  readonly phase: Phase;
  /** The table when this betting window opened (after the last roll). */
  readonly windowStart: CrapsTable;
  readonly undo: readonly CrapsTable[];
  readonly pending: Readonly<Record<string, Pending>>;
  readonly lastWindow: readonly RebetItem[];
  readonly last: LastRoll | null;
  readonly note: Note | null;
  readonly error: string | null;
  /** A neutral note about the last action ("Pass line starts at the $10 table minimum."). */
  readonly notice: string | null;
  /** The player asked the coach for a hint this betting window. */
  readonly hinted: boolean;
}

export function initialGame(rules: CrapsRules = DOWNTOWN_RULES): GameState {
  const table = createTable(rules);
  return {
    seed: null,
    table,
    phase: "bet",
    windowStart: table,
    undo: [],
    pending: {},
    lastWindow: [],
    last: null,
    note: null,
    error: null,
    notice: null,
    hinted: false,
  };
}

export function withSeed(state: GameState, seed: number): GameState {
  return { ...state, seed: seed >>> 0 };
}

/** Back to the Bet phase (from Result or Payout) without touching the layout. */
export function openBetting(state: GameState): GameState {
  return state.phase === "bet" || !bettingOpen(state) ? state : { ...state, phase: "bet" };
}

/** Bets close while the dice are out and the result shows; they reopen at the Payout. */
export function bettingOpen(state: GameState): boolean {
  return state.phase === "bet" || state.phase === "payout";
}

export const BETS_CLOSED = "No more bets until the payout.";

function closed(state: GameState): GameState {
  return { ...state, notice: BETS_CLOSED };
}

function changed(state: GameState, table: CrapsTable): GameState {
  return { ...state, table, undo: [...state.undo, state.table], error: null, notice: null };
}

/**
 * What a new bet on this spot starts at when the chip is under the table minimum (0 when the
 * spot already holds your bet, or takes any amount). A $5 chip on an empty pass line at a $10
 * table bets the $10; on the 6 or 8 it bets $12, the lowest amount at or above the minimum that
 * pays 7:6 exactly, so the table never picks an amount the coach would call a mistake.
 */
export function startingMinimum(table: CrapsTable, spot: Spot): number {
  if (minimumFor(table, spot.kind) <= 1) return 0;
  if (betAt(table, spot)) return 0;
  const min = table.rules.minBet;
  if (spot.kind === "place") {
    const step = exactStep("place", spot.number);
    return Math.ceil(min / step) * step;
  }
  return min;
}

function startsAtCopy(table: CrapsTable, spot: Spot, stake: number): string {
  const name = spotName(spot);
  const min = formatDollars(table.rules.minBet);
  return stake > table.rules.minBet
    ? `${name} starts at ${formatDollars(stake)}, the lowest amount at or above the ${min} minimum that pays exactly.`
    : `${name} starts at the ${min} table minimum.`;
}

/**
 * Bets `amount` on a spot. `available` is the practice chips not already on the layout.
 * Grades the bet and, per the coach level, shows a note (a caught mistake can be taken back).
 */
export function placeChip(
  state: GameState,
  spot: Spot,
  amount: number,
  available: number,
  coach: CoachLevel,
): GameState {
  if (!bettingOpen(state)) return closed(state);
  const s = openBetting(state);
  const minimum = startingMinimum(s.table, spot);
  const stake = Math.max(amount, minimum);
  if (stake > available) {
    return {
      ...s,
      error:
        available <= 0
          ? "You're out of practice chips."
          : `You have ${formatDollars(available)} in practice chips left.`,
    };
  }
  const result = addToSpot(s.table, spot, stake);
  if (!result.ok) return { ...s, error: result.reason };
  const bumped = stake > amount ? startsAtCopy(s.table, spot, stake) : null;
  const next = { ...changed(s, result.table), notice: bumped };
  if (result.odds && result.bet) {
    const key = `odds-${result.bet.id}`;
    return {
      ...next,
      pending: {
        ...next.pending,
        [key]: {
          category: "odds",
          spot: null,
          coached: false,
          hinted: s.hinted,
          betId: result.bet.id,
          takenBack: false,
        },
      },
      note: coach === "every" ? oddsNote(result.table, result.bet) : next.note,
    };
  }
  const grade = gradeSpot(result.table, spot, false);
  if (!grade) return next;
  const key = spotKey(spot);
  const caught = grade.mistake && coach !== "asked";
  const prev = next.pending[key];
  return {
    ...next,
    pending: {
      ...next.pending,
      [key]: {
        category: grade.category,
        spot,
        coached: (prev?.coached ?? false) || caught,
        hinted: (prev?.hinted ?? false) || s.hinted,
        takenBack: false,
      },
    },
    note: caught || coach === "every" ? grade.note : next.note,
  };
}

/**
 * Before the dice go out: a place bet whose payout breaks is caught (coach "mistakes" or
 * "every") with an offer to fix the amount. Returns null when there is nothing to catch.
 */
export function breakageCheck(
  state: GameState,
  coach: CoachLevel,
  available: number,
): GameState | null {
  if (coach === "asked") return null;
  for (const [key, entry] of Object.entries(state.pending)) {
    if (!entry.spot || entry.spot.kind !== "place" || entry.takenBack || entry.warned) continue;
    const bet = betAt(state.table, entry.spot);
    if (!bet || !breaks(entry.spot, bet.amount)) continue;
    const step = exactStep("place", entry.spot.number);
    const up = Math.ceil(bet.amount / step) * step;
    const fixTo =
      up - bet.amount <= available ? up : Math.max(step, Math.floor(bet.amount / step) * step);
    const grade = gradeSpot(state.table, entry.spot);
    if (!grade) continue;
    return {
      ...state,
      pending: { ...state.pending, [key]: { ...entry, coached: true, warned: true } },
      note: {
        ...grade.note,
        body: `${grade.note.body.replace(/ Take it back before the roll\?$/, "")} Make it ${formatDollars(fixTo)}?`,
        primary: "fixAmount",
        secondary: "rollAnyway",
        fixTo,
      },
    };
  }
  return null;
}

/** "Fix the amount": sets the caught place bet to its exact-paying amount. */
export function fixAmount(state: GameState, spot: Spot, amount: number): GameState {
  const bet = betAt(state.table, spot);
  if (!bet) return { ...state, note: null };
  const result = setAmount(state.table, bet.id, amount);
  if (!result.ok) return { ...state, note: null, error: result.reason };
  return { ...changed(state, result.table), note: null };
}

/** Takes `amount` off a spot (long-press, or "Take $X off" in Edit bets). */
export function removeChip(state: GameState, spot: Spot, amount: number): GameState {
  if (!bettingOpen(state)) return closed(state);
  const s = openBetting(state);
  const result = removeFromSpot(s.table, spot, amount);
  if (!result.ok) return { ...s, error: result.reason };
  const next = changed(s, result.table);
  const key = spotKey(spot);
  const entry = next.pending[key];
  if (entry && !entry.coached && !betAt(result.table, spot)) {
    const { [key]: _gone, ...pending } = next.pending;
    return { ...next, pending };
  }
  return next;
}

/** "Take it back": the caught bet comes down to what the spot held when the window opened. */
export function takeBack(state: GameState, spot: Spot): GameState {
  const bet = betAt(state.table, spot);
  const key = spotKey(spot);
  const dismissed = { ...state, note: null };
  if (!bet) return dismissed;
  const before = state.windowStart.bets.find((b) => b.id === bet.id);
  const result = before
    ? setAmount(state.table, bet.id, before.amount)
    : takeDown(state.table, bet.id);
  if (!result.ok) return { ...dismissed, error: result.reason };
  const entry = state.pending[key];
  return {
    ...changed(dismissed, result.table),
    pending: entry ? { ...state.pending, [key]: { ...entry, takenBack: true } } : state.pending,
  };
}

export function undo(state: GameState): GameState {
  const prev = state.undo[state.undo.length - 1];
  if (!prev) return state;
  return {
    ...state,
    table: prev,
    undo: state.undo.slice(0, -1),
    error: null,
    notice: null,
    note: null,
  };
}

/** Clears every chip put down in this window (standing bets stay up). */
export function clearWindow(state: GameState): GameState {
  if (state.undo.length === 0) return state;
  return {
    ...state,
    table: state.windowStart,
    undo: [],
    // A mistake the coach caught still counts once the chips come off.
    pending: Object.fromEntries(Object.entries(state.pending).filter(([, e]) => e.coached)),
    error: null,
    notice: null,
    note: null,
  };
}

export function canRebet(state: GameState): boolean {
  return state.undo.length === 0 && state.lastWindow.length > 0;
}

/** Puts back last window's chips, skipping any that are not legal now (e.g. pass on a point). */
export function rebet(state: GameState, available: number, coach: CoachLevel): GameState {
  if (!bettingOpen(state)) return closed(state);
  let s = openBetting(state);
  let left = available;
  const skipped: string[] = [];
  for (const item of state.lastWindow) {
    const next = placeChip(s, item.spot, item.amount, left, coach);
    if (next.error) {
      skipped.push(spotName(item.spot));
      s = { ...next, error: null };
    } else {
      left -= item.amount;
      s = next;
    }
  }
  // One undo step for the whole rebet.
  const merged = {
    ...s,
    undo: s.table === state.table ? state.undo : [...state.undo, state.table],
  };
  return skipped.length
    ? { ...merged, error: `Not rebet: ${skipped.join(", ")} (not available right now).` }
    : merged;
}

/** An edit from the Edit bets sheet (odds, working/off, take down). */
export function editBet(state: GameState, action: TableAction, coach: CoachLevel): GameState {
  if (!bettingOpen(state)) return closed(state);
  const s = openBetting(state);
  const before = action.type === "odds" ? s.table.bets.find((b) => b.id === action.betId) : null;
  const result = applyAction(s.table, action);
  if (!result.ok) return { ...s, error: result.reason };
  const next = changed(s, result.table);
  if (
    action.type === "odds" &&
    result.bet &&
    before &&
    (isLineBet(before) || isComeBet(before)) &&
    action.amount > before.odds
  ) {
    return {
      ...next,
      pending: {
        ...next.pending,
        [`odds-${result.bet.id}`]: {
          category: "odds",
          spot: null,
          coached: false,
          hinted: s.hinted,
          betId: result.bet.id,
          takenBack: false,
        },
      },
      note: coach === "every" ? oddsNote(result.table, result.bet) : next.note,
    };
  }
  return next;
}

/** Your line bet's max odds, from the coach's "Take max odds". */
export function takeMaxOdds(state: GameState, coach: CoachLevel): GameState {
  const line = betsOf(state.table).find(isLineBet);
  if (!line || state.table.point === null) return { ...state, note: null };
  const limit = oddsLimit(state.table, line);
  return { ...editBet(state, { type: "odds", betId: line.id, amount: limit }, coach), note: null };
}

export function dismissNote(state: GameState): GameState {
  return { ...state, note: null };
}

// ---------------------------------------------------------------------------------------------
// Rolling

export interface DecisionRecord {
  readonly category: CrapsCategory;
  readonly correct: boolean;
  readonly coached: boolean;
}

export interface RollEffects {
  readonly decisions: readonly DecisionRecord[];
  /** Your net for the roll, or null when you had nothing in action. */
  readonly hand: number | null;
}

function rebetItems(before: CrapsTable, windowStart: CrapsTable): RebetItem[] {
  const flats: RebetItem[] = [];
  const odds: RebetItem[] = [];
  for (const b of betsOf(before)) {
    const prev = windowStart.bets.find((p) => p.id === b.id);
    const spot = spotOf(b);
    if (!spot) continue;
    const added = b.amount - (prev?.amount ?? 0);
    if (added > 0 && !(isComeBet(b) && b.point !== null)) flats.push({ spot, amount: added });
    if (isLineBet(b)) {
      const prevOdds = prev && isLineBet(prev) ? prev.odds : 0;
      if (b.odds > prevOdds) odds.push({ spot, amount: b.odds - prevOdds });
    }
  }
  return [...flats, ...odds];
}

/** The dice for the next roll: a pure function of the seed and the roll number. */
export function nextDice(state: GameState): Dice {
  return rollDice(createRng(deriveSeed(state.seed ?? 0, state.table.rollCount)));
}

/**
 * Throws the dice: settles the layout, grades this window's decisions, and moves to the Roll
 * phase (the screen shows the dice tumbling, then `showResult`).
 */
export function throwDice(
  state: GameState,
  coach: CoachLevel,
  dice: Dice = nextDice(state),
): { state: GameState; effects: RollEffects } {
  const before = state.table;
  const outcome = rollTable(before, dice);
  const mine = outcome.resolutions.filter((r) => r.bet.owner === YOU);
  const inAction = mine.some((r) => r.outcome !== "off");
  const net = mine.reduce((sum, r) => sum + netOf(r), 0);

  const decisions: DecisionRecord[] = [];
  for (const entry of Object.values(state.pending)) {
    if (entry.category === "odds" || entry.spot === null) {
      // Only odds still standing above what the bet had when the window opened count.
      const now = before.bets.find((b) => b.id === entry.betId);
      const then = state.windowStart.bets.find((b) => b.id === entry.betId);
      const oddsOf = (b: Bet | undefined) => (b && (isLineBet(b) || isComeBet(b)) ? b.odds : 0);
      if (oddsOf(now) > oddsOf(then)) {
        decisions.push({ category: "odds", correct: true, coached: entry.hinted ?? false });
      }
      continue;
    }
    if (entry.coached) {
      // The coach caught this bet as a mistake. Whether it was taken back, fixed, undone,
      // cleared or kept, the decision made was the mistake: graded wrong, coached.
      decisions.push({ category: entry.category, correct: false, coached: true });
      continue;
    }
    const grade = gradeSpot(before, entry.spot);
    if (!grade) continue;
    decisions.push({
      category: entry.category,
      correct: !grade.mistake,
      coached: entry.hinted ?? false,
    });
  }

  const engineNote = coachRoll(outcome);
  const note =
    engineNote && (coach === "every" || (coach === "mistakes" && engineNote.tone === "mistake"))
      ? fromEngine(engineNote)
      : null;

  const items = rebetItems(before, state.windowStart);
  return {
    state: {
      ...state,
      table: outcome.table,
      phase: "roll",
      windowStart: outcome.table,
      undo: [],
      pending: {},
      lastWindow: items.length > 0 ? items : state.lastWindow,
      last: { before, outcome, mine, net, inAction },
      note,
      error: null,
      notice: null,
      hinted: false,
    },
    effects: { decisions, hand: inAction ? net : null },
  };
}

export function showResult(state: GameState): GameState {
  return state.phase === "roll" ? { ...state, phase: "result" } : state;
}

export function showPayout(state: GameState): GameState {
  return state.phase === "result" ? { ...state, phase: "payout" } : state;
}

function fromEngine(n: EngineNote): Note {
  const odds = n.tag.includes("ODDS");
  return {
    variant: n.tone === "good" ? "good" : n.tone === "mistake" ? "mistake" : "hint",
    kind: n.tag,
    title: n.title,
    body: n.body,
    primary: "gotIt",
    secondary: odds ? "oddsHelp" : undefined,
  };
}

/** "Ask the coach": shows the hint; bets made after it in this window count as coached. */
export function askCoach(state: GameState): GameState {
  return { ...state, note: coachHint(state), hinted: state.hinted || bettingOpen(state) };
}

/** After "Reset bankroll": the out-of-chips message no longer applies. */
export function afterReset(state: GameState): GameState {
  return { ...state, error: null, notice: null };
}

/** The note for "ask the coach" (and the pre-roll hint at coach level "every"). */
export function coachHint(state: GameState): Note {
  if ((state.phase === "result" || state.phase === "payout") && state.last) {
    const n = coachRoll(state.last.outcome);
    if (n) return fromEngine(n);
  }
  const t = state.table;
  const nudge = oddsNudge(t);
  if (nudge) {
    return {
      variant: "hint",
      kind: "Hint · Odds",
      title: "Back your line with full odds.",
      body: nudge,
      primary: "maxOdds",
      secondary: "oddsHelp",
    };
  }
  const mine = betsOf(t);
  if (t.point === null && !mine.some(isLineBet)) {
    return {
      variant: "hint",
      kind: "Hint · Line",
      title: `Start on the pass line: a ${formatEdge(passEdge())} house edge.`,
      body: explainBet("pass", t.rules),
      primary: "gotIt",
    };
  }
  return {
    variant: "hint",
    kind: "Hint · House edge",
    title:
      mine.length > 0
        ? `Your layout carries a ${formatEdge(tableEdge(mine, t.rules))} blended house edge.`
        : "Bet the pass line on the next come-out.",
    body: "Line bets cost 1.41%, place 6 and 8 1.52%, and odds nothing at all. Center bets run 9–17% of every dollar.",
    primary: "gotIt",
    secondary: "oddsHelp",
  };
}

// ---------------------------------------------------------------------------------------------
// What the screen draws

/**
 * The layout the felt shows: the bets as they stood when the dice went out, through the Roll
 * and Result phases (the win tags sit on them), then the settled layout for the Payout.
 */
export function shownTable(state: GameState): CrapsTable {
  return (state.phase === "roll" || state.phase === "result") && state.last
    ? state.last.before
    : state.table;
}

/**
 * The point the puck and header show. On a point made or a seven-out the puck is still on the
 * number while the call is made (Result), and comes off for the Payout.
 */
export function shownPoint(state: GameState): PointNumber | null {
  const last = state.last;
  if (state.phase === "roll" && last) return last.before.point;
  if (state.phase === "result" && last) {
    const e = last.outcome.record.event;
    if (e === "point-made" || e === "seven-out") return last.outcome.record.pointBefore;
  }
  return state.table.point;
}

export interface Call {
  readonly headline: string;
  readonly detail: string;
}

export function rollCallFor(state: GameState): Call {
  const t = state.table;
  if (state.phase === "roll") return { headline: "Dice are out…", detail: "No more bets" };
  if (state.last) {
    const r = state.last.outcome.record;
    return { headline: rollHeadline(r), detail: rollDetail(r) };
  }
  return t.point === null
    ? { headline: "Come-out roll", detail: "Bet the pass line, then roll" }
    : { headline: `Point is ${t.point}`, detail: "Place your bets" };
}

/** The ROLLS strip, most recent first. */
export function historyLabels(state: GameState, limit = 6): RollLabel[] {
  const t = state.phase === "roll" && state.last ? state.last.before : state.table;
  return rollHistoryLabels(t.history, limit);
}

export interface WinTag {
  readonly amount: string;
  readonly breakdown: string | null;
}

/** Win tags per spot key, in the Result and Payout phases ("+$46 · 10 + 36 odds"). */
export function winTags(state: GameState): Record<string, WinTag> {
  const out: Record<string, WinTag> = {};
  if (!state.last || state.phase === "bet" || state.phase === "roll") return out;
  const sums = new Map<string, { won: number; breakdown: string | null; count: number }>();
  for (const r of state.last.mine) {
    const badge = winBadge(r);
    const spot = spotOf(r.bet);
    if (!badge || !spot) continue;
    const key = isComeBet(r.bet) && r.bet.point !== null ? `place-${r.bet.point}` : spotKey(spot);
    const prev = sums.get(key);
    sums.set(key, {
      won: (prev?.won ?? 0) + r.won,
      breakdown: isLineBet(r.bet) ? badge.breakdown : null,
      count: (prev?.count ?? 0) + 1,
    });
  }
  for (const [key, v] of sums) {
    out[key] = { amount: formatSignedDollars(v.won), breakdown: v.count > 1 ? null : v.breakdown };
  }
  return out;
}

/** Your net this roll, for the result line ("+$46" / "−$22"), in Result and Payout. */
export function rollNetLabel(state: GameState): string | null {
  if (!state.last || !state.last.inAction || state.phase === "bet" || state.phase === "roll") {
    return null;
  }
  return formatSignedDollars(state.last.net);
}

/** A chip on the felt: its amount, and an optional caption ("ODDS 3x", "C", "OFF"). */
export interface FeltChip {
  readonly key: string;
  readonly amount: number;
  readonly label?: string;
}

/** Your chips on a box number: place bet, come and don't come bets that travelled there. */
export function numberChips(table: CrapsTable, n: PointNumber): FeltChip[] {
  const out: FeltChip[] = [];
  for (const b of betsOf(table)) {
    if (b.kind === "place" && b.number === n) out.push({ key: b.id, amount: b.amount });
    if (isComeBet(b) && b.point === n) {
      out.push({ key: b.id, amount: b.amount + b.odds, label: b.kind === "come" ? "C" : "DC" });
    }
  }
  return out;
}

export function lineChips(
  table: CrapsTable,
  kind: "pass" | "dontPass",
): {
  flat: number;
  odds: number;
  oddsLabel: string | null;
} {
  const bet = betsOf(table).find((b) => b.kind === kind);
  if (!bet || !isLineBet(bet)) return { flat: 0, odds: 0, oddsLabel: null };
  return {
    flat: bet.amount,
    odds: bet.odds,
    oddsLabel: bet.odds > 0 ? `ODDS ${multipleLabel(bet.odds, bet.amount)}` : null,
  };
}

export function stakeOn(table: CrapsTable, spot: Spot): number {
  const b = betAt(table, spot);
  return b ? b.amount + (isLineBet(b) || isComeBet(b) ? b.odds : 0) : 0;
}

/** The primary action's label: "Come-out roll" with no point, "Roll" with one. */
export function rollLabel(state: GameState): string {
  return state.table.point === null ? "Come-out roll" : "Roll";
}

export function onLayout(state: GameState): number {
  return onTable(state.table);
}

/** House edge copy for a spot (center bets sheet, rules). */
export function spotEdge(rules: CrapsRules, spot: Spot): string {
  return formatEdge(houseEdge(spot.kind, rules, "number" in spot ? spot.number : undefined));
}
