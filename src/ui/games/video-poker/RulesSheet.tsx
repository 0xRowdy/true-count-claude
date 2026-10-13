import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MAX_COINS, getPayTable, type PayTableId } from "@/games/video-poker";
import { colors, radius, ui } from "@/ui/ds";
import { VP_GAMES, houseEdgeText, returnText } from "./model";
import { X } from "./icons";

const GAME_NOTES: Record<PayTableId, string> = {
  "job-9-6": "Full pay: 9 for a full house, 6 for a flush. Pays from a pair of Jacks.",
  "job-8-5": "Short pay: the full house and flush pay one less each.",
  "job-7-5": "Short pay.",
  "job-6-5": "Short pay.",
  "deuces-wild-full-pay":
    "Every 2 is wild. Pays from three of a kind; four deuces pay 200 per coin.",
  "double-double-bonus-9-6":
    "Big bonuses for four of a kind, more with the right kicker. Two pair pays only even money.",
};

/**
 * The rules and pay tables behind the book icon: how a hand plays, and each machine with its
 * pay table and the return of perfect play. Switching machine is only possible between hands.
 */
export function RulesSheet({
  current,
  canSwitch,
  onSelect,
  onClose,
}: {
  current: PayTableId;
  canSwitch: boolean;
  onSelect: (id: PayTableId) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.scrim}>
      <View role="dialog" aria-modal accessibilityLabel="Rules and pay tables" style={styles.sheet}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[ui(18, 700), { color: colors.foreground }]}>
            Rules & pay tables
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close rules"
            onPress={onClose}
            style={styles.close}
          >
            <X size={22} color={colors.foreground} strokeWidth={2} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[ui(14, 400, { lineHeight: 20 }), { color: colors.mutedForeground }]}>
            One 52-card deck, shuffled fresh for every hand. You are dealt five cards: tap HOLD
            under the ones to keep, then Draw replaces the rest once. The final hand is paid from
            the pay table, per coin bet. Five coins pay 800 per coin on a royal flush (4,000 coins)
            instead of 250, so the returns below assume five coins. Practice chips only.
          </Text>
          <Text style={[ui(14, 400, { lineHeight: 20 }), { color: colors.mutedForeground }]}>
            Marcus grades every hold against the exact average return of all 32 ways to hold the
            hand.
          </Text>
          {!canSwitch ? (
            <Text style={[ui(13, 600), { color: colors.primary }]}>
              Finish this hand to switch machines.
            </Text>
          ) : null}
          <View role="radiogroup" accessibilityLabel="Game and pay table" style={{ gap: 10 }}>
            {VP_GAMES.map((id) => (
              <GameOption
                key={id}
                id={id}
                selected={id === current}
                canSwitch={canSwitch}
                onSelect={() => onSelect(id)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function GameOption({
  id,
  selected,
  canSwitch,
  onSelect,
}: {
  id: PayTableId;
  selected: boolean;
  canSwitch: boolean;
  onSelect: () => void;
}) {
  const table = getPayTable(id);
  const head = (
    <View style={{ gap: 2 }}>
      <Text style={[ui(15, 700), { color: colors.foreground }]}>{table.name}</Text>
      <Text style={[ui(12), { color: colors.mutedForeground }]}>
        {`Return ${returnText(id)} with perfect play · house edge ${houseEdgeText(id)}`}
      </Text>
      <Text style={[ui(12), { color: colors.mutedForeground }]}>{GAME_NOTES[id]}</Text>
    </View>
  );
  return (
    <View style={[styles.option, selected && styles.optionOn]}>
      {canSwitch ? (
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={table.name}
          aria-checked={selected}
          onPress={onSelect}
        >
          {head}
        </Pressable>
      ) : (
        <View accessibilityLabel={`${table.name}${selected ? " (playing)" : ""}`}>{head}</View>
      )}
      {selected ? (
        <View style={styles.table} accessibilityLabel={`${table.name} pay table`}>
          <View style={styles.row}>
            <Text style={[ui(11, 700), styles.cellHand]}>HAND</Text>
            <Text style={[ui(11, 700), styles.cell]}>1 COIN</Text>
            <Text style={[ui(11, 700), styles.cell]}>{`${MAX_COINS} COINS`}</Text>
          </View>
          {table.rows.map((r) => (
            <View key={r.hand} style={styles.row}>
              <Text style={[ui(12, 500), styles.cellHand, { color: colors.foreground }]}>
                {r.label}
              </Text>
              <Text style={[ui(12, 600), styles.cell]}>{r.pays}</Text>
              <Text style={[ui(12, 600), styles.cell]}>
                {(r.paysAtMaxCoins ?? r.pays) * MAX_COINS}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  sheet: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 6,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  option: {
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionOn: { borderColor: colors.primary },
  table: { gap: 4 },
  row: { flexDirection: "row", gap: 8 },
  cellHand: { flex: 1, color: colors.mutedForeground },
  cell: { width: 56, textAlign: "right", color: colors.primary },
});
