/**
 * Results vs. expectation — where an ordinary downswing is shown to be ordinary.
 *
 * *"every time I bet higher, the dealer magically gets a blackjack or 20... it appears
 * rigged."* That review is the other half of the rigged-RNG complaint, and no composition
 * table answers it, because the user's objection is not about the cards in the Shoe. It is
 * about their own results.
 *
 * The arithmetic that answers it is small and unintuitive: over 500 flat-bet hands the
 * expected loss is under 3 units, while one standard deviation is over 25. Being 40 units
 * down is inside one and a half standard deviations — the kind of thing that happens in
 * roughly one Session in seven. Shown on a band, that reads as normal. Left unshown, it
 * reads as theft.
 *
 * The figures can be entered by hand, and that is not merely a stopgap from before the
 * Session store existed: it lets a user check a Session they played somewhere else, which is
 * where most of this suspicion is actually formed. When a real Session is passed in, the
 * panel opens holding those numbers instead, says so, and offers the way back.
 */

import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  type ExpectationBand,
  describeExpectation,
  formatUnits,
} from "./integrity";
import { Badge, Panel, SecondaryButton, StatRow } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";

const FRAME_HEIGHT = 72;
/** How far out the axis reaches, in standard deviations either side of expectation. */
const AXIS_REACH = 3.5;

const pct = (value: number): `${number}%` => `${value}%` as `${number}%`;

const VERDICT_TONE = {
  ordinary: "good",
  uncommon: "warn",
  "report-it": "bad",
} as const;

const VERDICT_LABEL = {
  ordinary: "ORDINARY VARIANCE",
  uncommon: "UNCOMMON",
  "report-it": "WORTH REPORTING",
} as const;

export function ExpectationBandPanel({
  handsText,
  netUnitsText,
  onHandsChange,
  onNetUnitsChange,
  band,
  source,
  onUseRecorded,
}: {
  handsText: string;
  netUnitsText: string;
  onHandsChange: (next: string) => void;
  onNetUnitsChange: (next: string) => void;
  band: ExpectationBand;
  /** Where these numbers came from, when it is not simply "you typed them". */
  source?: string;
  /** Offered only once typed numbers have replaced a real Session's own result. */
  onUseRecorded?: () => void;
}) {
  const hasSession = band.hands > 0 && band.sd > 0;

  return (
    <Panel title="Your results vs. expectation">
      <Text style={styles.prose}>
        A losing run feels like evidence. Usually it is arithmetic. Enter a Session and see
        where it falls against what a fair Shoe produces.
      </Text>

      {source ? <Text style={styles.source}>{source}</Text> : null}

      <View style={styles.inputs}>
        <Field
          label="Hands played"
          value={handsText}
          onChangeText={onHandsChange}
          placeholder="500"
        />
        <Field
          label="Net result (units)"
          value={netUnitsText}
          onChangeText={onNetUnitsChange}
          placeholder="-40"
        />
      </View>

      {onUseRecorded ? (
        <View style={styles.controls}>
          <SecondaryButton label="Use my recorded play" onPress={onUseRecorded} />
        </View>
      ) : null}

      {hasSession ? (
        <>
          <View style={styles.badges}>
            <Badge label={VERDICT_LABEL[band.verdict]} tone={VERDICT_TONE[band.verdict]} />
          </View>

          <BandChart band={band} />

          <View>
            <StatRow label="Expected over these hands" value={`${formatUnits(band.expected)} u`} />
            <StatRow label="One standard deviation" value={`${band.sd.toFixed(1)} u`} />
            <StatRow
              label="Your result"
              value={`${formatUnits(band.netUnits)} u`}
              tone={VERDICT_TONE[band.verdict]}
            />
            <StatRow
              label="Distance from expectation"
              value={`${band.z >= 0 ? "+" : "−"}${Math.abs(band.z).toFixed(2)} sd`}
            />
          </View>

          <Text style={styles.verdict}>{describeExpectation(band)}</Text>
        </>
      ) : (
        <Text style={styles.prose}>{describeExpectation(band)}</Text>
      )}

      <Text style={styles.note}>
        Assumes flat bets and Basic Strategy at the table above: a {(band.edgePerHand * 100).toFixed(2)}%
        house edge and {band.sdPerHand.toFixed(2)} units of standard deviation per hand, with a normal
        approximation that is sound past a few dozen hands. Counting and spreading bets moves the
        expectation; this band does not model that.
      </Text>
    </Panel>
  );
}

function BandChart({ band }: { band: ExpectationBand }) {
  const low = band.expected - AXIS_REACH * band.sd;
  const high = band.expected + AXIS_REACH * band.sd;
  const position = (value: number): number =>
    Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));

  const oneSigmaLeft = position(band.expected - band.sd);
  const twoSigmaLeft = position(band.expected - 2 * band.sd);
  const marker = position(band.netUnits);

  return (
    <View style={styles.chartWrapper}>
      <View style={styles.frame}>
        <View
          style={[
            styles.bandTwo,
            { left: pct(twoSigmaLeft), right: pct(twoSigmaLeft) },
          ]}
        />
        <View
          style={[styles.bandOne, { left: pct(oneSigmaLeft), right: pct(oneSigmaLeft) }]}
        />
        <View style={[styles.expectedLine, { left: pct(position(band.expected)) }]} />
        <View
          style={[
            styles.marker,
            { left: pct(marker), backgroundColor: markerColor(band.verdict) },
          ]}
        />
        <Text style={[styles.markerLabel, { left: pct(marker) }]} numberOfLines={1}>
          you
        </Text>
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{`${formatUnits(band.expected - 2 * band.sd)} u`}</Text>
        <Text style={styles.axisLabel}>expected</Text>
        <Text style={styles.axisLabel}>{`${formatUnits(band.expected + 2 * band.sd)} u`}</Text>
      </View>
      <Text style={styles.legend}>
        The wide band is where 95 Sessions in 100 land. The bright band is where 68 of them do.
      </Text>
    </View>
  );
}

function markerColor(verdict: ExpectationBand["verdict"]): string {
  if (verdict === "ordinary") return colors.accent;
  return verdict === "uncommon" ? colors.warning : colors.danger;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        inputMode="numeric"
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  prose: { ...type.body, color: colors.textMuted },
  source: { ...type.caption, color: colors.accent, lineHeight: 18 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  verdict: { ...type.body, color: colors.text },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  inputs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  field: { flexGrow: 1, flexBasis: 140, gap: spacing.xs },
  fieldLabel: { ...type.caption, color: colors.textMuted },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    color: colors.text,
    ...type.mono,
    fontSize: 15,
  },
  chartWrapper: { gap: spacing.xs },
  frame: {
    height: FRAME_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: "hidden",
    position: "relative",
  },
  // The two bands overlap, so the outer one is dimmed to make the inner one read as the
  // brighter of the two — which is what the legend beneath the chart claims.
  bandTwo: {
    position: "absolute",
    top: 14,
    bottom: 14,
    backgroundColor: colors.accentMuted,
    opacity: 0.45,
  },
  bandOne: {
    position: "absolute",
    top: 8,
    bottom: 8,
    backgroundColor: colors.accentMuted,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.accent,
  },
  expectedLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    marginLeft: -0.5,
    backgroundColor: colors.accent,
    opacity: 0.6,
  },
  marker: { position: "absolute", top: 0, bottom: 16, width: 3, marginLeft: -1.5 },
  markerLabel: {
    ...type.caption,
    color: colors.text,
    position: "absolute",
    bottom: 0,
    marginLeft: -12,
    width: 24,
    textAlign: "center",
  },
  axis: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  axisLabel: { ...type.mono, fontSize: 11, color: colors.textMuted },
  legend: { ...type.caption, color: colors.textMuted },
});
