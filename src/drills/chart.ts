/**
 * The per-chart-cell breakdown — the part of a Basic Strategy score that is worth anything.
 *
 * "82% correct" is a number a user can do nothing with. *"You are fine everywhere except
 * soft 18, where you have stood four times out of five against a 9"* is a thing to go and
 * practise. The category's own reviews make the same point from the other side: the
 * complaint is not that trainers fail to score, it is that scoring without a reason only
 * teaches memorisation (`docs/adr/0005-explanation-first-over-visual-fidelity.md`).
 *
 * So every graded decision is filed under the cell that governed it — the same coordinate
 * `governingCell` returns, so the breakdown and the highlighted chart cell are the same
 * cell by construction — and the breakdown rolls up three ways: cell, row, and section. The
 * row roll-up is the one that produces the sentence above, because a user's weakness is
 * almost never one cell: it is a row they have half learnt.
 *
 * Mistakes are kept as *what the user actually chose*, not just as a miss count. "You hit
 * soft 18 vs 9" and "you doubled soft 18 vs 9" are different errors with different fixes.
 *
 * Rates are `null` at a zero denominator, never `0` — see `progress.ts`.
 */

import type { Action, ChartCode, ChartSection, DealerUpcard } from "@/engine";
import { rate } from "./progress";
import type { Verdict } from "./types";

/**
 * One graded decision, reduced to what the breakdown needs.
 *
 * Deliberately small and serializable: a drill keeps a list of these for the whole run,
 * while the full Explanation is kept only for the decision on screen. A thousand-hand
 * session should cost a thousand small records, not a thousand EV tables.
 */
export interface CellAttempt {
  readonly section: ChartSection;
  /** The row as published tables label it: "16", "A,7", "8,8". */
  readonly row: string;
  readonly upcard: DealerUpcard;
  /** What the printed chart says in this cell. */
  readonly code: ChartCode;
  /** The play the cell resolved to, once `legalActions` had its say. */
  readonly correctAction: Action;
  readonly actionTaken: Action;
  readonly verdict: Verdict;
  /** Bets given up against the best-EV play, or `null` when no EV was available. */
  readonly evLoss: number | null;
}

/** A wrong choice and how often it was made. */
export interface MistakeCount {
  readonly action: Action;
  readonly count: number;
}

export interface CellStat {
  /** Stable identifier: `"hard:16:10"`, `"soft:A,7:9"`, `"pairs:8,8:11"`. */
  readonly id: string;
  readonly section: ChartSection;
  readonly row: string;
  readonly upcard: DealerUpcard;
  readonly code: ChartCode;
  readonly correctAction: Action;
  readonly attempts: number;
  readonly correct: number;
  readonly missed: number;
  readonly accuracy: number | null;
  /** Total bets given up in this cell across the run. */
  readonly evLost: number;
  /** The wrong choices actually made here, most frequent first. */
  readonly mistakes: readonly MistakeCount[];
}

/** A whole chart row — "soft 18", "8,8", "16" — across every dealer upcard drilled. */
export interface RowStat {
  /** Stable identifier: `"soft:A,7"`. */
  readonly id: string;
  readonly section: ChartSection;
  readonly row: string;
  readonly attempts: number;
  readonly correct: number;
  readonly missed: number;
  readonly accuracy: number | null;
  readonly evLost: number;
  /** The cells of this row that were drilled, in dealer-upcard order. */
  readonly cells: readonly CellStat[];
}

export interface SectionStat {
  readonly section: ChartSection;
  readonly attempts: number;
  readonly correct: number;
  readonly missed: number;
  readonly accuracy: number | null;
  readonly evLost: number;
}

export interface ChartBreakdown {
  readonly attempts: number;
  readonly correct: number;
  readonly accuracy: number | null;
  readonly evLost: number;
  /**
   * Every cell drilled, grouped by section in published order — hard, then soft, then
   * pairs — with each section's rows in the order they were first met and each row's cells
   * in dealer-upcard order.
   */
  readonly cells: readonly CellStat[];
  readonly rows: readonly RowStat[];
  readonly sections: readonly SectionStat[];
}

export const EMPTY_BREAKDOWN: ChartBreakdown = {
  attempts: 0,
  correct: 0,
  accuracy: null,
  evLost: 0,
  cells: [],
  rows: [],
  sections: [],
};

/** Published chart order, so a breakdown reads down the page the way the chart does. */
const SECTION_ORDER: readonly ChartSection[] = ["hard", "soft", "pairs"];

export function cellId(section: ChartSection, row: string, upcard: DealerUpcard): string {
  return `${section}:${row}:${upcard}`;
}

export function rowId(section: ChartSection, row: string): string {
  return `${section}:${row}`;
}

interface CellAccumulator {
  section: ChartSection;
  row: string;
  upcard: DealerUpcard;
  code: ChartCode;
  correctAction: Action;
  attempts: number;
  correct: number;
  evLost: number;
  mistakes: Map<Action, number>;
  /** Order of first appearance, so equal-scoring cells sort stably. */
  seq: number;
}

/**
 * Files a run's graded decisions by chart cell.
 *
 * Derived from the attempt list rather than maintained incrementally, which is what makes
 * an undo exact: taking a step back pops a shorter list, and the breakdown recomputed from
 * it cannot carry a ghost of the decision that was withdrawn.
 */
export function chartBreakdown(attempts: readonly CellAttempt[]): ChartBreakdown {
  const byCell = new Map<string, CellAccumulator>();

  for (const attempt of attempts) {
    const id = cellId(attempt.section, attempt.row, attempt.upcard);
    let cell = byCell.get(id);
    if (!cell) {
      cell = {
        section: attempt.section,
        row: attempt.row,
        upcard: attempt.upcard,
        code: attempt.code,
        correctAction: attempt.correctAction,
        attempts: 0,
        correct: 0,
        evLost: 0,
        mistakes: new Map<Action, number>(),
        seq: byCell.size,
      };
      byCell.set(id, cell);
    }

    cell.attempts++;
    cell.evLost += attempt.evLoss ?? 0;
    if (attempt.verdict === "correct") {
      cell.correct++;
    } else {
      cell.mistakes.set(attempt.actionTaken, (cell.mistakes.get(attempt.actionTaken) ?? 0) + 1);
    }
  }

  const cells = [...byCell.values()].sort(compareCells).map(toCellStat);
  return {
    attempts: attempts.length,
    correct: attempts.reduce((sum, a) => sum + (a.verdict === "correct" ? 1 : 0), 0),
    accuracy: rate(
      attempts.reduce((sum, a) => sum + (a.verdict === "correct" ? 1 : 0), 0),
      attempts.length,
    ),
    evLost: cells.reduce((sum, cell) => sum + cell.evLost, 0),
    cells,
    rows: rollUpRows(cells),
    sections: rollUpSections(cells),
  };
}

function compareCells(a: CellAccumulator, b: CellAccumulator): number {
  const section = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
  if (section !== 0) return section;
  if (a.row !== b.row) return a.seq - b.seq;
  return a.upcard - b.upcard;
}

function toCellStat(cell: CellAccumulator): CellStat {
  const mistakes = [...cell.mistakes.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((x, y) => y.count - x.count || x.action.localeCompare(y.action));

  return {
    id: cellId(cell.section, cell.row, cell.upcard),
    section: cell.section,
    row: cell.row,
    upcard: cell.upcard,
    code: cell.code,
    correctAction: cell.correctAction,
    attempts: cell.attempts,
    correct: cell.correct,
    missed: cell.attempts - cell.correct,
    accuracy: rate(cell.correct, cell.attempts),
    evLost: cell.evLost,
    mistakes,
  };
}

function rollUpRows(cells: readonly CellStat[]): readonly RowStat[] {
  const rows = new Map<string, CellStat[]>();
  for (const cell of cells) {
    const id = rowId(cell.section, cell.row);
    const bucket = rows.get(id);
    if (bucket) bucket.push(cell);
    else rows.set(id, [cell]);
  }

  return [...rows.entries()].map(([id, members]) => {
    const first = members[0] as CellStat;
    const attempts = sum(members, (cell) => cell.attempts);
    const correct = sum(members, (cell) => cell.correct);
    return {
      id,
      section: first.section,
      row: first.row,
      attempts,
      correct,
      missed: attempts - correct,
      accuracy: rate(correct, attempts),
      evLost: sum(members, (cell) => cell.evLost),
      cells: members,
    };
  });
}

function rollUpSections(cells: readonly CellStat[]): readonly SectionStat[] {
  return SECTION_ORDER.map((section) => {
    const members = cells.filter((cell) => cell.section === section);
    const attempts = sum(members, (cell) => cell.attempts);
    const correct = sum(members, (cell) => cell.correct);
    return {
      section,
      attempts,
      correct,
      missed: attempts - correct,
      accuracy: rate(correct, attempts),
      evLost: sum(members, (cell) => cell.evLost),
    };
  }).filter((stat) => stat.attempts > 0);
}

function sum<T>(items: readonly T[], of: (item: T) => number): number {
  return items.reduce((total, item) => total + of(item), 0);
}

/**
 * The cells to go and practise, worst first.
 *
 * Ranked by misses rather than by accuracy, because a cell missed once out of one is not
 * a weakness and would otherwise top a list sorted by percentage. Bets given up breaks the
 * tie, so two cells missed equally often are ordered by what the mistake actually costs —
 * hitting a hard 20 and hitting a hard 12 vs 3 are not the same error.
 */
export function weakestCells(breakdown: ChartBreakdown, limit = 5): readonly CellStat[] {
  return breakdown.cells
    .filter((cell) => cell.missed > 0)
    .slice()
    .sort((a, b) => b.missed - a.missed || b.evLost - a.evLost || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/**
 * The rows to go and practise, worst first.
 *
 * This is the roll-up that produces an actionable sentence. A user who has not learnt soft
 * 18 misses it against 9, 10 and an ace; three cells each missed twice look like noise,
 * while one row missed six times is a lesson.
 */
export function weakestRows(breakdown: ChartBreakdown, limit = 3): readonly RowStat[] {
  return breakdown.rows
    .filter((row) => row.missed > 0)
    .slice()
    .sort((a, b) => b.missed - a.missed || b.evLost - a.evLost || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/**
 * Cells the user has demonstrably learnt: attempted at least `minAttempts` times and never
 * missed. Worth showing — a trainer that only ever lists failures is a worse teacher than
 * one that can also say what is finished.
 */
export function masteredCells(breakdown: ChartBreakdown, minAttempts = 3): readonly CellStat[] {
  return breakdown.cells.filter((cell) => cell.missed === 0 && cell.attempts >= minAttempts);
}

/** Cells drilled too few times to say anything about yet. */
export function untestedCells(breakdown: ChartBreakdown, minAttempts = 3): readonly CellStat[] {
  return breakdown.cells.filter((cell) => cell.attempts < minAttempts);
}
