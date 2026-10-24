import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { liveTableSubtitle, occupancyLabel } from "@/games/craps";
import { AppShell } from "@/ui/ds/AppShell";
import { Badge } from "@/ui/ds/Badge";
import { Button } from "@/ui/ds/Button";
import { Chip } from "@/ui/ds/Chip";
import { Sheet } from "@/ui/ds/Sheet";
import { formatMoney } from "@/ui/ds/format";
import { colors, display, radius, ui } from "@/ui/ds/tokens";
import { CrapsFelt } from "./CrapsFelt";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  Lightbulb,
  LogOut,
  Plus,
  Radio,
  UserPlus,
  X,
} from "@/ui/ds/icons";
import { OpenSeat, SeatCard } from "./Seats";
import {
  BET_WINDOW_SECONDS,
  canAddOdds,
  coachHint,
  railLayout,
  rulesSummary,
  timerLabel,
  yourSeat,
} from "./session";
import { Leaderboard, TableChat } from "./SocialColumn";
import { live } from "./theme";
import { RACK_CHIPS, useLiveCraps } from "./useLiveCraps";

const WIDE = 1100;
const NARROW = 640;

const TONE_ACCENT = {
  hint: colors.coachAccent,
  good: colors.correct,
  mistake: colors.mistake,
} as const;

/** "11 Multiplayer Table — Craps" (QEqUW): a practice table with simulated players. */
export function LiveCrapsScreen() {
  const t = useLiveCraps();
  const [width, setWidth] = useState<number | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const wide = width === null || width >= WIDE;
  const narrow = width !== null && width < NARROW;
  const gutter = narrow ? 16 : 32;

  const state = t.table;
  const rail = railLayout(state);
  const you = yourSeat(state);
  const hint = coachHint(state, t.notice);
  const timer =
    t.manual && t.secondsLeft !== null
      ? "Bets close on confirm"
      : timerLabel(t.secondsLeft ?? BET_WINDOW_SECONDS);

  const leave = () => router.replace("/live");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/live"));

  const tableColumn = (
    <View style={styles.tableColumn}>
      <View style={styles.rail}>
        {rail.top.map((s) => (
          <SeatCard key={s.id} state={state} seat={s} />
        ))}
      </View>

      <CrapsFelt state={state} timer={timer} onSpot={t.place} />

      <View style={styles.rail}>
        {rail.bottom.map((s) => (
          <SeatCard key={s.id} state={state} seat={s} />
        ))}
        {rail.openSeats > 0 ? <OpenSeat status={t.status} onInvite={t.invite} /> : null}
      </View>

      <View style={[styles.controls, !wide && styles.controlsWrap]}>
        <View style={styles.chips} role="radiogroup" accessibilityLabel="Chip rack">
          {RACK_CHIPS.map((v) => (
            <Chip key={v} value={v} selected={v === t.chip} onPress={() => t.setChip(v)} />
          ))}
        </View>
        <View
          role="note"
          aria-live="polite"
          accessibilityLabel={`Coach: ${hint.text}`}
          style={[styles.coach, { borderLeftColor: TONE_ACCENT[hint.tone] }]}
        >
          <Lightbulb size={16} color={TONE_ACCENT[hint.tone]} strokeWidth={2} />
          <Text style={[ui(13, 400, { lineHeight: 18 }), styles.flex, { color: colors.ink }]}>
            {hint.text}
          </Text>
        </View>
        <View style={styles.actions}>
          {canAddOdds(state.table) ? (
            <Button
              label="Add odds"
              variant="secondary"
              icon={Plus}
              onPress={t.addOdds}
              style={styles.bigButton}
            />
          ) : null}
          <Button
            label="Confirm bets"
            icon={Check}
            onPress={t.confirm}
            accessibilityHint="Closes betting and rolls the dice"
            style={styles.bigButton}
          />
        </View>
      </View>
    </View>
  );

  const social = (
    <View style={[styles.social, !wide && styles.socialStacked]}>
      <Leaderboard state={state} mode={t.mode} onMode={t.setMode} />
      <TableChat
        state={state}
        muted={t.muted}
        onMute={t.toggleMute}
        onReport={() =>
          t.flash("Nothing to report: the other players are simulated on this device.")
        }
        onSay={t.say}
        fixedHeight={wide ? undefined : 460}
      />
    </View>
  );

  return (
    <AppShell active="live" chips={you.bankroll}>
      <View
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        style={{ marginHorizontal: -gutter, marginTop: narrow ? -20 : -32 }}
      >
        {/* Table head: back, title, live/simulated badges, host and rules, actions. */}
        <View style={[styles.head, { paddingHorizontal: gutter }, narrow && styles.headNarrow]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to live tables"
            onPress={back}
            hitSlop={2}
            style={styles.back}
          >
            <ArrowLeft size={18} color={colors.foreground} strokeWidth={2} />
          </Pressable>
          <View style={styles.titles}>
            <View style={styles.titleRow}>
              <Text
                accessibilityRole="header"
                aria-level={1}
                style={[display(24, 500), { color: colors.foreground }]}
              >
                {state.name}
              </Text>
              <Badge
                label={occupancyLabel(state)}
                icon={Radio}
                tone="correct"
                style={{ backgroundColor: live.liveWash }}
              />
              <Badge label="Practice table · simulated players" icon={Bot} />
            </View>
            <Text style={[ui(13), { color: colors.mutedForeground }]}>
              {liveTableSubtitle(state)}
            </Text>
          </View>
          <View style={[styles.headActions, narrow && styles.headActionsNarrow]}>
            <Button
              label="Invite"
              variant="ghost"
              size="sm"
              icon={UserPlus}
              onPress={t.invite}
              style={styles.headButton}
            />
            <Button
              label="Table rules"
              variant="ghost"
              size="sm"
              icon={BookOpen}
              onPress={() => setRulesOpen(true)}
              style={styles.headButton}
            />
            <Button
              label="Leave table"
              variant="secondary"
              size="sm"
              icon={LogOut}
              onPress={leave}
              style={styles.headButton}
            />
          </View>
        </View>
        {t.status ? (
          <View
            role="status"
            style={[styles.status, { marginHorizontal: gutter }]}
            accessibilityLabel={t.status}
          >
            <Text style={[ui(13, 500), { color: colors.foreground }]}>{t.status}</Text>
          </View>
        ) : null}

        <View style={[styles.body, { paddingHorizontal: gutter }, !wide && styles.bodyStacked]}>
          {tableColumn}
          {social}
        </View>
      </View>

      <Sheet
        visible={rulesOpen}
        onClose={() => setRulesOpen(false)}
        accessibilityLabel="Table rules"
        scrimLabel="Dismiss table rules"
        maxWidth={520}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={[display(22, 500), styles.flex, { color: colors.foreground }]}>
              Table rules
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close table rules"
              onPress={() => setRulesOpen(false)}
              hitSlop={12}
            >
              <X size={20} color={colors.mutedForeground} strokeWidth={2} />
            </Pressable>
          </View>
          {rulesSummary(state).map((line) => (
            <Text
              key={line}
              style={[ui(14, 400, { lineHeight: 20 }), { color: colors.foreground }]}
            >
              {`· ${line}`}
            </Text>
          ))}
          <Text style={[ui(12), { color: colors.mutedForeground }]}>
            {`Your practice bankroll at this table: ${formatMoney(you.bankroll)}`}
          </Text>
        </View>
      </Sheet>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headNarrow: { gap: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  titles: { flex: 1, minWidth: 240, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  headActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  headActionsNarrow: { width: "100%" },
  headButton: { height: 40, paddingHorizontal: 18 },
  status: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  body: { flexDirection: "row", gap: 24, paddingTop: 24 },
  bodyStacked: { flexDirection: "column" },
  tableColumn: { flex: 1, minWidth: 0, gap: 16 },
  rail: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  controlsWrap: { flexWrap: "wrap" },
  chips: { flexDirection: "row", alignItems: "center", gap: 8 },
  coach: {
    flex: 1,
    minWidth: 240,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    backgroundColor: colors.coach,
  },
  actions: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  bigButton: { height: 48 },
  social: { width: 360, gap: 16 },
  socialStacked: { width: "100%" },
  sheet: { gap: 12, paddingTop: 4, paddingHorizontal: 24, paddingBottom: 24 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12 },
});
