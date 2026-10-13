import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { type LeaderboardMode, type LiveTableState, QUICK_REPLIES } from "@/games/craps";
import { colors, display, radius, surfaces, ui } from "@/ui/ds/tokens";
import { Bell, BellOff, Flag, Send } from "./icons";
import { LEADERBOARD_TABS, chatItems, leaderRows } from "./session";
import { Initials } from "./Seats";

/** "Table leaderboard" (design 11): ranked by decision accuracy or by longest hand. */
export function Leaderboard({
  state,
  mode,
  onMode,
}: {
  state: LiveTableState;
  mode: LeaderboardMode;
  onMode: (mode: LeaderboardMode) => void;
}) {
  const rows = leaderRows(state, mode);
  return (
    <View style={styles.card} accessibilityLabel="Table leaderboard">
      <View style={styles.lbHead}>
        <View style={styles.rowBetween}>
          <Text accessibilityRole="header" style={[ui(16, 600), { color: colors.foreground }]}>
            Table leaderboard
          </Text>
          <Text style={[ui(12), { color: colors.mutedForeground }]}>Tonight</Text>
        </View>
        <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Leaderboard">
          {LEADERBOARD_TABS.map((t) => {
            const on = t.value === mode;
            return (
              <Pressable
                key={t.value}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                aria-selected={on}
                onPress={() => onMode(t.value)}
                hitSlop={6}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text
                  style={[
                    ui(12, on ? 600 : 500),
                    { color: on ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {rows.map((r) => (
        <View
          key={r.seatId}
          style={[styles.lbRow, r.isYou && styles.lbRowYou]}
          accessible
          accessibilityLabel={`${r.rank}. ${r.handle}, ${r.value}, ${r.detail}`}
        >
          <Text
            style={[
              display(18, 400),
              styles.rank,
              { color: r.rank === 1 ? colors.primary : colors.mutedForeground },
            ]}
          >
            {r.rank}
          </Text>
          <Initials text={r.initials} color={r.color} size={30} />
          <View style={styles.flex}>
            <Text style={[ui(13, 600), { color: colors.foreground }]} numberOfLines={1}>
              {r.handle}
            </Text>
            <Text style={[ui(11), { color: colors.mutedForeground }]}>{r.detail}</Text>
          </View>
          <Text style={[ui(14, 700), { color: colors.correct }]}>{r.value}</Text>
        </View>
      ))}
      <View style={styles.lbFoot}>
        <Text style={[ui(11), { color: colors.mutedForeground }]}>
          {mode === "decisions"
            ? "Ranked by decision accuracy, not chips won."
            : "Ranked by the most rolls in one hand with the dice."}
        </Text>
      </View>
    </View>
  );
}

/** "Table chat": dealer and system lines as pills, players with avatars, quick replies. */
export function TableChat({
  state,
  muted,
  onMute,
  onReport,
  onSay,
  fixedHeight,
}: {
  state: LiveTableState;
  muted: boolean;
  onMute: () => void;
  onReport: () => void;
  onSay: (text: string) => void;
  /** Stacked layouts give the chat a height; beside the table it fills the column. */
  fixedHeight?: number;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<ScrollView>(null);
  const items = chatItems(state, muted);
  const send = () => {
    if (!draft.trim()) return;
    onSay(draft);
    setDraft("");
  };
  const MuteIcon = muted ? Bell : BellOff;
  return (
    <View style={[styles.card, styles.chat, fixedHeight ? { height: fixedHeight } : styles.fill]}>
      <View style={[styles.rowBetween, styles.chatHead]}>
        <Text accessibilityRole="header" style={[ui(16, 600), { color: colors.foreground }]}>
          Table chat
        </Text>
        <View style={styles.icons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={muted ? "Unmute players" : "Mute players"}
            onPress={onMute}
            hitSlop={14}
          >
            <MuteIcon size={16} color={colors.mutedForeground} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report a message"
            onPress={onReport}
            hitSlop={14}
          >
            <Flag size={16} color={colors.mutedForeground} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        ref={scroller}
        style={styles.flex}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        accessibilityLabel="Chat messages"
      >
        {items.map((m) =>
          m.type === "pill" ? (
            <View key={m.id} style={styles.pillRow}>
              <View style={styles.pill}>
                <Text style={[ui(11), styles.centerText, { color: colors.mutedForeground }]}>
                  {m.text}
                </Text>
              </View>
            </View>
          ) : (
            <View key={m.id} style={styles.msg}>
              <Initials text={m.initials} color={m.color} size={26} />
              <View style={[styles.flex, styles.msgText]}>
                <Text
                  style={[
                    ui(12, 600),
                    { color: m.isYou ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {m.handle}
                </Text>
                <Text style={[ui(14, 400, { lineHeight: 20 }), { color: colors.foreground }]}>
                  {m.text}
                </Text>
              </View>
            </View>
          ),
        )}
      </ScrollView>
      <View style={styles.quick}>
        {QUICK_REPLIES.map((q) => (
          <Pressable
            key={q}
            accessibilityRole="button"
            accessibilityLabel={q === "👏" ? "Applause" : q}
            onPress={() => onSay(q)}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [styles.reply, pressed && styles.pressed]}
          >
            <Text style={[ui(12), { color: colors.foreground }]}>{q}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          placeholder="Say something to the table…"
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel="Message the table"
          maxLength={200}
          returnKeyType="send"
          style={[ui(14), styles.input]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={send}
          style={({ pressed }) => [styles.send, pressed && styles.pressed]}
        >
          <Send size={18} color={colors.primaryForeground} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { flex: 1, minHeight: 360 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lbHead: { gap: 10, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 12 },
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: 8,
    backgroundColor: colors.muted,
  },
  tab: { flex: 1, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: colors.card },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lbRowYou: { backgroundColor: surfaces.primaryWash },
  rank: { width: 18 },
  lbFoot: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  chat: {},
  chatHead: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icons: { flexDirection: "row", gap: 12 },
  messages: {
    flexGrow: 1,
    justifyContent: "flex-end",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  pillRow: { flexDirection: "row", justifyContent: "center" },
  pill: {
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    flexShrink: 1,
  },
  centerText: { textAlign: "center" },
  msg: { flexDirection: "row", gap: 10 },
  msgText: { gap: 2 },
  quick: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  reply: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.foreground,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
});
