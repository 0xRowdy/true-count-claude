/**
 * The baccarat table's view model: pure, React-free, tested in Node.
 *
 * It holds one coup's life cycle on top of the engine (`src/games/baccarat`):
 *
 *   bet → deal (cards turned one at a time, P B P B, then third cards per the tableau)
 *       → result (totals, captions, winner) → payout (settlement, win tags, coach note)
 *
 * Nothing here reads a clock, draws randomness or touches storage. The session seed is handed
 * in; every shoe's seed is derived from it (`deriveShoeSeed`), so a `?seed=` session replays.
 * Recording to the progress store is the caller's job: the functions that grade or settle
 * return what to record.
 */

import type { Card } from "@/engine/cards";
import { deriveShoeSeed } from "@/state/session";
import type { CoachLevel } from "@/state/profile";
import {
  BET_LABELS,
  COACH_NOTE_TITLE,
  MAIN_BETS,
  STREAK_FALLACY,
  type BaccaratRules,
  type BaccaratShoe,
  type BetKind,
  type Bets,
  type Coup,
  type Settlement,
  type Side,
  type SideBetKind,
  type Winner,
  bankerEdgeTip,
  beadRoad,
  bigRoad,
  coachNote,
  createBaccaratShoe,
  currentStreak,
  dealCoup,
  formatPercent,
  houseEdge,
  isBetOffered,
  isShoeComplete,
  settleBets,
  sideBetTip,
  tieTip,
  validateBets,
} from "@/games/baccarat";
import { CHIP_VALUES, type ChipValue } from "@/ui/ds/format";

export type Phase = "bet" | "deal" | "result" | "payout";

/** Index of each phase in the Phase Stepper (Bet / Deal / Result / Payout). */
export const PHASE_STEP: Readonly<Record<Phase, number>> = {
  bet: 0,
  deal: 1,
  result: 2,
  payout: 3,
};

/** One chip put down, for Undo. */
export interface ChipPlacement {
  readonly bet: BetKind;
  readonly value: number;
}

/** A coach note as the screen draws it. */
export interface TableNote {
  readonly variant: "hint" | "mistake" | "good";
  /** The eyebrow under the dealer's name, when it differs from the variant's default. */
  readonly kind?: string;
  readonly title: string;
  readonly body: string;
  /** The bets a mistake note offers to take back. */
  readonly takeBack?: readonly BetKind[];
}

export type DecisionCategory = "bet-choice" | "side-bets";

export interface GradedDecision {
  readonly category: DecisionCategory;
  readonly correct: boolean;
}

export interface DecisionRecord extends GradedDecision {
  readonly coached: boolean;
}

export interface BaccaratTable {
  readonly rules: BaccaratRules;
  readonly sessionSeed: number;
  /** Which shoe of the session this is (0 = first). */
  readonly shoeIndex: number;
  readonly shoe: BaccaratShoe;
  readonly phase: Phase;
  readonly bets: Bets;
  /** Chips in the order they went down (Undo pops the last). */
  readonly placements: readonly ChipPlacement[];
  /** The bets of the last coup dealt, for Rebet. */
  readonly lastBets: Bets | null;
  readonly coup: Coup | null;
  /** Cards of `coup` turned face up so far, in deal order. */
  readonly revealed: number;
  readonly settlement: Settlement | null;
  /** An error to show in place (table limits, not enough chips). */
  readonly error: string | null;
  /** A mistake the coach caught on Deal, waiting for Take it back / Deal anyway. */
  readonly caught: TableNote | null;
  /** Categories already recorded for this coup (a caught mistake records at once). */
  readonly graded: readonly DecisionCategory[];
  /** The player switched sides to follow a streak on the road this coup. */
  readonly chasedStreak: boolean;
  /** A new shoe was shuffled up for this coup (the previous one ran out). */
  readonly freshShoe: boolean;
}

/** The deal order: Player, Banker, Player, Banker, then the third cards. */
export interface DealtCard {
  readonly side: Side;
  readonly card: Card;
}

export function createBaccaratTable(rules: BaccaratRules, sessionSeed: number): BaccaratTable {
  return {
    rules,
    sessionSeed,
    shoeIndex: 0,
    shoe: createBaccaratShoe(rules, deriveShoeSeed(sessionSeed, 0)),
    phase: "bet",
    bets: {},
    placements: [],
    lastBets: null,
    coup: null,
    revealed: 0,
    settlement: null,
    error: null,
    caught: null,
    graded: [],
    chasedStreak: false,
    freshShoe: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Money

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function totalStaked(bets: Bets): number {
  let sum = 0;
  for (const value of Object.values(bets)) sum += value ?? 0;
  return cents(sum);
}

/** The chips that make up a stake, largest first (greedy over the rack's denominations). */
export function chipStack(amount: number): ChipValue[] {
  const out: ChipValue[] = [];
  let left = Math.round(amount);
  const values = [...CHIP_VALUES].sort((a, b) => b - a);
  for (const value of values) {
    while (left >= value) {
      out.push(value);
      left -= value;
    }
  }
  return out;
}

/** "$50", "$47.50", "+$50", "−$25". Locale-free. */
export function formatAmount(amount: number, signed = false): string {
  const abs = Math.abs(amount);
  const whole = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  const [int = "0", frac] = whole.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = `$${grouped}${frac ? `.${frac}` : ""}`;
  if (signed) return `${amount < 0 ? "−" : "+"}${text}`;
  return amount < 0 ? `−${text}` : text;
}

// ---------------------------------------------------------------------------------------------
// Betting

/**
 * Puts one chip on a spot. `available` is the practice bankroll (undefined until known): the
 * layout can never hold more than the player has. Errors are returned in place, not thrown.
 */
export function placeChip(
  table: BaccaratTable,
  bet: BetKind,
  value: number,
  available?: number,
): BaccaratTable {
  if (table.phase !== "bet") return table;
  if (!isBetOffered(table.rules, bet)) {
    return { ...table, error: `${BET_LABELS[bet]} is not offered at this table` };
  }
  const current = table.bets[bet] ?? 0;
  const next = cents(current + value);
  if (next > table.rules.maxBet) {
    return {
      ...table,
      error: `${BET_LABELS[bet]} is capped at the table max of ${formatAmount(table.rules.maxBet)}`,
    };
  }
  if (available !== undefined && cents(totalStaked(table.bets) + value) > available) {
    return { ...table, error: `Not enough practice chips for another ${formatAmount(value)}` };
  }
  return {
    ...table,
    bets: { ...table.bets, [bet]: next },
    placements: [...table.placements, { bet, value }],
    error: null,
    caught: null,
  };
}

/** Takes the last chip placed on one spot back (long-press). */
export function removeChip(table: BaccaratTable, bet: BetKind): BaccaratTable {
  if (table.phase !== "bet") return table;
  let index = -1;
  for (let i = table.placements.length - 1; i >= 0; i--) {
    if (table.placements[i]?.bet === bet) {
      index = i;
      break;
    }
  }
  if (index < 0) return table;
  const chip = table.placements[index]!;
  const placements = table.placements.filter((_, i) => i !== index);
  return { ...table, bets: subtract(table.bets, chip), placements, error: null, caught: null };
}

function subtract(bets: Bets, chip: ChipPlacement): Bets {
  const left = cents((bets[chip.bet] ?? 0) - chip.value);
  const next: Bets = { ...bets };
  if (left > 0) next[chip.bet] = left;
  else delete next[chip.bet];
  return next;
}

/** Takes back the last chip put down anywhere. */
export function undoChip(table: BaccaratTable): BaccaratTable {
  if (table.phase !== "bet") return table;
  const chip = table.placements[table.placements.length - 1];
  if (!chip) return table;
  return {
    ...table,
    bets: subtract(table.bets, chip),
    placements: table.placements.slice(0, -1),
    error: null,
    caught: null,
  };
}

export function clearBets(table: BaccaratTable): BaccaratTable {
  if (table.phase !== "bet") return table;
  return { ...table, bets: {}, placements: [], error: null, caught: null };
}

/** Puts the last coup's bets back down (only the ones this table still offers). */
export function rebet(table: BaccaratTable, available?: number): BaccaratTable {
  if (table.phase !== "bet" || !table.lastBets) return table;
  const bets: Bets = {};
  const placements: ChipPlacement[] = [];
  for (const [bet, value] of Object.entries(table.lastBets) as [BetKind, number][]) {
    if (!value || !isBetOffered(table.rules, bet)) continue;
    bets[bet] = value;
    // One placement per chip, so Undo and "Take a chip off" lift one chip, not the stake.
    for (const chip of chipStack(value)) placements.push({ bet, value: chip });
  }
  if (available !== undefined && totalStaked(bets) > available) {
    return {
      ...table,
      error: `Not enough practice chips to rebet ${formatAmount(totalStaked(bets))}`,
    };
  }
  return { ...table, bets, placements, error: null, caught: null };
}

/** Changes the variant, tie payout or side bets. Bet phase only; drops bets no longer offered. */
export function setRules(table: BaccaratTable, rules: BaccaratRules): BaccaratTable {
  if (table.phase !== "bet") return table;
  const bets: Bets = {};
  for (const [bet, value] of Object.entries(table.bets) as [BetKind, number][]) {
    if (value && isBetOffered(rules, bet)) bets[bet] = value;
  }
  const placements = table.placements.filter((p) => isBetOffered(rules, p.bet));
  // The cards do not depend on the pay table, so the shoe carries on under the new rules.
  return { ...table, rules, bets, placements, shoe: { ...table.shoe, rules }, caught: null };
}

// ---------------------------------------------------------------------------------------------
// Coach

const SIDE_BET_KINDS: readonly BetKind[] = ["playerPair", "bankerPair", "dragon7", "panda8"];

/**
 * Grades the bets on the layout by house edge (the engine's `houseEdge`):
 *
 * - **bet-choice** — Banker (the lowest edge) is right; Player alone, Player and Banker together
 *   (a hedge that only pays commission), or anything on Tie is not.
 * - **side-bets** — graded only where side bets are offered: leaving them alone is right.
 */
export function gradeBets(rules: BaccaratRules, bets: Bets): GradedDecision[] {
  const graded: GradedDecision[] = [];
  const main = MAIN_BETS.filter((b) => (bets[b] ?? 0) > 0);
  if (main.length > 0) {
    graded.push({
      category: "bet-choice",
      correct: !bets.tie && !!bets.banker && !bets.player,
    });
  }
  if (rules.sideBets.length > 0) {
    graded.push({
      category: "side-bets",
      correct: !SIDE_BET_KINDS.some((b) => (bets[b] ?? 0) > 0),
    });
  }
  return graded;
}

/**
 * A mistake by edge: Tie, or a side bet. Returns the coach's mistake note, offering to take
 * the costly bets back, or null when the layout holds no mistake.
 */
export function mistakeNote(rules: BaccaratRules, bets: Bets): TableNote | null {
  const sides = rules.sideBets.filter((b) => (bets[b] ?? 0) > 0) as SideBetKind[];
  if (bets.tie) {
    return {
      variant: "mistake",
      title: `Tie carries a ${formatPercent(houseEdge(rules, "tie"), 2)} house edge`,
      body: tieTip(rules),
      takeBack: ["tie", ...sides],
    };
  }
  const side = sides[0];
  if (side) {
    return {
      variant: "mistake",
      title: `${BET_LABELS[side]} carries a ${formatPercent(houseEdge(rules, side), 2)} house edge`,
      body: sideBetTip(rules, side),
      takeBack: sides,
    };
  }
  return null;
}

/** "Banker has won 4 in a row" — the streak the player is following, if any. */
export interface Streak {
  readonly winner: Exclude<Winner, "tie">;
  readonly length: number;
}

/** A streak long enough that players start to chase it. */
export const STREAK_CHASE_LENGTH = 3;

function mainSide(bets: Bets | null): Side | null {
  if (!bets) return null;
  if (bets.banker && !bets.player) return "banker";
  if (bets.player && !bets.banker) return "player";
  return null;
}

/**
 * Chasing a streak: the road shows one side three or more in a row, and the player has just
 * switched to that side. Following a side you always back is not chasing.
 */
export function chasingStreak(
  coups: readonly Coup[],
  bets: Bets,
  lastBets: Bets | null,
): Streak | null {
  const streak = currentStreak(coups);
  if (!streak || streak.length < STREAK_CHASE_LENGTH) return null;
  const side = mainSide(bets);
  const before = mainSide(lastBets);
  if (side !== streak.winner || before === null || before === side) return null;
  return streak;
}

function sideName(side: Side): string {
  return side === "player" ? "Player" : "Banker";
}

export function streakNote(streak: Streak): TableNote {
  return {
    variant: "hint",
    kind: "Good to know",
    title: "Streaks don't change the next hand",
    body:
      `${sideName(streak.winner)} has won ${streak.length} in a row, and each coup is dealt ` +
      `fresh from the same shoe. ${STREAK_FALLACY}`,
  };
}

/**
 * The hint for the layout as it stands (coach "every", or the Hint button with "asked"):
 * a mistake gets its cost spelled out, a streak chase gets the streak note, and otherwise the
 * Banker-edge lesson.
 */
export function hintNote(table: BaccaratTable): TableNote {
  const mistake = mistakeNote(table.rules, table.bets);
  if (mistake) return { ...mistake, variant: "hint", kind: "Hint · House edge" };
  const chase = chasingStreak(table.shoe.coups, table.bets, table.lastBets);
  if (chase) return streakNote(chase);
  const player = (table.bets.player ?? 0) > 0 && !table.bets.banker;
  return {
    variant: "hint",
    kind: "Hint · House edge",
    title: player ? "Banker is the better bet" : "Banker is the lowest-edge bet",
    body: bankerEdgeTip(table.rules),
  };
}

/** The info note under the felt at payout ("Good to know before your trip"), engine copy. */
export function payoutNote(table: BaccaratTable): TableNote {
  if (table.chasedStreak && !mistakeNote(table.rules, table.lastBets ?? {})) {
    return {
      variant: "hint",
      title: COACH_NOTE_TITLE,
      body: `${STREAK_FALLACY} Each coup is dealt fresh from the shoe: the road is history, not a forecast.`,
    };
  }
  const note = coachNote(table.rules, table.lastBets ?? {});
  return { variant: "hint", title: note.title, body: note.body };
}

// ---------------------------------------------------------------------------------------------
// The coup

export interface DealOutcome {
  readonly table: BaccaratTable;
  /** Decisions to record now (empty when Deal was refused or the coach stepped in). */
  readonly decisions: readonly DecisionRecord[];
}

/**
 * The Deal button. Validates the layout, lets the coach catch a mistake first (coach
 * "mistakes" or "every"; `force` is "Deal anyway"), grades the bets and deals the coup.
 */
export function deal(
  table: BaccaratTable,
  coach: CoachLevel,
  options: { available?: number; force?: boolean; hintShown?: boolean } = {},
): DealOutcome {
  if (table.phase !== "bet") return { table, decisions: [] };
  const staked = totalStaked(table.bets);
  if (staked <= 0) {
    return { table: { ...table, error: "Place a bet to deal" }, decisions: [] };
  }
  const problems = validateBets(table.rules, table.bets);
  if (problems.length > 0) {
    return { table: { ...table, error: problems.join(". ") }, decisions: [] };
  }
  if (options.available !== undefined && staked > options.available) {
    return { table: { ...table, error: "Not enough practice chips" }, decisions: [] };
  }

  const graded = gradeBets(table.rules, table.bets);
  if (!options.force && coach !== "asked") {
    const caught = mistakeNote(table.rules, table.bets);
    if (caught) {
      // The mistake counts once, as coached, whatever the player does next.
      const decisions = graded
        .filter((g) => !g.correct && !table.graded.includes(g.category))
        .filter((g) => noteCovers(caught, g.category))
        .map((g) => ({ ...g, coached: true }));
      return {
        table: {
          ...table,
          caught,
          error: null,
          graded: [...table.graded, ...decisions.map((d) => d.category)],
        },
        decisions,
      };
    }
  }

  const decisions = graded
    .filter((g) => !table.graded.includes(g.category))
    // Same meaning as video poker: the coach was showing its hint when the bet was made.
    .map((g) => ({ ...g, coached: options.hintShown ?? false }));

  let shoe = table.shoe;
  let shoeIndex = table.shoeIndex;
  let freshShoe = false;
  if (isShoeComplete(shoe)) {
    shoeIndex += 1;
    shoe = createBaccaratShoe(table.rules, deriveShoeSeed(table.sessionSeed, shoeIndex));
    freshShoe = true;
  }
  const chased = chasingStreak(shoe.coups, table.bets, table.lastBets) !== null;
  const dealt = dealCoup(shoe);
  return {
    table: {
      ...table,
      shoe: dealt.state,
      shoeIndex,
      freshShoe,
      phase: "deal",
      coup: dealt.coup,
      revealed: 0,
      lastBets: table.bets,
      settlement: null,
      error: null,
      caught: null,
      graded: [],
      chasedStreak: chased,
    },
    decisions,
  };
}

function noteCovers(note: TableNote, category: DecisionCategory): boolean {
  const backs = note.takeBack ?? [];
  if (category === "bet-choice") return backs.includes("tie");
  return backs.some((b) => SIDE_BET_KINDS.includes(b));
}

/** The coach's hint is on screen during betting ("every", or asked for with "asked"). */
export function hintVisible(table: BaccaratTable, coach: CoachLevel, asked: boolean): boolean {
  return table.phase === "bet" && table.caught === null && (coach === "every" || asked);
}

/**
 * The net of a coup that was dealt but not yet paid, for a player who leaves mid-coup: the
 * cards are already decided, so the hand is settled as it falls (the stake is never refunded).
 * Null when nothing is in play.
 */
export function abandonedNet(table: BaccaratTable): number | null {
  if ((table.phase !== "deal" && table.phase !== "result") || !table.coup) return null;
  return settleBets(table.rules, table.coup, table.bets).net;
}

/** "Take it back": lifts the bets the caught mistake named, back to betting. */
export function takeBack(table: BaccaratTable): BaccaratTable {
  if (!table.caught) return table;
  const drop = new Set(table.caught.takeBack ?? []);
  const bets: Bets = {};
  for (const [bet, value] of Object.entries(table.bets) as [BetKind, number][]) {
    if (value && !drop.has(bet)) bets[bet] = value;
  }
  return {
    ...table,
    bets,
    placements: table.placements.filter((p) => !drop.has(p.bet)),
    caught: null,
  };
}

/** The coup's cards in deal order: P, B, P, B, then Player's and Banker's third cards. */
export function dealSequence(coup: Coup): DealtCard[] {
  const out: DealtCard[] = [];
  for (let i = 0; i < 2; i++) {
    out.push({ side: "player", card: coup.player[i]! });
    out.push({ side: "banker", card: coup.banker[i]! });
  }
  if (coup.player[2]) out.push({ side: "player", card: coup.player[2] });
  if (coup.banker[2]) out.push({ side: "banker", card: coup.banker[2] });
  return out;
}

/** Turns the next card. The last one moves the table to the result. */
export function revealNext(table: BaccaratTable): BaccaratTable {
  if (table.phase !== "deal" || !table.coup) return table;
  const total = dealSequence(table.coup).length;
  const revealed = Math.min(total, table.revealed + 1);
  return { ...table, revealed, phase: revealed >= total ? "result" : "deal" };
}

/** The cards face up on each side right now. */
export function visibleHands(table: BaccaratTable): { player: Card[]; banker: Card[] } {
  const player: Card[] = [];
  const banker: Card[] = [];
  if (!table.coup) return { player, banker };
  const shown = table.phase === "deal" ? table.revealed : Infinity;
  dealSequence(table.coup).forEach((d, i) => {
    if (i >= shown) return;
    (d.side === "player" ? player : banker).push(d.card);
  });
  return { player, banker };
}

export interface SettleOutcome {
  readonly table: BaccaratTable;
  /** The coup's net, to record as a hand. */
  readonly net: number;
}

/** Pays the layout. Result → Payout. */
export function settle(table: BaccaratTable): SettleOutcome | null {
  if (table.phase !== "result" || !table.coup) return null;
  const settlement = settleBets(table.rules, table.coup, table.bets);
  return { table: { ...table, phase: "payout", settlement }, net: settlement.net };
}

/** Clears the felt for the next coup; `keepBets` is Rebet. */
export function nextHand(table: BaccaratTable, keepBets = false): BaccaratTable {
  if (table.phase !== "payout") return table;
  const cleared: BaccaratTable = {
    ...table,
    phase: "bet",
    bets: {},
    placements: [],
    coup: null,
    revealed: 0,
    settlement: null,
    error: null,
    caught: null,
    graded: [],
    chasedStreak: false,
    freshShoe: false,
  };
  return keepBets ? rebet(cleared) : cleared;
}

// ---------------------------------------------------------------------------------------------
// Roads

/** Columns the scoreboard shows at once (the design's 12 × 6 grid). */
export const ROAD_COLUMNS = 12;

export interface RoadCell {
  readonly column: number;
  readonly row: number;
  readonly letter: "P" | "B" | "T";
  readonly winner: Winner;
  /** Ties after this bead (big road only). */
  readonly ties: number;
  readonly latest: boolean;
}

export interface RoadView {
  readonly rows: number;
  readonly columns: number;
  readonly cells: readonly RoadCell[];
  readonly legend: { player: number; banker: number; tie: number };
}

const LETTER: Readonly<Record<Winner, "P" | "B" | "T">> = { player: "P", banker: "B", tie: "T" };

function windowed(
  cells: readonly Omit<RoadCell, "latest">[],
  columns: number,
  latestCoup: number,
  coupOf: (i: number) => number,
): RoadCell[] {
  const last = cells.reduce((m, c) => Math.max(m, c.column), 0);
  const start = Math.max(0, last - (columns - 1));
  return cells
    .map((c, i) => ({ ...c, latest: coupOf(i) === latestCoup, column: c.column - start }))
    .filter((c) => c.column >= 0);
}

/** The bead road, scrolled so the newest column is in view; the latest bead is flagged. */
export function beadRoadView(coups: readonly Coup[], columns = ROAD_COLUMNS): RoadView {
  const road = beadRoad(coups);
  const cells = road.cells.map((c) => ({
    column: c.column,
    row: c.row,
    letter: c.letter,
    winner: c.winner,
    ties: 0,
  }));
  return {
    rows: road.rows,
    columns,
    cells: windowed(cells, columns, coups.length - 1, (i) => road.cells[i]!.coup),
    legend: { player: road.counts.player, banker: road.counts.banker, tie: road.counts.tie },
  };
}

/** The big road, same window; the latest bead is the one that the last non-tie coup placed. */
export function bigRoadView(coups: readonly Coup[], columns = ROAD_COLUMNS): RoadView {
  const road = bigRoad(coups);
  const latest = road.cells[road.cells.length - 1]?.coup ?? -1;
  const cells = road.cells.map((c) => ({
    column: c.column,
    row: c.row,
    letter: LETTER[c.winner],
    winner: c.winner as Winner,
    ties: c.ties,
  }));
  return {
    rows: road.rows,
    columns,
    cells: windowed(cells, columns, latest, (i) => road.cells[i]!.coup),
    legend: { player: road.counts.player, banker: road.counts.banker, tie: road.counts.tie },
  };
}

/** The player's result for the outcome line's icon. */
export function playerOutcome(settlement: Settlement | null): "win" | "lose" | "push" | null {
  if (!settlement) return null;
  if (settlement.net > 0) return "win";
  if (settlement.net < 0) return "lose";
  return "push";
}
