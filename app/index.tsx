import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RANKS } from "@/engine/cards";
import { DEFAULT_RULES, describeRules } from "@/engine/rules";
import {
  createShoe,
  deal,
  decksRemaining,
  isCutCardReached,
  remainingComposition,
  verifyComposition,
} from "@/engine/shoe";
import { colors, radius, spacing, type } from "@/ui/theme";

/**
 * A minimal harness proving the engine runs identically on web, iOS and Android.
 * This screen is scaffolding — the real Play and Drill surfaces replace it.
 */
export default function Home() {
  const [seed] = useState(() => 20260914);
  const [shoe, setShoe] = useState(() => createShoe(DEFAULT_RULES, seed));

  const composition = useMemo(() => remainingComposition(shoe), [shoe]);
  const intact = useMemo(() => verifyComposition(shoe), [shoe]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>True Count</Text>
      <Text style={styles.subtitle}>
        The card-counting trainer that shows you why, and proves its own math.
      </Text>

      <Link href="/play" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonLabel}>Play blackjack</Text>
        </Pressable>
      </Link>

      <View style={styles.card}>
        <Text style={styles.heading}>Table</Text>
        <Text style={styles.mono}>{describeRules(DEFAULT_RULES)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Shoe Integrity</Text>
        <Row label="Seed" value={String(shoe.seed)} />
        <Row label="Dealt" value={`${shoe.dealtCount} of ${shoe.cards.length}`} />
        <Row label="Decks remaining" value={decksRemaining(shoe).toFixed(2)} />
        <Row label="Cut card" value={isCutCardReached(shoe) ? "reached" : `at ${shoe.cutIndex}`} />
        <Row
          label="Composition"
          value={intact ? "verified" : "FAILED"}
          tone={intact ? "good" : "bad"}
        />
        {/* Invariant 1: the proof that the Shoe is honest is never behind a purchase. */}
        <Link href="/shoe-integrity" style={styles.link}>
          Open the Shoe Integrity Panel →
        </Link>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Remaining by rank</Text>
        <View style={styles.grid}>
          {RANKS.map((rank) => (
            <View key={rank} style={styles.cell}>
              <Text style={styles.cellRank}>{rank}</Text>
              <Text style={styles.cellCount}>{composition[rank]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label="Deal a card"
          onPress={() => setShoe((current) => deal(current).shoe)}
          disabled={shoe.dealtCount >= shoe.cards.length}
        />
        <Button label="Reset shoe" onPress={() => setShoe(createShoe(DEFAULT_RULES, seed))} />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const valueColor =
    tone === "good" ? colors.accent : tone === "bad" ? colors.danger : colors.text;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.mono, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function Button({
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
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, maxWidth: 720, width: "100%", alignSelf: "center" },
  title: { ...type.title, color: colors.text, marginTop: spacing.md },
  subtitle: { ...type.body, color: colors.textMuted, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: { ...type.heading, color: colors.text, marginBottom: spacing.xs },
  link: { ...type.body, color: colors.accent, marginTop: spacing.sm, minHeight: 44, paddingTop: spacing.sm },
  mono: { ...type.mono, ...type.caption, color: colors.text },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { ...type.caption, color: colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  cell: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minWidth: 46,
    alignItems: "center",
  },
  cellRank: { ...type.caption, color: colors.textMuted },
  cellCount: { ...type.mono, ...type.caption, color: colors.text },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  button: {
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { ...type.body, color: colors.accent, fontWeight: "600" },
});
