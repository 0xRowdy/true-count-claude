import { useId, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors, ui } from "@/ui/ds";
import { builder } from "./palette";

/** The mini felt of the builders: a radial felt gradient inside the rail-coloured frame. */
export function Felt({
  children,
  style,
  centerY = 0.3,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  centerY?: number;
}) {
  const id = `f${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View style={[styles.felt, style]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id={id} cx="50%" cy={`${centerY * 100}%`} rx="75%" ry="80%">
            <Stop offset={0} stopColor={builder.feltFrom} />
            <Stop offset={1} stopColor={builder.feltTo} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

/** A 30pt chip with its amount, coloured like the practice chips. */
export function FeltChip({ amount, style }: { amount: number; style?: StyleProp<ViewStyle> }) {
  const bg =
    amount <= 10
      ? colors.chip1
      : amount < 25
        ? colors.chip5
        : amount < 100
          ? colors.chip25
          : amount < 500
            ? colors.chip100
            : colors.chip500;
  const ink = amount <= 10 ? colors.ink : colors.paper;
  const label = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]} pointerEvents="none">
      <Text style={[ui(label.length > 3 ? 8 : 10, 800), { color: ink }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  felt: {
    borderRadius: 16,
    borderWidth: 6,
    borderColor: colors.rail,
    overflow: "hidden",
  },
  chip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: builder.chipEdge,
    boxShadow: builder.chipShadow,
    alignItems: "center",
    justifyContent: "center",
  },
});
