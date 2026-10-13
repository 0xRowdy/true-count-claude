import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, ui } from "./tokens";

export type ListRowTone = "default" | "correct" | "mistake" | "primary";

const TONE: Record<ListRowTone, string> = {
  default: colors.foreground,
  correct: colors.correct,
  mistake: colors.mistake,
  primary: colors.primary,
};

/** A label / value row with a hairline under it (the design's Progress "Session stats" rows). */
export function ListRow({
  label,
  value,
  tone = "default",
  divider = true,
  leading,
}: {
  label: string;
  value: ReactNode;
  tone?: ListRowTone;
  divider?: boolean;
  leading?: ReactNode;
}) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      {leading}
      <Text style={[ui(14), styles.label]}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={[ui(14, 600), { color: TONE[tone] }]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { flex: 1, color: colors.mutedForeground },
});
