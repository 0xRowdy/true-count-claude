import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, ui } from "@/ui/ds";
import { Info, X } from "./icons";

/**
 * An in-place notice for an action this build cannot perform (sign-in, purchases). It says so
 * plainly instead of opening a form that goes nowhere. Announced politely, dismissible.
 */
export function Notice({
  title,
  body,
  onClose,
  style,
}: {
  title: string;
  body?: string;
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View role="status" aria-live="polite" accessibilityLabel={title} style={[styles.box, style]}>
      <Info size={18} color={colors.primary} strokeWidth={2} />
      <View style={styles.text}>
        <Text style={[ui(14, 600, { lineHeight: 20 }), { color: colors.foreground }]}>{title}</Text>
        {body ? (
          <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.mutedForeground }]}>
            {body}
          </Text>
        ) : null}
      </View>
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
        >
          <X size={16} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.popover,
  },
  text: { flex: 1, gap: 2 },
  close: { padding: 2 },
});
