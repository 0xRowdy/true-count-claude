/**
 * The count rail: the Running Count, the True Count, and the system they are kept in.
 *
 * The hide toggle is the point of the panel, not a nicety. Counting is a skill you practise by
 * keeping the count yourself and checking it afterwards; a count permanently on screen trains
 * reading, not counting. Hiding blanks the numbers and leaves the labels, so the user can see
 * exactly what they are about to be checked against.
 *
 * `countReadout` has already decided whether a True Count exists — it does not for an
 * unbalanced system, and it is undefined with no decks left. This renders the reason rather
 * than a blank cell.
 */

import { StyleSheet, Text, View } from "react-native";
import { COUNTING_SYSTEMS, type CountingSystemId } from "@/engine/counting";
import { NONE_PUBLISHED, unbalancedCountRowsFromReadout } from "@/ui/drills/unbalancedCount";
import { Panel, SegmentedControl, StatRow, type Tone } from "@/ui/primitives";
import { colors, spacing, type } from "@/ui/theme";
import { formatCount } from "./format";
import type { CountReadout, PlayTable } from "./usePlayTable";

const HIDDEN = "• • •";

export type CountVisibility = "shown" | "hidden";

const VISIBILITY_OPTIONS = [
  { value: "shown" as const, label: "Show counts" },
  { value: "hidden" as const, label: "Hide counts" },
];

export function CountPanel({
  readout,
  systemName,
  visibility,
  onChangeVisibility,
}: {
  readout: CountReadout;
  systemName: string;
  visibility: CountVisibility;
  onChangeVisibility: (next: CountVisibility) => void;
}) {
  const shown = visibility === "shown";
  const reveal = (value: string) => (shown ? value : HIDDEN);
  const system = COUNTING_SYSTEMS.find((candidate) => candidate.name === systemName);
  const referenceRows =
    system && readout.pivot !== null ? unbalancedCountRowsFromReadout(system, readout.pivot) : [];

  return (
    <Panel title="Count">
      <SegmentedControl
        options={VISIBILITY_OPTIONS}
        value={visibility}
        onChange={onChangeVisibility}
      />

      <View style={styles.spacer} />

      <StatRow
        label={`Running count · ${systemName}`}
        value={reveal(formatCount(readout.running))}
        tone={shown ? countTone(readout.running) : "neutral"}
      />
      <StatRow
        label="True count"
        value={
          readout.trueCount === null ? (shown ? "—" : HIDDEN) : reveal(formatCount(readout.trueCount))
        }
        tone={shown && readout.trueCount !== null ? countTone(readout.trueCount) : "neutral"}
      />
      {/* #25: an unbalanced system carries a Key Count and a pivot, and they are different
          numbers for different jobs. Each is labelled with what it is, so KO's "-4" and "+4"
          never sit side by side looking like one number stated twice. */}
      {referenceRows.map((row) => (
        <StatRow
          key={row.kind}
          label={row.label}
          value={row.value === null ? NONE_PUBLISHED : reveal(formatCount(row.value))}
        />
      ))}
      {readout.aceSurplusPerDeck !== null ? (
        <StatRow
          label="Ace surplus / deck"
          value={reveal(formatCount(readout.aceSurplusPerDeck))}
          tone={shown ? countTone(readout.aceSurplusPerDeck) : "neutral"}
        />
      ) : null}
      <StatRow label="Decks remaining" value={readout.decksRemaining.toFixed(2)} />

      {readout.trueCountNote ? <Text style={styles.note}>{readout.trueCountNote}</Text> : null}
      {shown ? null : (
        <Text style={styles.note}>
          Counts hidden. Call the count yourself, then show it to check.
        </Text>
      )}
    </Panel>
  );
}

/** A positive count favours the player, a negative one the house. Colour says which. */
function countTone(count: number): Tone {
  if (count > 0) return "good";
  if (count < 0) return "bad";
  return "neutral";
}

export function SystemPanel({
  table,
  onChange,
}: {
  table: PlayTable;
  onChange: (id: CountingSystemId) => void;
}) {
  const options = COUNTING_SYSTEMS.map((system) => ({ value: system.id, label: system.name }));

  return (
    <Panel title="Counting system">
      <SegmentedControl options={options} value={table.system.id} onChange={onChange} />
      <Text style={styles.note}>
        Level {table.system.level} · {table.system.balanced ? "balanced" : "unbalanced"}
        {table.system.usesAceSideCount ? " · needs an ace side count" : ""}
      </Text>
      <Text style={styles.source}>{table.system.source}</Text>
      {/* #26: a switch is recorded on the Session, not deferred like a Rule Set change — a
          system reads the cards and deals none, so the Shoe still replays from its seed. */}
      <Text style={styles.note}>
        Switch whenever you like, mid-hand included: the count is recomputed from every card you
        have seen, the change is written to your Session, and each decision keeps the system it
        was made in.
      </Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  spacer: { height: spacing.xs },
  note: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  source: { ...type.caption, color: colors.textMuted, fontSize: 12, fontStyle: "italic" },
});
