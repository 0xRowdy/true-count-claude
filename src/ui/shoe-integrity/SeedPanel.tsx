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
import Copy from "lucide-react-native/icons/copy";
import Shuffle from "lucide-react-native/icons/shuffle";
import { colors, display, ui, Panel } from "@/ui/ds";
import { ActionButton, SecondaryButton, StatRow, inputStyle, text } from "@/ui/trainer/kit";

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
        This seed and the Rule Set below rebuild this Shoe exactly, card for card, on any device.
        Send it with a bug report and we see what you saw.
      </Text>

      <View style={styles.row}>
        <ActionButton label="Copy seed" icon={Copy} onPress={onCopySeed} tone="info" />
        <SecondaryButton label="New Shoe" icon={Shuffle} onPress={onNewSeed} />
      </View>

      <View style={styles.loadRow}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Rebuild a Shoe from a seed</Text>
          <TextInput
            value={seedText}
            onChangeText={onSeedTextChange}
            placeholder={String(shoe.seed)}
            placeholderTextColor={colors.mutedForeground}
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

const NUM = { fontVariant: ["tabular-nums" as const] };

const styles = StyleSheet.create({
  seedLabel: text.overline,
  seed: { ...display(40, 500), ...NUM, color: colors.foreground, letterSpacing: 1 },
  prose: text.note,
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  loadRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end" },
  field: { flexGrow: 1, flexBasis: 160, gap: 6 },
  fieldLabel: text.label,
  input: inputStyle,
  notice: text.info,
  rules: { ...ui(13, 500), color: colors.foreground, marginBottom: 4 },
  stats: { gap: 8, marginTop: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
});
