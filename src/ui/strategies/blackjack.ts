/**
 * The blackjack Strategy Builder's view model (design 10, RYP9O): the chart a draft holds,
 * how it differs from the strategy it was forked from, and whether each cell it changes is
 * right for the draft's Rule Set.
 *
 * The chart is never typed in by hand: the base is `strategyChart(rules)`, the engine's
 * audited Basic Strategy for a Rule Set (invariant 4), and a draft only stores the cells it
 * overrides. The rules check prices a cell with the EV engine (`actionEvs`) over every
 * two-card hand that makes the row's total, so "Rules-checked" is exact arithmetic for the
 * chosen table rather than a lookup.
 *
 * React-free, so it runs under vitest with the engine.
 */

import {
  type Action,
  type ActionEvs,
  type Card,
  type ChartCode,
  type DealerUpcard,
  type Hand,
  type PairRank,
  type Rank,
  type RuleSet,
  DEALER_UPCARDS,
  PAIR_RANKS,
  actionEvs,
  activeHand,
  applyAction,
  compositionWithout,
  createHand,
  createShoe,
  currentLegalActions,
  dealerUpcard,
  evaluate,
  fullShoeComposition,
  isCutCardReached,
  isSplittablePair,
  rankValue,
  startRound,
  strategyChart,
} from "@/engine";
import type { BlackjackDraft, ChartSource } from "@/state/strategies";

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export type CellSection = "hard" | "soft" | "pairs";

export interface CellRef {
  readonly section: CellSection;
  /** Hard total (8-17), soft total (13-20), or a pair rank ("A", "2"…"10"). */
  readonly row: string;
  readonly upcard: DealerUpcard;
}

/** The rows the builder shows, in chart order. */
export const HARD_ROWS = ["8", "9", "10", "11", "12", "13", "14", "15", "16", "17"] as const;
export const SOFT_ROWS = ["13", "14", "15", "16", "17", "18", "19", "20"] as const;
export const PAIR_ROWS: readonly string[] = PAIR_RANKS;
/** Rows where giving up half the bet is ever on the table: the Surrender tab. */
export const SURRENDER_ROWS: readonly { section: CellSection; row: string }[] = [
  { section: "hard", row: "14" },
  { section: "hard", row: "15" },
  { section: "hard", row: "16" },
  { section: "hard", row: "17" },
  { section: "pairs", row: "7" },
  { section: "pairs", row: "8" },
];

export function cellKey(ref: CellRef): string {
  return `${ref.section}:${ref.row}:${ref.upcard}`;
}

export function parseCellKey(key: string): CellRef | undefined {
  const [section, row, up] = key.split(":");
  const upcard = Number(up) as DealerUpcard;
  if (section !== "hard" && section !== "soft" && section !== "pairs") return undefined;
  if (!row || !DEALER_UPCARDS.includes(upcard)) return undefined;
  return { section, row, upcard };
}

/** Every cell the builder can edit, in reading order (hard, soft, pairs; left to right). */
export function editableCells(): CellRef[] {
  const out: CellRef[] = [];
  const add = (section: CellSection, rows: readonly string[]) => {
    for (const row of rows) for (const upcard of DEALER_UPCARDS) out.push({ section, row, upcard });
  };
  add("hard", HARD_ROWS);
  add("soft", SOFT_ROWS);
  add("pairs", PAIR_ROWS);
  return out;
}

const CELLS = editableCells();

/** "A,8" for soft 19, "8,8" for a pair, "11" for hard 11. */
export function rowLabel(section: CellSection, row: string): string {
  if (section === "soft") return `A,${Number(row) - 11}`;
  if (section === "pairs") return `${row},${row}`;
  return row;
}

export function upcardLabel(upcard: DealerUpcard): string {
  return upcard === 11 ? "A" : String(upcard);
}

/** "Soft 19 (A,8) vs dealer 6", "Hard 11 vs dealer A", "Pair of 8s vs dealer A". */
export function cellTitle(ref: CellRef): string {
  const vs = `vs dealer ${upcardLabel(ref.upcard)}`;
  if (ref.section === "soft") return `Soft ${ref.row} (${rowLabel("soft", ref.row)}) ${vs}`;
  if (ref.section === "pairs") return `Pair of ${ref.row === "A" ? "aces" : `${ref.row}s`} ${vs}`;
  return `Hard ${ref.row} ${vs}`;
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/** The five plays the move picker offers (plus Split on the pairs chart). */
export type Move = "H" | "S" | "D" | "Ds" | "P" | "R";

export const MOVE_LABELS: Readonly<Record<Move, string>> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  Ds: "Double / stand",
  P: "Split",
  R: "Surrender",
};

export const CODE_NAMES: Readonly<Record<ChartCode, string>> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  Ds: "Double, else stand",
  P: "Split",
  Rh: "Surrender",
  Rs: "Surrender, else stand",
  Rp: "Surrender, else split",
};

/** What a cell prints: R for every surrender code. */
export function cellGlyph(code: ChartCode): string {
  return code === "Rh" || code === "Rs" || code === "Rp" ? "R" : code;
}

export function moveOf(code: ChartCode): Move {
  return code === "Rh" || code === "Rs" || code === "Rp" ? "R" : code;
}

/** The chart code a picked move writes into a cell. */
export function codeForMove(move: Move, ref: CellRef): ChartCode {
  if (move !== "R") return move;
  if (ref.section === "pairs") return "Rp";
  return ref.section === "hard" && Number(ref.row) >= 17 ? "Rs" : "Rh";
}

export function movesFor(section: CellSection): Move[] {
  return section === "pairs" ? ["H", "S", "D", "Ds", "P", "R"] : ["H", "S", "D", "Ds", "R"];
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

const chartCache = new Map<string, ReturnType<typeof strategyChart>>();

export function rulesKey(rules: RuleSet): string {
  return JSON.stringify(rules);
}

function chartFor(rules: RuleSet) {
  const key = rulesKey(rules);
  let chart = chartCache.get(key);
  if (!chart) {
    chart = strategyChart(rules);
    chartCache.set(key, chart);
  }
  return chart;
}

/** Basic Strategy's code for a cell under `rules`. */
export function basicCode(rules: RuleSet, ref: CellRef): ChartCode {
  const chart = chartFor(rules);
  switch (ref.section) {
    case "hard":
      return chart.hard[Number(ref.row) as keyof typeof chart.hard][ref.upcard];
    case "soft":
      return chart.soft[Number(ref.row) as keyof typeof chart.soft][ref.upcard];
    case "pairs":
      return chart.pairs[ref.row as PairRank][ref.upcard];
  }
}

export function sourceCode(source: ChartSource, ref: CellRef): ChartCode {
  return source.cells[cellKey(ref)] ?? basicCode(source.rules, ref);
}

/** The code the draft plays in a cell. */
export function draftCode(draft: BlackjackDraft, ref: CellRef): ChartCode {
  return draft.cells[cellKey(ref)] ?? sourceCode(draft.base, ref);
}

/** The draft's chart as overrides on Basic Strategy for its own rules (for export and play). */
export function draftOverrides(draft: BlackjackDraft): Record<string, ChartCode> {
  const out: Record<string, ChartCode> = {};
  for (const ref of CELLS) {
    const code = draftCode(draft, ref);
    if (code !== basicCode(draft.rules, ref)) out[cellKey(ref)] = code;
  }
  return out;
}

/** Sets one cell. Writing the base chart's own code drops the override. */
export function setCell(draft: BlackjackDraft, ref: CellRef, code: ChartCode): BlackjackDraft {
  const key = cellKey(ref);
  const cells = { ...draft.cells };
  if (code === sourceCode(draft.base, ref)) delete cells[key];
  else cells[key] = code;
  return { ...draft, cells };
}

/** Every editable cell set to Basic Strategy for the draft's rules. */
export function resetToBasic(draft: BlackjackDraft): BlackjackDraft {
  let next: BlackjackDraft = { ...draft, cells: {} };
  for (const ref of CELLS) next = setCell(next, ref, basicCode(draft.rules, ref));
  return next;
}

export interface ChartChange {
  readonly ref: CellRef;
  readonly key: string;
  readonly from: ChartCode;
  readonly to: ChartCode;
}

/** The cells that differ from the original, in reading order: "Compare (n changes)". */
export function chartChanges(draft: BlackjackDraft): ChartChange[] {
  const out: ChartChange[] = [];
  for (const ref of CELLS) {
    const from = sourceCode(draft.base, ref);
    const to = draftCode(draft, ref);
    if (from !== to) out.push({ ref, key: cellKey(ref), from, to });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** "6D · H17 · DAS" — the shorthand on the step rail. */
export function rulesShort(rules: RuleSet): string {
  const parts = [`${rules.decks}D`, rules.dealerSoft17 === "hit" ? "H17" : "S17"];
  parts.push(rules.doubleAfterSplit ? "DAS" : "NDAS");
  if (rules.surrender !== "none") parts.push(rules.surrender === "late" ? "LS" : "ES");
  if (rules.blackjackPayout === "6:5") parts.push("6:5");
  if (!rules.dealerPeek) parts.push("No peek");
  return parts.join(" · ");
}

/** "6 deck · S17" for a strategy card. */
export function rulesCardLine(rules: RuleSet): string {
  return `${rules.decks} deck · ${rules.dealerSoft17 === "hit" ? "H17" : "S17"}`;
}

/** "H17, 6 decks" — what the rules check is checked against. */
export function rulesCheckTarget(rules: RuleSet): string {
  return `${rules.dealerSoft17 === "hit" ? "H17" : "S17"}, ${rules.decks} ${rules.decks === 1 ? "deck" : "decks"}`;
}

// ---------------------------------------------------------------------------
// The rules check: is a cell's play right for these rules?
// ---------------------------------------------------------------------------

const ACTION_VERB: Readonly<Record<Action, string>> = {
  hit: "hitting",
  stand: "standing",
  double: "doubling",
  split: "splitting",
  surrender: "surrendering",
};

const ACTION_NAME: Readonly<Record<Action, string>> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
};

const FALLBACK: Readonly<Record<ChartCode, readonly Action[]>> = {
  H: ["hit"],
  S: ["stand"],
  D: ["double", "hit"],
  Ds: ["double", "stand"],
  P: ["split"],
  Rh: ["surrender", "hit"],
  Rs: ["surrender", "stand"],
  Rp: ["surrender", "split"],
};
const LAST_RESORT: readonly Action[] = ["stand", "hit", "split", "double", "surrender"];

/** The play a code makes when `legal` is what the hand may do (mirrors the engine's resolve). */
export function playFor(code: ChartCode, legal: readonly Action[]): Action {
  for (const a of FALLBACK[code]) if (legal.includes(a)) return a;
  for (const a of LAST_RESORT) if (legal.includes(a)) return a;
  return "stand";
}

const card = (rank: Rank): Card => ({ rank, suit: "s" });
const RANK_OF_VALUE: Readonly<Record<number, Rank>> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "A",
};

/** The two-card hands that make a cell's row, each with how likely it is to be dealt. */
export function handsFor(ref: CellRef): { cards: [Card, Card]; weight: number }[] {
  const per = (v: number) => (v === 10 ? 4 : 1);
  if (ref.section === "pairs") {
    const r = ref.row === "A" ? "A" : (ref.row as Rank);
    return [{ cards: [card(r), card(r)], weight: 1 }];
  }
  if (ref.section === "soft") {
    const other = RANK_OF_VALUE[Number(ref.row) - 11] ?? "2";
    return [{ cards: [card("A"), card(other)], weight: 1 }];
  }
  const total = Number(ref.row);
  const hands: { cards: [Card, Card]; weight: number }[] = [];
  for (let a = 2; a <= 10; a++) {
    const b = total - a;
    if (b <= a || b > 10) continue;
    hands.push({
      cards: [card(RANK_OF_VALUE[a] ?? "2"), card(RANK_OF_VALUE[b] ?? "2")],
      weight: per(a) * per(b),
    });
  }
  return hands;
}

/** EVs for a cell, averaged over the two-card hands that make it, at a full shoe. */
export function cellEvs(rules: RuleSet, ref: CellRef): ActionEvs {
  const up = card(RANK_OF_VALUE[ref.upcard] ?? "A");
  const sums: Partial<Record<Action, number>> = {};
  let weight = 0;
  for (const h of handsFor(ref)) {
    const hand = createHand(h.cards, 1);
    const comp = compositionWithout(fullShoeComposition(rules.decks), [...h.cards, up]);
    const evs = actionEvs(hand, up, rules, comp);
    for (const [a, ev] of Object.entries(evs) as [Action, number][]) {
      sums[a] = (sums[a] ?? 0) + ev * h.weight;
    }
    weight += h.weight;
  }
  const out: Partial<Record<Action, number>> = {};
  for (const [a, s] of Object.entries(sums) as [Action, number][]) out[a] = s / weight;
  return out;
}

/** The plays a cell's hands may legally make under `rules` (the same for every hand). */
function legalFor(evs: ActionEvs): Action[] {
  return (Object.keys(evs) as Action[]).filter((a) => evs[a] !== undefined);
}

export type CellVerdict = "best" | "fine" | "worse";

export interface CellCheck {
  readonly verdict: CellVerdict;
  /** "Rules-checked for H17, 6 decks" or "Costs 4.1% of the bet under H17, 6 decks". */
  readonly title: string;
  readonly body: string;
  /** The play this cell makes, after any fallback the rules force. */
  readonly play: Action;
  /** Basic Strategy's play for these rules. */
  readonly basicPlay: Action;
  /** Bets lost per hand against Basic Strategy (0 when it is at least as good). */
  readonly loss: number;
}

/** A fraction of a bet as a percentage: 0.0412 → "4.1%", 0.0006 → "0.06%". */
export function formatBetShare(x: number): string {
  const pct = Math.abs(x) * 100;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

/** Losses smaller than this are a tie: EV ranking noise, not a strategy error. */
export const TIE = 0.0005;

const checkCache = new Map<string, CellCheck>();

/**
 * Checks one cell's code against the EV engine for `rules`. `compareTo` (the original's code)
 * picks the play the explanation compares against when the cell is right.
 */
export function checkCell(
  rules: RuleSet,
  ref: CellRef,
  code: ChartCode,
  compareTo?: ChartCode,
): CellCheck {
  const key = `${rulesKey(rules)}|${cellKey(ref)}|${code}|${compareTo ?? ""}`;
  const cached = checkCache.get(key);
  if (cached) return cached;

  const target = rulesCheckTarget(rules);
  const bsCode = basicCode(rules, ref);
  const evs = cellEvs(rules, ref);
  const legal = legalFor(evs);
  const play = playFor(code, legal);
  const basicPlay = playFor(bsCode, legal);
  const ev = (a: Action) => evs[a] ?? Number.NEGATIVE_INFINITY;
  const loss = code === bsCode ? 0 : Math.max(0, ev(basicPlay) - ev(play));
  const forced =
    FALLBACK[code][0] !== play
      ? `${ACTION_NAME[FALLBACK[code][0] ?? "stand"]} isn't offered here under these rules, so this cell plays ${ACTION_NAME[play]}. `
      : "";

  let result: CellCheck;
  if (loss > TIE) {
    result = {
      verdict: "worse",
      title: `Costs ${formatBetShare(loss)} of the bet under ${target}`,
      body: `${forced}${capitalize(ACTION_VERB[basicPlay])} earns ${formatBetShare(loss)} of the bet more than ${ACTION_VERB[play]} here, every time. Basic strategy for these rules says ${CODE_NAMES[bsCode]}.`,
      play,
      basicPlay,
      loss,
    };
  } else {
    const otherCode = compareTo && compareTo !== code ? compareTo : undefined;
    let other = otherCode ? playFor(otherCode, legal) : undefined;
    if (!other || other === play) {
      other = legal.filter((a) => a !== play).sort((a, b) => ev(b) - ev(a))[0];
    }
    const gap = other ? ev(play) - ev(other) : 0;
    const comparison =
      other === undefined
        ? `${capitalize(ACTION_VERB[play])} is the only play here.`
        : gap > TIE
          ? `Under these rules, ${ACTION_VERB[play]} earns ${gap < 0.02 ? "slightly " : ""}more on average than ${ACTION_VERB[other]}: ${formatBetShare(gap)} of the bet (exact engine EV).`
          : `Under these rules, ${ACTION_VERB[play]} and ${ACTION_VERB[other]} are worth the same to within ${formatBetShare(TIE)} of the bet (exact engine EV).`;
    const differs =
      code !== bsCode
        ? ` Basic strategy prints ${CODE_NAMES[bsCode]}; the first play is the same.`
        : "";
    result = {
      verdict: code === bsCode ? "best" : "fine",
      title: `Rules-checked for ${target}`,
      body: `${forced}${comparison}${differs}`,
      play,
      basicPlay,
      loss,
    };
  }
  checkCache.set(key, result);
  return result;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ChartCheck {
  readonly ok: boolean;
  /** Cells whose play costs EV under the draft's rules. */
  readonly flagged: readonly { ref: CellRef; check: CellCheck }[];
  /** Cells checked with the EV engine (the ones that differ from Basic Strategy). */
  readonly checked: number;
  readonly title: string;
  readonly body: string;
}

/**
 * The whole-chart rules check. Cells that match Basic Strategy for the draft's rules are
 * right by construction (the engine asserts its charts against published tables); every
 * other cell is priced with the EV engine and flagged when it loses money.
 */
export function checkChart(draft: BlackjackDraft): ChartCheck {
  const flagged: { ref: CellRef; check: CellCheck }[] = [];
  let checked = 0;
  for (const ref of CELLS) {
    const code = draftCode(draft, ref);
    if (code === basicCode(draft.rules, ref)) continue;
    checked++;
    const check = checkCell(draft.rules, ref, code);
    if (check.verdict === "worse") flagged.push({ ref, check });
  }
  const target = rulesCheckTarget(draft.rules);
  const total = flagged.reduce((s, f) => s + f.check.loss, 0);
  return {
    ok: flagged.length === 0,
    flagged,
    checked,
    title:
      flagged.length === 0
        ? `Rules-checked for ${target}`
        : `${flagged.length} ${flagged.length === 1 ? "cell costs" : "cells cost"} money under ${target}`,
    body:
      flagged.length === 0
        ? checked === 0
          ? "Every cell matches Basic Strategy for these rules."
          : `Every cell matches Basic Strategy for these rules or earns as much (${checked} checked with the EV engine).`
        : `Together they give up ${formatBetShare(total)} of a bet across those hands. Fix them before you share it.`,
  };
}

/** Whether a cell should carry the "lower EV" flag in the chart. */
export function isFlagged(draft: BlackjackDraft, ref: CellRef): boolean {
  const code = draftCode(draft, ref);
  if (code === basicCode(draft.rules, ref)) return false;
  return checkCell(draft.rules, ref, code).verdict === "worse";
}

// ---------------------------------------------------------------------------
// "Play 50 hands with it": the chart at a seeded table, beside Basic Strategy
// ---------------------------------------------------------------------------

export type ChartLookup = (ref: CellRef) => ChartCode;

/** The cell a hand is read from, as `governingCell` would find it. */
export function refForHand(hand: Hand, upcard: Card, legal: readonly Action[]): CellRef | null {
  const up = rankValue(upcard.rank) as DealerUpcard;
  if (isSplittablePair(hand) && legal.includes("split")) {
    const v = rankValue(hand.cards[0]?.rank ?? "2");
    return { section: "pairs", row: v === 11 ? "A" : String(v), upcard: up };
  }
  const value = evaluate(hand.cards);
  if (value.soft) {
    const total = Math.min(Math.max(value.total, 12), 21);
    return { section: "soft", row: String(total), upcard: up };
  }
  return { section: "hard", row: String(Math.min(Math.max(value.total, 4), 21)), upcard: up };
}

export interface HandsResult {
  readonly hands: number;
  /** Net in units of one bet. */
  readonly net: number;
  readonly wins: number;
  readonly losses: number;
  readonly pushes: number;
}

/** Plays `hands` rounds from a seeded shoe, one-unit bets, insurance declined. */
export function playHands(
  rules: RuleSet,
  lookup: ChartLookup,
  seed: number,
  hands = 50,
): HandsResult {
  let shoe = createShoe(rules, seed);
  let reshuffles = 0;
  let net = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  const bet = rules.minBet;
  for (let i = 0; i < hands; i++) {
    if (isCutCardReached(shoe)) shoe = createShoe(rules, seed + ++reshuffles);
    let state = startRound({ rules, shoe, bet, bankroll: bet * 1000 });
    if (state.phase === "insurance") state = applyAction(state, { type: "insurance", take: false });
    while (state.phase === "player") {
      const hand = activeHand(state);
      const legal = currentLegalActions(state);
      if (!hand || legal.length === 0) break;
      const ref = refForHand(hand, dealerUpcard(state), legal);
      const code = ref ? lookupAny(rules, lookup, ref) : "S";
      state = applyAction(state, { type: playFor(code, legal) });
    }
    const settled = state.settlement;
    if (settled) {
      net += settled.net / bet;
      if (settled.net > 0) wins++;
      else if (settled.net < 0) losses++;
      else pushes++;
    }
    shoe = state.shoe;
  }
  return { hands, net, wins, losses, pushes };
}

/** Rows the builder does not show (hard 4-7, 18+) read from Basic Strategy. */
function lookupAny(rules: RuleSet, lookup: ChartLookup, ref: CellRef): ChartCode {
  const shown =
    ref.section === "pairs" ||
    (ref.section === "hard" && (HARD_ROWS as readonly string[]).includes(ref.row)) ||
    (ref.section === "soft" && (SOFT_ROWS as readonly string[]).includes(ref.row));
  return shown ? lookup(ref) : basicCode(rules, ref);
}

/** The draft's chart and Basic Strategy for its rules, on the same seeded cards. */
export function testDraft(draft: BlackjackDraft, seed: number, hands = 50) {
  return {
    yours: playHands(draft.rules, (ref) => draftCode(draft, ref), seed, hands),
    basic: playHands(draft.rules, (ref) => basicCode(draft.rules, ref), seed, hands),
  };
}
