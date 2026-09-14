/**
 * Shared UI vocabulary.
 *
 * Every screen builds from these so the app reads as one tool rather than four. See
 * `docs/adr/0005-explanation-first-over-visual-fidelity.md`: the interface is a precision
 * instrument, not a simulated casino floor.
 *
 * Two of these components encode product invariants rather than taste:
 *
 * - `ActionButton` has no `disabled` prop. Invariant 7 forbids disabling a legal action —
 *   render exactly what `legalActions` returns and nothing else. Greying out a legal split
 *   corrupts the user's own accuracy statistics, a complaint that appears three times in one
 *   competitor's reviews.
 * - Hit targets are at least 44pt and spaced. "Mis-tapped the wrong action" is a recurring
 *   review theme across the category.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, radius, spacing, type } from "./theme";

const MIN_HIT_TARGET = 44;

export type Tone = "neutral" | "good" | "bad" | "warn" | "info";

const toneColor: Record<Tone, string> = {
  neutral: colors.text,
  good: colors.accent,
  bad: colors.danger,
  warn: colors.warning,
  info: colors.info,
};

/** A titled container. The default surface for grouping related information. */
export function Panel({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.panel, style]}>
      {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** A label/value pair. The workhorse of the stats and integrity surfaces. */
export function StatRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: Tone;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: toneColor[tone] }]}>{value}</Text>
    </View>
  );
}

/**
 * A player action button.
 *
 * Deliberately has no `disabled` prop — see the note at the top of this file. If an action
 * is not legal, do not render it.
 */
export function ActionButton({
  label,
  onPress,
  tone = "neutral",
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  accessibilityHint?: string;
}) {
  const accent = toneColor[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: accent },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionLabel, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

/** A lower-emphasis button for navigation and secondary commands. */
export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

/** A row of mutually exclusive choices. Used for counting system, speed, and drill mode. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small status marker — verdicts, counts, and integrity checks. */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const accent = toneColor[tone];
  return (
    <View style={[styles.badge, { borderColor: accent }]}>
      <Text style={[styles.badgeLabel, { color: accent }]}>{label}</Text>
    </View>
  );
}

/** Constrains content to a readable column and centres it on wide screens. */
export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
    gap: spacing.md,
    width: "100%",
    maxWidth: 780,
    alignSelf: "center",
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelTitle: { ...type.heading, color: colors.text, marginBottom: spacing.xs },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLabel: { ...type.caption, color: colors.textMuted },
  statValue: { ...type.mono, ...type.caption },
  actionButton: {
    minHeight: MIN_HIT_TARGET,
    minWidth: 96,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  actionLabel: { ...type.body, fontWeight: "700", letterSpacing: 0.3 },
  secondaryButton: {
    minHeight: MIN_HIT_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  secondaryLabel: { ...type.body, color: colors.textMuted },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.65 },
  segmented: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  segment: {
    minHeight: MIN_HIT_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentSelected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  segmentLabel: { ...type.caption, color: colors.textMuted },
  segmentLabelSelected: { color: colors.accent, fontWeight: "600" },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeLabel: { ...type.caption, fontWeight: "600" },
});
