/**
 * The strategy chart for the current Rule Set, with the cells that just moved lit up.
 *
 * This is the payoff of the whole screen. Invariant 4 says the strategy engine is
 * auditable, and `strategyChart(rules)` hands over the entire chart as data precisely so a
 * surface like this one can print it. The user changes a rule and watches the chart react:
 * take surrender away and eight red cells turn to hits; turn the dealer's peek off and A,A
 * against an ace stops being a split. That is a lesson no paragraph delivers as well, and
 * it is the answer to "the rules are wrong and can't be fixed through customization" —
 * here are the rules, here is the chart, and here is the link between them.
 *
 * Layout: the row labels are pinned and the ten upcard columns scroll horizontally inside
 * the table's own container, the same arrangement `RankTable` uses. Thirteen columns do
 * not fit 360pt and never will; the page itself must never scroll sideways.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { RuleSet } from "@/engine/rules";
import {
  type ChartCode,
  type ChartSection,
  DEALER_UPCARDS,
  type DealerUpcard,
  type StrategyChart,
} from "@/engine/strategy";
import { Badge, Panel, SegmentedControl } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";
import {
  CHART_CODE_LABEL,
  CHART_CODE_TEXT,
  CHART_SECTIONS,
  type ChartChange,
  type ChartRowView,
  type CodeFamily,
  CODE_FAMILY,
  SECTION_TITLE,
  cellKey,
  describeChange,
  sectionRows,
  summarizeChanges,
  upcardLabel,
} from "./chartChanges";

/** Cell geometry. `compact` is for a chart embedded in another surface, like an Explanation. */
const DENSITY = {
  regular: { rowHeight: 30, columnWidth: 38, labelWidth: 58 },
  compact: { rowHeight: 28, columnWidth: 32, labelWidth: 48 },
} as const;

export type ChartDensity = keyof typeof DENSITY;

/**
 * Five colours for five families of play, so the shape of the chart is readable before a
 * single letter is. Defined here rather than in `theme.ts` because they are this table's
 * semantics — hit, stand, double, split, surrender — and not app-wide tokens.
 */
const FAMILY_STYLE: Readonly<Record<CodeFamily, { bg: string; fg: string }>> = {
  hit: { bg: "#3A2A1C", fg: "#FBBF24" },
  stand: { bg: "#1F3D2B", fg: "#4ADE80" },
  double: { bg: "#1B2C44", fg: "#60A5FA" },
  split: { bg: "#2E2440", fg: "#C4B5FD" },
  surrender: { bg: "#3B1F22", fg: "#F87171" },
};

const LEGEND_ORDER: readonly ChartCode[] = ["H", "S", "D", "Ds", "P", "Rh", "Rs", "Rp"];

const SECTION_OPTIONS = CHART_SECTIONS.map((section) => ({
  value: section,
  label: SECTION_TITLE[section],
}));

/** How many moved cells to spell out before the list stops being readable. */
const MAX_DESCRIBED_CHANGES = 8;

export function StrategyChartPanel({
  rules,
  chart,
  changes,
  changedKeys,
}: {
  rules: RuleSet;
  chart: StrategyChart;
  /** Cells that differ from the chart before the user's last rule change. */
  changes: readonly ChartChange[];
  changedKeys: ReadonlySet<string>;
}) {
  const [section, setSection] = useState<ChartSection>("hard");
  const rows = useMemo(() => sectionRows(chart, section), [chart, section]);
  const changedInSection = changes.filter((change) => change.section === section).length;

  return (
    <Panel title="Basic Strategy for this table">
      <Text style={styles.intro}>
        Generated from your rules, not looked up in a fixed table. Change anything above and
        the cells that move are outlined here.
      </Text>

      <ChangeReport changes={changes} />

      <SegmentedControl options={SECTION_OPTIONS} value={section} onChange={setSection} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionCaption}>
          {SECTION_TITLE[section]} · dealer upcard across the top
        </Text>
        {changedInSection > 0 ? (
          <Badge
            label={`${changedInSection} MOVED HERE`}
            tone="info"
          />
        ) : null}
      </View>

      <StrategyChartGrid rows={rows} section={section} changedKeys={changedKeys} />

      <ChartLegend />

      <Text style={styles.footnote}>
        Hard 21 and soft 21 are not printed — a 21 is never a decision. Split aces take one
        card each{rules.oneCardToSplitAces ? "" : " — except at your table, where you may draw"}
        .
      </Text>
    </Panel>
  );
}

/** The cell a chart is asked to point at: one row, one upcard column. */
export interface ChartHighlight {
  /** The row as `ChartRowView.label` prints it — which is also `GoverningCell.row`. */
  readonly rowLabel: string;
  readonly upcard: DealerUpcard;
}

/**
 * The chart table itself: pinned row labels, ten upcard columns scrolling in their own
 * container. Shared by the Rule Set screen and the Explanation panel, so there is exactly one
 * way this app draws a strategy chart.
 *
 * With a `highlight`, the governing row and column stay at full strength, every other cell
 * dims, and the cell where they cross is outlined — the cell in context, not a bare code
 * (ADR-0005). The column is scrolled into view on layout, because on a 360pt phone the 10 and
 * ace columns, the most common upcards in the game, start off-screen.
 */
export function StrategyChartGrid({
  rows,
  section,
  changedKeys,
  highlight = null,
  density = "regular",
}: {
  rows: readonly ChartRowView[];
  section: ChartSection;
  changedKeys?: ReadonlySet<string>;
  highlight?: ChartHighlight | null;
  density?: ChartDensity;
}) {
  const size = DENSITY[density];
  const scroller = useRef<ScrollView>(null);
  const highlightColumn = highlight ? DEALER_UPCARDS.indexOf(highlight.upcard) : -1;

  const [viewport, setViewport] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setViewport(event.nativeEvent.layout.width);
  }, []);

  // Re-run whenever the highlighted column or the available width changes, so a panel that
  // switches between decisions keeps its cell in view without remounting the table.
  useEffect(() => {
    if (highlightColumn < 0 || viewport <= 0) return;
    const content = DEALER_UPCARDS.length * size.columnWidth;
    if (content <= viewport) return;
    const centred = highlightColumn * size.columnWidth - (viewport - size.columnWidth) / 2;
    const x = Math.max(0, Math.min(centred, content - viewport));
    scroller.current?.scrollTo({ x, animated: false });
  }, [highlightColumn, viewport, size.columnWidth]);

  const cellSize = { height: size.rowHeight };
  const column = { width: size.columnWidth };

  return (
    <View style={styles.table}>
      <View style={[styles.labelColumn, { width: size.labelWidth }]}>
        <View style={[styles.cell, cellSize, styles.cornerCell, { width: size.labelWidth }]}>
          <Text style={styles.cornerText}>{section === "pairs" ? "Pair" : "You"}</Text>
        </View>
        {rows.map((row) => {
          const lit = highlight?.rowLabel === row.label;
          return (
            <View
              key={row.key}
              style={[styles.cell, cellSize, { width: size.labelWidth }, lit && styles.litLabel]}
            >
              <Text style={[styles.labelText, lit && styles.litLabelText]} numberOfLines={1}>
                {row.label}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator
        onLayout={onLayout}
      >
        <View>
          <View style={styles.headerRow}>
            {DEALER_UPCARDS.map((upcard) => {
              const lit = highlight?.upcard === upcard;
              return (
                <View
                  key={upcard}
                  style={[styles.cell, cellSize, column, lit && styles.litLabel]}
                >
                  <Text style={[styles.headerText, lit && styles.litLabelText]}>
                    {upcardLabel(upcard)}
                  </Text>
                </View>
              );
            })}
          </View>
          {rows.map((row) => (
            <View key={row.key} style={styles.bodyRow}>
              {DEALER_UPCARDS.map((upcard) => {
                const code = row.cells[upcard];
                const moved = changedKeys?.has(cellKey(row.key, upcard)) ?? false;
                const palette = FAMILY_STYLE[CODE_FAMILY[code]];
                const inRow = highlight?.rowLabel === row.label;
                const inColumn = highlight?.upcard === upcard;
                const target = inRow && inColumn;
                const dimmed = highlight !== null && !inRow && !inColumn;
                return (
                  <View
                    key={upcard}
                    accessible
                    accessibilityLabel={`${row.label} versus ${upcardLabel(upcard)}: ${
                      CHART_CODE_LABEL[code]
                    }${moved ? ", changed" : ""}${target ? ", the cell behind this decision" : ""}`}
                    style={[
                      styles.cell,
                      cellSize,
                      column,
                      { backgroundColor: palette.bg },
                      dimmed && styles.dimmedCell,
                      moved && styles.movedCell,
                      target && styles.targetCell,
                    ]}
                  >
                    <Text style={[styles.cellText, { color: palette.fg }]}>
                      {CHART_CODE_TEXT[code]}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * What the last rule change did, in sentences.
 *
 * The count comes first because the count is the honest headline: a rule that moves one
 * cell and a rule that moves twenty are different sizes of thing. Then up to eight of the
 * moves are spelled out, because "Hard 15 vs 10: Hit becomes Surrender, else hit" is the
 * form in which a chart change is actually learnable.
 */
function ChangeReport({ changes }: { changes: readonly ChartChange[] }) {
  if (changes.length === 0) return null;
  const shown = changes.slice(0, MAX_DESCRIBED_CHANGES);
  const remaining = changes.length - shown.length;

  return (
    <View style={styles.changes}>
      <Text style={styles.changesHeadline}>{summarizeChanges(changes)}</Text>
      {shown.map((change) => (
        <Text key={cellKey(change.rowKey, change.upcard)} style={styles.changeLine}>
          {describeChange(change)}
        </Text>
      ))}
      {remaining > 0 ? (
        <Text style={styles.changeMore}>
          …and {remaining} more, outlined in the table below.
        </Text>
      ) : null}
    </View>
  );
}

/** What each colour and code means. Shared with the Explanation panel. */
export function ChartLegend() {
  return (
    <View style={styles.legend}>
      {LEGEND_ORDER.map((code) => {
        const palette = FAMILY_STYLE[CODE_FAMILY[code]];
        return (
          <View key={code} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: palette.bg }]}>
              <Text style={[styles.legendCode, { color: palette.fg }]}>
                {CHART_CODE_TEXT[code]}
              </Text>
            </View>
            <Text style={styles.legendLabel}>{CHART_CODE_LABEL[code]}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  changes: {
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.info,
    backgroundColor: colors.background,
  },
  changesHeadline: { ...type.caption, color: colors.info, fontWeight: "700" },
  changeLine: { ...type.caption, color: colors.text, fontSize: 12, lineHeight: 18 },
  changeMore: { ...type.caption, color: colors.textMuted, fontSize: 12 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  sectionCaption: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  table: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  labelColumn: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  headerRow: { flexDirection: "row", backgroundColor: colors.surfaceRaised },
  bodyRow: { flexDirection: "row" },
  cell: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cornerCell: { backgroundColor: colors.surfaceRaised },
  cornerText: { ...type.caption, color: colors.textMuted, fontSize: 11 },
  labelText: { ...type.mono, ...type.caption, color: colors.text, fontWeight: "700" },
  headerText: { ...type.mono, ...type.caption, color: colors.text, fontWeight: "700" },
  cellText: { ...type.mono, fontSize: 12, fontWeight: "700" },
  movedCell: { borderWidth: 2, borderColor: colors.text },
  litLabel: { backgroundColor: colors.accentMuted },
  litLabelText: { color: colors.accent },
  dimmedCell: { opacity: 0.35 },
  targetCell: { borderWidth: 3, borderColor: colors.text },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendSwatch: {
    width: 26,
    height: 22,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  legendCode: { ...type.mono, fontSize: 11, fontWeight: "700" },
  legendLabel: { ...type.caption, color: colors.textMuted, fontSize: 12 },
  footnote: { ...type.caption, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
