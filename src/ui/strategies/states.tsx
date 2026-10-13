import { Link } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, display, ui } from "@/ui/ds";

/** Shown until the route's query and the stored drafts are read (both after mount). */
export function BuilderLoading() {
  return (
    <View style={styles.box} accessibilityLabel="Loading strategy">
      <ActivityIndicator color={colors.primary} />
      <Text style={[ui(14), { color: colors.mutedForeground }]}>Loading strategy…</Text>
    </View>
  );
}

export function BuilderMissing() {
  return (
    <View style={styles.box}>
      <Text accessibilityRole="header" style={[display(24, 500), { color: colors.foreground }]}>
        Strategy not found
      </Text>
      <Text style={[ui(14), { color: colors.mutedForeground }]}>
        It may have been deleted on this device. Drafts are stored locally only.
      </Text>
      <Link href="/strategies" style={[ui(14, 600), { color: colors.primary }]}>
        Back to strategies
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 96 },
});
