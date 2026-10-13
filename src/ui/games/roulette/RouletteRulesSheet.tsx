/**
 * Rules and payouts behind the book icon: the wheel choice (European, American, French with
 * La Partage), the payout table with each bet's house edge from the engine, and the coach's
 * notes on which bets carry the lowest edge.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import X from "lucide-react-native/icons/x";
import {
  type BetType,
  BET_TYPE_NAMES,
  PAYOUTS,
  describeTable,
  explainDoubleZero,
  explainLaPartage,
  explainLowestEdgeBets,
  formatHouseEdge,
  formatPayoutOdds,
  getLayout,
  houseEdgeOf,
} from "@/games/roulette";
import { Button, SegmentedControl, colors, radius, ui } from "@/ui/ds";
import { type WheelChoice, WHEEL_OPTIONS, WHEEL_RULES } from "./rouletteTable";

const ORDER: BetType[] = [
  "straight",
  "split",
  "street",
  "trio",
  "corner",
  "firstFour",
  "topLine",
  "sixLine",
  "column",
  "dozen",
  "red",
  "odd",
  "low",
];

export function RouletteRulesSheet({
  wheel,
  canChange,
  onWheel,
  onClose,
}: {
  wheel: WheelChoice;
  canChange: boolean;
  onWheel: (wheel: WheelChoice) => void;
  onClose: () => void;
}) {
  const rules = WHEEL_RULES[wheel];
  const types = new Set(getLayout(rules).spots.map((s) => s.type));
  const rows = ORDER.filter((t) => types.has(t));
  const name = (t: BetType) =>
    t === "red"
      ? "Red / Black"
      : t === "odd"
        ? "Odd / Even"
        : t === "low"
          ? "1–18 / 19–36"
          : BET_TYPE_NAMES[t];

  return (
    <View style={styles.scrim}>
      <View role="dialog" accessibilityLabel="Roulette rules and payouts" style={styles.sheet}>
        <View style={styles.head}>
          <Text
            accessibilityRole="header"
            style={[ui(17, 700), { color: colors.foreground, flex: 1 }]}
          >
            Rules & payouts
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close rules"
            onPress={onClose}
            style={styles.close}
          >
            <X size={20} color={colors.mutedForeground} strokeWidth={2} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 4 }}>
          <View style={{ gap: 8 }}>
            <Text style={[ui(11, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
              WHEEL
            </Text>
            <SegmentedControl
              accessibilityLabel="Wheel"
              options={WHEEL_OPTIONS}
              value={wheel}
              onChange={canChange ? onWheel : undefined}
            />
            <Text style={[ui(12), { color: colors.mutedForeground }]}>
              {canChange
                ? describeTable(rules)
                : `${describeTable(rules)} · finish this spin to change the wheel`}
            </Text>
          </View>

          <View style={styles.table}>
            <View style={styles.tr}>
              <Text style={[styles.th, { flex: 1 }]}>Bet</Text>
              <Text style={[styles.th, styles.num]}>Pays</Text>
              <Text style={[styles.th, styles.num]}>House edge</Text>
            </View>
            {rows.map((t) => {
              const edge = houseEdgeOf(rules, t);
              const worst = t === "topLine";
              const best = rules.laPartage && t === "red";
              return (
                <View key={t} style={styles.tr} accessible>
                  <Text style={[ui(13, 600), { color: colors.foreground, flex: 1 }]}>
                    {name(t)}
                  </Text>
                  <Text style={[ui(13), styles.num, { color: colors.foreground }]}>
                    {formatPayoutOdds(PAYOUTS[t])}
                  </Text>
                  <Text
                    style={[
                      ui(13, worst || best ? 700 : 400),
                      styles.num,
                      { color: worst ? colors.mistake : best ? colors.correct : colors.foreground },
                    ]}
                  >
                    {formatHouseEdge(edge)}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.note}>
            <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.ink }]}>
              {explainLowestEdgeBets(rules)}
            </Text>
            <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.inkMuted }]}>
              {wheel === "american" ? explainDoubleZero() : explainLaPartage(rules)}
            </Text>
          </View>
          <Text style={[ui(12, 400, { lineHeight: 17 }), { color: colors.mutedForeground }]}>
            Practice chips only. Each pocket is equally likely on every spin; the wheel has no
            memory.
          </Text>
          <Button label="Done" onPress={onClose} fullWidth />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    backgroundColor: colors.background,
    justifyContent: "flex-end",
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 16,
    gap: 12,
  },
  head: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  table: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: { ...ui(11, 700, { letterSpacing: 0.5 }), color: colors.mutedForeground },
  num: { width: 84, textAlign: "right" },
  note: { backgroundColor: colors.paper, borderRadius: radius.md, padding: 12, gap: 8 },
});
