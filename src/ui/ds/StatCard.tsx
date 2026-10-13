import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { TrendingUp, type LucideIcon } from "./icons";
import { colors, display, radius, ui } from "./tokens";

export type DeltaTone = "correct" | "mistake" | "primary" | "muted";

const TONE: Record<DeltaTone, string> = {
  correct: colors.correct,
  mistake: colors.mistake,
  primary: colors.primary,
  muted: colors.mutedForeground,
};

/** The design's Stat Card (X5JL1): label, a Fraunces figure, and an optional delta line. */
export function StatCard({
  label,
  value,
  delta,
  deltaIcon: DeltaIcon = TrendingUp,
  deltaTone = "correct",
  width = 220,
  style,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaIcon?: LucideIcon;
  deltaTone?: DeltaTone;
  /** The design's 220, or "auto" to fill a grid cell. */
  width?: number | "auto";
  style?: StyleProp<ViewStyle>;
}) {
  const fg = TONE[deltaTone];
  return (
    <View
      role="group"
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.card, width === "auto" ? styles.fill : { width }, style]}
    >
      <Text style={[ui(13, 500), { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[display(34, 500), { color: colors.foreground }]}>{value}</Text>
      {delta ? (
        <View style={styles.delta}>
          <DeltaIcon size={14} color={fg} strokeWidth={2} />
          <Text style={[ui(12, 500), { color: fg }]}>{delta}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 6,
  },
  fill: { flex: 1 },
  delta: { flexDirection: "row", alignItems: "center", gap: 4 },
});
