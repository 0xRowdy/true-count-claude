import type { ReactNode } from "react";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RANKS } from "@/engine/cards";
import { cardsRemaining, remainingComposition, verifyComposition } from "@/engine/shoe";
import {
  BET_LABELS,
  EZ_BACCARAT,
  EZ_ONLY_SIDE_BETS,
  PUNTO_BANCO,
  SIDE_BETS,
  type BaccaratRules,
  type BaccaratShoe,
  type SideBetKind,
  commissionTip,
  describeRules,
  houseEdgeTable,
  isCutCardOut,
  payLabel,
} from "@/games/baccarat";
import {
  Button,
  SegmentedControl,
  ToggleChip,
  cardLabel,
  colors,
  display,
  icons,
  radius,
  Sheet,
  type,
  ui,
} from "@/ui/ds";
import { ChevronRight, ShieldCheck } from "@/ui/ds/icons";

const TABLEAU: readonly [string, string][] = [
  ["Natural 8 or 9 on either side", "Both stand. The coup is over."],
  ["Player 0–5", "Player draws a third card."],
  ["Player 6–7", "Player stands."],
  ["Banker 0–2", "Draws."],
  ["Banker 3", "Draws unless Player's third card is an 8."],
  ["Banker 4", "Draws when Player's third card is 2–7."],
  ["Banker 5", "Draws when Player's third card is 4–7."],
  ["Banker 6", "Draws when Player's third card is 6 or 7."],
  ["Banker 7", "Stands."],
  ["Player stood", "Banker draws on 0–5 and stands on 6–7, like the Player."],
];

/**
 * Rules and payouts (the book icon): the variant (Punto Banco / EZ Baccarat), the tie payout
 * and optional side bets, every bet's pay and exact house edge (engine enumeration), the
 * third-card tableau, and this shoe's remaining cards with the composition check — the same
 * honesty idea as the Shoe Integrity screen, linked from here.
 */
export function RulesSheet({
  visible,
  onClose,
  rules,
  shoe,
  shoeIndex,
  canChange,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  rules: BaccaratRules;
  shoe: BaccaratShoe;
  shoeIndex: number;
  /** Rules change between coups only. */
  canChange: boolean;
  onChange: (rules: BaccaratRules) => void;
}) {
  const edges = houseEdgeTable(rules);
  const offeredSides = SIDE_BETS.filter(
    (b) => rules.variant === "ez" || !EZ_ONLY_SIDE_BETS.includes(b),
  );
  const toggleSide = (bet: SideBetKind) => {
    const on = rules.sideBets.includes(bet);
    const sideBets = on ? rules.sideBets.filter((b) => b !== bet) : [...rules.sideBets, bet];
    onChange({ ...rules, sideBets: SIDE_BETS.filter((b) => sideBets.includes(b)) });
  };
  const setVariant = (variant: string) => {
    const base = variant === "ez" ? EZ_BACCARAT : PUNTO_BANCO;
    onChange({
      ...base,
      tiePays: rules.tiePays,
      // Keep the pair bets the player chose; Dragon 7 / Panda 8 come with EZ by default.
      sideBets:
        variant === "ez"
          ? base.sideBets
          : rules.sideBets.filter((b) => !EZ_ONLY_SIDE_BETS.includes(b)),
    });
  };

  const composition = remainingComposition(shoe.shoe);
  const left = cardsRemaining(shoe.shoe);
  const total = shoe.shoe.cards.length;
  const intact = verifyComposition(shoe.shoe);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Baccarat rules and payouts"
      scrimLabel="Close rules"
      maxWidth={430}
      maxHeight="92%"
    >
      <View style={styles.sheetHead}>
        <Text accessibilityRole="header" style={[display(24, 500), { color: colors.foreground }]}>
          Rules & payouts
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={[ui(15, 600), { color: colors.primary }]}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>{describeRules(rules)}</Text>

        <Section title="Variant">
          {canChange ? (
            <>
              <SegmentedControl
                accessibilityLabel="Variant"
                value={rules.variant}
                onChange={setVariant}
                options={[
                  { value: "punto-banco", label: "Punto Banco" },
                  { value: "ez", label: "EZ Baccarat" },
                ]}
              />
              <Text style={styles.note}>
                {rules.variant === "ez"
                  ? "No commission: a Banker win with a three-card 7 (Dragon 7) pushes instead."
                  : commissionTip(rules)}
              </Text>
              <Text style={styles.label}>Tie pays</Text>
              <SegmentedControl
                accessibilityLabel="Tie pays"
                value={String(rules.tiePays)}
                onChange={(v) => onChange({ ...rules, tiePays: v === "9" ? 9 : 8 })}
                options={[
                  { value: "8", label: "8 to 1" },
                  { value: "9", label: "9 to 1" },
                ]}
              />
              <Text style={styles.label}>Side bets (optional)</Text>
              <View style={styles.chips}>
                {offeredSides.map((bet) => (
                  <ToggleChip
                    key={bet}
                    label={BET_LABELS[bet]}
                    selected={rules.sideBets.includes(bet)}
                    onPress={() => toggleSide(bet)}
                  />
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.note}>
              Finish this coup to change the variant, the tie payout or the side bets.
            </Text>
          )}
        </Section>

        <Section title="Payouts and house edge">
          {edges.map((row, i) => (
            <View key={row.bet} style={[styles.row, i > 0 && styles.rowLine]}>
              <Text style={[ui(14, 600), styles.rowName]}>{BET_LABELS[row.bet]}</Text>
              <Text style={[ui(13), { color: colors.mutedForeground }]}>
                {payLabel(rules, row.bet)}
              </Text>
              <Text
                style={[
                  ui(14, 700),
                  styles.edge,
                  {
                    color:
                      i === 0
                        ? colors.correct
                        : row.edge > 0.05
                          ? colors.mistake
                          : colors.foreground,
                  },
                ]}
              >
                {row.label}
              </Text>
            </View>
          ))}
          <Text style={styles.note}>
            Exact figures, enumerated over every possible coup from a fresh {rules.decks}-deck shoe.
            Lowest edge first.
          </Text>
        </Section>

        <Section title="The third-card rule">
          {TABLEAU.map(([when, what], i) => (
            <View key={when} style={[styles.row, i > 0 && styles.rowLine]}>
              <Text style={[ui(13, 600), styles.rowName]}>{when}</Text>
              <Text style={[ui(13), styles.tableauWhat]}>{what}</Text>
            </View>
          ))}
          <Text style={styles.note}>
            Nobody chooses: the dealer follows this table every time. Tap “Why these draws?” after a
            coup to see which rows applied.
          </Text>
        </Section>

        <Section title={`This shoe · #${shoeIndex + 1}`}>
          <Text style={[ui(14, 600), { color: colors.foreground }]}>
            {`${left} of ${total} cards left · seed ${shoe.shoe.seed}`}
          </Text>
          <Text style={styles.note}>
            {shoe.burn
              ? `Burn: ${cardLabel(shoe.burn.exposed.rank, shoe.burn.exposed.suit)} turned up, ${shoe.burn.burned.length} burned face down. `
              : ""}
            {isCutCardOut(shoe)
              ? "The cut card is out: one more coup, then a fresh shoe."
              : `The cut card sits ${shoe.rules.cardsBehindCut} cards from the back.`}
          </Text>
          <View style={styles.ranks} accessibilityLabel="Cards left by rank">
            {RANKS.map((rank) => (
              <View key={rank} style={styles.rank}>
                <Text style={[ui(12, 700), { color: colors.foreground }]}>{rank}</Text>
                <Text style={[ui(11), { color: colors.mutedForeground }]}>{composition[rank]}</Text>
              </View>
            ))}
          </View>
          <View style={styles.check}>
            <ShieldCheck size={16} color={intact ? colors.correct : colors.mistake} />
            <Text style={[ui(13, 600), { color: intact ? colors.correct : colors.mistake }]}>
              {intact
                ? `Composition check passed: dealt + left = ${shoe.rules.decks} full decks`
                : "Composition check failed"}
            </Text>
          </View>
          <Link href="/shoe-integrity" asChild>
            <Pressable accessibilityRole="link" style={styles.link}>
              <Text style={[ui(14, 600), { color: colors.primary }]}>
                How we prove a shoe is fair
              </Text>
              <ChevronRight size={16} color={colors.primary} />
            </Pressable>
          </Link>
        </Section>
        <Button
          label="Back to the table"
          variant="secondary"
          fullWidth
          onPress={onClose}
          icon={icons.ArrowLeft}
        />
      </ScrollView>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.overline, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  close: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  body: { gap: 20, paddingHorizontal: 16, paddingBottom: 24 },
  section: { gap: 10 },
  label: { ...ui(13, 600), color: colors.foreground, marginTop: 4 },
  note: { ...ui(13, 400, { lineHeight: 19 }), color: colors.mutedForeground },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.border },
  rowName: { flex: 1, color: colors.foreground },
  edge: { minWidth: 64, textAlign: "right" },
  tableauWhat: { flex: 1.4, color: colors.mutedForeground },
  ranks: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rank: {
    width: 40,
    alignItems: "center",
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
  },
  check: { flexDirection: "row", alignItems: "center", gap: 6 },
  link: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
});
