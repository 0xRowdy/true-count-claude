import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Circle, type LucideIcon } from "./icons";
import { colors, radius, ui } from "./tokens";

export type BadgeTone = "muted" | "primary" | "correct" | "mistake";

const TONE: Record<BadgeTone, string> = {
  muted: colors.mutedForeground,
  primary: colors.primary,
  correct: colors.correct,
  mistake: colors.mistake,
};

/** The design's Badge (VMvcV): a muted pill with a 12pt icon and a 12pt medium label. */
export function Badge({
  label,
  icon: Icon = Circle,
  tone = "muted",
  showIcon = true,
  labelColor,
  style,
}: {
  label: string;
  icon?: LucideIcon;
  tone?: BadgeTone;
  showIcon?: boolean;
  /** Label colour when it differs from the tone (the design's foreground label beside a toned icon). */
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = TONE[tone];
  return (
    <View style={[styles.badge, style]}>
      {showIcon ? <Icon size={12} color={fg} strokeWidth={2} /> : null}
      <Text style={[ui(12, 500), { color: labelColor ?? fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
});
