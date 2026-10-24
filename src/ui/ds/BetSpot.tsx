import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, surfaces, textScale, ui } from "./tokens";

/**
 * The design's Bet Spot (I8XUJG): an outlined area on the felt with a label and its payout.
 * Pressable when `onPress` is set (place a bet); `active` brightens the outline.
 */
export function BetSpot({
  label,
  pays,
  onPress,
  active = false,
  children,
  width = 96,
  height = 64,
  style,
}: {
  label: string;
  pays?: string;
  onPress?: () => void;
  active?: boolean;
  /** Chips placed on the spot. */
  children?: ReactNode;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <>
      <Text
        style={[ui(11, 700, { letterSpacing: 1 }), { color: colors.feltText }]}
        maxFontSizeMultiplier={textScale.felt}
      >
        {label}
      </Text>
      {pays ? (
        <Text
          style={[ui(11), { color: surfaces.feltTextMuted }]}
          maxFontSizeMultiplier={textScale.felt}
        >
          {pays}
        </Text>
      ) : null}
      {children}
    </>
  );
  const frame = [
    styles.spot,
    { width, height },
    active && { borderColor: colors.primary, borderWidth: 2 },
    style,
  ];
  if (!onPress) {
    return <View style={frame}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pays ? `${label}, ${pays}` : label}
      onPress={onPress}
      style={({ pressed }) => [frame, pressed && { opacity: 0.85 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spot: {
    backgroundColor: surfaces.betSpot,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
