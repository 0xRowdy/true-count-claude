import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "./icons";
import { slopTo } from "./tap";
import { colors, radius, surfaces, textScale, ui } from "./tokens";

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
  /**
   * Only for actions that are genuinely unavailable (e.g. Deal with no bet placed).
   * CONTEXT.md invariant 7: a *legal* player action is never disabled — if an action is not
   * legal, do not render it; if it is legal, it stays pressable.
   */
  disabled?: boolean;
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
  disabled = false,
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
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      aria-disabled={disabled}
      testID={testID}
      hitSlop={slopTo(s.height)}
      style={({ pressed }) => [
        styles.base,
        {
          // A minimum, not a height: at large text sizes the label grows and the button with it.
          minHeight: s.height,
          paddingHorizontal: s.px,
          backgroundColor: v.bg,
          borderColor: v.border ?? surfaces.transparent,
        },
        fullWidth && styles.full,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {Icon ? <Icon size={s.icon} color={v.fg} strokeWidth={2} /> : null}
      <Text
        style={[ui(s.font, 600), styles.label, { color: v.fg }]}
        numberOfLines={1}
        maxFontSizeMultiplier={textScale.control}
      >
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
    paddingVertical: 6,
  },
  label: { flexShrink: 1 },
  full: { alignSelf: "stretch" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
