import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { chipColors, chipLabel, chipSpotPaths, formatMoney, type ChipValue } from "./format";
import { colors, shadow, surfaces, ui } from "./tokens";

/**
 * The design's Chip (R2Oc4o): a 52pt practice chip with six edge spots, an inlay ring and the
 * denomination. Selectable chips (with `onPress` or `selected`) sit in a 56pt slot that shows the
 * gold ring of the Chip Rack when selected.
 */
export function Chip({
  value,
  size = 52,
  selected = false,
  onPress,
}: {
  value: ChipValue;
  size?: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { fill, ink } = chipColors(value);
  const k = size / 52;
  const inlay = 34 * k;
  const label = chipLabel(value);
  const face = (
    <View style={{ width: size, height: size, borderRadius: size / 2, boxShadow: shadow.chip }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={fill} />
        {chipSpotPaths(size).map((d) => (
          <Path key={d} d={d} fill={surfaces.chipEdgeSpot} />
        ))}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={inlay / 2}
          fill="none"
          stroke={surfaces.chipInlay}
          strokeWidth={1.5 * k}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[ui(Math.round(16 * k), 800), { color: ink }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );

  const slot = size + 4 * k;
  const ringed = (
    <View
      style={[
        styles.center,
        { width: slot, height: slot, borderRadius: slot / 2 },
        selected && { borderWidth: 2.5, borderColor: colors.primary },
      ]}
    >
      {face}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={`${formatMoney(value)} chip`}>
        {selected ? ringed : face}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${formatMoney(value)} chip`}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {ringed}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
