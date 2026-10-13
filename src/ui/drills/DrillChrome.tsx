/**
 * The furniture every drill screen shares: its header, what it is recording into, the table
 * it is dealt at, and the undo control.
 *
 * Two promises are kept here so no single drill can forget them:
 *
 * - **The user is told what a verdict is measured against** before the first answer
 *   (`DrillDefinition.gradedAgainst`). "Scored against Basic Strategy" and "scored against the
 *   Illustrious 18" disagree on purpose, and a trainer that hides which it is using is the
 *   "wrong math" complaint waiting to happen.
 * - **Whether an answer is being recorded is never implicit.** Every drill records (#27), and
 *   each says which Session, what it holds, and offers the one control that ends it.
 */

import type { ReactNode } from "react";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Undo2 from "lucide-react-native/icons/undo-2";
import { COUNTING_SYSTEMS, type CountingSystem } from "@/engine/counting";
import { type RuleSet, describeRules } from "@/engine/rules";
import { type Session, type SessionStats, computeStats } from "@/state";
import type { DrillDefinition } from "@/drills/types";
import { ReportBugButton, type ReportBugButtonProps } from "@/ui/bug-report/ReportBugButton";
import { colors, display, ui } from "@/ui/ds";
import { matchingPreset } from "@/ui/rules/presets";
import {
  ActionButton,
  Choice,
  Group,
  PageHeader,
  Panel,
  SecondaryButton,
  StatRow,
  ToneBadge,
  text,
} from "@/ui/trainer/kit";
import { formatRate } from "./drillFormat";

/**
 * What a drill knows about the situation on screen, for its bug report: the shoe it deals
 * from, its run seed, the rules and system. The more a screen passes, the closer the report
 * comes to a reproduction rather than a description.
 */
export type DrillReport = Omit<ReportBugButtonProps, "screen" | "includeSession" | "label">;

export function DrillHeader({ drill, report }: { drill: DrillDefinition; report?: DrillReport }) {
  return (
    <PageHeader
      eyebrow="Trainer · Drill"
      title={drill.name}
      lede={
        <>
          {drill.summary} Graded against <Text style={text.strong}>{drill.gradedAgainst}</Text>.
        </>
      }
      actions={
        <>
          {/* Drill Sessions never hold the active pointer, so the open Session in the store is
              the Play table's and does not belong in a drill's report. */}
          <ReportBugButton
            screen={`${drill.name} drill`}
            includeSession={false}
            {...report}
            details={{ drill: drill.id, ...report?.details }}
          />
          <Link href="/drills" style={styles.headLink}>
            All drills
          </Link>
        </>
      }
    />
  );
}

/** What the run is recording into, and the explicit end. */
export function RecordingPanel({
  session,
  ended,
  unit,
  error,
  onEnd,
}: {
  session: Session | null;
  ended: Session | null;
  /** What this drill writes: "decisions", "count checks", "conversions" or "index plays". */
  unit: RecordedUnit;
  error: string | null;
  onEnd: () => void;
}) {
  const tally = session ? unitTally(computeStats(session), unit) : null;
  const endedTally = ended ? unitTally(computeStats(ended), unit) : null;
  const count = tally?.count ?? 0;

  return (
    <Panel>
      <View style={styles.recordRow}>
        <View style={styles.recordStatus}>
          {session ? (
            <ToneBadge label="Recording" tone="good" />
          ) : (
            <ToneBadge label="Not started" tone="neutral" />
          )}
          <Text style={styles.note}>
            {session
              ? `This drill's Session holds ${count} ${count === 1 ? unit.replace(/s$/, "") : unit}${unit === "decisions" ? " (insurance calls included)" : ""}, ${formatRate(tally?.rate ?? null)} correct, saved on this device. An undone answer is taken back out of it.`
              : `A Session opens on your first answer and is saved on this device. Its ${unit} show on the Statistics screen.`}
          </Text>
        </View>
        <View style={styles.recordControls}>
          <Link href="/session" style={text.link}>
            Statistics
          </Link>
          {session ? (
            <ActionButton
              label="End session"
              tone="warn"
              accessibilityHint="Close this drill's Session and keep its record. The next answer opens a new one."
              onPress={onEnd}
            />
          ) : null}
        </View>
      </View>
      {ended && endedTally ? (
        <Text style={styles.note}>
          Last Session closed with {endedTally.count}{" "}
          {endedTally.count === 1 ? unit.replace(/s$/, "") : unit}, {formatRate(endedTally.rate)}{" "}
          correct. It is kept in your history.
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.error}>
          Saving to this device failed: {error}. The drill carries on, but this run may not survive
          a reload.
        </Text>
      ) : null}
    </Panel>
  );
}

/** The record a drill writes into its Session, in the words the recording panel uses. */
export type RecordedUnit = "decisions" | "count checks" | "conversions" | "index plays";

/** How many of a drill's records a Session holds, and the share of them that were correct. */
export function unitTally(
  stats: SessionStats,
  unit: RecordedUnit,
): { readonly count: number; readonly rate: number | null } {
  switch (unit) {
    case "decisions":
      return { count: stats.decisionsMade, rate: stats.basicStrategyAccuracy };
    case "count checks":
      return { count: stats.countChecks, rate: stats.countingAccuracy };
    case "conversions":
      return { count: stats.conversionChecks, rate: stats.trueCountAccuracy };
    case "index plays":
      return { count: stats.indexPlays, rate: stats.indexPlayAccuracy };
  }
}

/** The table this drill is dealt at, named on the surface that deals it (#19). */
export function TableLine({ rules }: { rules: RuleSet }) {
  const preset = matchingPreset(rules);
  return (
    <View style={styles.tableLine}>
      <Text style={styles.note}>
        {preset ? `${preset.name} · ` : ""}
        {describeRules(rules)}
      </Text>
      <Link href="/rules" style={styles.inlineLink}>
        Change your table
      </Link>
    </View>
  );
}

/**
 * A configured table the run has not taken up, and why. A change the drill silently ignored
 * would make the Rule Set screen's chart disagree with the drill's grading.
 */
export function PendingTablePanel({
  current,
  pending,
  onTakeUp,
  reason = "This drill's Session records one table for its whole length, and its shoes are rebuilt from that table to prove the log. Drilling a second game inside it would make the hands already recorded replay as cards that were never dealt.",
}: {
  current: RuleSet;
  pending: RuleSet;
  onTakeUp: () => void;
  /** Why this drill's Session cannot take a second table. Defaults to the dealt drills' reason. */
  reason?: string;
}) {
  return (
    <Panel>
      <ToneBadge label="New table waiting" tone="warn" />
      <StatRow label="Drilling now" value={describeRules(current)} />
      <StatRow label="Configured" value={describeRules(pending)} tone="info" />
      <Text style={styles.note}>{reason}</Text>
      <View style={styles.actions}>
        <ActionButton
          label="End session and drill the new table"
          tone="info"
          accessibilityHint="Close this Session, keep its record, and start again at your configured table."
          onPress={onTakeUp}
        />
      </View>
    </Panel>
  );
}

export function SystemPicker({
  value,
  onChange,
  note,
  systems = COUNTING_SYSTEMS,
}: {
  value: CountingSystem;
  onChange: (system: CountingSystem) => void;
  note?: string | null;
  systems?: readonly CountingSystem[];
}) {
  return (
    <View style={styles.picker}>
      <Text style={styles.label}>Counting system</Text>
      <Choice
        accessibilityLabel="Counting system"
        options={systems.map((system) => ({ value: system.id, label: system.name }))}
        value={value.id}
        onChange={(id) => {
          const system = systems.find((candidate) => candidate.id === id);
          if (system) onChange(system);
        }}
      />
      <Text style={styles.note}>
        Level {value.level} · {value.balanced ? "balanced" : "unbalanced"}
        {note ? ` · ${note}` : ""}
      </Text>
    </View>
  );
}

/** Undo the last graded answer. Only rendered when there is one to take back. */
export function UndoControl({
  canUndo,
  onUndo,
  undone,
}: {
  canUndo: boolean;
  onUndo: () => void;
  undone: number;
}) {
  if (!canUndo && undone === 0) return null;
  return (
    <View style={styles.undo}>
      {canUndo ? <SecondaryButton label="Undo last answer" icon={Undo2} onPress={onUndo} /> : null}
      {undone > 0 ? (
        <Text style={styles.note}>
          {undone} answer{undone === 1 ? "" : "s"} undone this run. Undo restores the streak and the
          cards exactly as they were.
        </Text>
      ) : null}
    </View>
  );
}

/** A labelled group inside a panel. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Group title={title}>{children}</Group>;
}

export const drillStyles = StyleSheet.create({
  column: { gap: 24 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  note: text.note,
  body: text.body,
  strong: text.strong,
  mono: { fontVariant: ["tabular-nums"] },
  big: { ...display(40, 500), fontVariant: ["tabular-nums"], color: colors.foreground },
  refusal: { ...ui(15, 400, { lineHeight: 22 }), color: colors.foreground, flexShrink: 1 },
  loading: text.bodyMuted,
});

const styles = StyleSheet.create({
  headLink: { ...ui(14, 600), color: colors.primary, paddingVertical: 12, paddingHorizontal: 8 },
  inlineLink: { ...ui(13, 600), color: colors.primary, paddingVertical: 12 },
  note: text.note,
  error: text.bad,
  recordRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  recordStatus: { flexGrow: 1, flexShrink: 1, flexBasis: 220, gap: 8 },
  recordControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 },
  tableLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  picker: { gap: 8 },
  label: text.overline,
  undo: { gap: 6, alignItems: "flex-start" },
});
