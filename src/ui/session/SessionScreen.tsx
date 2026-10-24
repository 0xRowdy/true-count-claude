/**
 * The Statistics screen.
 *
 * Five things, in the order a user asks for them: how the Play run in progress is going, how
 * it compares to what a fair Shoe produces, the drill Session drilled most recently, how every
 * run so far adds up, and what the runs were — each labelled Play or by its drill (#27). Plus the control that closes the Session, repeated here so it is reachable from
 * anywhere in the Session rather than only from the felt (ADR-0003).
 *
 * The expectation band on this screen is fed from the Session's own recorded results. It
 * still takes typed input — the panel was built as a calculator so someone could check a
 * Session they played somewhere else, and that is worth keeping — but it opens holding the
 * user's real numbers instead of a placeholder.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import {
  type LoadResult,
  type SessionStats,
  type SessionSummary,
  aggregateStats,
  summarize,
} from "@/state";
import { ReportBugButton } from "@/ui/bug-report/ReportBugButton";
import { Panel } from "@/ui/ds";
import {
  PageHeader,
  SecondaryButton,
  StatCards,
  StatRow,
  TrainerPage,
  text,
  useWide,
} from "@/ui/trainer/kit";
import { ExpectationBandPanel } from "@/ui/shoe-integrity/ExpectationBandPanel";
import { expectationBand } from "@/ui/shoe-integrity/integrity";
import { formatChips, formatNet } from "@/ui/table/format";
import { useDrillSessions } from "@/ui/drills/drillSessionStore";
import {
  LatestDrillPanel,
  SessionControlBar,
  SessionHistoryRow,
  SessionHistoryTable,
  SessionStatsPanel,
} from "./SessionPanels";
import {
  EMPTY_STATS,
  NO_VALUE,
  bettingUnit,
  formatRate,
  formatRatio,
  latestDrillSummary,
  sessionResultFor,
} from "./sessionFormat";
import { loadAllSessions } from "./sessionStore";
import { useSessionOverview } from "./usePlaySession";
import { SessionBackupPanel } from "./SessionBackupPanel";

/** Session history rows rendered at once; "Show older" adds another page. */
const HISTORY_PAGE = 20;

export function SessionScreen() {
  const overview = useSessionOverview();
  // Drill Sessions are written by the drill screens' own store. Its write counter is part of
  // the reload signature, so a drill answer given a moment ago is never missing from here.
  const drillRevision = useDrillSessions((drills) => drills.revision);
  const [summaries, setSummaries] = useState<readonly SessionSummary[]>([]);
  const [unreadable, setUnreadable] = useState<LoadResult["unreadable"]>([]);
  const [lifetime, setLifetime] = useState(EMPTY_STATS);
  const [archiveRevision, setArchiveRevision] = useState(0);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // History grows with every Session ever played; render the newest page, then more on request.
  const [shownCount, setShownCount] = useState(HISTORY_PAGE);
  const shown = summaries.slice(0, shownCount);
  const hidden = summaries.length - shown.length;

  // Reloaded whenever the Session in hand changes identity or closes, which is exactly when
  // the history gains a row or an open run turns into a finished one.
  const signature = `${overview.session?.id ?? ""}:${overview.session?.endedAt ?? ""}:${
    overview.session?.rounds.length ?? 0
  }:${overview.session?.countingSystem ?? ""}:${drillRevision}`;
  const latestDrill = useMemo(() => latestDrillSummary(summaries), [summaries]);

  useEffect(() => {
    let cancelled = false;
    void loadAllSessions().then(
      (all) => {
        if (cancelled) return;
        setSummaries(all.sessions.map(summarize));
        setUnreadable(all.unreadable);
        setLifetime(aggregateStats(all.sessions));
        setHistoryError(null);
      },
      (error: unknown) => {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [signature, archiveRevision]);

  const [wide, onLayout] = useWide(1000);

  const playColumn = (
    <>
      <SessionStatsPanel
        session={overview.session}
        stats={overview.stats}
        title="This Play session"
      />
      <LatestDrillPanel summary={latestDrill} />
      <SessionStatsPanel
        session={null}
        stats={lifetime}
        title="Every session on this device"
        showDrillRecords
      />
    </>
  );
  const bandColumn = <SessionExpectation stats={overview.stats} />;

  return (
    <TrainerPage>
      <PageHeader
        eyebrow="Trainer · Statistics"
        title="Statistics"
        lede={`Everything here is computed from hands you actually played, and every rate is shown next to the counts it was divided from. A rate with nothing to divide reads ${NO_VALUE} — a fresh Session has no accuracy, not 0% accuracy.`}
        actions={
          <>
            {/* No Shoe of its own: the report reads the Session's current Shoe off its log. */}
            <ReportBugButton screen="Statistics" />
            <Link href="/play" style={styles.link}>
              Back to the table →
            </Link>
          </>
        }
      />

      <SessionControlBar
        session={overview.session}
        recording={overview.recording}
        error={overview.error}
        onEnd={() => overview.end()}
        onStartNew={overview.dismiss}
      />

      {/* Every session on this device, at a glance — the Progress page's stat cards. */}
      <StatCards
        cards={[
          {
            label: "Basic Strategy accuracy",
            value: formatRate(lifetime.basicStrategyAccuracy),
            delta: `${formatRatio(lifetime.correctDecisions, lifetime.decisionsMade)} decisions`,
          },
          {
            label: "Counting accuracy",
            value: formatRate(lifetime.countingAccuracy),
            delta: `${formatRatio(lifetime.correctCountChecks, lifetime.countChecks)} checks`,
          },
          {
            label: "Hands played",
            value: String(lifetime.handsPlayed),
            delta: `${summaries.length} session${summaries.length === 1 ? "" : "s"} recorded`,
          },
          {
            label: "Net result",
            value: formatNet(lifetime.netResult),
            delta: "practice chips, all sessions",
            tone: lifetime.netResult > 0 ? "good" : lifetime.netResult < 0 ? "bad" : "neutral",
          },
        ]}
      />

      <View onLayout={onLayout} style={wide ? styles.columns : styles.stack}>
        {/* One tree at every width, so nothing remounts when the layout changes. */}
        <View style={wide ? styles.column : styles.stack}>{playColumn}</View>
        <View style={wide ? styles.column : styles.stack}>{bandColumn}</View>
      </View>

      <Panel
        title="History"
        aside={
          summaries.length > 0
            ? `${summaries.length} session${summaries.length === 1 ? "" : "s"}`
            : undefined
        }
      >
        {historyError ? (
          <>
            <Text accessibilityRole="alert" style={text.warn}>
              Could not load session history: {historyError}. The totals shown may be out of date.
            </Text>
            <SecondaryButton
              label="Reload history"
              onPress={() => setArchiveRevision((revision) => revision + 1)}
            />
          </>
        ) : null}
        {summaries.length === 0 ? (
          <Text style={text.note}>
            No Sessions recorded yet. One opens the first time you deal.
          </Text>
        ) : wide ? (
          <SessionHistoryTable summaries={shown} />
        ) : (
          shown.map((summary) => <SessionHistoryRow key={summary.id} summary={summary} />)
        )}
        {hidden > 0 ? (
          <SecondaryButton
            label={`Show ${Math.min(HISTORY_PAGE, hidden)} older (${hidden} more)`}
            onPress={() => setShownCount((count) => count + HISTORY_PAGE)}
          />
        ) : null}
        {unreadable.length > 0 ? (
          <Text style={text.warn}>
            {unreadable.length} stored record{unreadable.length === 1 ? "" : "s"} could not be read
            and {unreadable.length === 1 ? "is" : "are"} left out of these totals:{" "}
            {unreadable.map((entry) => entry.reason).join("; ")}
          </Text>
        ) : null}
      </Panel>

      <SessionBackupPanel onRestore={() => setArchiveRevision((revision) => revision + 1)} />

      <Text style={styles.footer}>
        History stays on this device unless you export a backup. No account or automatic sync.
      </Text>
    </TrainerPage>
  );
}

/**
 * The expectation band, opened on the Session's real result.
 *
 * The band is quoted in betting units, and the Session is played in chips, so the conversion
 * is shown rather than performed behind the user's back: hands, net chips, the mean stake
 * per hand, and the quotient. `null` hands means there is nothing to place yet, and the
 * panel says so itself.
 */
function SessionExpectation({ stats }: { stats: SessionStats }) {
  const result = useMemo(() => sessionResultFor(stats), [stats]);
  const unit = bettingUnit(stats);

  const [handsText, setHandsText] = useState("");
  const [netUnitsText, setNetUnitsText] = useState("");
  const [overridden, setOverridden] = useState(false);

  const hands = overridden ? handsText : String(result?.hands ?? 0);
  const netUnits = overridden ? netUnitsText : (result?.netUnits ?? 0).toFixed(2);

  const band = useMemo(
    () => expectationBand({ hands: parseNumber(hands), netUnits: parseNumber(netUnits) }),
    [hands, netUnits],
  );

  const override = useCallback(
    (setter: (next: string) => void) => (next: string) => {
      setOverridden(true);
      setter(next);
    },
    [],
  );

  return (
    <View style={styles.group}>
      <Panel title="How the band reads your play">
        <StatRow label="Hands recorded" value={stats.handsPlayed} />
        <StatRow label="Net result" value={formatChips(stats.netResult)} />
        <StatRow label="Mean stake per hand" value={unit === null ? NO_VALUE : formatChips(unit)} />
        <StatRow
          label="Net in betting units"
          value={result === null ? NO_VALUE : result.netUnits.toFixed(2)}
        />
        <Text style={styles.note}>
          The band assumes flat bets, so the unit is your mean stake — doubles included, which makes
          it slightly larger than your opening bet. Spreading your bets with the count moves the
          real expectation, and the band does not model that.
        </Text>
        {overridden ? (
          <View style={styles.controls}>
            <SecondaryButton
              label="Use my recorded play"
              onPress={() => {
                setOverridden(false);
                setHandsText("");
                setNetUnitsText("");
              }}
            />
          </View>
        ) : null}
      </Panel>

      <ExpectationBandPanel
        handsText={hands}
        netUnitsText={netUnits}
        onHandsChange={override(setHandsText)}
        onNetUnitsChange={override(setNetUnitsText)}
        band={band}
      />
    </View>
  );
}

/** Tolerant of an empty or half-typed field: anything unparseable is simply zero. */
function parseNumber(text: string): number {
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : 0;
}

const styles = StyleSheet.create({
  stack: { gap: 24 },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  column: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 24 },
  group: { gap: 24 },
  note: text.note,
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  link: { ...text.link, paddingTop: 0, paddingVertical: 12, paddingHorizontal: 8 },
  footer: { ...text.small, textAlign: "center" },
});
