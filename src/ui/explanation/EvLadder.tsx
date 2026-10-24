/**
 * Every legal action's EV, best first, with the gap to the best drawn as a bar.
 *
 * The bar is the point. A 0.003 near-tie and a 0.4 blunder are both "wrong", and the category's
 * trainers say exactly that and nothing more. Here the near-tie is a sliver and the blunder
 * fills most of the track, on a fixed scale that is the same on every hand, so a user learns
 * what size of mistake they are making before they have read a single number.
 *
 * Each row is two lines rather than one wide one, so it fits a 360pt phone without scrolling.
 */

import { StyleSheet, Text, View } from "react-native";
import { colors, radius, ui, surfaces } from "@/ui/ds";
import { type EvRowView, ROW_TIER_LABEL, TIER_TONE, type TierTone } from "./explanationFormat";

export const TONE_COLOR: Readonly<Record<TierTone, string>> = {
  good: colors.correct,
  info: surfaces.infoInk,
  warn: colors.primary,
  bad: colors.mistake,
};

export function EvLadder({ rows }: { rows: readonly EvRowView[] }) {
  return (
    <View style={styles.ladder} accessibilityRole="list">
      {rows.map((row) => (
        <EvRow key={row.action} row={row} />
      ))}
    </View>
  );
}

function EvRow({ row }: { row: EvRowView }) {
  const tone = TONE_COLOR[TIER_TONE[row.tier]];
  const marks = [
    row.chosen ? "YOU" : null,
    row.chart ? "CHART" : null,
    row.countPlay ? "COUNT" : null,
  ].filter((mark): mark is string => mark !== null);

  return (
    <View
      accessible
      accessibilityLabel={`${row.label}: expected value ${row.evText} bets, ${
        row.best ? "the best play" : `${row.lossText} behind the best, ${ROW_TIER_LABEL[row.tier]}`
      }${marks.length ? `. ${marks.join(", ").toLowerCase()}` : ""}`}
      style={[styles.row, row.chosen && styles.chosenRow]}
    >
      <View style={styles.topLine}>
        <View style={styles.name}>
          <Text style={[styles.label, row.best && { color: colors.correct }]}>{row.label}</Text>
          {marks.map((mark) => (
            <View key={mark} style={[styles.mark, mark === "YOU" && styles.youMark]}>
              <Text style={[styles.markText, mark === "YOU" && styles.youMarkText]}>{mark}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.ev}>{row.evText}</Text>
      </View>
      <View style={styles.bottomLine}>
        <View style={styles.track}>
          {row.bar > 0 ? (
            <View
              style={[
                styles.fill,
                { width: `${Math.max(row.bar * 100, 1.5)}%`, backgroundColor: tone },
              ]}
            />
          ) : null}
        </View>
        <Text style={[styles.gap, { color: tone }]} numberOfLines={1}>
          {row.best ? ROW_TIER_LABEL.best : `${row.lossText} · ${ROW_TIER_LABEL[row.tier]}`}
        </Text>
      </View>
    </View>
  );
}

const NUM = { fontVariant: ["tabular-nums" as const] };

const styles = StyleSheet.create({
  ladder: { gap: 6 },
  row: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chosenRow: { borderColor: colors.border, backgroundColor: colors.muted },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    flexShrink: 1,
  },
  label: { ...ui(15, 600), color: colors.foreground },
  mark: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
  },
  markText: { ...ui(11, 700, { letterSpacing: 0.8 }), color: colors.mutedForeground },
  youMark: { backgroundColor: colors.paper },
  youMarkText: { color: colors.ink },
  ev: { ...ui(15, 600), ...NUM, color: colors.foreground },
  // The track spans the full row on every row, so the same gap draws the same length on every
  // line: a label beside the track would steal a different width from each one.
  bottomLine: { gap: 4 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  fill: { height: 6, borderRadius: 3 },
  gap: { ...ui(12, 500), ...NUM, textAlign: "right" },
});
