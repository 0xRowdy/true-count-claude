import { StyleSheet, Text, View } from "react-native";
import { colors, radius, ui } from "./tokens";

/** A gold pill with dark ink ("7-day free trial", "Best for trip prep"): the design's Badge on primary. */
export function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={[ui(12, 600), { color: colors.primaryForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignSelf: "flex-start",
  },
});
