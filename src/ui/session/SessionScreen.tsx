/**
 * The Statistics screen.
 *
 * Four things, in the order a user asks for them: how the run in progress is going, how it
 * compares to what a fair Shoe produces, how every run so far adds up, and what the runs
 * were. Plus the control that closes the Session, repeated here so it is reachable from
 * anywhere in the Session rather than only from the felt (ADR-0003).
 *
 * The expectation band on this screen is fed from the Session's own recorded results. It
 * still takes typed input — the panel was built as a calculator so someone could check a
 * Session they played somewhere else, and that is worth keeping — but it opens holding the
 * user's real numbers instead of a placeholder.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { type LoadResult, type SessionStats, type SessionSummary, aggregateStats } from "@/state";
import { ReportBugButton } from "@/ui/bug-report/ReportBugButton";
import { Panel, Screen, SecondaryButton, StatRow } from "@/ui/primitives";
import { ExpectationBandPanel } from "@/ui/shoe-integrity/ExpectationBandPanel";
import { expectationBand } from "@/ui/shoe-integrity/integrity";
import { formatChips } from "@/ui/table/format";
import { colors, spacing, type } from "@/ui/theme";
import {
  SessionControlBar,
  SessionHistoryRow,
  SessionStatsPanel,
} from "./SessionPanels";
import { EMPTY_STATS, NO_VALUE, bettingUnit, sessionResultFor } from "./sessionFormat";
import { listSessionSummaries, loadAllSessions } from "./sessionStore";
import { useSessionOverview } from "./usePlaySession";

export function SessionScreen() {
  const overview = useSessionOverview();
  const [summaries, setSummaries] = useState<readonly SessionSummary[]>([]);
  const [unreadable, setUnreadable] = useState<LoadResult["unreadable"]>([]);
  const [lifetime, setLifetime] = useState(EMPTY_STATS);

  // Reloaded whenever the Session in hand changes identity or closes, which is exactly when
  // the history gains a row or an open run turns into a finished one.
  const signature = `${overview.session?.id ?? ""}:${overview.session?.endedAt ?? ""}:${
    overview.session?.rounds.length ?? 0
  }`;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listSessionSummaries(), loadAllSessions()]).then(([rows, all]) => {
      if (cancelled) return;
      setSummaries(rows);
      setUnreadable(all.unreadable);
      setLifetime(aggregateStats(all.sessions));
    });
    return () => {
      cancelled = true;
    };
  }, [signature]);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      keyboardShouldPersistTaps="handled"
    >
      <Screen>
        <Panel>
          <Text style={styles.title}>Statistics</Text>
          <Text style={styles.lede}>
            Everything here is computed from hands you actually played, and every rate is shown
            next to the counts it was divided from. A rate with nothing to divide reads{" "}
            {NO_VALUE} — a fresh Session has no accuracy, not 0% accuracy.
          </Text>
          <View style={styles.headerActions}>
            <Link href="/play" style={styles.link}>
              Back to the table →
            </Link>
            {/* No Shoe of its own: the report reads the Session's current Shoe off its log. */}
            <ReportBugButton screen="Statistics" />
          </View>
        </Panel>

        <SessionControlBar
          session={overview.session}
          recording={overview.recording}
          error={overview.error}
          onEnd={() => overview.end()}
          onStartNew={overview.dismiss}
        />

        <SessionStatsPanel session={overview.session} stats={overview.stats} />

        <SessionExpectation stats={overview.stats} />

        <SessionStatsPanel session={null} stats={lifetime} title="Every session on this device" />

        <Panel title="History">
          {summaries.length === 0 ? (
            <Text style={styles.note}>
              No Sessions recorded yet. One opens the first time you deal.
            </Text>
          ) : (
            summaries.map((summary) => <SessionHistoryRow key={summary.id} summary={summary} />)
          )}
          {unreadable.length > 0 ? (
            <Text style={styles.warning}>
              {unreadable.length} stored record{unreadable.length === 1 ? "" : "s"} could not be
              read and {unreadable.length === 1 ? "is" : "are"} left out of these totals:{" "}
              {unreadable.map((entry) => entry.reason).join("; ")}
            </Text>
          ) : null}
        </Panel>

        <Text style={styles.footer}>
          All of this lives on this device and nowhere else. No account, no sync, no network
          (ADR-0003).
        </Text>
      </Screen>
    </ScrollView>
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
        <StatRow
          label="Mean stake per hand"
          value={unit === null ? NO_VALUE : formatChips(unit)}
        />
        <StatRow
          label="Net in betting units"
          value={result === null ? NO_VALUE : result.netUnits.toFixed(2)}
        />
        <Text style={styles.note}>
          The band assumes flat bets, so the unit is your mean stake — doubles included, which
          makes it slightly larger than your opening bet. Spreading your bets with the count
          moves the real expectation, and the band does not model that.
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
  page: { flex: 1, backgroundColor: colors.background },
  pageContent: { flexGrow: 1, paddingBottom: spacing.xl },
  group: { gap: spacing.md },
  title: { ...type.title, color: colors.text },
  lede: { ...type.body, color: colors.textMuted },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  warning: { ...type.caption, color: colors.warning, lineHeight: 18 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  link: {
    ...type.body,
    color: colors.accent,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingTop: spacing.sm,
  },
  footer: { ...type.caption, color: colors.textMuted, textAlign: "center" },
});
