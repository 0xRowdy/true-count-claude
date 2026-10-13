import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "./icons";
import { colors, MIN_TAP, radius, surfaces, ui } from "./tokens";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "table";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.primaryForeground },
  secondary: { bg: colors.secondary, fg: colors.foreground, border: colors.border },
  ghost: { bg: surfaces.transparent, fg: colors.foreground },
  table: { bg: surfaces.tableButton, fg: colors.feltText, border: colors.feltLine },
};

// md is the design's Button (44 tall, 12/20 padding, 15 semibold, 18 icon); lg is the
// onboarding Back/Continue size (52 tall, 28 sides).
const SIZE: Record<ButtonSize, { height: number; px: number; font: number; icon: number }> = {
  sm: { height: 36, px: 14, font: 14, icon: 16 },
  md: { height: 44, px: 20, font: 15, icon: 18 },
  lg: { height: 52, px: 28, font: 16, icon: 20 },
};

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Trailing content (e.g. a count). */
  trailing?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The design's Button/Primary · Secondary · Ghost · Table (node ids CF3yA, uAI8V, Q3LPsQ, K8XQN). */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon: Icon,
  trailing,
  accessibilityLabel,
  accessibilityHint,
  fullWidth,
  style,
  testID,
}: ButtonProps) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
      hitSlop={s.height < MIN_TAP ? (MIN_TAP - s.height) / 2 : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.px,
          backgroundColor: v.bg,
          borderColor: v.border ?? surfaces.transparent,
        },
        fullWidth && styles.full,
        pressed && styles.pressed,
        style,
      ]}
    >
      {Icon ? <Icon size={s.icon} color={v.fg} strokeWidth={2} /> : null}
      <Text style={[ui(s.font, 600), { color: v.fg }]} numberOfLines={1}>
        {label}
      </Text>
      {trailing ? <View>{trailing}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  full: { alignSelf: "stretch" },
  pressed: { opacity: 0.85 },
});
