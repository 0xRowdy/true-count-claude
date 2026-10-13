import { StyleSheet, Text, View } from "react-native";
import { colors, display, ui } from "./tokens";

/** The Tableside mark and wordmark (the design's Logo frame, used on the marketing pages). */
export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <View style={styles.logo}>
      <View style={styles.mark}>
        <Text style={[ui(17), { color: colors.primaryForeground }]}>{"♠︎"}</Text>
      </View>
      {wordmark ? (
        <Text style={[display(22, 600), { color: colors.foreground }]}>Tableside</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
