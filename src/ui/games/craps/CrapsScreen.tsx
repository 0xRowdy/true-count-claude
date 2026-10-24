import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { describePlan, formatDollars, onTable, tableLabel } from "@/games/craps";
import { Button } from "@/ui/ds/Button";
import { ChipRack } from "@/ui/ds/ChipRack";
import { CoachNote } from "@/ui/ds/CoachNote";
import type { ChipValue } from "@/ui/ds/format";
import { PhaseStepper } from "@/ui/ds/PhaseStepper";
import { TableTopBar } from "@/ui/ds/TableTopBar";
import { TestingBanner, useTestedStrategy } from "@/ui/strategies/TestingBanner";
import { colors, radius, ui } from "@/ui/ds/tokens";
import { CrapsFelt } from "./CrapsFelt";
import { Dices, Eraser, Layers, Lightbulb, Repeat, Undo2 } from "@/ui/ds/icons";
import {
  type NoteAction,
  type Spot,
  NOTE_ACTION_LABEL,
  PHASE_INDEX,
  PHASE_STEPS,
  canRebet,
  historyLabels,
  rollCallFor,
  rollLabel,
  shownPoint,
  shownTable,
  winTags,
} from "./model";
import { CenterBetsSheet, EditBetsSheet, RulesSheet } from "./Sheets";
import { craps } from "./theme";
import { useCrapsGame } from "./useCrapsGame";

/** Phone-width column, centred on desktop. */
const COLUMN = 430;

/** `/games/craps` — the single-player craps table (frame 06, lUiCl). */
export function CrapsScreen({ seed }: { seed?: string }) {
  const g = useCrapsGame(seed);
  // "Test in trainer" (`?strategy=<id>`): which plan is under test, for reference at the rail.
  const tested = useTestedStrategy("craps");
  const { state } = g;
  const [chip, setChip] = useState<ChipValue>(5);
  const [sheet, setSheet] = useState<"center" | "edit" | "rules" | null>(null);

  const table = shownTable(state);
  const point = shownPoint(state);
  const history = historyLabels(state);
  const call = rollCallFor(state);
  const dice = state.last ? state.last.outcome.record.dice : null;
  const betting = state.phase === "bet";

  const back = () => (router.canGoBack() ? router.back() : router.replace("/lobby"));
  const onSpot = (spot: Spot) => g.place(spot, chip);
  const onRemove = (spot: Spot) => g.remove(spot, chip);

  const note = state.note;
  const run = (action: NoteAction) => {
    switch (action) {
      case "takeBack":
        if (note?.spot) g.takeBack(note.spot);
        return;
      case "fixAmount":
        if (note?.spot && note.fixTo !== undefined) g.fix(note.spot, note.fixTo);
        return;
      case "rollAnyway":
        g.roll(true);
        return;
      case "maxOdds":
        g.maxOdds();
        return;
      case "oddsHelp":
        setSheet("rules");
        return;
      default:
        g.dismiss();
    }
  };

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false, title: "Craps" }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <TableTopBar
            title="Craps"
            subtitle={tableLabel(table.rules, point)}
            bankroll={g.bankroll}
            onBack={back}
            onBook={() => setSheet("rules")}
            bookLabel="Rules and payouts"
          />
          <PhaseStepper current={PHASE_INDEX[state.phase]} steps={PHASE_STEPS} />
          <TestingBanner
            game="craps"
            tested={tested}
            detail={(draft) =>
              `${describePlan(draft.plan)
                .map((row) => `${row.when}: ${row.text}`)
                .join(
                  " · ",
                )}. Bet the plan by hand; the coach still prices every bet by its house edge.`
            }
          />

          <View style={styles.rail}>
            <Text style={[ui(11, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
              ROLLS
            </Text>
            <View
              style={styles.history}
              role="list"
              accessibilityLabel="Recent rolls, latest first"
            >
              {history.length === 0 ? (
                <Text style={[ui(12), { color: colors.mutedForeground }]}>No rolls yet</Text>
              ) : (
                history.map((h, i) => (
                  <View
                    key={`${history.length - i}-${h.text}`}
                    role="listitem"
                    accessibilityLabel={i === 0 ? `Last roll ${h.text}` : h.text}
                    style={[styles.roll, i === 0 && styles.latest]}
                  >
                    <Text
                      style={[
                        ui(13, 700),
                        { color: i === 0 ? colors.primaryForeground : colors.foreground },
                      ]}
                    >
                      {h.total}
                    </Text>
                    {h.tag ? (
                      <Text
                        style={[
                          ui(11, 600),
                          { color: i === 0 ? craps.latestSub : colors.mutedForeground },
                        ]}
                      >
                        {h.tag}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ask the coach"
              onPress={g.hint}
              style={styles.hint}
            >
              <Lightbulb size={18} color={colors.mutedForeground} strokeWidth={2} />
            </Pressable>
          </View>

          <CrapsFelt
            table={table}
            point={point}
            call={call}
            dice={dice}
            rolling={state.phase === "roll"}
            wins={winTags(state)}
            chip={chip}
            onSpot={onSpot}
            onRemove={onRemove}
            onCenter={() => setSheet("center")}
          />

          {state.error ? (
            <Text role="alert" style={[ui(13, 600), styles.error]}>
              {state.error}
            </Text>
          ) : null}

          {state.notice && !state.error ? (
            <Text role="status" style={[ui(13), styles.notice]}>
              {state.notice}
            </Text>
          ) : null}

          {g.broke ? (
            <View style={styles.reset}>
              <Text style={[ui(14), styles.flex, { color: colors.foreground }]}>
                Out of practice chips. Start again with a fresh bankroll.
              </Text>
              <Button label="Reset bankroll" size="sm" onPress={g.resetBankroll} />
            </View>
          ) : null}

          {note ? (
            <View style={styles.coach}>
              <CoachNote
                width="100%"
                variant={note.variant}
                kind={note.kind}
                title={note.title}
                body={note.body}
                primary={{
                  label:
                    note.primary === "fixAmount" && note.fixTo !== undefined
                      ? `Make it ${formatDollars(note.fixTo)}`
                      : NOTE_ACTION_LABEL[note.primary],
                  onPress: () => run(note.primary),
                }}
                secondary={
                  note.secondary
                    ? {
                        label: NOTE_ACTION_LABEL[note.secondary],
                        onPress: () => run(note.secondary!),
                      }
                    : undefined
                }
              />
            </View>
          ) : null}

          {betting ? (
            <>
              <View style={styles.controls}>
                {state.undo.length > 0 ? (
                  <>
                    <Button label="Undo" icon={Undo2} variant="ghost" size="sm" onPress={g.undo} />
                    <Button
                      label="Clear"
                      icon={Eraser}
                      variant="ghost"
                      size="sm"
                      onPress={g.clear}
                    />
                  </>
                ) : null}
                {canRebet(state) ? (
                  <Button label="Rebet" icon={Repeat} variant="ghost" size="sm" onPress={g.rebet} />
                ) : null}
              </View>
              <ChipRack selected={chip} onSelect={setChip} />
            </>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={`Edit bets · ${formatDollars(onTable(table))}`}
              accessibilityLabel={`Edit bets, ${formatDollars(onTable(table))} on the table`}
              icon={Layers}
              variant="secondary"
              style={styles.action}
              onPress={() => {
                g.openBetting();
                setSheet("edit");
              }}
            />
            <Button
              label={rollLabel(state)}
              icon={Dices}
              style={styles.action}
              onPress={() => g.roll()}
            />
          </View>
        </View>
      </ScrollView>

      <CenterBetsSheet
        visible={sheet === "center"}
        table={state.table}
        chip={chip}
        onSpot={(s) => {
          onSpot(s);
          setSheet(null);
        }}
        onRemove={onRemove}
        onClose={() => setSheet(null)}
      />
      <EditBetsSheet
        visible={sheet === "edit"}
        table={state.table}
        chip={chip}
        onEdit={g.edit}
        onRemove={onRemove}
        onClose={() => setSheet(null)}
      />
      <RulesSheet visible={sheet === "rules"} table={state.table} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: "center" },
  column: { width: "100%", maxWidth: COLUMN, paddingBottom: 16 },
  flex: { flex: 1 },
  action: { flex: 1, height: 52, paddingHorizontal: 12 },
  rail: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 16,
    paddingRight: 4,
  },
  history: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, overflow: "hidden" },
  roll: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
  },
  latest: { backgroundColor: colors.primary },
  hint: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  error: { color: colors.mistake, paddingHorizontal: 16, paddingTop: 10 },
  notice: { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 10 },
  reset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coach: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 4 },
  controls: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    minHeight: 8,
  },
  actions: { flexDirection: "row", gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
});
