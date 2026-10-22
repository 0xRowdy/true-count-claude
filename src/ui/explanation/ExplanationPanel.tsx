/**
 * The Explanation panel — the why behind a verdict (#8, ADR-0005).
 *
 * This is the product, not a feature of it. The largest product complaint in the category is
 * a verdict with no reason:
 *
 *   > "They tell you if your move is right or wrong, but they don't tell you why. So all it's
 *   > doing is teaching you to memorize the card combinations, not actually think through the
 *   > game."
 *
 * So for any graded Decision this panel answers four questions, in the order a player asks
 * them, and it answers them as fully for a right answer as for a wrong one (invariant 2):
 *
 *  1. **How close was the call?** The EV of every legal action for this exact hand, rules and
 *     count, with the gap to the best drawn to a fixed scale.
 *  2. **Which chart cell says so?** The governing cell, lit up inside its chart.
 *  3. **What did the count do?** The True Count with its division shown, the index that covers
 *     the hand, and the signed distance between them — or the honest reason there is none.
 *  4. **What would have to change** for the other answer to be right.
 *
 * It renders; it never decides. Everything on screen is a field of the `DecisionExplanation`
 * or `InsuranceExplanation` it is handed, put into words by `explanationFormat.ts`. And it
 * carries the graded hand's own snapshot, so it can stay on screen after the round has moved —
 * a split, a bust, a settlement — which is what invariant 3 needs from it.
 *
 * The props take the Explanation and, optionally, the verdict — nothing drill-specific. A
 * drill's `DecisionResult` satisfies `ExplanationVerdict` as it stands:
 *
 *   <ExplanationPanel explanation={result.explanation} verdict={result} />
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Card } from "@/engine/cards";
import { upcardOf } from "@/engine/strategy";
import type {
  CountContext,
  DecisionExplanation,
  HandSnapshot,
  InsuranceExplanation,
} from "@/drills/explanation";
import { CoachNote, type CoachVariant, colors, radius, ui, surfaces, Panel } from "@/ui/ds";
import { upcardLabel } from "@/ui/rules/chartChanges";
import { CardFan } from "@/ui/trainer/Felt";
import { Group, text } from "@/ui/trainer/kit";
import { EvLadder, TONE_COLOR } from "./EvLadder";
import { GoverningCellChart } from "./GoverningCellChart";
import { IndexScale } from "./IndexScale";
import {
  type ExplanationVerdict,
  type IndexView,
  type TierTone,
  type VerdictView,
  closeness,
  countView,
  dealerOddsView,
  decisionVerdict,
  evRows,
  handContext,
  handTitle,
  indexView,
  insuranceVerdict,
  insuranceView,
  insuranceWhatWouldChange,
  whatWouldChange,
} from "./explanationFormat";

export type { ExplanationVerdict } from "./explanationFormat";

export interface ExplanationPanelProps {
  /** A playing decision's or an insurance decision's Explanation, exactly as the drills module built it. */
  readonly explanation: DecisionExplanation | InsuranceExplanation;
  /**
   * What the user did and what it was graded against. Omit it to explain a decision that has
   * not been made yet — a hint reads the same, minus the verdict line.
   */
  readonly verdict?: ExplanationVerdict | null;
  /** Panel heading. Defaults to "Why". */
  readonly title?: string;
  /**
   * Draw the graded hand's own cards at the top. Defaults to true: the snapshot is what keeps
   * the explanation readable after the round on the table has moved on.
   */
  readonly showHand?: boolean;
  /**
   * Anything the host screen wants directly under the heading — a picker between several
   * decisions, a "next question" button. The panel itself stays drill-agnostic.
   */
  readonly accessory?: ReactNode;
}

/** Renders either kind of Explanation. */
export function ExplanationPanel(props: ExplanationPanelProps) {
  const { explanation, ...rest } = props;
  return explanation.kind === "decision" ? (
    <DecisionExplanationPanel explanation={explanation} {...rest} />
  ) : (
    <InsuranceExplanationPanel explanation={explanation} {...rest} />
  );
}

// ---------------------------------------------------------------------------
// Playing decisions
// ---------------------------------------------------------------------------

export function DecisionExplanationPanel({
  explanation,
  verdict = null,
  title = "Why",
  showHand = true,
  accessory = null,
}: Omit<ExplanationPanelProps, "explanation"> & { readonly explanation: DecisionExplanation }) {
  const rows = evRows(explanation, verdict);
  const close = closeness(explanation);
  const dealer = dealerOddsView(explanation);
  const index = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);
  const change = whatWouldChange(explanation, verdict);
  const context = handContext(explanation);

  return (
    <Panel title={title}>
      {accessory}
      {showHand ? (
        <HandHeader
          title={handTitle(explanation)}
          context={context}
          hand={explanation.hand}
          upcard={explanation.hand.dealerUpcard}
        />
      ) : (
        <Text style={styles.handTitle}>{handTitle(explanation)}</Text>
      )}

      {verdict ? <VerdictBox view={decisionVerdict(explanation, verdict)} /> : null}

      <Section
        title="Every legal action"
        subtitle="Estimated result per bet, using the unseen cards"
      >
        {rows.length > 0 ? (
          <>
            {close ? (
              <Text style={[styles.lead, { color: TONE_COLOR[toneOf(close.tier)] }]}>
                {close.text}
              </Text>
            ) : null}
            <EvLadder rows={rows} />
            {dealer ? (
              <Text style={styles.note}>
                Dealer showing {upcardLabel(upcardOf(explanation.hand.dealerUpcard))}: busts{" "}
                {dealer.bust}
                {dealer.blackjack ? ` · blackjack ${dealer.blackjack}` : ""}
                {" · "}
                {dealer.totals.map((entry) => `${entry.total}: ${entry.text}`).join(" · ")}
              </Text>
            ) : null}
            <Text style={styles.note}>
              +1.000 wins a whole bet, -1.000 loses it. Doubling risks two bets, so it can reach ±2.
            </Text>
            <Text style={styles.note}>
              These are estimates. Dealer odds stay fixed while player draws are explored; split
              continuations approximate card depletion and assume enough chips for later doubles and
              resplits. Close EV rankings can differ from the published chart.
            </Text>
          </>
        ) : (
          // An honest gap, not a blank: say why there are no numbers.
          <Text style={styles.body}>
            {explanation.evNote ?? "No expected values for this hand."}
          </Text>
        )}
      </Section>

      <Section title="The chart cell">
        <GoverningCellChart explanation={explanation} />
      </Section>

      <Section title="The count">
        <CountBlock count={explanation.count} />
        <IndexBlock view={index} />
      </Section>

      <Section title="What would have to change">
        <Bullets lines={change.lines} />
      </Section>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Insurance
// ---------------------------------------------------------------------------

export function InsuranceExplanationPanel({
  explanation,
  verdict = null,
  title = "Why",
  showHand = true,
  accessory = null,
}: Omit<ExplanationPanelProps, "explanation"> & { readonly explanation: InsuranceExplanation }) {
  const view = insuranceView(explanation);
  const index = indexView(explanation.index, explanation.count, explanation.basicStrategyAction);

  return (
    <Panel title={title}>
      {accessory}
      {showHand && explanation.hand ? (
        <HandHeader
          title={`Insurance against a dealer ${upcardLabel(upcardOf(explanation.dealerUpcard))}`}
          context={null}
          hand={explanation.hand}
          upcard={explanation.dealerUpcard}
        />
      ) : (
        <Text style={styles.handTitle}>Insurance against a dealer ace</Text>
      )}

      {verdict ? <VerdictBox view={insuranceVerdict(explanation, verdict)} /> : null}

      <Section title="Is it a good bet?" subtitle="Insurance is a bet on tens, not on your hand">
        {view.densityP !== null && view.density ? (
          <>
            <DensityBar density={view.densityP} breakEven={view.breakEvenP} />
            <Text style={styles.body}>{view.density}</Text>
            {view.evLine ? <Text style={styles.body}>{view.evLine}</Text> : null}
          </>
        ) : (
          <Text style={styles.body}>
            {explanation.evNote ?? "No composition to price this bet."}
          </Text>
        )}
        <Text style={styles.note}>Basic Strategy never insures, at any count.</Text>
      </Section>

      <Section title="The count">
        <CountBlock count={explanation.count} />
        <IndexBlock view={index} />
      </Section>

      <Section title="What would have to change">
        <Bullets lines={insuranceWhatWouldChange(explanation)} />
      </Section>
    </Panel>
  );
}

function DensityBar({ density, breakEven }: { density: number; breakEven: number }) {
  // Drawn over 0-50% tens: everything interesting happens either side of one in three.
  const SPAN = 0.5;
  const at = (p: number) => `${Math.min(1, p / SPAN) * 100}%` as const;
  const over = density > breakEven;
  return (
    <View
      accessible
      accessibilityLabel={`Ten density ${(density * 100).toFixed(1)} percent against a break-even of ${(
        breakEven * 100
      ).toFixed(1)} percent`}
      style={styles.densityWrap}
    >
      <View style={styles.densityTrack}>
        <View
          style={[
            styles.densityFill,
            { width: at(density), backgroundColor: over ? colors.correct : colors.mutedForeground },
          ]}
        />
        <View style={[styles.breakEvenTick, { left: at(breakEven) }]} />
      </View>
      <View style={styles.densityLabels}>
        <Text style={styles.tickText}>0%</Text>
        <Text style={[styles.tickText, { color: colors.primary }]}>break-even 1 in 3</Text>
        <Text style={styles.tickText}>50%</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared blocks
// ---------------------------------------------------------------------------

function HandHeader({
  title,
  context,
  hand,
  upcard,
}: {
  title: string;
  context: string | null;
  hand: HandSnapshot;
  upcard: Card;
}) {
  return (
    <View style={styles.handHeader}>
      <View style={styles.handTitleRow}>
        <Text style={styles.handTitle}>{title}</Text>
        {context ? <Text style={styles.note}>{context}</Text> : null}
      </View>
      <View style={styles.hands}>
        <View style={styles.seat}>
          <Text style={styles.seatLabel}>You</Text>
          <CardFan cards={hand.playerCards} size="sm" />
        </View>
        <Text style={styles.versus}>vs</Text>
        <View style={styles.seat}>
          <Text style={styles.seatLabel}>Dealer</Text>
          <CardFan cards={[upcard]} size="sm" />
        </View>
      </View>
    </View>
  );
}

/**
 * The verdict as the dealer's coach note (the design's Coach Note, p3Ojh3), toned as the verdict
 * is: a good call in green, a near-tie or close miss as the blue information note — a coin flip
 * is information, not a blunder — and a clear mistake in orange. Then what it cost and what it
 * was graded against.
 */
const VERDICT_NOTE: Readonly<Record<TierTone, { variant: CoachVariant; kind: string }>> = {
  good: { variant: "good", kind: "Good call" },
  info: { variant: "hint", kind: "Close call" },
  warn: { variant: "hint", kind: "Close call" },
  bad: { variant: "mistake", kind: "Here is the miss" },
};

function VerdictBox({ view }: { view: VerdictView }) {
  const body = [view.detail, view.standard].filter((line): line is string => !!line).join(" ");
  const note = VERDICT_NOTE[view.tone];
  return (
    <View accessibilityRole="summary">
      <CoachNote
        variant={note.variant}
        kind={note.kind}
        title={view.headline}
        body={body}
        width="100%"
      />
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Group title={title} {...(subtitle ? { subtitle } : {})}>
      {children}
    </Group>
  );
}

function CountBlock({ count }: { count: CountContext }) {
  const view = countView(count);
  return (
    <View style={styles.countBlock}>
      <Text style={styles.body}>
        <Text style={styles.strong}>{view.systemName}</Text> running count{" "}
        <Text style={styles.mono}>{view.runningCount}</Text> with {view.decksRemaining} left
      </Text>
      {view.division && view.trueCount ? (
        <Text style={styles.body}>
          True count <Text style={styles.mono}>{view.division}</Text>, played as{" "}
          <Text style={[styles.mono, styles.strong]}>{view.trueCount}</Text>
          {view.rounding ? <Text style={styles.muted}> ({view.rounding})</Text> : null}
        </Text>
      ) : null}
      {view.note ? <Text style={styles.refusal}>{view.note}</Text> : null}
    </View>
  );
}

function IndexBlock({ view }: { view: IndexView }) {
  const accent = TONE_COLOR[view.tone];
  return (
    <View style={styles.indexBlock}>
      <Text style={[styles.lead, { color: accent }]}>{view.headline}</Text>
      {view.entryLabel ? (
        <Text style={styles.body}>
          <Text style={styles.strong}>{view.entryLabel}</Text>
          {view.rule ? `: ${view.rule}` : ""}
        </Text>
      ) : null}
      {view.distance ? <Text style={styles.body}>{view.distance}</Text> : null}
      {view.scale ? <IndexScale scale={view.scale} departure={view.departure ?? "depart"} /> : null}
      {view.notes.map((note) => (
        <Text key={note} style={styles.note}>
          {note}
        </Text>
      ))}
    </View>
  );
}

function Bullets({ lines }: { lines: readonly string[] }) {
  return (
    <View style={styles.bullets}>
      {lines.map((line) => (
        <View key={line} style={styles.bullet}>
          <Text style={styles.bulletMark}>•</Text>
          <Text style={[styles.body, styles.bulletText]}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function toneOf(tier: ReturnType<typeof evRows>[number]["tier"]) {
  // The closeness of a call is not a verdict on the user: a coin flip is information, not a
  // warning, and a lopsided call is simply clear.
  return tier === "near-tie" || tier === "close" ? "warn" : "info";
}

const NUM = { fontVariant: ["tabular-nums" as const] };

const styles = StyleSheet.create({
  handHeader: { gap: 8 },
  handTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  handTitle: { ...ui(16, 700), color: colors.foreground },
  hands: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.feltDeep,
    alignSelf: "flex-start",
  },
  seat: { gap: 4, flexShrink: 1 },
  seatLabel: {
    ...ui(10, 700, { letterSpacing: 1.2, textTransform: "uppercase" }),
    color: colors.feltText,
  },
  versus: { ...ui(13, 600), color: colors.feltText, paddingBottom: 22 },
  lead: text.lead,
  body: text.body,
  strong: text.strong,
  mono: { ...NUM, fontFamily: ui(15, 600).fontFamily },
  muted: text.muted,
  note: text.note,
  refusal: { ...ui(13, 400, { lineHeight: 19 }), color: surfaces.infoInk },
  countBlock: { gap: 4 },
  indexBlock: { gap: 8 },
  bullets: { gap: 6 },
  bullet: { flexDirection: "row", gap: 8 },
  bulletMark: { ...ui(15), color: colors.primary },
  bulletText: { flex: 1 },
  densityWrap: { gap: 4 },
  densityTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.muted,
    overflow: "visible",
  },
  densityFill: { height: 12, borderRadius: 6 },
  breakEvenTick: {
    position: "absolute",
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.primary,
  },
  densityLabels: { flexDirection: "row", justifyContent: "space-between" },
  tickText: { ...ui(11, 500), ...NUM, color: colors.mutedForeground },
});
