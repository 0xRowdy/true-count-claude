/**
 * The baccarat table (design frame gu3Mf, "08 Baccarat — Payout"), phone-first and centred in a
 * phone-width column on desktop.
 *
 * Bet → Deal (P B P B, then third cards per the tableau, one card at a time) → Result → Payout.
 * The engine (`src/games/baccarat`) deals, settles and writes the coach's copy; the view model
 * (`baccaratTable.ts`) runs the coup; this file only draws it.
 */

import { useState } from "react";
import { Stack, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  describeHand,
  describeResult,
  describeRules,
  explainDraws,
  isLastCoup,
} from "@/games/baccarat";
import type { ChipValue } from "@/ui/ds/format";
import {
  Button,
  ChipRack,
  CoachNote,
  PhaseStepper,
  TableTopBar,
  colors,
  display,
  icons,
  radius,
  ui,
} from "@/ui/ds";
import {
  PHASE_STEP,
  type TableNote,
  formatAmount,
  hintNote,
  payoutNote,
  playerOutcome,
  totalStaked,
  visibleHands,
} from "./baccaratTable";
import { FeltSurface, HandPanel, Spot } from "./Felt";
import { Equal, Eraser, Info, Repeat, Undo2, X } from "@/ui/ds/icons";
import { baccaratPalette as pal } from "./palette";
import { Road, type RoadKind } from "./Road";
import { RulesSheet } from "./RulesSheet";
import { useBaccaratTable } from "./useBaccaratTable";

/** Phone column: the design's frame is 390 wide; larger phones fill up to this. */
const COLUMN = 430;

export function BaccaratScreen({ seed }: { seed?: string }) {
  const { table, coach, bankroll, storedBankroll, startingBankroll, hintAsked, actions } =
    useBaccaratTable(seed);
  const [chip, setChip] = useState<ChipValue>(25);
  const [road, setRoad] = useState<RoadKind>("bead");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [explain, setExplain] = useState(false);

  const { rules, phase, coup } = table;
  const hands = visibleHands(table);
  const complete = coup !== null && (phase === "result" || phase === "payout");
  const staked = totalStaked(table.bets);
  const settled = new Map(table.settlement?.bets.map((s) => [s.bet, s]) ?? []);
  // Chips stay movable while a caught note is open: the mistake is already recorded.
  const betting = phase === "bet";
  // The amount turns --correct while a winning payout lands (gu3Mf), as on the blackjack table.
  const bankrollColor =
    phase === "payout" && (table.settlement?.net ?? 0) > 0 ? colors.correct : colors.primary;
  const broke =
    phase === "bet" &&
    staked === 0 &&
    storedBankroll !== undefined &&
    storedBankroll < rules.minBet;

  // The coach note for this moment (CONTEXT.md invariants 2 and 3).
  let note: TableNote | null = null;
  if (table.caught) note = table.caught;
  else if (phase === "bet" && (coach === "every" || hintAsked)) note = hintNote(table);

  const next = () => {
    setExplain(false);
    actions.next();
  };
  const rebetDeal = () => {
    setExplain(false);
    actions.rebetAndDeal();
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, title: "Baccarat" }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <TableTopBar
            title="Baccarat"
            subtitle={describeRules(rules)}
            bankroll={bankroll}
            bankrollColor={bankrollColor}
            onBack={() => (router.canGoBack() ? router.back() : router.replace("/lobby"))}
            onBook={() => setRulesOpen(true)}
            bookLabel="Rules and payouts"
          />
          <PhaseStepper current={PHASE_STEP[phase]} />
          <Road coups={table.shoe.coups} kind={road} onToggle={setRoad} />

          <FeltSurface>
            {table.freshShoe || isLastCoup(table.shoe) ? (
              <Text style={[ui(12, 600), styles.shoeLine]}>
                {table.freshShoe
                  ? `New shoe #${table.shoeIndex + 1}: shuffled, burned and cut`
                  : "Cut card is out: one more coup, then a fresh shoe"}
              </Text>
            ) : null}
            <Pressable
              style={styles.hands}
              onPress={phase === "deal" ? actions.revealAll : undefined}
              disabled={phase !== "deal"}
              accessibilityRole={phase === "deal" ? "button" : undefined}
              accessibilityLabel={phase === "deal" ? "Turn all the cards" : undefined}
            >
              <HandPanel
                side="player"
                cards={hands.player}
                caption={complete && coup ? describeHand(coup, "player") : null}
                winner={complete && coup?.winner !== "banker"}
              />
              <HandPanel
                side="banker"
                cards={hands.banker}
                caption={complete && coup ? describeHand(coup, "banker") : null}
                winner={complete && coup?.winner !== "player"}
              />
            </Pressable>

            <Outcome
              text={
                complete && coup
                  ? describeResult(coup)
                  : phase === "deal"
                    ? "Dealing…"
                    : staked > 0
                      ? `${formatAmount(staked)} on the layout`
                      : "Place your bets"
              }
              result={phase === "payout" ? playerOutcome(table.settlement) : null}
              done={complete}
            />
            {complete && coup ? (
              <View style={styles.explain}>
                <Button
                  label={explain ? "Hide the draws" : "Why these draws?"}
                  variant="table"
                  size="sm"
                  icon={Info}
                  onPress={() => setExplain((v) => !v)}
                  style={styles.center}
                />
                {explain ? (
                  <View style={styles.explainBox} accessibilityLabel="Why these draws">
                    {explainDraws(coup).map((line) => (
                      <Text key={line} style={[ui(13, 400, { lineHeight: 19 }), styles.feltText]}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {rules.sideBets.length > 0 ? (
              <View style={styles.spots}>
                {rules.sideBets.map((bet) => (
                  <Spot
                    key={bet}
                    bet={bet}
                    rules={rules}
                    compact
                    stake={table.bets[bet] ?? 0}
                    settlement={settled.get(bet)}
                    onPress={betting ? () => actions.place(bet, chip) : undefined}
                    onLongPress={betting ? () => actions.remove(bet) : undefined}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.spots}>
              {(["player", "tie", "banker"] as const).map((bet) => (
                <Spot
                  key={bet}
                  bet={bet}
                  rules={rules}
                  stake={table.bets[bet] ?? 0}
                  settlement={settled.get(bet)}
                  onPress={betting ? () => actions.place(bet, chip) : undefined}
                  onLongPress={betting ? () => actions.remove(bet) : undefined}
                />
              ))}
            </View>
          </FeltSurface>

          <View style={styles.coach}>
            {table.error ? (
              <Text role="alert" style={[ui(13, 600), { color: colors.mistake }]}>
                {table.error}
              </Text>
            ) : null}
            {broke ? (
              <View style={styles.broke}>
                <Text style={[ui(14, 600), { color: colors.foreground }]}>
                  You're out of practice chips for this table.
                </Text>
                <Button
                  label={`Reset to ${formatAmount(startingBankroll)}`}
                  onPress={actions.resetBankroll}
                  icon={icons.RotateCcw}
                />
              </View>
            ) : null}
            {note ? (
              <CoachNote
                width="100%"
                variant={note.variant}
                kind={note.kind}
                title={note.title}
                body={note.body}
                primary={
                  table.caught ? { label: "Take it back", onPress: actions.takeBack } : undefined
                }
                secondary={
                  table.caught
                    ? { label: "Deal anyway", onPress: () => actions.deal(true) }
                    : undefined
                }
              />
            ) : null}
            {phase === "payout" ? <InlineNote note={payoutNote(table)} /> : null}
          </View>

          {phase === "bet" ? (
            <View style={styles.betBar}>
              <ChipRack selected={chip} onSelect={setChip} />
              <View style={styles.actions}>
                <Button
                  label="Clear"
                  variant="ghost"
                  size="sm"
                  icon={Eraser}
                  onPress={actions.clear}
                  disabled={staked === 0}
                />
                <Button
                  label="Undo"
                  variant="ghost"
                  size="sm"
                  icon={Undo2}
                  onPress={actions.undo}
                  disabled={staked === 0}
                />
                {table.lastBets ? (
                  <Button
                    label="Rebet"
                    variant="ghost"
                    size="sm"
                    icon={Repeat}
                    onPress={actions.rebet}
                  />
                ) : null}
                {coach === "asked" ? (
                  <Button
                    label="Hint"
                    variant="ghost"
                    size="sm"
                    icon={icons.Lightbulb}
                    onPress={actions.askHint}
                  />
                ) : null}
              </View>
              {!table.caught ? (
                <View style={styles.dealRow}>
                  <Button
                    label={staked > 0 ? `Deal · ${formatAmount(staked)}` : "Deal"}
                    icon={icons.Play}
                    fullWidth
                    style={styles.tall}
                    onPress={() => actions.deal()}
                    disabled={staked === 0}
                  />
                </View>
              ) : null}
            </View>
          ) : phase === "payout" ? (
            <View style={styles.payoutBar}>
              {table.lastBets && totalStaked(table.lastBets) > 0 ? (
                <Button
                  label={`Rebet ${formatAmount(totalStaked(table.lastBets))}`}
                  variant="secondary"
                  icon={Repeat}
                  style={[styles.tall, styles.grow]}
                  onPress={rebetDeal}
                />
              ) : null}
              <Button
                label="Next hand"
                icon={icons.Play}
                style={[styles.tall, styles.grow]}
                onPress={next}
              />
            </View>
          ) : (
            <View style={styles.payoutBar}>
              <Text style={[ui(13), styles.waiting]}>
                {phase === "deal"
                  ? "The dealer turns P, B, P, B, then any third cards. Tap the hands to turn them all."
                  : "Paying the layout…"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
      <RulesSheet
        visible={rulesOpen}
        onClose={() => setRulesOpen(false)}
        rules={rules}
        shoe={table.shoe}
        shoeIndex={table.shoeIndex}
        canChange={phase === "bet"}
        onChange={actions.setRules}
      />
    </View>
  );
}

/** The outcome line: "✓ Player wins 9 over 7" (the icon is the player's own result). */
function Outcome({
  text,
  result,
  done,
}: {
  text: string;
  result: "win" | "lose" | "push" | null;
  done: boolean;
}) {
  const Icon =
    result === "win" ? icons.Check : result === "lose" ? X : result === "push" ? Equal : null;
  const tint =
    result === "win" ? pal.outcomeWin : result === "lose" ? colors.mistake : colors.feltText;
  return (
    <View style={styles.outcome} accessibilityLiveRegion="polite" aria-live="polite">
      {Icon ? <Icon size={18} color={tint} strokeWidth={2.25} /> : null}
      <Text
        testID="outcome"
        style={[
          done ? display(22, 400) : ui(15, 500),
          { color: done ? colors.feltText : colors.feltText },
          !done && styles.dim,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

/** The design's "Coach Inline" (pY4gH): lightbulb, title, body, on paper with a blue edge. */
function InlineNote({ note }: { note: TableNote }) {
  return (
    <View style={styles.inline} role="note" accessibilityLabel={`Coach note: ${note.title}`}>
      <icons.Lightbulb size={18} color={colors.coachAccent} strokeWidth={2} />
      <View style={styles.inlineText}>
        <Text style={[ui(14, 700), { color: colors.ink }]}>{note.title}</Text>
        <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.inkMuted }]}>
          {note.body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { alignItems: "center", flexGrow: 1 },
  column: { width: "100%", maxWidth: COLUMN, backgroundColor: colors.background },
  shoeLine: { color: colors.primary, textAlign: "center" },
  hands: { flexDirection: "row", gap: 12 },
  outcome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 30,
  },
  dim: { opacity: 0.75 },
  explain: { gap: 8 },
  center: { alignSelf: "center" },
  explainBox: {
    gap: 4,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: pal.stakeTag,
  },
  feltText: { color: colors.feltText },
  spots: { flexDirection: "row", gap: 8 },
  coach: { gap: 10, paddingTop: 14, paddingHorizontal: 16 },
  broke: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  inline: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.coachAccent,
    backgroundColor: colors.coach,
  },
  inlineText: { flex: 1, gap: 3 },
  betBar: { gap: 10, paddingTop: 14, paddingBottom: 16 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 16,
  },
  payoutBar: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  tall: { height: 52 },
  dealRow: { paddingHorizontal: 16 },
  grow: { flex: 1 },
  waiting: { flex: 1, textAlign: "center", color: colors.mutedForeground, minHeight: 52 },
});
