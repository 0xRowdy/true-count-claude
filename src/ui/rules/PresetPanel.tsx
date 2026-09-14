/**
 * Preset tables — one tap to a real game.
 *
 * Thirteen controls is the honest cost of "the rules are wrong and can't be fixed through
 * customization" being a real review. This panel is what keeps that cost off the user who
 * just wants to train for the table down the road: pick the game by name, then adjust.
 *
 * Each card carries its own house edge, so the list doubles as the comparison — the Strip
 * game and the 6:5 single-decker sit one above the other with their prices on them, which
 * is an argument no lesson makes as well.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RuleSet } from "@/engine/rules";
import { Badge, Panel } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";
import { RULE_PRESETS, type RulePreset, matchingPreset } from "./presets";
import { edgeVerdict, formatEdge, houseEdge } from "./houseEdge";

export function PresetPanel({
  rules,
  onSelect,
}: {
  rules: RuleSet;
  onSelect: (rules: RuleSet) => void;
}) {
  const active = matchingPreset(rules);

  return (
    <Panel title="Common tables">
      <Text style={styles.intro}>
        Start from a real game and adjust, or build your table field by field below. Edges
        shown are for the preset as listed.
      </Text>
      <View style={styles.list}>
        {RULE_PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            selected={preset.id === active?.id}
            onPress={() => onSelect(preset.rules)}
          />
        ))}
      </View>
      {active ? null : (
        <Text style={styles.custom}>
          Your table does not match any preset. That is normal — check the pit sign, not the
          list.
        </Text>
      )}
    </Panel>
  );
}

function PresetCard({
  preset,
  selected,
  onPress,
}: {
  preset: RulePreset;
  selected: boolean;
  onPress: () => void;
}) {
  const estimate = houseEdge(preset.rules);
  const percent = estimate.percent;
  const verdict = percent === undefined ? undefined : edgeVerdict(percent);
  const edgeColor =
    verdict === undefined
      ? colors.textMuted
      : verdict === "player-advantage" || verdict === "excellent"
        ? colors.accent
        : verdict === "fair"
          ? colors.info
          : verdict === "poor"
            ? colors.warning
            : colors.danger;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${preset.name}, ${preset.where}`}
      accessibilityHint={
        percent === undefined ? undefined : `House edge ${formatEdge(percent)}. ${preset.note}`
      }
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{preset.name}</Text>
        <Text style={[styles.edge, { color: edgeColor }]}>
          {percent === undefined ? "—" : formatEdge(percent)}
        </Text>
      </View>
      <Text style={styles.where}>{preset.where}</Text>
      <Text style={styles.note}>{preset.note}</Text>
      {selected ? (
        <View style={styles.badgeRow}>
          <Badge label="YOUR TABLE" tone="good" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  list: { gap: spacing.sm },
  card: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.sm + 2,
    gap: 2,
  },
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  pressed: { opacity: 0.65 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  name: { ...type.body, color: colors.text, fontWeight: "700", flexShrink: 1 },
  edge: { ...type.mono, ...type.caption, fontWeight: "700" },
  where: { ...type.caption, color: colors.textMuted, fontSize: 12 },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: 2 },
  badgeRow: { marginTop: spacing.xs },
  custom: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
});
