/**
 * The Video Poker screen's pieces (frame xfJEh). Thin: every string and number comes from
 * `model.ts`.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { Card } from "@/engine/cards";
import { PlayingCard, colors, display, icons, radius, surfaces, ui } from "@/ui/ds";
import type { PayLine, MathRow, HistoryEntry } from "./model";
import { historyLabel } from "./model";
import { machine } from "./theme";

// ---------------------------------------------------------------------------------------------
// Pay table

export function PayTablePanel({ left, right }: { left: PayLine[]; right: PayLine[] }) {
  return (
    <View style={styles.payPanel} accessibilityLabel="Pay table" role="table">
      <PayColumn lines={left} />
      <PayColumn lines={right} />
    </View>
  );
}

function PayColumn({ lines }: { lines: PayLine[] }) {
  return (
    <View style={styles.payCol}>
      {lines.map((line) => (
        <View
          key={line.hand}
          role="row"
          accessibilityLabel={`${line.label} pays ${line.coins}${line.highlighted ? " (highlighted)" : ""}`}
          style={[styles.payLine, line.highlighted && styles.payLineLit]}
        >
          <Text
            style={[
              ui(12, line.highlighted ? 700 : 500),
              { color: line.highlighted ? machine.lit : machine.label, flexShrink: 1 },
            ]}
            numberOfLines={1}
          >
            {line.label}
          </Text>
          <Text style={[ui(12, 700), { color: line.highlighted ? machine.lit : machine.gold }]}>
            {line.coins}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Hand

export interface SlotView {
  card: Card | null;
  faceUp: boolean;
  held: boolean;
  keep: boolean;
}

export function HandRow({
  slots,
  interactive,
  onToggle,
}: {
  slots: SlotView[];
  /** HOLD buttons are buttons only while holding is a legal action (Hold & draw). */
  interactive: boolean;
  onToggle: (index: number) => void;
}) {
  return (
    <View style={styles.hand}>
      {slots.map((slot, i) => (
        <View key={i} style={styles.slot}>
          {slot.keep ? (
            <View style={styles.keepTag} accessibilityLabel="Coach says keep">
              <icons.Lightbulb size={10} color={machine.lit} strokeWidth={2.5} />
              <Text style={[ui(9, 800, { letterSpacing: 0.5 }), { color: machine.lit }]}>KEEP</Text>
            </View>
          ) : (
            <View style={styles.keepSpace} />
          )}
          <View
            style={[
              styles.cardWrap,
              slot.held && styles.cardWrapHeld,
              slot.keep && styles.cardWrapKeep,
            ]}
          >
            {slot.card ? (
              <PlayingCard rank={slot.card.rank} suit={slot.card.suit} faceDown={!slot.faceUp} />
            ) : (
              <PlayingCard rank="A" suit="s" faceDown />
            )}
          </View>
          <HoldButton
            held={slot.held}
            card={slot.card}
            interactive={interactive}
            onPress={() => onToggle(i)}
          />
        </View>
      ))}
    </View>
  );
}

const RANK_WORD: Partial<Record<string, string>> = { A: "Ace", K: "King", Q: "Queen", J: "Jack" };
const SUIT_WORD = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as const;

function HoldButton({
  held,
  card,
  interactive,
  onPress,
}: {
  held: boolean;
  card: Card | null;
  interactive: boolean;
  onPress: () => void;
}) {
  const label = held ? "HELD" : "HOLD";
  const text = (
    <Text
      style={[
        ui(12, 800, { letterSpacing: 1 }),
        { color: held ? colors.primaryForeground : machine.holdInk },
      ]}
    >
      {label}
    </Text>
  );
  if (!interactive || !card) {
    return <View style={[styles.hold, held && styles.holdOn, styles.holdIdle]}>{text}</View>;
  }
  const name = `${RANK_WORD[card.rank] ?? card.rank} of ${SUIT_WORD[card.suit]}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Hold ${name}`}
      aria-pressed={held}
      onPress={onPress}
      style={({ pressed }) => [styles.hold, held && styles.holdOn, pressed && { opacity: 0.85 }]}
    >
      {text}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Coach layer

/** The little paper triangle that points the coach note up at the machine. */
export function NotePointer() {
  return (
    <Svg width={22} height={11} viewBox="0 0 22 11">
      <Path d="M0 11 L11 0 L22 11 Z" fill={colors.coach} />
    </Svg>
  );
}

export function MathTable({ rows }: { rows: MathRow[] }) {
  return (
    <View style={styles.math} accessibilityLabel="Holds ranked by expected return">
      <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: colors.inkMuted }]}>
        EVERY WAY TO HOLD, RANKED · AVERAGE BACK ON YOUR BET
      </Text>
      {rows.map((r) => (
        <View
          key={r.mask}
          style={[styles.mathRow, r.yours && styles.mathYours]}
          accessible
          accessibilityLabel={`${r.rank}. ${r.cards}, ${r.concept}, returns about ${r.ev}${r.best ? ", best" : ""}${r.yours ? ", your hold" : ""}`}
        >
          <Text style={[ui(12, 700), styles.mathRank]}>{r.rank}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[ui(13, 600), { color: colors.ink }]}>{r.cards}</Text>
            <Text style={[ui(12), { color: colors.inkMuted }]}>
              {r.concept}
              {r.best ? " · best" : ""}
              {r.yours ? " · your hold" : ""}
            </Text>
          </View>
          <Text style={[ui(13, 700), { color: r.best ? colors.correctInk : colors.ink }]}>
            {r.ev}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Result / payout

export function ResultBanner({
  won,
  headline,
  detail,
}: {
  won: boolean;
  headline: string;
  detail: string;
}) {
  const Icon = won ? icons.Check : icons.Circle;
  return (
    <View style={styles.banner} accessibilityLabel={`${headline}. ${detail}`} role="status">
      <View style={[styles.bannerIcon, { backgroundColor: won ? colors.correct : colors.muted }]}>
        <Icon size={22} color={won ? colors.paper : colors.mutedForeground} strokeWidth={2.5} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[display(28, 500), { color: colors.foreground }]}>{headline}</Text>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
    </View>
  );
}

export function DecisionLine({
  title,
  detail,
  correct,
}: {
  title: string;
  detail: string;
  correct: boolean;
}) {
  const Icon = correct ? icons.Check : icons.RotateCcw;
  return (
    <View style={styles.decisions}>
      <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
        DECISIONS THIS HAND
      </Text>
      <View style={styles.decisionRow}>
        <View
          style={[
            styles.decisionIcon,
            { backgroundColor: correct ? colors.correct : colors.mistake },
          ]}
        >
          <Icon size={13} color={colors.paper} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[ui(15, 600), { color: colors.foreground }]}>{title}</Text>
          <Text style={[ui(13), { color: colors.mutedForeground }]}>{detail}</Text>
        </View>
      </View>
    </View>
  );
}

export function HistoryStrip({ history }: { history: readonly HistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <View style={styles.history} accessibilityLabel="Last hands" role="list">
      <Text style={[ui(11, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
        LAST
      </Text>
      {history.map((h, i) => {
        const won = h.netCents > 0;
        return (
          <View
            key={h.handNo}
            role="listitem"
            accessibilityLabel={`Hand ${h.handNo}: ${historyLabel(h)}`}
            style={[
              styles.pill,
              { backgroundColor: won ? colors.correct : colors.secondary },
              { borderColor: i === 0 ? colors.foreground : surfaces.transparent },
            ]}
          >
            <Text style={[ui(12, 700), { color: won ? colors.paper : colors.mutedForeground }]}>
              {historyLabel(h)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  payPanel: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: machine.payPanelEdge,
    backgroundColor: machine.payPanel,
  },
  payCol: { flex: 1, gap: 3 },
  payLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  payLineLit: { backgroundColor: machine.payLineLit },
  hand: { flexDirection: "row", justifyContent: "space-between" },
  slot: { alignItems: "center", gap: 8 },
  keepTag: {
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: colors.coachAccent,
  },
  keepSpace: { height: 18 },
  cardWrap: { padding: 3, borderRadius: 9, borderWidth: 2, borderColor: surfaces.transparent },
  cardWrapHeld: { borderColor: colors.primary },
  cardWrapKeep: { borderColor: colors.coachAccent },
  hold: {
    width: 66,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: machine.holdEdge,
    backgroundColor: machine.holdFill,
    alignItems: "center",
    justifyContent: "center",
  },
  holdOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  holdIdle: { opacity: 0.6 },
  math: {
    marginTop: 4,
    gap: 6,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.paper2,
  },
  mathRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  mathYours: {
    backgroundColor: colors.paper,
    borderRadius: 6,
    marginHorizontal: -6,
    paddingHorizontal: 6,
  },
  mathRank: { width: 16, color: colors.inkMuted },
  banner: { flexDirection: "row", alignItems: "center", gap: 14 },
  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  decisions: {
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  decisionRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  decisionIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  history: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  pill: {
    paddingHorizontal: 8,
    height: 26,
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
  },
});
