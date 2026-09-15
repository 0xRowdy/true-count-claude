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
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import type { DrillId } from "@/drills/types";
import type { Session, SessionStats, SessionSummary } from "@/state";
import { DRILL_HREF } from "@/ui/drills/DrillsHub";
import { ActionButton, Badge, Panel, StatRow } from "@/ui/primitives";
import { formatChips, formatNet } from "@/ui/table/format";
import { colors, spacing, type } from "@/ui/theme";
import {
  NO_VALUE,
  bankrollTopUp,
  bankrollWasReset,
  countingSystemsLine,
  describeEndReason,
  formatDuration,
  formatPerHand,
  formatRate,
  formatRatio,
  recordedAccuracies,
  sessionKindLabel,
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
  showDrillRecords = false,
}: {
  session: Session | null;
  stats: SessionStats;
  title?: string;
  /**
   * Show the True Count and Deviation drill tallies. Off for a Play Session, which never
   * records either; on for totals that include drill Sessions.
   */
  showDrillRecords?: boolean;
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
      {showDrillRecords ? (
        <>
          <StatRow label="True Count accuracy" value={formatRate(stats.trueCountAccuracy)} />
          <StatRow
            label="Conversions correct"
            value={formatRatio(stats.correctConversionChecks, stats.conversionChecks)}
          />
          <StatRow label="Index play accuracy" value={formatRate(stats.indexPlayAccuracy)} />
          <StatRow
            label="Index plays correct"
            value={formatRatio(stats.correctIndexPlays, stats.indexPlays)}
          />
        </>
      ) : null}

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

/**
 * One row of the history list. Enough to recognise a run without opening its log: what kind of
 * Session it was (#27), every Counting System it was kept in (#26), and the accuracy it measured.
 */
export function SessionHistoryRow({ summary }: { summary: SessionSummary }) {
  const { stats } = summary;
  const dealt = summary.mode === "play" || stats.roundsPlayed > 0;
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyHead}>
        <Badge label={sessionKindLabel(summary).toUpperCase()} tone={summary.mode === "play" ? "info" : "neutral"} />
        <Text style={styles.historyTitle}>{formatStartedAt(summary.startedAt)}</Text>
        {summary.active ? <Badge label="OPEN" tone="good" /> : null}
      </View>
      <Text style={styles.note}>
        {countingSystemsLine(summary.countingSystems)} · seed {summary.seed} ·{" "}
        {formatDuration(summary.durationMs)}
      </Text>
      <AccuracyRows stats={stats} drillId={summary.drillId} />
      {dealt ? (
        <>
          <StatRow label="Hands" value={stats.handsPlayed} />
          <StatRow label="Win rate" value={formatRate(stats.winRate)} />
          <StatRow
            label="Net"
            value={formatNet(stats.netResult)}
            tone={stats.netResult > 0 ? "good" : stats.netResult < 0 ? "bad" : "neutral"}
          />
        </>
      ) : null}
    </View>
  );
}

/** Each accuracy the Session holds records for, as a rate beside the counts behind it. */
function AccuracyRows({ stats, drillId }: { stats: SessionStats; drillId: string | null }) {
  return (
    <>
      {recordedAccuracies(stats, drillId).map((line) => (
        <StatRow
          key={line.label}
          label={line.label}
          value={
            line.total === 0
              ? NO_VALUE
              : `${formatRate(line.rate)} (${formatRatio(line.correct, line.total)})`
          }
        />
      ))}
    </>
  );
}

/**
 * The drill Session drilled in most recently (#27). The "This Play session" panel above it only
 * ever holds the Play table's Session, because drill Sessions never take the active pointer —
 * so without this, drill results would reach the screen only as part of the lifetime totals.
 */
export function LatestDrillPanel({ summary }: { summary: SessionSummary | null }) {
  if (!summary) {
    return (
      <Panel title="Latest drill session">
        <Text style={styles.note}>
          No drill Session yet. Every drill records its answers — the first one opens a Session.
        </Text>
        <Link href="/drills" style={styles.link}>
          Go to the drills →
        </Link>
      </Panel>
    );
  }

  const href = DRILL_HREF[summary.drillId as DrillId] ?? "/drills";
  return (
    <Panel title="Latest drill session">
      <View style={styles.historyHead}>
        <Badge label={sessionKindLabel(summary).toUpperCase()} tone="neutral" />
        {summary.active ? <Badge label="OPEN" tone="good" /> : <Badge label="ENDED" tone="warn" />}
      </View>
      <Text style={styles.note}>
        {countingSystemsLine(summary.countingSystems)} · last answer{" "}
        {formatStartedAt(summary.lastActivityAt)} · seed {summary.seed}
      </Text>
      <AccuracyRows stats={summary.stats} drillId={summary.drillId} />
      {summary.stats.roundsPlayed > 0 ? (
        <StatRow label="Hands dealt" value={summary.stats.handsPlayed} />
      ) : null}
      <Text style={styles.note}>
        {summary.active
          ? "Still open: it picks up where you left off, and only its own End session button closes it."
          : `${describeEndReason({ endReason: summary.endReason })}. It is kept in your history.`}
      </Text>
      <Link href={href} style={styles.link}>
        {summary.active ? "Carry on drilling →" : "Drill again →"}
      </Link>
    </Panel>
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
  link: { ...type.body, color: colors.accent, minHeight: 44, paddingTop: spacing.sm },
});
