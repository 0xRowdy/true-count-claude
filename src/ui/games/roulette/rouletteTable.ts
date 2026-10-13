/**
 * The Roulette table's view model (frame dBsVJ): a pure reducer over the roulette engine, plus
 * the selectors and copy the screen renders. React-free so it runs under vitest; the screen
 * (`RouletteScreen.tsx`) only dispatches actions and draws the result.
 *
 * A round runs Bet → Spin → Result → Payout (the Phase Stepper). Spin `i` of a table lands on
 * `spinPocket(rules, seed, i)`, so a seed replays a whole visit, even across wheel changes.
 *
 * The coach (CONTEXT.md invariants 2 and 3) uses the engine's coach helpers. Roulette has no
 * "wrong" bet beyond the house edge, with one exception the engine measures: the American top
 * line (0, 00, 1, 2, 3) carries 7.89% against 5.26% for everything else. That is the only bet
 * graded as a mistake. Every other bet choice is recorded as a correct decision.
 */

import {
  type Bet,
  type BetSpot,
  type Pocket,
  type RouletteRules,
  type SpinSettlement,
  AMERICAN_RULES,
  EUROPEAN_RULES,
  FRENCH_RULES,
  addChips,
  analyzeBets,
  betsTouching,
  columnOf,
  describeBetSummary,
  dozenOf,
  explainHouseEdgeIsTheSame,
  explainLaPartage,
  explainLowestEdgeBets,
  explainNoMemory,
  formatDollars,
  formatHouseEdge,
  formatSignedDollars,
  fromCents,
  getLayout,
  getSpot,
  houseEdgeOf,
  isEvenMoneyBet,
  isInsideBet,
  isZero,
  loupeCaption,
  pocketColor,
  removeChips,
  settleBets,
  spinPocket,
  spotShortName,
  spotTitle,
  streetOf,
  toCents,
  totalStake,
  validateBets,
  wheelHouseEdge,
} from "@/games/roulette";
import type { CoachLevel } from "@/state/profile";

// ---------------------------------------------------------------------------------------------
// Wheels and phases

export type WheelChoice = "european" | "american" | "french";

export const WHEEL_RULES: Readonly<Record<WheelChoice, RouletteRules>> = {
  european: EUROPEAN_RULES,
  american: AMERICAN_RULES,
  french: FRENCH_RULES,
};

export const WHEEL_OPTIONS: ReadonlyArray<{ value: WheelChoice; label: string }> = [
  { value: "european", label: "European" },
  { value: "american", label: "American" },
  { value: "french", label: "French" },
];

export type Phase = "bet" | "spin" | "result" | "payout";

export const ROULETTE_PHASES = ["Bet", "Spin", "Result", "Payout"] as const;

export function phaseIndex(phase: Phase): number {
  return ["bet", "spin", "result", "payout"].indexOf(phase);
}

/** How long the ball spins before the result shows, in ms. */
export const SPIN_MS = 900;

export const CHIPS = [1, 5, 25, 100, 500, 1000] as const;
export type ChipAmount = (typeof CHIPS)[number];

// ---------------------------------------------------------------------------------------------
// State

export type CoachKind = "hint" | "mistake" | "good";

export interface CoachMessage {
  readonly variant: CoachKind;
  /** Eyebrow under the dealer's name. */
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  /** The spot a mistake note offers to take back. */
  readonly takeBack?: string;
}

export interface Caught {
  readonly spotId: string;
  readonly category: "inside" | "outside";
}

export interface TableState {
  readonly wheel: WheelChoice;
  /** Null until drawn after mount (hydration). */
  readonly seed: number | null;
  /** Practice chips; null until the progress store has answered. */
  readonly bankroll: number | null;
  /** Every spin of this visit, oldest first. */
  readonly history: readonly Pocket[];
  readonly chip: ChipAmount;
  readonly bets: readonly Bet[];
  /** Bet lists before each change this round, for Undo. */
  readonly undo: readonly (readonly Bet[])[];
  /** The previous round's bets, for Rebet. */
  readonly lastBets: readonly Bet[];
  readonly phase: Phase;
  readonly settlement: SpinSettlement | null;
  /** Bankroll before the payout of the current round. */
  readonly bankrollBefore: number | null;
  /** The pocket the bet loupe is open on. */
  readonly loupe: Pocket | null;
  readonly coach: CoachMessage | null;
  /**
   * Bets the coach caught as mistakes this round. Each is graded at Spin as a coached decision
   * whether the player kept it or took it back (Take it back, Undo, Clear, long-press).
   */
  readonly coached: readonly Caught[];
  /** Spots the "every" coach has already explained this round. */
  readonly hinted: readonly string[];
  /** An in-place error (limits, bankroll). */
  readonly error: string | null;
}

export function initialTable(wheel: WheelChoice = "european"): TableState {
  return {
    wheel,
    seed: null,
    bankroll: null,
    history: [],
    chip: 5,
    bets: [],
    undo: [],
    lastBets: [],
    phase: "bet",
    settlement: null,
    bankrollBefore: null,
    loupe: null,
    coach: null,
    coached: [],
    hinted: [],
    error: null,
  };
}

export function rulesOf(state: Pick<TableState, "wheel">): RouletteRules {
  return WHEEL_RULES[state.wheel];
}

export type TableAction =
  | { type: "seed"; seed: number }
  | { type: "bankroll"; bankroll: number }
  | { type: "resetBankroll"; bankroll: number }
  | { type: "chip"; chip: ChipAmount }
  | { type: "add"; spotId: string; coach: CoachLevel }
  | { type: "remove"; spotId: string }
  | { type: "removeSpot"; spotId: string }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "rebet"; coach: CoachLevel }
  /** "Test in trainer": a strategy's wheel and layout, placed like a rebet (coach included). */
  | { type: "layout"; wheel: WheelChoice; bets: readonly Bet[]; coach: CoachLevel }
  | { type: "spin" }
  | { type: "reveal" }
  | { type: "payout" }
  | { type: "next" }
  | { type: "loupe"; pocket: Pocket | null }
  | { type: "wheel"; wheel: WheelChoice }
  | { type: "hint" }
  | { type: "dismissCoach" };

function placed(state: TableState, bets: readonly Bet[]): TableState {
  return { ...state, bets, undo: [...state.undo, state.bets], error: null };
}

export function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "seed":
      return state.seed === null ? { ...state, seed: action.seed >>> 0 } : state;
    case "bankroll":
      return state.bankroll === null ? { ...state, bankroll: action.bankroll } : state;
    case "resetBankroll":
      return { ...state, bankroll: action.bankroll, error: null };
    case "chip":
      return { ...state, chip: action.chip, error: null };
    case "add":
      return addBet(state, action.spotId, action.coach);
    case "remove": {
      if (state.phase !== "bet") return state;
      const on = amountOn(state.bets, action.spotId);
      if (on <= 0) return state;
      const next = removeChips(state.bets, action.spotId, Math.min(on, state.chip));
      const out = placed(state, next);
      // A note offering to take back a bet that is already gone has nothing left to do.
      const gone = state.coach?.takeBack === action.spotId && amountOn(next, action.spotId) <= 0;
      return gone ? { ...out, coach: null } : out;
    }
    case "removeSpot": {
      if (state.phase !== "bet") return state;
      if (amountOn(state.bets, action.spotId) <= 0) return { ...state, coach: null };
      const on = amountOn(state.bets, action.spotId);
      return { ...placed(state, removeChips(state.bets, action.spotId, on)), coach: null };
    }
    case "undo": {
      if (state.phase !== "bet" || state.undo.length === 0) return state;
      return {
        ...state,
        bets: state.undo[state.undo.length - 1]!,
        undo: state.undo.slice(0, -1),
        error: null,
        coach: null,
      };
    }
    case "clear":
      if (state.phase !== "bet" || state.bets.length === 0) return state;
      return { ...placed(state, []), coach: null };
    case "rebet": {
      if (state.phase !== "bet" || state.lastBets.length === 0) return state;
      const rules = rulesOf(state);
      const valid = state.lastBets.filter((b) => getSpot(rules, b.spotId));
      const stake = totalStake(valid);
      if (state.bankroll !== null && stake > state.bankroll) {
        return {
          ...state,
          error: `Rebet needs ${formatDollars(stake)}, more than your ${formatDollars(state.bankroll)} practice bankroll.`,
        };
      }
      // The coach sees a rebet like any other bet: the first note wins, every mistake is caught.
      let out = placed(state, valid);
      for (const b of valid) {
        const spot = getSpot(rules, b.spotId)!;
        const note = coachOnBet(out, spot, action.coach);
        if (!note) continue;
        out = {
          ...out,
          coach: out.coach ?? note,
          coached: note.variant === "mistake" ? catchSpot(out.coached, spot) : out.coached,
          hinted: [...out.hinted, spot.id],
        };
      }
      return out;
    }
    case "layout": {
      if (state.phase !== "bet") return state;
      const onWheel = tableReducer(state, { type: "wheel", wheel: action.wheel });
      return tableReducer(
        { ...onWheel, lastBets: action.bets },
        { type: "rebet", coach: action.coach },
      );
    }
    case "spin":
      return spin(state);
    case "reveal": {
      if (state.phase !== "spin" || !state.settlement) return state;
      return { ...state, phase: "result", history: [...state.history, state.settlement.pocket] };
    }
    case "payout": {
      if (state.phase !== "result" || !state.settlement || state.bankroll === null) return state;
      const after = fromCents(toCents(state.bankroll) + toCents(state.settlement.net));
      return { ...state, phase: "payout", bankrollBefore: state.bankroll, bankroll: after };
    }
    case "next":
      if (state.phase !== "payout") return state;
      return {
        ...state,
        phase: "bet",
        lastBets: state.bets,
        bets: [],
        undo: [],
        settlement: null,
        bankrollBefore: null,
        coached: [],
        hinted: [],
        coach: null,
        error: null,
      };
    case "loupe":
      if (action.pocket !== null && state.phase !== "bet") return state;
      return { ...state, loupe: action.pocket };
    case "wheel": {
      if (state.phase !== "bet" || action.wheel === state.wheel) return state;
      const rules = WHEEL_RULES[action.wheel];
      return {
        ...state,
        wheel: action.wheel,
        bets: state.bets.filter((b) => getSpot(rules, b.spotId)),
        lastBets: state.lastBets.filter((b) => getSpot(rules, b.spotId)),
        undo: [],
        loupe: null,
        coach: null,
        // Hints restart on the new wheel; caught mistakes stay, they are decisions already made.
        hinted: [],
        error: null,
      };
    }
    case "hint": {
      // Asking is still the coach stepping in: a mistake it names counts as coached.
      const note = askedHint(state);
      const spot = note.takeBack ? getSpot(rulesOf(state), note.takeBack) : undefined;
      return {
        ...state,
        coach: note,
        coached: spot ? catchSpot(state.coached, spot) : state.coached,
      };
    }
    case "dismissCoach":
      return { ...state, coach: null };
  }
}

export function amountOn(bets: readonly Bet[], spotId: string): number {
  return bets.find((b) => b.spotId === spotId)?.amount ?? 0;
}

function addBet(state: TableState, spotId: string, coach: CoachLevel): TableState {
  if (state.phase !== "bet" || state.bankroll === null) return state;
  const rules = rulesOf(state);
  const spot = getSpot(rules, spotId);
  if (!spot) return state;
  const next = addChips(state.bets, spotId, state.chip);
  const onSpot = amountOn(next, spotId);
  if (onSpot > rules.limits.max) {
    return {
      ...state,
      error: `${spotShortName(spot)} would be ${formatDollars(onSpot)}, over the ${formatDollars(rules.limits.max)} table maximum.`,
    };
  }
  const stake = totalStake(next);
  if (stake > state.bankroll) {
    return {
      ...state,
      error: `That chip would put ${formatDollars(stake)} on the felt, more than your ${formatDollars(state.bankroll)} practice bankroll.`,
    };
  }
  let out = placed(state, next);
  const note = coachOnBet(out, spot, coach);
  if (note) {
    out = {
      ...out,
      coach: note,
      coached: note.variant === "mistake" ? catchSpot(out.coached, spot) : out.coached,
      hinted: [...out.hinted, spot.id],
    };
  }
  return out;
}

function catchSpot(caught: readonly Caught[], spot: BetSpot): Caught[] {
  if (caught.some((c) => c.spotId === spot.id)) return [...caught];
  return [...caught, { spotId: spot.id, category: categoryOf(spot) }];
}

function categoryOf(spot: BetSpot): "inside" | "outside" {
  return isInsideBet(spot.type) ? "inside" : "outside";
}

function spin(state: TableState): TableState {
  if (state.phase !== "bet" || state.seed === null || state.bankroll === null) return state;
  if (state.bets.length === 0) return { ...state, error: "Place a bet first." };
  const rules = rulesOf(state);
  const issues = validateBets(rules, state.bets);
  if (issues.length > 0) {
    return { ...state, error: issues.map((i) => i.message).join(" ") };
  }
  if (totalStake(state.bets) > state.bankroll) {
    return { ...state, error: "Your bets are more than your practice bankroll." };
  }
  const pocket = spinPocket(rules, state.seed, state.history.length);
  return {
    ...state,
    phase: "spin",
    settlement: settleBets(rules, state.bets, pocket),
    loupe: null,
    coach: null,
    error: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Coach

/** True when the engine rates this bet strictly worse than the wheel's own edge (the top line). */
export function isWorseBet(rules: RouletteRules, spot: BetSpot): boolean {
  return houseEdgeOf(rules, spot.type) > wheelHouseEdge(rules) + 1e-9;
}

function mistakeNote(rules: RouletteRules, spot: BetSpot): CoachMessage {
  return {
    variant: "mistake",
    kind: "Let's replay that",
    title: `The top line costs ${formatHouseEdge(houseEdgeOf(rules, spot.type))}`,
    body: explainLowestEdgeBets(rules),
    takeBack: spot.id,
  };
}

/** Pockets the felt covers, as "Your bets cover 19 of 37 pockets. Not covered: 1–12". */
export function coverageLine(rules: RouletteRules, bets: readonly Bet[]): string {
  if (bets.length === 0) return "";
  const a = analyzeBets(rules, bets);
  const n = getLayout(rules).pockets.length;
  return `Your bets cover ${a.covered.length} of ${n} pockets.`;
}

function hintFor(state: TableState, spot: BetSpot | undefined): CoachMessage {
  const rules = rulesOf(state);
  const recent = [...state.history].reverse();
  if (spot && (spot.type === "red" || spot.type === "black")) {
    const note = explainNoMemory(rules, recent);
    if (/in a row/.test(note)) {
      return {
        variant: "hint",
        kind: "Hint · No memory",
        title: "The wheel has no memory",
        body: note,
      };
    }
  }
  if (spot && rules.laPartage && isEvenMoneyBet(spot.type)) {
    return {
      variant: "good",
      kind: "Good call · La Partage",
      title: `${spotShortName(spot)} carries ${formatHouseEdge(houseEdgeOf(rules, spot.type))}`,
      body: explainLaPartage(rules),
    };
  }
  const coverage = coverageLine(rules, state.bets);
  return {
    variant: "hint",
    kind: "Hint · House edge",
    title: `${formatHouseEdge(edgeOf(state))} house edge on this layout`,
    body: `${explainHouseEdgeIsTheSame(rules)}${coverage ? ` ${coverage}` : ""}`,
  };
}

/** The note (if any) the coach gives when a chip lands on `spot`. */
export function coachOnBet(
  state: TableState,
  spot: BetSpot,
  level: CoachLevel,
): CoachMessage | null {
  const rules = rulesOf(state);
  if (isWorseBet(rules, spot)) return level === "asked" ? null : mistakeNote(rules, spot);
  if (level !== "every" || state.hinted.includes(spot.id)) return null;
  return hintFor(state, spot);
}

/** The hint when the player asks (tapping the house-edge pill). */
export function askedHint(state: TableState): CoachMessage {
  const rules = rulesOf(state);
  const worse = state.bets
    .map((b) => getSpot(rules, b.spotId))
    .find((s): s is BetSpot => s !== undefined && isWorseBet(rules, s));
  if (worse) return mistakeNote(rules, worse);
  const last = state.bets[state.bets.length - 1];
  return hintFor(state, last ? getSpot(rules, last.spotId) : undefined);
}

export interface GradedBet {
  readonly category: "inside" | "outside";
  readonly correct: boolean;
  readonly coached: boolean;
}

/**
 * The graded decisions when the ball is spun: one per bet on the felt, plus one for each
 * mistake the coach caught and the player took back (wrong, coached), so a corrected mistake
 * still reaches progress.
 */
export function gradeBets(state: TableState): GradedBet[] {
  const rules = rulesOf(state);
  const caught = (id: string) => state.coached.some((c) => c.spotId === id);
  const onFelt: GradedBet[] = state.bets.flatMap((b) => {
    const spot = getSpot(rules, b.spotId);
    if (!spot) return [];
    return [
      { category: categoryOf(spot), correct: !isWorseBet(rules, spot), coached: caught(spot.id) },
    ];
  });
  const takenBack: GradedBet[] = state.coached
    .filter((c) => amountOn(state.bets, c.spotId) <= 0)
    .map((c) => ({ category: c.category, correct: false, coached: true }));
  return [...onFelt, ...takenBack];
}

// ---------------------------------------------------------------------------------------------
// Selectors and copy

export function edgeOf(state: TableState): number {
  const rules = rulesOf(state);
  return state.bets.length === 0 ? wheelHouseEdge(rules) : analyzeBets(rules, state.bets).houseEdge;
}

export function edgeLabel(state: TableState): string {
  return `House edge ${formatHouseEdge(edgeOf(state))}`;
}

export function totalBetLabel(state: TableState): string {
  return `Total bet ${formatDollars(totalStake(state.bets))}`;
}

export function betSummary(state: TableState): string {
  return state.bets.length === 0
    ? "Tap a spot to bet"
    : describeBetSummary(rulesOf(state), state.bets);
}

export function chipCaption(chip: number): string {
  return `${formatDollars(chip)} selected · long-press any number for the bet loupe`;
}

/** Newest first, the latest one ringed: the LAST strip. */
export function lastPockets(history: readonly Pocket[], count = 8): Pocket[] {
  return history.slice(-count).reverse();
}

export function pocketName(pocket: Pocket): string {
  const color = pocketColor(pocket);
  return `${String(pocket)} ${color}`;
}

const ORD = ["1st", "2nd", "3rd"] as const;

/** "Black · Odd · 1–18 · 2nd dozen" for a number; zeros explain what they do. */
export function pocketFacts(rules: RouletteRules, pocket: Pocket): string {
  if (isZero(pocket)) {
    return rules.laPartage
      ? "Green · even-money bets get half back (La Partage)"
      : "Green · even-money and outside bets lose";
  }
  const n = pocket as number;
  const color = pocketColor(n) === "red" ? "Red" : "Black";
  return [
    color,
    n % 2 === 0 ? "Even" : "Odd",
    n <= 18 ? "1–18" : "19–36",
    `${ORD[dozenOf(n)]} dozen`,
  ].join(" · ");
}

/** Spot ids that win on `pocket`: highlighted on the felt in the result phases. */
export function winningSpotIds(rules: RouletteRules, pocket: Pocket): Set<string> {
  return new Set(betsTouching(rules, pocket).map((s) => s.id));
}

export interface PayoutRow {
  readonly spotId: string;
  readonly name: string;
  readonly amount: string;
  readonly outcome: "win" | "lose" | "halfBack";
  /** "Pays 35:1 · returns $180", "Lost", "Half back · returns $5". */
  readonly detail: string;
  readonly net: string;
}

export function payoutRows(state: TableState): PayoutRow[] {
  const s = state.settlement;
  if (!s) return [];
  const rules = rulesOf(state);
  return s.results.map((r) => {
    const spot = getSpot(rules, r.spotId)!;
    const detail =
      r.outcome === "win"
        ? `Pays ${spot.payout}:1 · returns ${formatDollars(r.returned)}`
        : r.outcome === "halfBack"
          ? `Half back · returns ${formatDollars(r.returned)}`
          : "Lost";
    return {
      spotId: r.spotId,
      name: spotShortName(spot),
      amount: formatDollars(r.amount),
      outcome: r.outcome,
      detail,
      net: formatSignedDollars(r.net),
    };
  });
}

export function netLabel(state: TableState): string {
  return state.settlement ? formatSignedDollars(state.settlement.net) : "";
}

/** The bankroll cannot cover the smallest legal spin: offer the one-tap reset (invariant 6). */
export function needsReset(state: TableState): boolean {
  if (state.bankroll === null || state.phase !== "bet" || state.bets.length > 0) return false;
  const { min, insideMin } = rulesOf(state).limits;
  return state.bankroll < Math.min(min, insideMin);
}

export interface LoupeOption {
  readonly spotId: string;
  /** "Split 16 | 17", "Red". */
  readonly name: string;
  readonly label: string;
  readonly caption: string;
  readonly amount: number;
  readonly accessibilityLabel: string;
}

/**
 * The bet loupe's options for `pocket`: every bet that wins on it, in the engine's order (the
 * inside bets first, as the design shows them, then the outside bets touching it, so every spot
 * on the felt has a button path to add and remove chips).
 */
export function loupeOptions(state: TableState, pocket: Pocket): LoupeOption[] {
  const rules = rulesOf(state);
  return betsTouching(rules, pocket).map((spot) => {
    const amount = amountOn(state.bets, spot.id);
    const caption = loupeCaption(spot);
    return {
      spotId: spot.id,
      name: spotTitle(spot),
      label: amount > 0 ? `${spot.label}  · ${formatDollars(amount)}` : spot.label,
      caption,
      amount,
      accessibilityLabel: `${spotTitle(spot)}, pays ${spot.payout} to 1${amount > 0 ? `, ${formatDollars(amount)} bet` : ""}`,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Felt geometry (the number grid, in its own coordinates)

export const CELL_H = 36;
export const GAP = 2;
/** Height of the number grid: zero row, 12 streets, the column bets. */
export const GRID_H = CELL_H * 14 + GAP * 13;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function colWidth(width: number): number {
  return (width - 2 * GAP) / 3;
}

/** A number cell 1–36. */
export function numberRect(n: number, width: number): Rect {
  const w = colWidth(width);
  return { x: columnOf(n) * (w + GAP), y: (CELL_H + GAP) * (1 + streetOf(n)), w, h: CELL_H };
}

/** The zero cell(s): one across the top, or 0 and 00 side by side. */
export function zeroRect(pocket: Pocket, wheel: RouletteRules["wheel"], width: number): Rect {
  if (wheel === "european") return { x: 0, y: 0, w: width, h: CELL_H };
  const half = (width - GAP) / 2;
  return pocket === 0
    ? { x: 0, y: 0, w: half, h: CELL_H }
    : { x: half + GAP, y: 0, w: half, h: CELL_H };
}

export function pocketRect(pocket: Pocket, wheel: RouletteRules["wheel"], width: number): Rect {
  return isZero(pocket) ? zeroRect(pocket, wheel, width) : numberRect(pocket as number, width);
}

const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Where an inside bet's chips sit: straight ups to the right inside their cell, splits on the
 * line between two numbers, corners on the crossing, streets and six lines on the grid's outer
 * edge, and the zero-row bets on the line under the zero.
 */
export function chipPoint(spot: BetSpot, wheel: RouletteRules["wheel"], width: number) {
  const rects = spot.pockets.map((p) => pocketRect(p, wheel, width));
  const zeroLine = CELL_H + GAP / 2;
  const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
  switch (spot.type) {
    case "straight": {
      const r = rects[0]!;
      return { x: r.x + r.w - 17, y: r.y + r.h / 2 };
    }
    case "street":
      return { x: 0, y: center(rects[0]!).y };
    case "sixLine":
      return { x: 0, y: rects[0]!.y + CELL_H + GAP / 2 };
    case "firstFour":
    case "topLine":
      return { x: 0, y: zeroLine };
    default:
      break;
  }
  if (spot.pockets.some(isZero)) {
    // 0 | 00 sits high on its boundary, clear of the 0 · 00 · 2 trio on the line below.
    if (spot.pockets.every(isZero)) return { x: width / 2, y: CELL_H / 2 - 6 };
    const xs =
      wheel === "european"
        ? spot.pockets.filter((p) => !isZero(p)).map((p) => center(pocketRect(p, wheel, width)).x)
        : rects.map((r) => center(r).x);
    // American trios beside a single zero sit up in the zero row, so the zero line keeps room
    // for the four splits and the 0 · 00 · 2 trio.
    const zeros = spot.pockets.filter(isZero).length;
    const inRow = wheel === "american" && spot.type === "trio" && zeros === 1;
    return { x: avg(xs), y: inRow ? CELL_H / 2 : zeroLine };
  }
  const cs = rects.map(center);
  return { x: avg(cs.map((c) => c.x)), y: avg(cs.map((c) => c.y)) };
}

/** The chip colour for a stack of `amount`: the largest denomination it contains. */
export function stackChip(amount: number): ChipAmount {
  let best: ChipAmount = 1;
  for (const c of CHIPS) if (c <= amount) best = c;
  return best;
}

/** "5", "25", "1K", "12.5". */
export function stackLabel(amount: number): string {
  if (amount >= 1000 && amount % 1000 === 0) return `${amount / 1000}K`;
  if (amount >= 1000) return `${Math.round(amount / 100) / 10}K`;
  return String(amount);
}

/** The table wheel a strategy's rules describe. */
export function wheelOf(rules: RouletteRules): WheelChoice {
  if (rules.wheel === "american") return "american";
  return rules.laPartage ? "french" : "european";
}
