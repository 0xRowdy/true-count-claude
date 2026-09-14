/**
 * Every field of the Rule Set, with what it costs you written underneath.
 *
 * All thirteen are here, including the four a settings screen usually swallows — resplit
 * aces, one card to split aces, dealer peek, penetration. They are on the chart, so they
 * are on the screen. "The rules are wrong and can't be fixed through customization" is a
 * real review of a real competitor, and it is the whole brief for this panel.
 *
 * Each field carries one line of explanation rather than a bare label, because a user who
 * does not know what "one card to split aces" means cannot report their own table
 * correctly, and a wrongly reported table trains the wrong chart. ADR-0005 again: the
 * explanation is the product.
 *
 * No control is ever greyed out. Where a combination makes no sense the screen says so in
 * words (`validateRules`, and the notes below), which is invariant 7 applied to settings —
 * a disabled control is a claim you cannot argue with.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type {
  BlackjackPayout,
  DealerSoft17,
  DoubleRule,
  RuleSet,
  SurrenderRule,
} from "@/engine/rules";
import { Panel, SegmentedControl } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";
import { SOURCED_DECK_COUNTS } from "./houseEdge";

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

type YesNo = (typeof YES_NO)[number]["value"];

const yn = (value: boolean): YesNo => (value ? "yes" : "no");

const DECK_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8].map((decks) => ({
  value: String(decks),
  label: String(decks),
}));

const PENETRATION_OPTIONS = [0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9].map((fraction) => ({
  value: fraction.toFixed(2),
  label: `${Math.round(fraction * 100)}%`,
}));

const SPLIT_HAND_OPTIONS = [
  { value: "1", label: "No splits" },
  { value: "2", label: "2 hands" },
  { value: "3", label: "3 hands" },
  { value: "4", label: "4 hands" },
];

export function RuleFields({
  rules,
  onChange,
}: {
  rules: RuleSet;
  onChange: (next: RuleSet) => void;
}) {
  const set = <K extends keyof RuleSet>(key: K, value: RuleSet[K]) =>
    onChange({ ...rules, [key]: value });

  const unusualDeckCount = !SOURCED_DECK_COUNTS.includes(rules.decks);

  return (
    <>
      <Panel title="The deal">
        <Field
          label="Decks"
          why="Fewer decks means a better game and a faster-moving count. It also moves a dozen cells on the chart."
          {...(unusualDeckCount
            ? {
                warning:
                  "Casinos deal 1, 2, 4, 6 and 8 decks. Nobody publishes a house edge for the others, so the edge above will read as unavailable.",
              }
            : {})}
        >
          <SegmentedControl
            options={DECK_OPTIONS}
            value={String(rules.decks)}
            onChange={(next) => set("decks", Number(next))}
          />
        </Field>

        <Field
          label="Dealer on soft 17"
          why="Hitting soft 17 gives the dealer a second chance at a stiff hand. It costs you about a fifth of a percent and changes how you play A,7 and hard 11."
        >
          <SegmentedControl<DealerSoft17>
            options={[
              { value: "stand", label: "Stands (S17)" },
              { value: "hit", label: "Hits (H17)" },
            ]}
            value={rules.dealerSoft17}
            onChange={(next) => set("dealerSoft17", next)}
          />
        </Field>

        <Field
          label="Blackjack pays"
          why="The one rule worth walking away over. 6:5 pays $6 on a $5 blackjack instead of $7.50, and costs more than every other bad rule on this screen put together."
          {...(rules.blackjackPayout === "6:5"
            ? { warning: "6:5 costs you 1.39%. No counting system recovers that." }
            : {})}
        >
          <SegmentedControl<BlackjackPayout>
            options={[
              { value: "3:2", label: "3 to 2" },
              { value: "6:5", label: "6 to 5" },
            ]}
            value={rules.blackjackPayout}
            onChange={(next) => set("blackjackPayout", next)}
          />
        </Field>

        <Field
          label="Dealer peek"
          why="With a hole card the dealer checks for blackjack before you act, so a doubled or split bet is safe. With no hole card it is not — which is why A,A and hard 11 stop wanting the extra money against an ace."
        >
          <SegmentedControl
            options={[
              { value: "yes", label: "Peeks" },
              { value: "no", label: "No hole card" },
            ]}
            value={yn(rules.dealerPeek)}
            onChange={(next) => set("dealerPeek", next === "yes")}
          />
        </Field>
      </Panel>

      <Panel title="Doubling and surrender">
        <Field
          label="Double on"
          why="Restricting doubles to hard totals takes away every soft double — A,2 through A,7 — which is most of what the soft chart is for."
        >
          <SegmentedControl<DoubleRule>
            options={[
              { value: "any", label: "Any two cards" },
              { value: "9-11", label: "9-11 only" },
              { value: "10-11", label: "10-11 only" },
            ]}
            value={rules.doubleRule}
            onChange={(next) => set("doubleRule", next)}
          />
        </Field>

        <Field
          label="Double after split"
          why="Splitting 2s, 3s, 4s and 6s is mostly worth it because of the doubles that follow. Without DAS, several pairs stop being splits at all."
        >
          <SegmentedControl
            options={[...YES_NO]}
            value={yn(rules.doubleAfterSplit)}
            onChange={(next) => set("doubleAfterSplit", next === "yes")}
          />
        </Field>

        <Field
          label="Surrender"
          why="Late surrender gives back half a bet after the dealer checks for blackjack. Early surrender — rare, and worth nine times as much — lets you fold before the check."
        >
          <SegmentedControl<SurrenderRule>
            options={[
              { value: "none", label: "None" },
              { value: "late", label: "Late" },
              { value: "early", label: "Early" },
            ]}
            value={rules.surrender}
            onChange={(next) => set("surrender", next)}
          />
        </Field>
      </Panel>

      <Panel title="Splitting">
        <Field
          label="Split up to"
          why="How many hands you may split to, counting the original. Four is standard."
          {...(rules.maxSplitHands === 1
            ? {
                warning:
                  "A table that forbids splitting outright is unheard of, and no source prices it — the house edge above will read as unavailable. The chart handles it: every pair is read as its total.",
              }
            : {})}
        >
          <SegmentedControl
            options={SPLIT_HAND_OPTIONS}
            value={String(Math.min(rules.maxSplitHands, 4))}
            onChange={(next) => set("maxSplitHands", Number(next))}
          />
        </Field>

        <Field
          label="Resplit aces"
          why="Whether a third ace on a split hand may be split again. Worth 0.08% and almost never offered."
        >
          <SegmentedControl
            options={[...YES_NO]}
            value={yn(rules.resplitAces)}
            onChange={(next) => set("resplitAces", next === "yes")}
          />
        </Field>

        <Field
          label="Cards to split aces"
          why="Nearly every table gives split aces exactly one card each. A table that lets you draw to them hands you 0.19% — better than late surrender."
        >
          <SegmentedControl
            options={[
              { value: "yes", label: "One card" },
              { value: "no", label: "May draw" },
            ]}
            value={yn(rules.oneCardToSplitAces)}
            onChange={(next) => set("oneCardToSplitAces", next === "yes")}
          />
        </Field>
      </Panel>

      <Panel title="The shoe and the limits">
        <Field
          label="Penetration"
          why="How much of the shoe is dealt before the shuffle. It does not move the house edge or a single chart cell — it decides how much of your count is worth anything. Deep penetration is the counter's single biggest ask."
        >
          <SegmentedControl
            options={PENETRATION_OPTIONS}
            value={rules.penetration.toFixed(2)}
            onChange={(next) => set("penetration", Number(next))}
          />
        </Field>

        <Field
          label="Table limits"
          why="The edge is a percentage, so the limits scale what it costs you rather than changing it. The spread between them is what a counter actually needs."
        >
          <View style={styles.betRow}>
            <MoneyInput
              label="Minimum"
              value={rules.minBet}
              onChange={(value) => set("minBet", value)}
            />
            <MoneyInput
              label="Maximum"
              value={rules.maxBet}
              onChange={(value) => set("maxBet", value)}
            />
          </View>
        </Field>
      </Panel>
    </>
  );
}

function Field({
  label,
  why,
  warning,
  children,
}: {
  label: string;
  why: string;
  warning?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      <Text style={styles.why}>{why}</Text>
      {warning ? <Text style={styles.warning}>{warning}</Text> : null}
    </View>
  );
}

/**
 * A bet amount.
 *
 * Held as text so a half-typed or emptied field stays editable — clamping to a number on
 * every keystroke makes a field you cannot clear. An unparseable value becomes 0, which
 * `validateRules` then rejects out loud in the banner at the top of the screen.
 */
function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.money}>
      <Text style={styles.moneyLabel}>{label}</Text>
      <View style={styles.moneyField}>
        <Text style={styles.currency}>$</Text>
        <TextInput
          value={value === 0 ? "" : String(value)}
          onChangeText={(text) => onChange(parseMoney(text))}
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={`${label} bet`}
          style={styles.moneyInput}
        />
      </View>
    </View>
  );
}

function parseMoney(text: string): number {
  const digits = text.replace(/[^0-9]/g, "");
  if (digits === "") return 0;
  const value = Number(digits);
  return Number.isFinite(value) ? value : 0;
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs, paddingVertical: spacing.xs },
  fieldLabel: { ...type.body, color: colors.text, fontWeight: "600" },
  why: { ...type.caption, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  warning: { ...type.caption, color: colors.warning, fontSize: 12, lineHeight: 17 },
  betRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  money: { gap: spacing.xs, flexGrow: 1, flexBasis: 130 },
  moneyLabel: { ...type.caption, color: colors.textMuted },
  moneyField: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  currency: { ...type.mono, ...type.caption, color: colors.textMuted },
  moneyInput: {
    ...type.mono,
    ...type.body,
    color: colors.text,
    flex: 1,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.xs,
  },
});
