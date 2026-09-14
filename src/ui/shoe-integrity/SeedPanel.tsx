/**
 * The seed — this Shoe's name, and the thing that makes a bug report complete.
 *
 * ADR-0004 accepts openly that a determined user could predict a Shoe from its seed, and
 * trades that for reproducibility. This panel is where the trade pays off: the seed is
 * shown, copyable, and *enterable*, so a seed from someone else's bug report rebuilds their
 * Shoe card for card on this device.
 *
 * That last direction is the one that matters. A seed you can only read is a serial number.
 * A seed you can paste back in is a proof.
 */

import { StyleSheet, Text, TextInput, View } from "react-native";
import type { RuleSet } from "@/engine/rules";
import { describeRules } from "@/engine/rules";
import type { Shoe } from "@/engine/shoe";
import { cardsRemaining, decksRemaining, isCutCardReached } from "@/engine/shoe";
import { ActionButton, Panel, SecondaryButton, StatRow } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";

export function SeedPanel({
  shoe,
  rules,
  seedText,
  onSeedTextChange,
  onLoadSeed,
  onNewSeed,
  onCopySeed,
  notice,
}: {
  shoe: Shoe;
  rules: RuleSet;
  seedText: string;
  onSeedTextChange: (next: string) => void;
  /** Rendered only when the typed seed is usable and differs from the Shoe on screen. */
  onLoadSeed?: () => void;
  onNewSeed: () => void;
  onCopySeed: () => void;
  notice?: string;
}) {
  const remaining = cardsRemaining(shoe);
  const cutReached = isCutCardReached(shoe);

  return (
    <Panel title="This Shoe">
      <Text style={styles.seedLabel}>Seed</Text>
      <Text style={styles.seed} selectable>
        {shoe.seed}
      </Text>
      <Text style={styles.prose}>
        This seed and the Rule Set below rebuild this Shoe exactly, card for card, on any
        device. Send it with a bug report and we see what you saw.
      </Text>

      <View style={styles.row}>
        <ActionButton label="Copy seed" onPress={onCopySeed} tone="info" />
        <SecondaryButton label="New Shoe" onPress={onNewSeed} />
      </View>

      <View style={styles.loadRow}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Rebuild a Shoe from a seed</Text>
          <TextInput
            value={seedText}
            onChangeText={onSeedTextChange}
            placeholder={String(shoe.seed)}
            placeholderTextColor={colors.textMuted}
            inputMode="numeric"
            accessibilityLabel="Seed to load"
            style={styles.input}
          />
        </View>
        {onLoadSeed ? <ActionButton label="Load" onPress={onLoadSeed} /> : null}
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.stats}>
        {/* Stacked rather than a StatRow: the rule string is long enough to wrap badly
            against its own label on a 360pt phone. */}
        <Text style={styles.fieldLabel}>Table</Text>
        <Text style={styles.rules} selectable>
          {describeRules(rules)}
        </Text>
        <StatRow label="Dealt" value={`${shoe.dealtCount} of ${shoe.cards.length}`} />
        <StatRow label="Cards left" value={remaining} />
        <StatRow label="Decks remaining" value={decksRemaining(shoe).toFixed(2)} />
        <StatRow
          label="Cut card"
          value={cutReached ? `reached (at ${shoe.cutIndex})` : `at card ${shoe.cutIndex}`}
          tone={cutReached ? "warn" : "neutral"}
        />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  seedLabel: { ...type.caption, color: colors.textMuted },
  seed: { ...type.mono, fontSize: 30, fontWeight: "700", color: colors.text, letterSpacing: 1 },
  prose: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  loadRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "flex-end" },
  field: { flexGrow: 1, flexBasis: 160, gap: spacing.xs },
  fieldLabel: { ...type.caption, color: colors.textMuted },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    color: colors.text,
    ...type.mono,
    fontSize: 15,
  },
  notice: { ...type.caption, color: colors.info },
  rules: { ...type.mono, ...type.caption, color: colors.text, marginBottom: spacing.xs },
  stats: { gap: spacing.xs, marginTop: spacing.xs },
});
