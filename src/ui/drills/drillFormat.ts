/**
 * Words for the drill screens.
 *
 * The drills module returns structured data and never a sentence (`src/drills/explanation.ts`
 * says why); this is where the sentences are made, and nowhere else, so every one of them can
 * be tested against the numbers it claims to describe. React-free, so it runs in plain Node.
 *
 * The one sentence this file exists for is the Basic Strategy breakdown. "82% correct" is a
 * number a user can do nothing with; "you are fine everywhere except soft 18" is a thing to go
 * and practise.
 */

import type { ChartSection, DealerUpcard } from "@/engine/strategy";
import type { TrueCountRounding } from "@/engine/counting";
import type { BasicStrategyReport } from "@/drills/basicStrategy";
import type { CellStat, RowStat } from "@/drills/chart";
import type { CountCheckResult } from "@/drills/counting";
import type { EntryExclusionReason } from "@/drills/deviation";
import type { TrueCountFocus, TrueCountResult } from "@/drills/trueCount";
import { ACTION_NAME, ACTION_PAST } from "@/ui/explanation/explanationFormat";

/** An em dash for a rate with nothing to divide — never "0%". Matches the Statistics screen. */
export const NO_RATE = "—";

export function formatRate(rate: number | null): string {
  return rate === null ? NO_RATE : `${Math.round(rate * 100)}%`;
}

/** A count, signed, with a real minus sign: "+4", "−12", "0", "+7.5". */
export function formatCountValue(count: number): string {
  if (count === 0) return "0";
  const magnitude = Math.abs(count);
  const rendered = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1);
  return `${count > 0 ? "+" : "−"}${rendered}`;
}

export function upcardName(upcard: DealerUpcard): string {
  return upcard === 11 ? "A" : String(upcard);
}

// ---------------------------------------------------------------------------
// Basic Strategy
// ---------------------------------------------------------------------------

const PAIR_WORD: Record<string, string> = { A: "aces", "10": "tens" };

/**
 * A chart row as a player says it: "hard 16", "soft 18", "a pair of 8s".
 *
 * The chart labels soft rows by their cards ("A,7") because that is how they are printed, but
 * nobody at a table says "A comma 7"; they say soft 18.
 */
export function rowName(section: ChartSection, row: string): string {
  switch (section) {
    case "hard":
      return `hard ${row}`;
    case "soft": {
      const match = /^A,(\d)$/.exec(row);
      return match ? `soft ${11 + Number(match[1])}` : row;
    }
    case "pairs": {
      const rank = row.split(",")[0] ?? row;
      return `a pair of ${PAIR_WORD[rank] ?? `${rank}s`}`;
    }
  }
}

function rowMiss(row: RowStat): string {
  return `${rowName(row.section, row.row)} (missed ${row.missed} of ${row.attempts})`;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The actionable form of a Basic Strategy score. */
export function breakdownSentence(report: BasicStrategyReport): string {
  const { breakdown } = report;
  if (breakdown.attempts === 0) {
    return "No decisions graded yet. Your weak spots will be named here, row by row, as you play.";
  }
  const decisions = `${breakdown.attempts} decision${breakdown.attempts === 1 ? "" : "s"}`;
  const rows = `${breakdown.rows.length} chart row${breakdown.rows.length === 1 ? "" : "s"}`;
  if (report.weakestRows.length === 0) {
    return `No misses in ${decisions} across ${rows}.`;
  }
  return `Across ${decisions} in ${rows}, you are fine everywhere except ${joinList(
    report.weakestRows.map(rowMiss),
  )}.`;
}

/** One weak cell: where, what the chart says, and what the user actually did instead. */
export function cellMistakeLine(cell: CellStat): string {
  const mistakes = cell.mistakes
    .map((mistake) => `${ACTION_PAST[mistake.action]}${mistake.count > 1 ? ` ${mistake.count}×` : ""}`)
    .join(", ");
  return `${rowName(cell.section, cell.row)} vs ${upcardName(cell.upcard)}: the chart says ${ACTION_NAME[
    cell.correctAction
  ].toLowerCase()}; you ${mistakes}.`;
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

export interface VerdictLines {
  readonly correct: boolean;
  readonly headline: string;
  readonly detail: string | null;
}

export function countCheckVerdict(result: CountCheckResult): VerdictLines {
  const actual = formatCountValue(result.actualRunningCount);
  if (result.verdict === "correct") {
    return {
      correct: true,
      headline: `Right — the Running Count is ${actual}.`,
      detail: `${result.explanation.cardsSeen} cards seen in ${result.explanation.systemName}.`,
    };
  }
  const off = Math.abs(result.off);
  const points = `${Number.isInteger(off) ? off : off.toFixed(1)} point${off === 1 ? "" : "s"}`;
  return {
    correct: false,
    headline: `You said ${formatCountValue(result.statedRunningCount)}; the Running Count is ${actual}.`,
    detail: `You are ${points} ${result.off > 0 ? "high" : "low"}. The cards since your last check are below, each with its tag — the slip is in there.`,
  };
}

// ---------------------------------------------------------------------------
// True Count
// ---------------------------------------------------------------------------

export const ROUNDING_NAME: Readonly<Record<TrueCountRounding, string>> = {
  exact: "unrounded",
  truncate: "truncated toward zero",
  floor: "rounded down (floor)",
  round: "rounded to nearest",
};

export const ROUNDING_SHORT: Readonly<Record<TrueCountRounding, string>> = {
  exact: "Exact",
  truncate: "Truncate",
  floor: "Floor",
  round: "Round",
};

export const FOCUS_LABEL: Readonly<Record<TrueCountFocus, string>> = {
  ordinary: "Ordinary count",
  negative: "Negative count",
  "two-digit-running": "Two-digit Running Count",
  "two-digit-true": "Two-digit True Count",
  "deep-shoe": "Deep in the shoe",
};

/** Decks to two places, with the card count it came from: "2.25 decks (117 cards)". */
export function decksText(cardsRemaining: number): string {
  const decks = cardsRemaining / 52;
  return `${decks.toFixed(2)} deck${decks === 1 ? "" : "s"} (${cardsRemaining} cards)`;
}

/** The division, shown: "−7 ÷ 2.00 = −3.50". */
export function divisionText(runningCount: number, decksRemaining: number, exact: number): string {
  return `${formatCountValue(runningCount)} ÷ ${decksRemaining.toFixed(2)} = ${formatExact(exact)}`;
}

function formatExact(value: number): string {
  if (value === 0) return "0";
  const rendered = Math.abs(value).toFixed(2);
  return `${value > 0 ? "+" : "−"}${rendered}`;
}

export function trueCountVerdict(result: TrueCountResult): VerdictLines & { readonly lesson: string | null } {
  const e = result.explanation;
  const division = divisionText(e.runningCount, e.decksRemaining, e.exact);
  const answer = formatCountValue(e.answer);
  if (result.verdict === "correct") {
    return {
      correct: true,
      headline: `Right — ${answer}.`,
      detail: `${division}, ${ROUNDING_NAME[e.rounding]}, is ${answer}.`,
      lesson: null,
    };
  }

  let lesson: string | null = null;
  if (e.correctUnderRounding !== null) {
    lesson = `${formatCountValue(e.stated)} is what ${ROUNDING_NAME[e.correctUnderRounding]} gives — your arithmetic was right. This drill uses ${ROUNDING_NAME[e.rounding]}, where it is ${answer}. The two conventions only disagree when the division leaves a fraction, and most often on negative counts.`;
  } else if (e.signError) {
    lesson = `Right size, wrong sign: the Running Count is ${formatCountValue(e.runningCount)}, so the True Count is ${e.answer < 0 ? "negative" : "positive"} too.`;
  }

  return {
    correct: false,
    headline: `You said ${formatCountValue(e.stated)}; the True Count is ${answer}.`,
    detail: `${division}, ${ROUNDING_NAME[e.rounding]}, is ${answer}.`,
    lesson,
  };
}

// ---------------------------------------------------------------------------
// Deviations
// ---------------------------------------------------------------------------

export const EXCLUSION_REASON: Readonly<Record<EntryExclusionReason, string>> = {
  "outside-published-rules":
    "Your table's Basic Strategy already plays this hand differently, so there is no chart play left for the index to depart from — and no source publishes the departure from the play your table makes.",
  "action-not-legal": "The play this index calls for is not allowed at your table.",
  "no-representable-hand":
    "No two-card hand makes this total without being a pair the chart reads differently.",
  superseded:
    "Another published index covers the same hand against the same upcard and takes precedence, so this one cannot be drilled on its own terms.",
};
