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
 * - **Whether an answer is being recorded is never implicit.** A drill that records says which
 *   Session and offers the one control that ends it; a drill whose results a Session cannot
 *   hold yet says so rather than letting a user assume their practice was saved.
 */

import type { ReactNode } from "react";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { COUNTING_SYSTEMS, type CountingSystem } from "@/engine/counting";
import { type RuleSet, describeRules } from "@/engine/rules";
import { type Session, computeStats } from "@/state";
import type { DrillDefinition } from "@/drills/types";
import {
  ActionButton,
  Badge,
  Panel,
  SecondaryButton,
  SegmentedControl,
  StatRow,
} from "@/ui/primitives";
import { matchingPreset } from "@/ui/rules/presets";
import { colors, spacing, type } from "@/ui/theme";
import { formatRate } from "./drillFormat";

export function DrillHeader({ drill }: { drill: DrillDefinition }) {
  return (
    <Panel>
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">
          {drill.name}
        </Text>
        <View style={styles.headerActions}>
          {/* ReportBugButton: added after #14 merges */}
          <Link href="/drills" style={styles.link}>
            All drills
          </Link>
        </View>
      </View>
      <Text style={styles.body}>{drill.summary}</Text>
      <Text style={styles.graded}>
        Graded against <Text style={styles.strong}>{drill.gradedAgainst}</Text>.
      </Text>
    </Panel>
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
  /** "decisions" or "count checks" — what this drill writes. */
  unit: "decisions" | "count checks";
  error: string | null;
  onEnd: () => void;
}) {
  const stats = session ? computeStats(session) : null;
  const endedStats = ended ? computeStats(ended) : null;
  const count = stats ? (unit === "decisions" ? stats.decisionsMade : stats.countChecks) : 0;
  const rate = stats ? (unit === "decisions" ? stats.basicStrategyAccuracy : stats.countingAccuracy) : null;

  return (
    <Panel>
      <View style={styles.recordRow}>
        <View style={styles.recordStatus}>
          {session ? <Badge label="RECORDING" tone="good" /> : <Badge label="NOT STARTED" tone="neutral" />}
          <Text style={styles.note}>
            {session
              ? `This drill's Session holds ${count} ${count === 1 ? unit.replace(/s$/, "") : unit}${unit === "decisions" ? " (insurance calls included)" : ""}, ${formatRate(rate)} correct, saved on this device. An undone answer is taken back out of it.`
              : `A Session opens on your first answer and is saved on this device. Its ${unit} show on the Statistics screen.`}
          </Text>
        </View>
        <View style={styles.recordControls}>
          <Link href="/session" style={styles.link}>
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
      {ended && endedStats ? (
        <Text style={styles.note}>
          Last Session closed with{" "}
          {unit === "decisions"
            ? `${endedStats.decisionsMade} decisions, ${formatRate(endedStats.basicStrategyAccuracy)} correct`
            : `${endedStats.countChecks} count checks, ${formatRate(endedStats.countingAccuracy)} correct`}
          . It is kept in your history.
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.error}>
          Saving to this device failed: {error}. The drill carries on, but this run may not survive a reload.
        </Text>
      ) : null}
    </Panel>
  );
}

/** For a drill whose results no Session record can hold yet — said, not implied. */
export function NotRecordedPanel({ reason }: { reason: string }) {
  return (
    <Panel>
      <Badge label="NOT RECORDED" tone="info" />
      <Text style={styles.note}>{reason}</Text>
    </Panel>
  );
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
      <Link href="/rules" style={styles.link}>
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
}: {
  current: RuleSet;
  pending: RuleSet;
  onTakeUp: () => void;
}) {
  return (
    <Panel>
      <Badge label="NEW TABLE WAITING" tone="warn" />
      <StatRow label="Drilling now" value={describeRules(current)} />
      <StatRow label="Configured" value={describeRules(pending)} tone="info" />
      <Text style={styles.note}>
        This drill's Session records one table for its whole length, and its shoes are rebuilt from
        that table to prove the log. Drilling a second game inside it would make the hands already
        recorded replay as cards that were never dealt.
      </Text>
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
      <SegmentedControl
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
      {canUndo ? <SecondaryButton label="↶ Undo last answer" onPress={onUndo} /> : null}
      {undone > 0 ? (
        <Text style={styles.note}>
          {undone} answer{undone === 1 ? "" : "s"} undone this run. Undo restores the streak and
          the cards exactly as they were.
        </Text>
      ) : null}
    </View>
  );
}

/** A labelled group inside a panel. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export const drillStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xl },
  column: { gap: spacing.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18, flexShrink: 1 },
  body: { ...type.body, color: colors.text, flexShrink: 1 },
  strong: { fontWeight: "700" },
  mono: { ...type.mono },
  big: { ...type.mono, fontSize: 28, fontWeight: "700", color: colors.text },
  refusal: { ...type.body, color: colors.info, flexShrink: 1 },
  loading: { ...type.body, color: colors.textMuted },
});

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { ...type.title, color: colors.text, flexShrink: 1 },
  body: { ...type.body, color: colors.textMuted, flexShrink: 1 },
  graded: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  strong: { fontWeight: "700", color: colors.text },
  link: { ...type.body, color: colors.accent, minHeight: 44, paddingTop: spacing.sm },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18, flexShrink: 1 },
  error: { ...type.caption, color: colors.danger, lineHeight: 18 },
  recordRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  recordStatus: { flexGrow: 1, flexShrink: 1, flexBasis: 220, gap: spacing.xs },
  recordControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md },
  tableLine: { gap: 0 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  picker: { gap: spacing.xs },
  label: { ...type.caption, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  undo: { gap: spacing.xs, alignItems: "flex-start" },
  section: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
