/**
 * The index and the true count on one number line, with the departure's side shaded.
 *
 * "Stand at +0 or higher; the count is +2" is a sentence. The same fact drawn is a dot two
 * steps inside a shaded zone, and the negative half of the Illustrious 18 — which fires
 * *below* its index and which users most often get backwards — is a zone shaded to the left.
 */

import { StyleSheet, Text, View } from "react-native";
import { signed } from "@/engine/deviations";
import { colors, spacing, type } from "@/ui/theme";
import { formatSignedCount, indexScaleGeometry, type IndexView } from "./explanationFormat";

export function IndexScale({
  scale,
  departure,
}: {
  scale: NonNullable<IndexView["scale"]>;
  /** What the shaded zone means, e.g. "stand". */
  departure: string;
}) {
  const geometry = indexScaleGeometry(scale);
  const pct = (at: number) => `${at * 100}%` as const;

  return (
    <View
      accessible
      accessibilityLabel={`Index ${signed(scale.index)}, true count ${formatSignedCount(
        scale.trueCount,
      )}. ${departure} ${scale.direction === "at-or-above" ? "at or above" : "below"} the index.`}
      style={styles.wrap}
    >
      <View style={styles.labels}>
        <Text
          style={[styles.indexLabel, { left: pct(geometry.indexAt) }]}
          numberOfLines={1}
        >
          index {signed(scale.index)}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.zone,
            { left: pct(geometry.zoneFrom), width: pct(geometry.zoneTo - geometry.zoneFrom) },
          ]}
        />
        <View style={[styles.indexTick, { left: pct(geometry.indexAt) }]} />
        <View style={[styles.countDot, { left: pct(geometry.countAt) }]} />
      </View>
      <View style={styles.labels}>
        <Text style={[styles.countLabel, { left: pct(geometry.countAt) }]} numberOfLines={1}>
          count {formatSignedCount(scale.trueCount)}
        </Text>
      </View>
      <View style={styles.ticks}>
        {geometry.ticks.map((tick) => (
          <Text
            key={tick}
            style={[styles.tick, { left: pct((tick - geometry.low) / (geometry.high - geometry.low)) }]}
          >
            {tick}
          </Text>
        ))}
      </View>
      <Text style={styles.legend}>
        Shaded: where the count says {departure}.
      </Text>
    </View>
  );
}

const LABEL_WIDTH = 72;

const styles = StyleSheet.create({
  wrap: { gap: 2, paddingHorizontal: LABEL_WIDTH / 2 - 4, paddingVertical: spacing.xs },
  labels: { height: 16 },
  indexLabel: {
    ...type.mono,
    position: "absolute",
    width: LABEL_WIDTH,
    marginLeft: -LABEL_WIDTH / 2,
    textAlign: "center",
    fontSize: 11,
    color: colors.warning,
  },
  countLabel: {
    ...type.mono,
    position: "absolute",
    width: LABEL_WIDTH,
    marginLeft: -LABEL_WIDTH / 2,
    textAlign: "center",
    fontSize: 11,
    color: colors.text,
    fontWeight: "700",
  },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(251, 191, 36, 0.22)",
  },
  indexTick: {
    position: "absolute",
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.warning,
  },
  countDot: {
    position: "absolute",
    top: 1,
    width: 10,
    height: 10,
    marginLeft: -5,
    borderRadius: 5,
    backgroundColor: colors.text,
  },
  ticks: { height: 14 },
  tick: {
    ...type.mono,
    position: "absolute",
    width: 24,
    marginLeft: -12,
    textAlign: "center",
    fontSize: 10,
    color: colors.textMuted,
  },
  legend: { ...type.caption, fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
