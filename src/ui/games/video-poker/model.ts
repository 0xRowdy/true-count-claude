/**
 * The Video Poker table (frame xfJEh) as a pure view model: phases, the coach's timing, what to
 * record into progress, and every string and number the screen shows. The React screen only
 * holds a `VpState`, calls these functions from its handlers and renders the view helpers.
 *
 * Phases follow the Phase Stepper: Bet → Hold & draw → Result → Payout. A round is dealt from a
 * seeded RNG derived from the session seed and the hand number, so `?seed=` replays a session.
 *
 * Coach (CONTEXT.md invariants 2 and 3), by `profile.coach`:
 * - "every": the hint (KEEP tags, the target pay line, the note) shows at every deal.
 * - "mistakes": silent until Draw; a strictly worse hold stops the draw with a mistake note,
 *   while the dealt cards are still on screen, offering the take-back.
 * - "asked": only when the player taps "Hint"; a worse hold draws without a word (it is still
 *   graded and recorded).
 */

import { createRng } from "@/engine/rng";
import {
  type CoachAdvice,
  DEFAULT_VIDEO_POKER_SETTINGS,
  DENOMINATIONS_CENTS,
  type DealtRound,
  type DrawnRound,
  type HandRank,
  type HoldAnalysis,
  type HoldOption,
  MAX_COINS,
  type PayTableId,
  type VideoPokerSettings,
  analyzeHolds,
  betCents,
  coachHint,
  dealRound,
  dealtLine,
  describeHold,
  drawRound,
  drawTarget,
  evCents,
  formatAverage,
  formatMoney,
  getPayTable,
  holdFlags,
  holdMask,
  isOptimalHold,
  judgeHold,
  optionForMask,
  payTableColumn,
  sameEv,
  setHolds,
  toggleHold,
} from "@/games/video-poker";
import type { Card } from "@/engine/cards";
import type { CoachLevel } from "@/state/profile";

export type VpPhase = "bet" | "hold" | "result" | "payout";
export const VP_PHASES: readonly VpPhase[] = ["bet", "hold", "result", "payout"];
export const VP_STEPS = ["Bet", "Hold & draw", "Result", "Payout"] as const;

/** The games the rules sheet offers, in its order. */
export const VP_GAMES: readonly PayTableId[] = [
  "job-9-6",
  "job-8-5",
  "deuces-wild-full-pay",
  "double-double-bonus-9-6",
];

/** Video poker decision categories (`DECISION_CATEGORIES["video-poker"]`). */
export type VpCategory = "made-hands" | "pairs" | "flush-draws" | "straight-draws" | "high-cards";

export interface HoldDecision {
  /** The hold the player pressed Draw with. */
  readonly chosenMask: number;
  /** The hold actually drawn to (the best one after a take-back). */
  readonly finalMask: number;
  readonly correct: boolean;
  /** The coach stepped in: a hint was on screen, or a mistake note stopped the draw. */
  readonly coached: boolean;
  readonly tookBack: boolean;
  readonly category: VpCategory;
  /** `judgeHold` for the chosen hold. */
  readonly advice: CoachAdvice;
}

export interface HistoryEntry {
  readonly handNo: number;
  readonly result: HandRank;
  readonly netCents: number;
}

export interface VpState {
  /** Null until drawn after mount (hydration): nothing is dealt before. */
  readonly seed: number | null;
  /** Hands dealt so far this session. */
  readonly handNo: number;
  readonly settings: VideoPokerSettings;
  readonly phase: VpPhase;
  readonly round: DealtRound | DrawnRound | null;
  /** The player tapped "Hint" this hand. */
  readonly hintAsked: boolean;
  /** "Show the math" is expanded. */
  readonly mathOpen: boolean;
  /** A caught mistake, waiting for take-back or keep (the draw has not happened). */
  readonly mistake: CoachAdvice | null;
  readonly decision: HoldDecision | null;
  /** Settled hands, newest first (the LAST strip). */
  readonly history: readonly HistoryEntry[];
}

export const HISTORY_LENGTH = 5;

export const INITIAL_VP_STATE: VpState = {
  seed: null,
  handNo: 0,
  settings: DEFAULT_VIDEO_POKER_SETTINGS,
  phase: "bet",
  round: null,
  hintAsked: false,
  mathOpen: false,
  mistake: null,
  decision: null,
  history: [],
};

/** What a state change asks the screen to record into progress. */
export interface VpRecord {
  readonly decision: {
    readonly category: VpCategory;
    readonly correct: boolean;
    readonly coached: boolean;
  };
  /** Practice chips (dollars) won or lost on the hand. */
  readonly net: number;
}

// ---------------------------------------------------------------------------------------------
// Seeds

/** `?seed=` → a 32-bit seed, or null when absent or not a whole number. */
export function parseSeed(value: string | string[] | undefined | null): number | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === undefined || text === null || !/^\d+$/.test(text)) return null;
  return Number(text) >>> 0;
}

/** The RNG of one hand: derived from the session seed and the hand number. */
export function handRng(seed: number, handNo: number) {
  return createRng((seed ^ Math.imul(handNo + 1, 0x9e3779b1)) >>> 0);
}

export function withSeed(state: VpState, seed: number): VpState {
  return { ...state, seed: seed >>> 0 };
}

// ---------------------------------------------------------------------------------------------
// Bet

export function betDollars(settings: VideoPokerSettings): number {
  return betCents(settings) / 100;
}

/** "5¢", "25¢", "$1", "$5". */
export function denominationLabel(cents: number): string {
  return cents < 100 ? `${cents}¢` : formatMoney(cents);
}

/** "9/6 Jacks or Better · 5 coins × $1" */
export function subtitle(settings: VideoPokerSettings): string {
  const table = getPayTable(settings.payTableId);
  const coins = `${settings.coins} coin${settings.coins === 1 ? "" : "s"}`;
  return `${table.name} · ${coins} × ${denominationLabel(settings.denominationCents)}`;
}

export const COIN_OPTIONS: readonly number[] = Array.from({ length: MAX_COINS }, (_, i) => i + 1);
export const DENOMINATION_OPTIONS: readonly number[] = DENOMINATIONS_CENTS;

/** Settings change only between hands. */
export function canChangeSettings(state: VpState): boolean {
  return state.phase === "bet" || state.phase === "payout";
}

function changeSettings(state: VpState, change: Partial<VideoPokerSettings>): VpState {
  if (!canChangeSettings(state)) return state;
  return { ...state, phase: "bet", round: null, settings: { ...state.settings, ...change } };
}

export function setCoins(state: VpState, coins: number): VpState {
  if (!COIN_OPTIONS.includes(coins)) return state;
  return changeSettings(state, { coins });
}

export function setDenomination(state: VpState, denominationCents: number): VpState {
  if (!DENOMINATION_OPTIONS.includes(denominationCents)) return state;
  return changeSettings(state, { denominationCents });
}

export function setPayTable(state: VpState, payTableId: PayTableId): VpState {
  if (state.settings.payTableId === payTableId) return state;
  return changeSettings(state, { payTableId });
}

/** The smallest bet any machine here takes: one coin of the smallest denomination. */
export const MIN_BET_DOLLARS = Math.min(...DENOMINATIONS_CENTS) / 100;

/** Below the smallest bet the table offers the one-tap reset (invariant 6). */
export function isBroke(bankroll: number): boolean {
  return bankroll + 1e-9 < MIN_BET_DOLLARS;
}

/** Why Deal cannot go ahead, or null when it can. */
export function dealBlocker(state: VpState, bankroll: number | undefined): string | null {
  if (state.seed === null || bankroll === undefined) return "Shuffling…";
  const bet = betDollars(state.settings);
  if (bet > bankroll + 1e-9) {
    return `Not enough practice chips for a ${formatMoney(betCents(state.settings))} bet. Lower the coins or the denomination.`;
  }
  return null;
}

/** Deal a new hand (from Bet, or "Deal again" from Payout). */
export function deal(state: VpState): VpState {
  if (state.seed === null || !canChangeSettings(state)) return state;
  const round = dealRound(state.settings, handRng(state.seed, state.handNo));
  return {
    ...state,
    phase: "hold",
    handNo: state.handNo + 1,
    round,
    hintAsked: false,
    mathOpen: false,
    mistake: null,
    decision: null,
  };
}

/** Back to the bet controls from Payout. */
export function changeBet(state: VpState): VpState {
  if (state.phase !== "payout") return state;
  return { ...state, phase: "bet", round: null };
}

// ---------------------------------------------------------------------------------------------
// Hold & draw

const analyses = new WeakMap<DealtRound | DrawnRound, HoldAnalysis>();

/** Exact EVs of all 32 holds for the dealt hand (memoised per round). */
export function analysisFor(round: DealtRound | DrawnRound): HoldAnalysis {
  // Holds don't change the dealt cards: key on the cards' identity via the first round seen.
  let analysis = analyses.get(round);
  if (!analysis) {
    analysis = analyzeHolds(
      round.dealt,
      getPayTable(round.settings.payTableId),
      round.settings.coins,
    );
    analyses.set(round, analysis);
  }
  return analysis;
}

function dealtRound(state: VpState): DealtRound | null {
  return state.phase === "hold" && state.round?.phase === "dealt" ? state.round : null;
}

export function toggle(state: VpState, index: number): VpState {
  const round = dealtRound(state);
  if (!round || state.mistake) return state;
  return { ...state, round: keepAnalysis(round, toggleHold(round, index)) };
}

/** "Hold these 4": set the coach's holds. */
export function holdBest(state: VpState): VpState {
  const round = dealtRound(state);
  if (!round) return state;
  const best = analysisFor(round).best;
  return { ...state, round: keepAnalysis(round, setHolds(round, holdFlags(best.mask))) };
}

function keepAnalysis<T extends DealtRound | DrawnRound>(from: DealtRound, to: T): T {
  const analysis = analyses.get(from);
  if (analysis) analyses.set(to, analysis);
  return to;
}

export function askHint(state: VpState): VpState {
  return dealtRound(state) ? { ...state, hintAsked: true } : state;
}

export function toggleMath(state: VpState): VpState {
  return { ...state, mathOpen: !state.mathOpen };
}

/** The pre-draw hint is on screen. */
export function hintVisible(state: VpState, coach: CoachLevel): boolean {
  return (
    dealtRound(state) !== null && state.mistake === null && (coach === "every" || state.hintAsked)
  );
}

/** The hint for the dealt hand. */
export function hintFor(state: VpState): CoachAdvice | null {
  const round = dealtRound(state);
  return round ? coachHint(analysisFor(round), round.settings.denominationCents) : null;
}

/** Press Draw. A caught mistake stops here (unless the coach only speaks when asked). */
export function draw(
  state: VpState,
  coach: CoachLevel,
): { state: VpState; record: VpRecord | null } {
  const round = dealtRound(state);
  if (!round || state.mistake) return { state, record: null };
  const analysis = analysisFor(round);
  const mask = holdMask(round.held);
  const advice = judgeHold(analysis, mask, round.settings.denominationCents);
  if (advice.verdict === "mistake" && coach !== "asked") {
    return { state: { ...state, mistake: advice, mathOpen: false }, record: null };
  }
  return settle(state, round, {
    chosenMask: mask,
    finalMask: mask,
    correct: advice.verdict !== "mistake",
    coached: hintVisible(state, coach),
    tookBack: false,
    category: holdCategory(analysis),
    advice,
  });
}

/** Answer the mistake note: take it back (hold the best cards) or keep the hold; then draw. */
export function resolveMistake(
  state: VpState,
  choice: "take-back" | "keep",
): { state: VpState; record: VpRecord | null } {
  const round = dealtRound(state);
  if (!round || !state.mistake) return { state, record: null };
  const analysis = analysisFor(round);
  const chosenMask = holdMask(round.held);
  const finalMask = choice === "take-back" ? analysis.best.mask : chosenMask;
  const drawn = keepAnalysis(round, setHolds(round, holdFlags(finalMask)));
  return settle({ ...state, mistake: null }, drawn, {
    chosenMask,
    finalMask,
    correct: false,
    coached: true,
    tookBack: choice === "take-back",
    category: holdCategory(analysis),
    advice: state.mistake,
  });
}

function settle(
  state: VpState,
  round: DealtRound,
  decision: HoldDecision,
): { state: VpState; record: VpRecord } {
  const drawn = keepAnalysis(round, drawRound(round));
  const entry: HistoryEntry = {
    handNo: state.handNo,
    result: drawn.result,
    netCents: drawn.netCents,
  };
  return {
    state: {
      ...state,
      phase: "result",
      round: drawn,
      mistake: null,
      mathOpen: false,
      decision,
      history: [entry, ...state.history].slice(0, HISTORY_LENGTH),
    },
    record: {
      decision: {
        category: decision.category,
        correct: decision.correct,
        coached: decision.coached,
      },
      net: drawn.netCents / 100,
    },
  };
}

/** Result → Payout ("Collect" / "Continue"). */
export function collect(state: VpState): VpState {
  return state.phase === "result" ? { ...state, phase: "payout" } : state;
}

// ---------------------------------------------------------------------------------------------
// Grading

const PAT =
  /^(a royal flush|four deuces|a wild royal flush|five of a kind|four aces|a straight flush|a full house|a flush|a straight)/;

/**
 * The decision category of a dealt hand, from the strategy idea of its best hold: a made hand
 * to keep (pat hands, trips, quads, two pair), a pair, a flush draw (royal, straight-flush and
 * flush draws), a straight draw, or high cards (and everything thinner, including a redraw and
 * a deuces-only hold).
 */
export function holdCategory(analysis: HoldAnalysis): VpCategory {
  const concept = describeHold(analysis.best.held, analysis.table).concept;
  if (PAT.test(concept) || /of a kind|two pair|four Aces/.test(concept)) return "made-hands";
  if (/flush/.test(concept)) return "flush-draws";
  if (/pair/.test(concept)) return "pairs";
  if (/straight/.test(concept)) return "straight-draws";
  return "high-cards";
}

// ---------------------------------------------------------------------------------------------
// View helpers

export function stepIndex(phase: VpPhase): number {
  return VP_PHASES.indexOf(phase);
}

export interface PayLine {
  readonly hand: HandRank;
  readonly label: string;
  /** Total coins for the current bet, as the machine prints it ("4,000"). */
  readonly coins: string;
  readonly highlighted: boolean;
}

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The pay table in two columns (first column the longer), with one line highlighted. */
export function payLines(
  settings: VideoPokerSettings,
  highlight: HandRank | null,
): { left: PayLine[]; right: PayLine[] } {
  const lines = payTableColumn(getPayTable(settings.payTableId), settings.coins).map((row) => ({
    hand: row.hand,
    label: row.label,
    coins: groupThousands(row.coins),
    highlighted: row.hand === highlight,
  }));
  const split = Math.ceil(lines.length / 2);
  return { left: lines.slice(0, split), right: lines.slice(split) };
}

/** Which pay line to light: the hand the advised hold draws to, the current holds', or the win. */
export function highlightedLine(state: VpState, coach: CoachLevel): HandRank | null {
  const round = state.round;
  if (!round) return null;
  const table = getPayTable(round.settings.payTableId);
  if (round.phase === "drawn") {
    return table.rows.some((r) => r.hand === round.result) ? round.result : null;
  }
  const analysis = analysisFor(round);
  if (hintVisible(state, coach) || state.mistake) {
    return drawTarget(analysis.best, table, round.settings.coins);
  }
  const mask = holdMask(round.held);
  if (mask === 0) return null;
  return drawTarget(optionForMask(analysis, mask), table, round.settings.coins);
}

/** Card positions the coach tags KEEP (while the hint or a mistake note is up). */
export function keepTags(state: VpState, coach: CoachLevel): readonly boolean[] {
  const round = dealtRound(state);
  if (!round || !(hintVisible(state, coach) || state.mistake))
    return [false, false, false, false, false];
  return holdFlags(analysisFor(round).best.mask);
}

/** The status line under the cards. */
export function statusLine(state: VpState): string {
  const round = state.round;
  if (!round) return "Choose your coins, then Deal.";
  const table = getPayTable(round.settings.payTableId);
  if (round.phase === "dealt") return dealtLine(round.dealt, table.game);
  return `${handName(round.result, round.settings.payTableId)}${round.coinsWon > 0 ? ` · pays ${groupThousands(round.coinsWon)}` : ""}`;
}

/** "Flush", or "No win" for a hand the table doesn't pay. */
export function handName(result: HandRank, payTableId: PayTableId): string {
  return getPayTable(payTableId).rows.find((r) => r.hand === result)?.label ?? "No win";
}

/** "BET 5" */
export function betTag(settings: VideoPokerSettings): string {
  return `BET ${settings.coins}`;
}

/** Cards as the math table shows them: "5♥ 9♥ Q♥ 2♥". */
export function cardsText(cards: readonly Card[]): string {
  const glyph = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;
  return cards.length === 0
    ? "Nothing (draw five)"
    : cards.map((c) => `${c.rank}${glyph[c.suit]}`).join(" ");
}

export interface MathRow {
  readonly rank: number;
  readonly mask: number;
  readonly cards: string;
  readonly concept: string;
  /** Average return of the bet, "$6.10". */
  readonly ev: string;
  readonly best: boolean;
  readonly yours: boolean;
}

/**
 * "Show the math": the holds ranked by exact EV, as average dollars back on this bet. The top
 * `limit` holds, plus the player's own hold when it ranks lower.
 */
export function mathRows(round: DealtRound | DrawnRound, yourMask: number, limit = 6): MathRow[] {
  const analysis = analysisFor(round);
  const { coins, denominationCents } = round.settings;
  const bet = coins * denominationCents;
  const row = (option: HoldOption, i: number): MathRow => ({
    rank: i + 1,
    mask: option.mask,
    cards: cardsText(option.held),
    concept: describeHold(option.held, analysis.table).concept,
    ev: formatAverage(evCents(option, coins, denominationCents), bet),
    best: sameEv(option.ev, analysis.best.ev),
    yours: option.mask === yourMask,
  });
  const rows = analysis.options.slice(0, limit).map(row);
  const yours = analysis.options.findIndex((o) => o.mask === yourMask);
  if (yours >= limit) rows.push(row(analysis.options[yours]!, yours));
  return rows;
}

/** The "Decisions this hand" line for the hold. */
export function decisionSummary(
  decision: HoldDecision,
  settings: VideoPokerSettings,
): { title: string; detail: string; correct: boolean } {
  const bet = betCents(settings);
  if (decision.correct) {
    const option = decision.advice.best;
    const concept = describeHold(option.held, getPayTable(settings.payTableId)).concept;
    return {
      title: `Hold: ${concept}. The best play.`,
      detail: `Returns about ${formatAverage(evCents(option, settings.coins, settings.denominationCents), bet)} of your ${formatMoney(bet)} bet on average.`,
      correct: true,
    };
  }
  const chosen = decision.advice.compared;
  const concept = chosen
    ? describeHold(chosen.held, getPayTable(settings.payTableId)).concept
    : "that hold";
  const cost = formatAverage(decision.advice.costCents, bet);
  return {
    title: `Hold: ${concept}${decision.tookBack ? ", taken back" : ""}.`,
    detail: `${decision.tookBack ? "You drew to the better hold. " : ""}Gave up about ${cost} a hand on average. Counts as a miss.`,
    correct: false,
  };
}

/** The result headline: "You win $30", "Push", "No win". */
export function resultHeadline(round: DrawnRound): string {
  if (round.winCents === 0) return "No win this hand";
  if (round.netCents === 0) return `Push · ${formatMoney(round.winCents)} back`;
  return `You win ${formatMoney(round.winCents)}`;
}

/** "W +25", "L -5", "P 0" for the LAST strip. */
export function historyLabel(entry: HistoryEntry): string {
  const amount = formatMoney(Math.abs(entry.netCents)).slice(1);
  if (entry.netCents > 0) return `W +${amount}`;
  if (entry.netCents < 0) return `L -${amount}`;
  return "P 0";
}

/** Whether the player's hold (before the draw) is one of the best. */
export function holdIsOptimal(round: DealtRound): boolean {
  return isOptimalHold(analysisFor(round), holdMask(round.held));
}

/** House edge of perfect play, "0.46%". */
export function houseEdgeText(payTableId: PayTableId): string {
  const edge = (1 - getPayTable(payTableId).publishedReturn) * 100;
  return `${edge < 0 ? "−" : ""}${Math.abs(edge).toFixed(2)}%`;
}

/** Return of perfect play, "99.54%". */
export function returnText(payTableId: PayTableId): string {
  return `${(getPayTable(payTableId).publishedReturn * 100).toFixed(2)}%`;
}
