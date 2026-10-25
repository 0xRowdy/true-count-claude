/**
 * The Play table panel's vocabulary (TableSheet, CountPanel, DecisionFeedback), drawn from the
 * design system's tokens (`@/ui/ds`) like every other screen.
 *
 * Two of these components encode product invariants rather than taste:
 *
 * - `ActionButton` has no `disabled` prop. Invariant 7 forbids disabling a legal action —
 *   render exactly what `legalActions` returns and nothing else. Greying out a legal split
 *   corrupts the user's own accuracy statistics, a complaint that appears three times in one
 *   competitor's reviews.
 * - Hit targets meet the platform minimum (`MIN_TAP`) and are spaced. "Mis-tapped the wrong
 *   action" is a recurring review theme across the category.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { MIN_TAP } from "./ds/tap";
import { colors, radius, surfaces, ui } from "./ds/tokens";
import { type Tone, toneColor } from "./trainer/kit";

export type { Tone };

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
      {title ? (
        <Text accessibilityRole="header" style={styles.panelTitle}>
          {title}
        </Text>
      ) : null}
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

/**
 * A row of mutually exclusive choices that wraps (counting system, count visibility). The
 * chosen one is House Gold, as selection is across the system.
 */
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
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            aria-checked={selected}
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

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  panelTitle: { ...ui(17, 600), color: colors.foreground, marginBottom: 4 },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  statLabel: { ...ui(13), color: colors.mutedForeground, flexShrink: 1 },
  statValue: { ...ui(13, 600), fontVariant: ["tabular-nums"] },
  actionButton: {
    minHeight: MIN_TAP,
    minWidth: 96,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  actionLabel: { ...ui(15, 700), letterSpacing: 0.3 },
  secondaryButton: {
    minHeight: MIN_TAP,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  secondaryLabel: { ...ui(15, 500), color: colors.foreground },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  segment: {
    minHeight: MIN_TAP,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  segmentSelected: { borderColor: colors.primary, backgroundColor: surfaces.primaryWash },
  segmentLabel: { ...ui(13, 500), color: colors.mutedForeground },
  segmentLabelSelected: { ...ui(13, 600), color: colors.primary },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeLabel: ui(12, 600),
});
