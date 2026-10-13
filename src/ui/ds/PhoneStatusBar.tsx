import { StyleSheet, Text, View } from "react-native";
import { BatteryFull, Signal, Wifi } from "./icons";
import { colors, ui } from "./tokens";

/**
 * The design's Status Bar (g3jlEe): a mock phone status bar for phone-frame previews only
 * (the design sheet, marketing mockups). Real screens never draw one — the OS does.
 * Hidden from assistive tech: it is decoration.
 */
export function PhoneStatusBar({ time = "9:41", width = 390 }: { time?: string; width?: number }) {
  return (
    <View
      style={[styles.bar, { width }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Text style={[ui(16, 600), { color: colors.foreground }]}>{time}</Text>
      <View style={styles.icons}>
        <Signal size={18} color={colors.foreground} strokeWidth={2} />
        <Wifi size={18} color={colors.foreground} strokeWidth={2} />
        <BatteryFull size={18} color={colors.foreground} strokeWidth={2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 54,
    maxWidth: "100%",
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.background,
  },
  icons: { flexDirection: "row", alignItems: "center", gap: 6 },
});
