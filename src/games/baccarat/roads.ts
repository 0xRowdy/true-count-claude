/**
 * Scoreboard roads for the current shoe.
 *
 * - **Bead road** ("BEAD ROAD · THIS SHOE" in the design): one bead per coup, filled down
 *   six rows and then across, ties included.
 * - **Big road**: one column per streak, ties marked on the previous bead rather than taking
 *   a cell. A streak longer than the grid is tall turns right along its last row (the
 *   "dragon tail").
 *
 * The roads are pure data for a scoreboard to draw. They are history, not a forecast: each
 * coup is independent of the last apart from the slight card-removal effect, which is why
 * the coach says so next to them.
 */

import type { Coup, Winner } from "./coup";

/** Rows on a standard scoreboard. */
export const ROAD_ROWS = 6;

export interface RoadCounts {
  readonly player: number;
  readonly banker: number;
  readonly tie: number;
  readonly total: number;
}

export function roadCounts(coups: readonly Coup[]): RoadCounts {
  let player = 0;
  let banker = 0;
  let tie = 0;
  for (const coup of coups) {
    if (coup.winner === "player") player++;
    else if (coup.winner === "banker") banker++;
    else tie++;
  }
  return { player, banker, tie, total: coups.length };
}

/** "Player 14", "Banker 18", "Tie 3" — the legend beside the road. */
export function roadLegend(counts: RoadCounts): {
  player: string;
  banker: string;
  tie: string;
} {
  return {
    player: `Player ${counts.player}`,
    banker: `Banker ${counts.banker}`,
    tie: `Tie ${counts.tie}`,
  };
}

export interface BeadCell {
  /** Index of the coup in the shoe. */
  readonly coup: number;
  readonly column: number;
  readonly row: number;
  readonly winner: Winner;
  /** "P" / "B" / "T", as printed in the bead. */
  readonly letter: "P" | "B" | "T";
  readonly natural: boolean;
  readonly playerPair: boolean;
  readonly bankerPair: boolean;
}

export interface BeadRoad {
  readonly rows: number;
  /** Columns in use (at least one, so an empty road still draws a grid). */
  readonly columns: number;
  readonly cells: readonly BeadCell[];
  readonly counts: RoadCounts;
}

const LETTER: Readonly<Record<Winner, BeadCell["letter"]>> = {
  player: "P",
  banker: "B",
  tie: "T",
};

/** The bead road: coup i sits at column ⌊i / rows⌋, row i mod rows. */
export function beadRoad(coups: readonly Coup[], rows = ROAD_ROWS): BeadRoad {
  const cells = coups.map(
    (coup, i): BeadCell => ({
      coup: i,
      column: Math.floor(i / rows),
      row: i % rows,
      winner: coup.winner,
      letter: LETTER[coup.winner],
      natural: coup.playerNatural || coup.bankerNatural,
      playerPair: coup.playerPair,
      bankerPair: coup.bankerPair,
    }),
  );
  return {
    rows,
    columns: Math.max(1, Math.ceil(coups.length / rows)),
    cells,
    counts: roadCounts(coups),
  };
}

export interface BigRoadCell {
  /** Index of the coup that placed this bead. */
  readonly coup: number;
  readonly column: number;
  readonly row: number;
  readonly winner: Exclude<Winner, "tie">;
  /** Ties that followed this bead (drawn as a slash and a count). */
  readonly ties: number;
  /** Which streak (0-based) the bead belongs to. */
  readonly streak: number;
}

export interface BigRoad {
  readonly rows: number;
  readonly columns: number;
  readonly cells: readonly BigRoadCell[];
  /** Ties dealt before the first Player or Banker win; shown on the first bead once it lands. */
  readonly leadingTies: number;
  readonly counts: RoadCounts;
}

/** The big road, with dragon tails when a streak outgrows the rows. */
export function bigRoad(coups: readonly Coup[], rows = ROAD_ROWS): BigRoad {
  const cells: { -readonly [K in keyof BigRoadCell]: BigRoadCell[K] }[] = [];
  const occupied = new Set<string>();
  const key = (c: number, r: number) => `${c},${r}`;

  let leadingTies = 0;
  let streak = -1;
  let streakStartColumn = -1;
  // Once a streak turns right (bottom row, or the cell below is taken), it keeps going
  // right on that row — it never drops back down into a free cell.
  let turned = false;
  let last: (typeof cells)[number] | undefined;

  coups.forEach((coup, i) => {
    if (coup.winner === "tie") {
      if (last) last.ties++;
      else leadingTies++;
      return;
    }
    let column: number;
    let row: number;
    if (!last || last.winner !== coup.winner) {
      streak++;
      column = streakStartColumn + 1;
      while (occupied.has(key(column, 0))) column++;
      row = 0;
      streakStartColumn = column;
      turned = false;
    } else if (!turned && last.row + 1 < rows && !occupied.has(key(last.column, last.row + 1))) {
      column = last.column;
      row = last.row + 1;
    } else {
      column = last.column + 1;
      row = last.row;
      turned = true;
    }
    occupied.add(key(column, row));
    const cell = { coup: i, column, row, winner: coup.winner, ties: 0, streak };
    if (cells.length === 0) cell.ties = leadingTies;
    cells.push(cell);
    last = cell;
  });

  const columns = Math.max(1, ...cells.map((c) => c.column + 1));
  return { rows, columns, cells, leadingTies, counts: roadCounts(coups) };
}

/** The current streak: who is on it and how long. Null before the first non-tie coup. */
export function currentStreak(
  coups: readonly Coup[],
): { winner: Exclude<Winner, "tie">; length: number } | null {
  let winner: Exclude<Winner, "tie"> | null = null;
  let length = 0;
  for (let i = coups.length - 1; i >= 0; i--) {
    const w = coups[i]?.winner;
    if (w === "tie" || w === undefined) continue;
    if (winner === null) winner = w;
    if (w !== winner) break;
    length++;
  }
  return winner === null ? null : { winner, length };
}
