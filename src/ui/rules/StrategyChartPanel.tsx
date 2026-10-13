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
import { type LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RuleSet } from "@/engine/rules";
import {
  type ChartCode,
  type ChartSection,
  DEALER_UPCARDS,
  type DealerUpcard,
  type StrategyChart,
} from "@/engine/strategy";
import { Tabs, colors, radius, ui, Panel } from "@/ui/ds";
import { strategyColors, type StrategySwatch } from "@/ui/ds/strategyColors";
import { ToneBadge, text } from "@/ui/trainer/kit";
import {
  CHART_CODE_LABEL,
  CHART_CODE_TEXT,
  CHART_SECTIONS,
  type ChartChange,
  type ChartRowView,
  SECTION_TITLE,
  cellKey,
  describeChange,
  sectionRows,
  summarizeChanges,
  upcardLabel,
} from "./chartChanges";

/**
 * Cell geometry. `compact` is for a chart embedded in another surface, like an Explanation.
 * Columns grow to fill the panel up to `maxColumnWidth` (the Strategy Builder's cells fill
 * their row), and never shrink below `columnWidth` — narrower than that, the table scrolls.
 */
const DENSITY = {
  regular: { rowHeight: 33, columnWidth: 40, maxColumnWidth: 64, labelWidth: 58 },
  compact: { rowHeight: 30, columnWidth: 34, maxColumnWidth: 48, labelWidth: 48 },
} as const;

/** The cell gap: the design's chart rows and columns sit 3pt apart. */
const GAP = 3;

export type ChartDensity = keyof typeof DENSITY;

/**
 * Each code's swatch, from the Strategy Builder's legend (RYP9O): Hit on paper, Stand amber,
 * Double blue, Double-else-stand light blue, Surrender grey. Split, which that legend does not
 * show, is violet. The shape of the chart reads before a single letter does.
 */
const CODE_SWATCH: Readonly<Record<ChartCode, StrategySwatch>> = {
  H: "hit",
  S: "stand",
  D: "double",
  Ds: "doubleStand",
  P: "split",
  Rh: "surrender",
  Rs: "surrender",
  Rp: "surrender",
};

const swatch = (code: ChartCode) => strategyColors[CODE_SWATCH[code]];

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
        Generated from your rules, not looked up in a fixed table. Change anything above and the
        cells that move are outlined here.
      </Text>

      <ChangeReport changes={changes} />

      <Tabs
        options={SECTION_OPTIONS}
        value={section}
        onChange={setSection}
        accessibilityLabel="Chart section"
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionCaption}>
          {SECTION_TITLE[section]} · dealer upcard across the top
        </Text>
        {changedInSection > 0 ? (
          <ToneBadge label={`${changedInSection} moved here`} tone="warn" />
        ) : null}
      </View>

      <StrategyChartGrid rows={rows} section={section} changedKeys={changedKeys} />

      <ChartLegend />

      <Text style={styles.footnote}>
        Hard 21 and soft 21 are not printed — a 21 is never a decision. Split aces take one card
        each{rules.oneCardToSplitAces ? "" : " — except at your table, where you may draw"}.
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
  // Measured after mount, so the prerendered chart and the first client render agree.
  const columnWidth =
    viewport > 0
      ? Math.min(
          size.maxColumnWidth,
          Math.max(size.columnWidth, Math.floor(viewport / DEALER_UPCARDS.length)),
        )
      : size.columnWidth;

  useEffect(() => {
    if (highlightColumn < 0 || viewport <= 0) return;
    const content = DEALER_UPCARDS.length * columnWidth;
    if (content <= viewport) return;
    const centred = highlightColumn * columnWidth - (viewport - columnWidth) / 2;
    const x = Math.max(0, Math.min(centred, content - viewport));
    scroller.current?.scrollTo({ x, animated: false });
  }, [highlightColumn, viewport, columnWidth]);

  const cellSize = { height: size.rowHeight };
  const column = { width: columnWidth };

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
        style={styles.scroller}
      >
        <View>
          <View style={styles.headerRow}>
            {DEALER_UPCARDS.map((upcard) => {
              const lit = highlight?.upcard === upcard;
              return (
                <View key={upcard} style={[styles.cell, cellSize, column, lit && styles.litLabel]}>
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
                const palette = swatch(code);
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
                    style={[styles.cell, cellSize, column]}
                  >
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: palette.bg },
                        dimmed && styles.dimmedCell,
                        moved && styles.movedCell,
                        // Gold on the amber Stand swatch would vanish: outline it in ink there.
                        moved && CODE_SWATCH[code] === "stand" && styles.movedOnAmber,
                        target && styles.targetCell,
                      ]}
                    >
                      <Text style={[styles.cellText, { color: palette.fg }]}>
                        {CHART_CODE_TEXT[code]}
                      </Text>
                      {moved ? <View style={styles.movedDot} /> : null}
                    </View>
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
        <Text style={styles.changeMore}>…and {remaining} more, outlined in the table below.</Text>
      ) : null}
    </View>
  );
}

/** What each colour and code means. Shared with the Explanation panel. */
export function ChartLegend() {
  return (
    <View style={styles.legend}>
      {LEGEND_ORDER.map((code) => {
        const palette = swatch(code);
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
  intro: text.note,
  changes: {
    gap: 4,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.muted,
  },
  changesHeadline: { ...ui(14, 600), color: colors.primary },
  changeLine: { ...ui(13, 400, { lineHeight: 19 }), color: colors.foreground },
  changeMore: { ...ui(12), color: colors.mutedForeground },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sectionCaption: {
    ...ui(11, 700, { letterSpacing: 1.2, textTransform: "uppercase" }),
    color: colors.mutedForeground,
    flexShrink: 1,
  },
  table: { flexDirection: "row" },
  scroller: { flex: 1 },
  labelColumn: {},
  headerRow: { flexDirection: "row" },
  bodyRow: { flexDirection: "row" },
  cell: { justifyContent: "center", alignItems: "center", padding: GAP / 2 },
  swatch: {
    alignSelf: "stretch",
    flex: 1,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  cornerCell: { alignItems: "flex-start" },
  cornerText: { ...ui(10, 600), color: colors.mutedForeground },
  labelText: { ...ui(13, 600), color: colors.foreground, alignSelf: "flex-start", paddingLeft: 2 },
  headerText: { ...ui(13, 700), color: colors.foreground },
  cellText: { ...ui(12, 800) },
  movedCell: { borderColor: colors.primary },
  movedOnAmber: { borderColor: colors.ink },
  // Gold with an ink ring, so it reads on every swatch, amber included.
  movedDot: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  litLabel: { backgroundColor: colors.muted, borderRadius: 5 },
  litLabelText: { color: colors.primary },
  dimmedCell: { opacity: 0.3 },
  targetCell: { borderColor: colors.foreground, borderWidth: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: {
    width: 24,
    height: 20,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  legendCode: { ...ui(10, 800) },
  legendLabel: { ...ui(12), color: colors.mutedForeground },
  footnote: text.small,
});
