import { StyleSheet, Text, View } from "react-native";
import { colors, surfaces, ui } from "./tokens";

export const TABLE_PHASES = ["Bet", "Deal", "Result", "Payout"] as const;

/**
 * The design's Phase Stepper (bXiVQ): numbered steps with a bar each. The current step
 * (0-based) is solid gold with a bold label; finished steps keep a dimmed gold bar and a muted
 * label (frames N6Lcl, WSAfm, w7wLdL); steps still to come are on the border colour.
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
              style={[
                styles.bar,
                {
                  backgroundColor: on ? colors.primary : done ? surfaces.primaryDim : colors.border,
                },
              ]}
            />
            <Text
              style={[
                ui(11, on ? 700 : 500, { letterSpacing: 0.3 }),
                { color: on ? colors.foreground : colors.mutedForeground },
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
