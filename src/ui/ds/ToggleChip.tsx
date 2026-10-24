import { Pressable, StyleSheet, Text } from "react-native";
import { Check } from "./icons";
import { MIN_TAP } from "./tap";
import { colors, radius, ui } from "./tokens";

/**
 * A pill that toggles on and off, with a check when on (the design's Onboarding game chips,
 * BHUju). On: foreground fill, background ink. Behaves as a checkbox.
 */
export function ToggleChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const fg = selected ? colors.background : colors.foreground;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.on, pressed && { opacity: 0.85 }]}
    >
      {selected ? <Check size={16} color={fg} strokeWidth={2.25} /> : null}
      <Text style={[ui(15, 500), { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TAP,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  on: { backgroundColor: colors.foreground, borderColor: colors.foreground },
});
