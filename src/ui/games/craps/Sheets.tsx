import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  type Bet,
  type CrapsTable,
  type TableAction,
  betName,
  betsOf,
  canTakeDown,
  edgeChart,
  explainBet,
  formatDollars,
  formatEdge,
  fullOddsRule,
  isComeBet,
  isLineBet,
  isWorking,
  oddsLimit,
  oddsPoint,
  payoutLabel,
  tableLabel,
} from "@/games/craps";
import { colors, display, radius, ui } from "@/ui/ds/tokens";
import { Info, X } from "./icons";
import {
  type Spot,
  CENTER_KINDS,
  betAt,
  spotEdge,
  spotName,
  spotOf,
  stakeOn,
  wouldDropBelowMinimum,
} from "./model";
import { craps } from "./theme";

function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet} role="dialog" accessibilityLabel={title}>
          <View style={styles.head}>
            <Text style={[display(22, 500), styles.flex, { color: colors.foreground }]}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${title.toLowerCase()}`}
              onPress={onClose}
              style={styles.close}
            >
              <X size={20} color={colors.mutedForeground} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SmallButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.small, pressed && styles.pressed]}
    >
      <Text style={[ui(13, 600), { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

/** Hardways and the one-roll center bets. Tap bets the selected chip; long-press takes it off. */
export function CenterBetsSheet({
  visible,
  table,
  chip,
  onSpot,
  onRemove,
  onClose,
}: {
  visible: boolean;
  table: CrapsTable;
  chip: number;
  onSpot: (spot: Spot) => void;
  onRemove: (spot: Spot) => void;
  onClose: () => void;
}) {
  const row = (spot: Spot, payout: string) => {
    const stake = stakeOn(table, spot);
    const name = spotName(spot);
    return (
      <Pressable
        key={name}
        accessibilityRole="button"
        accessibilityLabel={`${name}, pays ${payout}, house edge ${spotEdge(table.rules, spot)}${stake > 0 ? `, your bet ${formatDollars(stake)}` : ""}`}
        accessibilityHint={`Tap to bet ${formatDollars(chip)}, long-press or Edit bets to take it off`}
        onPress={() => onSpot(spot)}
        onLongPress={() => onRemove(spot)}
        style={({ pressed }) => [
          styles.center,
          stake > 0 && styles.mine,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.flex}>
          <Text style={[ui(15, 700), { color: colors.feltText }]}>{name}</Text>
          <Text style={[ui(12), { color: colors.mutedForeground }]}>
            {`Pays ${payout} · house edge ${spotEdge(table.rules, spot)}`}
          </Text>
        </View>
        {stake > 0 ? (
          <Text style={[ui(14, 700), { color: colors.primary }]}>{formatDollars(stake)}</Text>
        ) : null}
      </Pressable>
    );
  };
  return (
    <Sheet visible={visible} title="Center bets" onClose={onClose}>
      <Text style={[ui(13), { color: colors.mutedForeground }]}>
        {`Tap to bet ${formatDollars(chip)}. Hardways are off on the come-out unless you call them on.`}
      </Text>
      <Text style={[ui(11, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
        HARDWAYS
      </Text>
      {([6, 8, 4, 10] as const).map((n) =>
        row({ kind: "hard", number: n }, payoutLabel("hard", n)),
      )}
      <Text style={[ui(11, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
        ONE ROLL
      </Text>
      {CENTER_KINDS.map((k) => row({ kind: k }, payoutLabel(k)))}
      <View style={styles.note}>
        <Info size={14} color={colors.mutedForeground} strokeWidth={2} />
        <Text style={[ui(12), styles.flex, { color: colors.mutedForeground }]}>
          House edge 9–17% on center bets. Odds behind the line carry none.
        </Text>
      </View>
    </Sheet>
  );
}

function betDetail(table: CrapsTable, bet: Bet): string {
  const parts = [formatDollars(bet.amount)];
  if ((isLineBet(bet) || isComeBet(bet)) && bet.odds > 0) {
    parts.push(`odds ${formatDollars(bet.odds)}`);
  }
  const working = isWorking(bet, table.point, table.rules);
  parts.push(working ? "working" : "off next roll");
  return parts.join(" · ");
}

/** Your bets: odds, working / off, and take down where the rules allow it. */
export function EditBetsSheet({
  visible,
  table,
  chip,
  onEdit,
  onRemove,
  onClose,
}: {
  visible: boolean;
  table: CrapsTable;
  /** The selected chip: "Take $5 off" is the button alternative to a long-press on the felt. */
  chip: number;
  onEdit: (action: TableAction) => void;
  onRemove: (spot: Spot) => void;
  onClose: () => void;
}) {
  const mine = betsOf(table);
  return (
    <Sheet visible={visible} title="Your bets" onClose={onClose}>
      {mine.length === 0 ? (
        <Text style={[ui(14), { color: colors.mutedForeground }]}>
          No bets yet. Pick a chip and tap a spot on the felt.
        </Text>
      ) : null}
      {mine.map((bet) => {
        const name = betName(bet);
        const hasOdds = isLineBet(bet) || isComeBet(bet);
        const point = hasOdds ? oddsPoint(table, bet) : null;
        const limit = point !== null ? oddsLimit(table, bet) : 0;
        const odds = hasOdds ? bet.odds : 0;
        const toggles = !isLineBet(bet) && bet.kind !== "dontCome" && (!isComeBet(bet) || odds > 0);
        const working = isWorking(bet, table.point, table.rules);
        const spot = spotOf(bet);
        // Chip by chip, where the felt's long-press would take a chip off this very bet.
        const chipOff =
          spot !== null &&
          betAt(table, spot)?.id === bet.id &&
          bet.amount > chip &&
          !wouldDropBelowMinimum(table, bet, chip) &&
          !(isLineBet(bet) && table.point !== null) &&
          !(isComeBet(bet) && bet.point !== null);
        return (
          <View
            key={bet.id}
            style={styles.betRow}
            accessibilityLabel={`${name}: ${betDetail(table, bet)}`}
          >
            <View style={styles.betHead}>
              <Text style={[ui(15, 700), styles.flex, { color: colors.foreground }]}>{name}</Text>
              <Text style={[ui(13), { color: colors.mutedForeground }]}>
                {betDetail(table, bet)}
              </Text>
            </View>
            <View style={styles.betActions}>
              {point !== null && odds < limit ? (
                <SmallButton
                  label={`Max odds (${formatDollars(limit)})`}
                  accessibilityLabel={`${name}: max odds ${formatDollars(limit)}`}
                  onPress={() => onEdit({ type: "odds", betId: bet.id, amount: limit })}
                />
              ) : null}
              {odds > 0 ? (
                <SmallButton
                  label="Remove odds"
                  accessibilityLabel={`${name}: remove odds`}
                  onPress={() => onEdit({ type: "odds", betId: bet.id, amount: 0 })}
                />
              ) : null}
              {toggles ? (
                <SmallButton
                  label={working ? "Call it off" : "Call it on"}
                  accessibilityLabel={`${name}: ${working ? "call it off" : "call it on"}`}
                  onPress={() => onEdit({ type: "working", betId: bet.id, working: !working })}
                />
              ) : null}
              {chipOff && spot ? (
                <SmallButton
                  label={`Take ${formatDollars(chip)} off`}
                  accessibilityLabel={`${name}: take ${formatDollars(chip)} off`}
                  onPress={() => onRemove(spot)}
                />
              ) : null}
              {canTakeDown(table, bet) ? (
                <SmallButton
                  label="Take down"
                  accessibilityLabel={`${name}: take down`}
                  onPress={() => onEdit({ type: "takeDown", betId: bet.id })}
                />
              ) : null}
            </View>
          </View>
        );
      })}
      <Text style={[ui(12, 400, { lineHeight: 18 }), { color: colors.mutedForeground }]}>
        Place bets and hardways are off on the come-out; come-bet odds too. Line and come bets are
        contract bets once they have a point: their odds can come down, the bet can’t.
      </Text>
    </Sheet>
  );
}

/** Rules and payouts with the house edge of every bet, computed for this table's rules. */
export function RulesSheet({
  visible,
  table,
  onClose,
}: {
  visible: boolean;
  table: CrapsTable;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title="Rules and payouts" onClose={onClose}>
      <Text style={[ui(14, 600), { color: colors.foreground }]}>{tableLabel(table.rules)}</Text>
      <Text style={[ui(14, 400, { lineHeight: 20 }), { color: colors.foreground }]}>
        {`${fullOddsRule(table.rules)}. ${explainBet("odds", table.rules)}`}
      </Text>
      <View style={styles.chart} role="table" accessibilityLabel="House edge by bet">
        {edgeChart(table.rules).map((r) => (
          <View key={r.label} style={styles.chartRow} role="row">
            <Text style={[ui(13), styles.flex, { color: colors.foreground }]}>{r.label}</Text>
            <Text style={[ui(12), styles.payout, { color: colors.mutedForeground }]}>
              {r.payout}
            </Text>
            <Text
              style={[
                ui(13, 700),
                styles.edge,
                {
                  color:
                    r.edge === 0
                      ? colors.correct
                      : r.edge > 0.06
                        ? colors.mistake
                        : colors.foreground,
                },
              ]}
            >
              {formatEdge(r.edge)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[ui(12), { color: colors.mutedForeground }]}>
        Practice chips only. No real money is wagered.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: craps.scrim,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "86%",
    backgroundColor: colors.popover,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 8,
  },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  body: { gap: 10, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4 },
  flex: { flex: 1 },
  center: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    backgroundColor: colors.feltDeep,
  },
  mine: { borderColor: colors.primary },
  pressed: { opacity: 0.8 },
  note: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingTop: 4 },
  betRow: {
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  betHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  betActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  small: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  chart: { gap: 2 },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  payout: { width: 120, textAlign: "right" },
  edge: { width: 60, textAlign: "right" },
});
