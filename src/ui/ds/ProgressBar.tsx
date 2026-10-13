import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { clampProgress } from "./format";
import { colors, surfaces } from "./tokens";

/** A thin progress bar (Progress requirements, achievements): 6pt track, rounded fill. */
export function ProgressBar({
  value,
  color = colors.primary,
  track = surfaces.track,
  height = 6,
  accessibilityLabel,
  style,
}: {
  /** 0–1. */
  value: number;
  color?: string;
  track?: string;
  height?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const v = clampProgress(value);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: track }, style]}
    >
      <View
        style={{ width: `${v * 100}%`, height, borderRadius: height / 2, backgroundColor: color }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: "100%", overflow: "hidden" },
});
