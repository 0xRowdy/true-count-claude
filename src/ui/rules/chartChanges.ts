/**
 * The strategy chart as rows, and the diff between two charts.
 *
 * `strategyChart(rules)` hands back the whole chart as data (invariant 4), which is what
 * makes the payoff of this screen possible: change a rule and the chart visibly moves.
 * "Visibly" is doing the work in that sentence. A chart that silently re-renders with two
 * different letters in it teaches nothing, so this module also computes exactly which
 * cells changed and puts each one into a sentence — "Hard 15 vs 10: Hit becomes
 * Surrender". That sentence is the lesson; the table is the reference.
 *
 * Pure, React-free, and tested in `chartChanges.test.ts`.
 */

import {
  type ChartCode,
  type ChartRow,
  type ChartSection,
  DEALER_UPCARDS,
  type DealerUpcard,
  type HardTotal,
  PAIR_RANKS,
  type PairRank,
  type SoftTotal,
  type StrategyChart,
} from "@/engine/strategy";

/**
 * Hard 5 through 20.
 *
 * Hard 4 is an unsplittable 2,2 that published tables fold into the pairs chart, and a
 * hard 21 is not a decision. Hard 18-20 are always stand under every Rule Set, but they
 * are printed anyway — a chart that stops at 17 makes a reader wonder whether their hand
 * fell off the end of it.
 */
export const HARD_ROWS: readonly HardTotal[] = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
];

/** Soft 13 through 20 — A,2 through A,9, exactly as published tables print them. */
export const SOFT_ROWS: readonly SoftTotal[] = [13, 14, 15, 16, 17, 18, 19, 20];

export const PAIR_ROWS: readonly PairRank[] = PAIR_RANKS;

export const SECTION_TITLE: Readonly<Record<ChartSection, string>> = {
  hard: "Hard totals",
  soft: "Soft totals",
  pairs: "Pairs",
};

/** One printed row of the chart, ready to render and stable enough to diff against. */
export interface ChartRowView {
  readonly section: ChartSection;
  /** Stable identity across rule changes — the total, or the pair rank. */
  readonly key: string;
  /** How a published table labels the row: "16", "A,7", "8,8". */
  readonly label: string;
  readonly cells: ChartRow;
}

export function hardLabel(total: HardTotal): string {
  return String(total);
}

/** Published tables label soft rows by the non-ace card: soft 18 is "A,7". */
export function softLabel(total: SoftTotal): string {
  return `A,${total - 11}`;
}

export function pairLabel(rank: PairRank): string {
  return `${rank},${rank}`;
}

/** The rows of one section, in printed order. */
export function sectionRows(chart: StrategyChart, section: ChartSection): readonly ChartRowView[] {
  switch (section) {
    case "hard":
      return HARD_ROWS.map((total) => ({
        section,
        key: `hard:${total}`,
        label: hardLabel(total),
        cells: chart.hard[total],
      }));
    case "soft":
      return SOFT_ROWS.map((total) => ({
        section,
        key: `soft:${total}`,
        label: softLabel(total),
        cells: chart.soft[total],
      }));
    case "pairs":
      return PAIR_ROWS.map((rank) => ({
        section,
        key: `pairs:${rank}`,
        label: pairLabel(rank),
        cells: chart.pairs[rank],
      }));
  }
}

export const CHART_SECTIONS: readonly ChartSection[] = ["hard", "soft", "pairs"];

/** Every printed row of the chart, all three sections, in order. */
export function chartRows(chart: StrategyChart): readonly ChartRowView[] {
  return CHART_SECTIONS.flatMap((section) => sectionRows(chart, section));
}

/**
 * What each code means, spelled out.
 *
 * The composite codes are the ones worth spelling out: "Ds" reads as noise on a printed
 * chart until someone tells you it means double if you can and stand if you cannot.
 */
export const CHART_CODE_LABEL: Readonly<Record<ChartCode, string>> = {
  H: "Hit",
  S: "Stand",
  D: "Double, else hit",
  Ds: "Double, else stand",
  P: "Split",
  Rh: "Surrender, else hit",
  Rs: "Surrender, else stand",
  Rp: "Surrender, else split",
};

/** The short form printed in a cell. Matches the notation published tables use. */
export const CHART_CODE_TEXT: Readonly<Record<ChartCode, string>> = {
  H: "H",
  S: "S",
  D: "D",
  Ds: "Ds",
  P: "P",
  Rh: "R",
  Rs: "Rs",
  Rp: "Rp",
};

/** The five families a cell belongs to, which is what the colouring keys off. */
export type CodeFamily = "hit" | "stand" | "double" | "split" | "surrender";

export const CODE_FAMILY: Readonly<Record<ChartCode, CodeFamily>> = {
  H: "hit",
  S: "stand",
  D: "double",
  Ds: "double",
  P: "split",
  Rh: "surrender",
  Rs: "surrender",
  Rp: "surrender",
};

export interface ChartChange {
  readonly section: ChartSection;
  /** Row identity, matching `ChartRowView.key`. */
  readonly rowKey: string;
  readonly rowLabel: string;
  readonly upcard: DealerUpcard;
  readonly before: ChartCode;
  readonly after: ChartCode;
}

/** How the chart labels a dealer upcard column. 11 is an ace. */
export function upcardLabel(upcard: DealerUpcard): string {
  return upcard === 11 ? "A" : String(upcard);
}

/** Identity of one cell, for a changed-cell lookup during render. */
export function cellKey(rowKey: string, upcard: DealerUpcard): string {
  return `${rowKey}@${upcard}`;
}

/**
 * Every cell that differs between two charts, in printed order.
 *
 * Both charts are read through `chartRows`, so the diff covers exactly the cells the
 * screen shows. A change in a row that is not printed cannot be highlighted and would be
 * a count the user could not reconcile with what is in front of them.
 */
export function chartChanges(
  before: StrategyChart,
  after: StrategyChart,
): readonly ChartChange[] {
  const changes: ChartChange[] = [];
  const beforeRows = chartRows(before);
  const afterRows = chartRows(after);

  afterRows.forEach((row, index) => {
    const previous = beforeRows[index];
    if (!previous) return;
    for (const upcard of DEALER_UPCARDS) {
      const was = previous.cells[upcard];
      const now = row.cells[upcard];
      if (was !== now) {
        changes.push({
          section: row.section,
          rowKey: row.key,
          rowLabel: row.label,
          upcard,
          before: was,
          after: now,
        });
      }
    }
  });

  return changes;
}

export function changedCellKeys(changes: readonly ChartChange[]): ReadonlySet<string> {
  return new Set(changes.map((change) => cellKey(change.rowKey, change.upcard)));
}

/** "Hard 15 vs 10: Hit becomes Surrender, else hit". */
export function describeChange(change: ChartChange): string {
  const where =
    change.section === "pairs"
      ? change.rowLabel
      : `${change.section === "hard" ? "Hard" : "Soft"} ${change.rowLabel}`;
  return (
    `${where} vs ${upcardLabel(change.upcard)}: ` +
    `${CHART_CODE_LABEL[change.before]} becomes ${CHART_CODE_LABEL[change.after]}`
  );
}

/**
 * A one-line headline for a set of changes.
 *
 * Reported as a count first because the count is the honest summary — a rule that moves
 * one cell and a rule that moves twenty are different sizes of thing, and a user deciding
 * whether re-learning is worth it needs that number before they need the detail.
 */
export function summarizeChanges(changes: readonly ChartChange[]): string {
  if (changes.length === 0) return "No cell on the chart moves. Basic strategy is unchanged.";
  const sections = [
    ...new Set(changes.map((change) => SECTION_TITLE[change.section].toLowerCase())),
  ];
  const where =
    sections.length <= 1
      ? (sections[0] ?? "the chart")
      : `${sections.slice(0, -1).join(", ")} and ${sections[sections.length - 1]}`;
  return changes.length === 1
    ? `1 cell moves, in ${where}.`
    : `${changes.length} cells move, in ${where}.`;
}
