/**
 * The governing chart cell, in the chart it came from.
 *
 * Invariant 4 says the user can see the chart cell behind any verdict. A bare "Rh" does not
 * meet that: a cell means something only against its neighbours — 16 surrenders against a 10
 * but hits against a 7, and 17 stands against both. So the section is drawn with the
 * governing row and column lit and every other cell dimmed, a few rows either side by default
 * and the whole section on request.
 *
 * The chart is `strategyChart(explanation.rules)` drawn by the same `StrategyChartGrid` the Rule
 * Set screen uses. It is the engine's own chart, not a copy, and the tests in
 * `explanationFormat.test.ts` assert the governing code is the code printed in that cell.
 */

import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { strategyChart } from "@/engine/strategy";
import type { DecisionExplanation } from "@/drills/explanation";
import { SecondaryButton } from "@/ui/primitives";
import { sectionRows } from "@/ui/rules/chartChanges";
import { ChartLegend, StrategyChartGrid } from "@/ui/rules/StrategyChartPanel";
import { colors, spacing, type } from "@/ui/theme";
import { cellView, chartWindow, unprintedRowNote } from "./explanationFormat";

/** Rows either side of the governing one in the default, compact view. */
const WINDOW_RADIUS = 2;

export function GoverningCellChart({ explanation }: { explanation: DecisionExplanation }) {
  const [full, setFull] = useState(false);
  const view = cellView(explanation);
  const rows = useMemo(
    () => sectionRows(strategyChart(explanation.rules), view.section),
    [explanation.rules, view.section],
  );
  const window = chartWindow(
    rows.map((row) => row.label),
    view.rowLabel,
    WINDOW_RADIUS,
  );
  const shown = full ? rows : rows.slice(window.start, window.end);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sentence}>{view.sentence}</Text>
      {view.fallbackNote ? <Text style={styles.note}>{view.fallbackNote}</Text> : null}

      <StrategyChartGrid
        rows={shown}
        section={view.section}
        highlight={{ rowLabel: view.rowLabel, upcard: view.upcard }}
        density="compact"
      />
      {!window.found ? <Text style={styles.note}>{unprintedRowNote(view.rowLabel)}</Text> : null}

      <View style={styles.footer}>
        <Text style={styles.caption}>
          {view.sectionTitle} · your hand down the side, dealer upcard across the top
        </Text>
        <SecondaryButton
          label={full ? "Show nearby rows" : `Show all ${view.sectionTitle.toLowerCase()}`}
          onPress={() => setFull((current) => !current)}
        />
      </View>
      {full ? <ChartLegend /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  sentence: { ...type.body, color: colors.text },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  caption: { ...type.caption, fontSize: 12, color: colors.textMuted, flexShrink: 1 },
});
