import { StyleSheet, Text, View } from "react-native";
import { colors, ui } from "./tokens";

export const TABLE_PHASES = ["Bet", "Deal", "Result", "Payout"] as const;

/**
 * The design's Phase Stepper (bXiVQ): numbered steps with a bar each. Steps up to and
 * including `current` (0-based) are filled gold; the current label is bold.
 */
export function PhaseStepper({
  current,
  steps = TABLE_PHASES,
}: {
  current: number;
  steps?: ReadonlyArray<string>;
}) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current] ?? ""}`}
      accessibilityValue={{ min: 1, max: steps.length, now: current + 1 }}
    >
      {steps.map((label, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <View key={label} style={styles.step}>
            <View
              style={[styles.bar, { backgroundColor: done || on ? colors.primary : colors.border }]}
            />
            <Text
              style={[
                ui(11, on ? 700 : 500, { letterSpacing: 0.3 }),
                { color: on || done ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {`${i + 1}  ${label}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
  },
  step: { flex: 1, gap: 5 },
  bar: { height: 3, borderRadius: 2 },
});
