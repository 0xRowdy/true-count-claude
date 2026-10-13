import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, ui } from "./tokens";

/**
 * The card surface the screens group content on (Progress "Session stats", "Achievements"…):
 * `--card`, 1pt border, 16 radius, 24 padding, an optional title row with a muted aside.
 */
export function Panel({
  title,
  aside,
  children,
  padding = 24,
  gap = 16,
  style,
}: {
  title?: string;
  /** Right-aligned muted text in the title row ("This month"). */
  aside?: ReactNode;
  children?: ReactNode;
  padding?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.panel, { padding, gap }, style]}>
      {title || aside ? (
        <View style={styles.head}>
          {title ? (
            <Text accessibilityRole="header" style={[ui(17, 600), { color: colors.foreground }]}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {typeof aside === "string" ? (
            <Text style={[ui(13), { color: colors.mutedForeground }]}>{aside}</Text>
          ) : (
            aside
          )}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
});
