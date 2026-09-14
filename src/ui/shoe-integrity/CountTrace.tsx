/**
 * The Running Count's path through the Shoe, drawn against the line it must come home to.
 *
 * This is the zero-sum check made watchable. The user runs the Shoe out and sees the line
 * wander, cross the cut card, and land exactly on the home line — for a balanced Counting
 * System, zero.
 *
 * Plotted with plain Views and percentage offsets: no SVG dependency, no canvas, and it
 * scales identically from a 360pt phone to a 1920px desktop because every coordinate is a
 * percentage of the frame rather than a pixel.
 */

import { StyleSheet, Text, View } from "react-native";
import type { TracePoint, TraceRange } from "./integrity";
import { formatSigned } from "./integrity";
import { colors, radius, spacing, type } from "@/ui/theme";

const FRAME_HEIGHT = 132;
const DOT = 3;
const END_DOT = 9;

/** RN's DimensionValue accepts `${number}%`, which a template literal widens to `string`. */
const pct = (value: number): `${number}%` => `${value}%` as `${number}%`;

/** Clamped so a point never escapes the frame, whatever the range calculation does. */
function verticalPercent(count: number, range: TraceRange): number {
  const offset = range.span > 0 ? (count - range.home) / range.span : 0;
  return Math.min(100, Math.max(0, 50 - offset * 50));
}

export function CountTrace({
  points,
  range,
  totalCards,
  cutIndex,
  homeLabel,
  landed,
}: {
  points: readonly TracePoint[];
  range: TraceRange;
  /** Every card in the Shoe, dealt or not — the trace's full horizontal extent. */
  totalCards: number;
  cutIndex: number;
  /** What the home line means, e.g. "finishes on 0". */
  homeLabel: string;
  /** True once the Shoe is finished, which is when the final dot is the proof. */
  landed: boolean;
}) {
  const last = points[points.length - 1];
  const width = Math.max(1, totalCards);
  const endTone = landed
    ? last && last.count === range.home
      ? colors.accent
      : colors.danger
    : colors.info;

  return (
    <View style={styles.wrapper}>
      <View style={styles.frame} accessibilityRole="image" accessibilityLabel={homeLabel}>
        <Text style={[styles.axisLabel, styles.axisTop]}>
          {formatSigned(range.home + range.span)}
        </Text>
        <Text style={[styles.axisLabel, styles.axisBottom]}>
          {formatSigned(range.home - range.span)}
        </Text>

        <View style={styles.homeLine} />
        <Text style={styles.homeLabel}>{formatSigned(range.home)}</Text>

        {/*
         * The plot is inset by half a marker so the first and last points sit whole inside
         * the frame. The final dot is the pixel this entire screen is arguing about; it
         * must not be half-clipped by the border it lands on.
         */}
        <View style={styles.plot}>
          {cutIndex > 0 && cutIndex < totalCards ? (
            <View style={[styles.cutMarker, { left: pct((cutIndex / width) * 100) }]} />
          ) : null}

          {points.map((point) => (
            <View
              key={point.index}
              style={[
                styles.dot,
                {
                  left: pct((point.index / width) * 100),
                  top: pct(verticalPercent(point.count, range)),
                },
              ]}
            />
          ))}

          {last ? (
            <View
              style={[
                styles.endDot,
                {
                  left: pct((last.index / width) * 100),
                  top: pct(verticalPercent(last.count, range)),
                  borderColor: endTone,
                },
              ]}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>card 0</Text>
        <Text style={styles.footerLabel}>
          {cutIndex > 0 && cutIndex < totalCards ? `cut card at ${cutIndex}` : ""}
        </Text>
        <Text style={styles.footerLabel}>{`card ${totalCards}`}</Text>
      </View>
      <Text style={styles.caption}>{homeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  frame: {
    height: FRAME_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: "hidden",
    position: "relative",
  },
  plot: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: END_DOT / 2,
    right: END_DOT / 2,
  },
  homeLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 1,
    backgroundColor: colors.accent,
    opacity: 0.55,
  },
  homeLabel: {
    ...type.mono,
    fontSize: 11,
    color: colors.accent,
    position: "absolute",
    left: spacing.xs,
    top: "50%",
    marginTop: -14,
  },
  cutMarker: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.warning,
    opacity: 0.5,
  },
  dot: {
    position: "absolute",
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    marginLeft: -DOT / 2,
    marginTop: -DOT / 2,
    backgroundColor: colors.info,
  },
  endDot: {
    position: "absolute",
    width: END_DOT,
    height: END_DOT,
    borderRadius: END_DOT / 2,
    marginLeft: -END_DOT / 2,
    marginTop: -END_DOT / 2,
    borderWidth: 2,
    backgroundColor: colors.background,
  },
  axisLabel: { ...type.mono, fontSize: 11, color: colors.textMuted, position: "absolute", right: spacing.xs },
  axisTop: { top: 2 },
  axisBottom: { bottom: 2 },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  footerLabel: { ...type.mono, fontSize: 11, color: colors.textMuted },
  caption: { ...type.caption, color: colors.textMuted },
});
