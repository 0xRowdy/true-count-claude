/**
 * The index and the true count on one number line, with the departure's side shaded.
 *
 * "Stand at +0 or higher; the count is +2" is a sentence. The same fact drawn is a dot two
 * steps inside a shaded zone, and the negative half of the Illustrious 18 — which fires
 * *below* its index and which users most often get backwards — is a zone shaded to the left.
 */

import { StyleSheet, Text, View } from "react-native";
import { signed } from "@/engine/deviations";
import { colors, surfaces, ui } from "@/ui/ds";
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
        <Text style={[styles.indexLabel, { left: pct(geometry.indexAt) }]} numberOfLines={1}>
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
            style={[
              styles.tick,
              { left: pct((tick - geometry.low) / (geometry.high - geometry.low)) },
            ]}
          >
            {tick}
          </Text>
        ))}
      </View>
      <Text style={styles.legend}>Shaded: where the count says {departure}.</Text>
    </View>
  );
}

const LABEL_WIDTH = 72;

const NUM = { fontVariant: ["tabular-nums" as const] };

const styles = StyleSheet.create({
  wrap: { gap: 2, paddingHorizontal: LABEL_WIDTH / 2 - 4, paddingVertical: 4 },
  labels: { height: 16 },
  indexLabel: {
    ...ui(11, 600),
    ...NUM,
    position: "absolute",
    width: LABEL_WIDTH,
    marginLeft: -LABEL_WIDTH / 2,
    textAlign: "center",
    color: colors.primary,
  },
  countLabel: {
    ...ui(11, 700),
    ...NUM,
    position: "absolute",
    width: LABEL_WIDTH,
    marginLeft: -LABEL_WIDTH / 2,
    textAlign: "center",
    color: colors.foreground,
  },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  zone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: surfaces.primaryWash,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.primary,
  },
  indexTick: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.primary,
  },
  countDot: {
    position: "absolute",
    top: 2,
    width: 10,
    height: 10,
    marginLeft: -5,
    borderRadius: 5,
    backgroundColor: colors.foreground,
  },
  ticks: { height: 14 },
  tick: {
    ...ui(10, 500),
    ...NUM,
    position: "absolute",
    width: 24,
    marginLeft: -12,
    textAlign: "center",
    color: colors.mutedForeground,
  },
  legend: { ...ui(11), color: colors.mutedForeground, marginTop: 2 },
});
