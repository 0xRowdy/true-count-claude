import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { SegmentOption } from "./SegmentedControl";
import { MIN_TAP } from "./tap";
import { colors, textScale, ui } from "./tokens";

/**
 * Content-width tabs in a bordered card, the chosen one on muted (the design's Progress game
 * tabs, Jtp35). Scrolls sideways on narrow screens rather than wrapping.
 */
export function Tabs<T extends string>({
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller}>
      <View
        style={styles.track}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityLabel={o.label}
              aria-selected={on}
              onPress={() => onChange?.(o.value)}
              // 36pt tabs inside a 4pt-padded track; the slop brings each to the platform minimum.
              hitSlop={(MIN_TAP - 36) / 2}
              style={[styles.tab, on && styles.on]}
            >
              <Text
                style={[
                  ui(14, on ? 600 : 500),
                  { color: on ? colors.foreground : colors.mutedForeground },
                ]}
                maxFontSizeMultiplier={textScale.control}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0 },
  track: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 4,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tab: {
    minHeight: 36,
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  on: { backgroundColor: colors.muted },
});
