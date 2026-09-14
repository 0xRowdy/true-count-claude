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
import { colors, radius, spacing, type } from "@/ui/theme";
import { type EvRowView, TIER_LABEL, TIER_TONE, type TierTone } from "./explanationFormat";

export const TONE_COLOR: Readonly<Record<TierTone, string>> = {
  good: colors.accent,
  info: colors.info,
  warn: colors.warning,
  bad: colors.danger,
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
        row.best ? "the best play" : `${row.lossText} behind the best, ${TIER_LABEL[row.tier]}`
      }${marks.length ? `. ${marks.join(", ").toLowerCase()}` : ""}`}
      style={[styles.row, row.chosen && styles.chosenRow]}
    >
      <View style={styles.topLine}>
        <View style={styles.name}>
          <Text style={[styles.label, row.best && { color: colors.accent }]}>{row.label}</Text>
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
              style={[styles.fill, { width: `${Math.max(row.bar * 100, 1.5)}%`, backgroundColor: tone }]}
            />
          ) : null}
        </View>
        <Text style={[styles.gap, { color: tone }]} numberOfLines={1}>
          {row.best ? TIER_LABEL.best : `${row.lossText} · ${TIER_LABEL[row.tier]}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ladder: { gap: spacing.xs },
  row: {
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chosenRow: { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  name: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap", flexShrink: 1 },
  label: { ...type.body, color: colors.text, fontWeight: "600" },
  mark: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markText: { ...type.mono, fontSize: 10, color: colors.textMuted, fontWeight: "700" },
  youMark: { borderColor: colors.text },
  youMarkText: { color: colors.text },
  ev: { ...type.mono, ...type.body, color: colors.text },
  bottomLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  fill: { height: 8, borderRadius: 4 },
  gap: { ...type.mono, fontSize: 12, minWidth: 128, textAlign: "right" },
});
