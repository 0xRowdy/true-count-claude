import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "./icons";
import { colors, radius, surfaces, ui } from "./tokens";

/**
 * A large radio option: icon box, title, description, radio dot. The design's Onboarding goal
 * cards (cviGu / EAt7z). Selected: gold border, gold wash, gold icon box, filled radio.
 */
export function SelectableCard({
  title,
  description,
  icon: Icon,
  selected,
  onPress,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  selected: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityHint={description}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.on, pressed && { opacity: 0.92 }]}
    >
      {Icon ? (
        <View style={[styles.iconBox, selected && { backgroundColor: colors.primary }]}>
          <Icon
            size={22}
            color={selected ? colors.primaryForeground : colors.foreground}
            strokeWidth={2}
          />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={[ui(19, 600), { color: colors.foreground }]}>{title}</Text>
        {description ? (
          <Text style={[ui(15, 400, { lineHeight: 22 }), { color: colors.mutedForeground }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  // 2pt border on selection; padding drops by 1 so the content does not shift.
  on: {
    borderWidth: 2,
    padding: 19,
    borderColor: colors.primary,
    backgroundColor: surfaces.primaryWash,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 4 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.mutedForeground,
  },
  radioOn: { borderWidth: 0, backgroundColor: colors.primary },
});
