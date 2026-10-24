import { Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TAP } from "./tap";
import { colors, textScale, ui } from "./tokens";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Equal-width segments on a muted track; the chosen one is paper with ink text. The design's
 * Onboarding "How often the coach speaks up" control (oe14b). Behaves as a radio group.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange?: (value: T) => void;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            aria-checked={on}
            onPress={() => onChange?.(o.value)}
            // 40pt segments on a 4pt-padded track: the slop brings each to the platform minimum.
            hitSlop={(MIN_TAP - 40) / 2}
            style={[styles.segment, on && styles.on]}
          >
            <Text
              style={[ui(13, on ? 600 : 500), { color: on ? colors.ink : colors.mutedForeground }]}
              numberOfLines={1}
              maxFontSizeMultiplier={textScale.control}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 12,
    backgroundColor: colors.muted,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  on: { backgroundColor: colors.paper },
});
