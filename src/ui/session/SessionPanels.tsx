/**
 * The Session's user-facing surfaces: the control bar, the statistics, and the summary a
 * finished Session leaves behind.
 *
 * Two things here are product requirements rather than layout choices:
 *
 * 1. **Ending a Session is one tap, and the control is on every screen the Session reaches.**
 *    The incumbent's most detailed negative review is about game sessions that would not
 *    close reliably (ADR-0003). There is no confirmation dialogue, because a confirmation is
 *    a second action and the promise is that ending takes one — `endSession` is idempotent,
 *    so a double tap is harmless, and starting the next Session is also one tap.
 * 2. **A statistic with no denominator renders as an em dash.** A fresh Session has no
 *    accuracy; it does not have 0% accuracy. See `sessionFormat.ts`.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Session, SessionStats, SessionSummary } from "@/state";
import { ActionButton, Badge, Panel, StatRow } from "@/ui/primitives";
import { formatChips, formatNet } from "@/ui/table/format";
import { colors, spacing, type } from "@/ui/theme";
import {
  NO_VALUE,
  bankrollTopUp,
  bankrollWasReset,
  describeEndReason,
  formatDuration,
  formatPerHand,
  formatRate,
  formatRatio,
} from "./sessionFormat";

/**
 * The Session's always-present header: whether play is being recorded, and the one control
 * that ends it. Rendered at the top of both the Play table and the Statistics screen, which
 * is what "reachable from anywhere in the session" means in practice.
 */
export function SessionControlBar({
  session,
  recording,
  error,
  onEnd,
  onStartNew,
  children,
}: {
  session: Session | null;
  recording: boolean;
  error: string | null;
  onEnd: () => void;
  onStartNew: () => void;
  children?: ReactNode;
}) {
  return (
    <Panel>
      <View style={styles.bar}>
        <View style={styles.status}>
          {recording ? (
            <Badge label="RECORDING" tone="good" />
          ) : session ? (
            <Badge label="SESSION ENDED" tone="warn" />
          ) : (
            <Badge label="NOT STARTED" tone="neutral" />
          )}
          <Text style={styles.note}>
            {recording
              ? "Every hand and every decision is being written to this device. Nothing leaves it."
              : session
                ? describeEndReason(session)
                : "A Session opens on your first deal."}
          </Text>
        </View>

        <View style={styles.controls}>
          {children}
          {recording ? (
            <ActionButton
              label="End session"
              tone="warn"
              accessibilityHint="Close this Session now and keep its statistics. This is the only thing that ends it."
              onPress={onEnd}
            />
          ) : session ? (
            <ActionButton
              label="Start a new session"
              tone="good"
              accessibilityHint="Open a fresh Session at a new shoe and a full bankroll."
              onPress={onStartNew}
            />
          ) : null}
        </View>
      </View>

      {error ? (
        <Text style={styles.error}>
          Saving to this device failed: {error}. Play carries on, but this run may not survive
          a reload.
        </Text>
      ) : null}
    </Panel>
  );
}

/**
 * The aggregate statistics, each shown next to the counts it was divided from so a user who
 * doubts a number can recheck it by hand — the same discipline `src/state/stats.ts` applies
 * to computing them (invariant 4, and "wrong math" being 21% of the category's complaints).
 */
export function SessionStatsPanel({
  session,
  stats,
  title = "This session",
}: {
  session: Session | null;
  stats: SessionStats;
  title?: string;
}) {
  const topUp = session ? bankrollTopUp(session, stats) : 0;
  const reset = session ? bankrollWasReset(session, stats) : false;

  return (
    <Panel title={title}>
      <StatRow label="Rounds played" value={stats.roundsPlayed} />
      <StatRow label="Hands played" value={stats.handsPlayed} />

      <View style={styles.divider} />

      <StatRow label="Basic Strategy accuracy" value={formatRate(stats.basicStrategyAccuracy)} />
      <StatRow
        label="Decisions correct"
        value={formatRatio(stats.correctDecisions, stats.decisionsMade)}
      />
      <StatRow label="Counting accuracy" value={formatRate(stats.countingAccuracy)} />
      <StatRow
        label="Count checks correct"
        value={formatRatio(stats.correctCountChecks, stats.countChecks)}
      />

      <View style={styles.divider} />

      <StatRow label="Win rate" value={formatRate(stats.winRate)} />
      <StatRow
        label="Wins"
        value={formatRatio(stats.wins + stats.blackjacks, stats.handsPlayed)}
      />
      <StatRow label="Bust rate" value={formatRate(stats.bustRate)} />
      <StatRow label="Busts" value={formatRatio(stats.busts, stats.handsPlayed)} />
      <StatRow label="Pushes" value={stats.pushes} />
      <StatRow label="Surrenders" value={stats.surrenders} />

      <View style={styles.divider} />

      <StatRow
        label="Net result"
        value={formatNet(stats.netResult)}
        tone={stats.netResult > 0 ? "good" : stats.netResult < 0 ? "bad" : "neutral"}
      />
      <StatRow label="Per hand" value={formatPerHand(stats.netPerHand)} />
      <StatRow label="Total staked" value={formatChips(stats.wagered)} />
      {session ? <StatRow label="Bankroll" value={formatChips(session.bankroll)} /> : null}

      {stats.decisionsMade === 0 ? (
        <Text style={styles.note}>
          {NO_VALUE} means there is nothing to divide yet, not a score of zero. A rate appears
          the moment it has a denominator.
        </Text>
      ) : null}

      {reset ? (
        <Text style={styles.note}>
          The bankroll has been topped up by {formatChips(topUp)} since this Session began, so
          it no longer matches the net result. Both numbers are true: every chip lost is still
          in the net, because going broke is the most instructive thing in a training log.
        </Text>
      ) : null}
    </Panel>
  );
}

/** What a Session looks like once it is closed. The statistics stay; the run does not resume. */
export function SessionEndedPanel({
  session,
  stats,
  onStartNew,
}: {
  session: Session;
  stats: SessionStats;
  onStartNew: () => void;
}) {
  const duration = session.endedAt === null ? null : session.endedAt - session.startedAt;

  return (
    <Panel title="Session closed">
      <Text style={styles.note}>
        {describeEndReason(session)} after {formatDuration(duration)}, across{" "}
        {stats.roundsPlayed} rounds. It is saved on this device and will not reopen — start a
        new one whenever you like.
      </Text>
      <StatRow label="Seed" value={session.seed} />
      <StatRow label="Shoes dealt" value={session.shoes.length} />
      <StatRow label="Basic Strategy accuracy" value={formatRate(stats.basicStrategyAccuracy)} />
      <StatRow
        label="Net result"
        value={formatNet(stats.netResult)}
        tone={stats.netResult > 0 ? "good" : stats.netResult < 0 ? "bad" : "neutral"}
      />
      <View style={styles.controls}>
        <ActionButton
          label="Start a new session"
          tone="good"
          accessibilityHint="Open a fresh Session at a new shoe and a full bankroll."
          onPress={onStartNew}
        />
      </View>
    </Panel>
  );
}

/** One row of the history list. Enough to recognise a run without opening its log. */
export function SessionHistoryRow({ summary }: { summary: SessionSummary }) {
  const { stats } = summary;
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyHead}>
        <Text style={styles.historyTitle}>{formatStartedAt(summary.startedAt)}</Text>
        {summary.active ? <Badge label="OPEN" tone="good" /> : null}
      </View>
      <Text style={styles.note}>
        {summary.countingSystem} · seed {summary.seed} · {formatDuration(summary.durationMs)}
      </Text>
      <StatRow label="Hands" value={stats.handsPlayed} />
      <StatRow label="Basic Strategy accuracy" value={formatRate(stats.basicStrategyAccuracy)} />
      <StatRow label="Win rate" value={formatRate(stats.winRate)} />
      <StatRow
        label="Net"
        value={formatNet(stats.netResult)}
        tone={stats.netResult > 0 ? "good" : stats.netResult < 0 ? "bad" : "neutral"}
      />
    </View>
  );
}

/**
 * A local, human-readable timestamp. `toLocaleString` differs between the prerendered page
 * and the browser, so this is only ever rendered from data loaded in the browser.
 */
function formatStartedAt(at: number): string {
  return new Date(at).toLocaleString();
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  status: { flexGrow: 1, flexShrink: 1, flexBasis: 220, gap: spacing.xs },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  note: { ...type.caption, color: colors.textMuted, flexShrink: 1, lineHeight: 18 },
  error: { ...type.caption, color: colors.danger, lineHeight: 18 },
  historyRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  historyHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  historyTitle: { ...type.body, color: colors.text, fontWeight: "600" },
});
