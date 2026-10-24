/**
 * The Roulette table (frame dBsVJ, "05 Roulette — Betting (bet loupe)"), route
 * `/games/roulette`. Thin: the round, the coach and every number come from `rouletteTable.ts`
 * over the pure engine in `src/games/roulette`.
 *
 * Hydration: the first render is the fixed empty table. The seed (`?seed=` or a random one),
 * the bankroll (progress store) and the coach level (profile) arrive after mount.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { router } from "expo-router";
import Info from "lucide-react-native/icons/info";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import Undo2 from "lucide-react-native/icons/undo-2";
import Repeat from "lucide-react-native/icons/repeat";
import X from "lucide-react-native/icons/x";
import ZoomIn from "lucide-react-native/icons/zoom-in";
import { type Pocket, describeTable, formatDollars, pocketColor } from "@/games/roulette";
import type { CoachLevel } from "@/state/profile";
import { PRACTICE_BANKROLL_START } from "@/state/progress";
import { bankroll as gameBankroll } from "@/state/progressSelectors";
import {
  Button,
  ChipRack,
  CoachNote,
  PhaseStepper,
  TableTopBar,
  colors,
  radius,
  surfaces,
  ui,
  type ChipValue,
} from "@/ui/ds";
import { useProfile } from "@/ui/profile/profileStore";
import { TestingBanner, useTestedStrategy } from "@/ui/strategies/TestingBanner";
import {
  endProgressSession,
  makeSessionId,
  recordDecision,
  recordHand,
  resetBankroll,
  startProgressSession,
  useProgressView,
} from "@/ui/progress/progressStore";
import { RouletteFelt } from "./RouletteFelt";
import { RouletteRulesSheet } from "./RouletteRulesSheet";
import {
  type ChipAmount,
  type TableState,
  ROULETTE_PHASES,
  SPIN_MS,
  betSummary,
  chipCaption,
  edgeLabel,
  gradeBets,
  initialTable,
  lastPockets,
  wheelOf,
  needsReset,
  netLabel,
  payoutRows,
  phaseIndex,
  pocketFacts,
  pocketName,
  pocketRect,
  rulesOf,
  tableReducer,
  totalBetLabel,
  winningSpotIds,
} from "./rouletteTable";

const POCKET_FILL = { red: colors.chip5, black: colors.chip100, green: colors.chip25 } as const;

export function RouletteScreen({ seed }: { seed?: string }) {
  const [state, dispatch] = useReducer(tableReducer, undefined, () => initialTable());
  const [rulesOpen, setRulesOpen] = useState(false);
  // The last number tapped or focused: "Bets touching N" opens its loupe without a long-press.
  const [picked, setPicked] = useState<Pocket | null>(null);
  const { profile } = useProfile();
  const progress = useProgressView(false);
  const rules = rulesOf(state);
  // "Test in trainer" (`?strategy=<id>`): the banner can lay the strategy's bets on the felt.
  const tested = useTestedStrategy("roulette");

  // Seed after mount (hydration): `?seed=` for deterministic e2e, otherwise random.
  useEffect(() => {
    const fixed = seed !== undefined && /^\d+$/.test(seed) ? Number(seed) : undefined;
    dispatch({ type: "seed", seed: fixed ?? Math.floor(Math.random() * 0xffffffff) });
  }, [seed]);

  // The practice bankroll for roulette, once storage has answered.
  useEffect(() => {
    if (progress.ready) {
      dispatch({ type: "bankroll", bankroll: gameBankroll(progress.data, "roulette") });
    }
  }, [progress.ready, progress.data]);

  // One progress session per visit.
  useEffect(() => {
    const id = makeSessionId("roulette");
    startProgressSession({ id, game: "roulette" });
    return () => endProgressSession(id);
  }, []);

  // Spin: grade the bets as they are committed, then let the ball land.
  const graded = useRef(-1);
  const handed = useRef(-1);
  const stateRef = useRef<TableState>(state);
  stateRef.current = state;
  useEffect(() => {
    if (state.phase !== "spin") return;
    const spinNo = state.history.length;
    if (graded.current !== spinNo) {
      graded.current = spinNo;
      for (const g of gradeBets(stateRef.current)) recordDecision({ game: "roulette", ...g });
    }
  }, [state.phase, state.history.length]);

  // The ball lands SPIN_MS after Spin. The timer belongs to the press, not to a render, so no
  // re-render (a progress write, a profile load) can cancel it; `reveal` is a no-op outside the
  // spin phase, so a refused Spin is harmless.
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );
  const onSpin = () => {
    dispatch({ type: "spin" });
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => dispatch({ type: "reveal" }), SPIN_MS);
  };

  useEffect(() => {
    if (state.phase !== "result" || !state.settlement) return;
    const spinNo = state.history.length;
    if (handed.current === spinNo) return;
    handed.current = spinNo;
    recordHand({ game: "roulette", net: state.settlement.net });
  }, [state.phase, state.history.length, state.settlement]);

  // Bring the winning number into view when the ball lands.
  const scroller = useRef<ScrollViewInstance>(null);
  const [viewH, setViewH] = useState(0);
  useEffect(() => {
    if (state.phase !== "result" || !state.settlement) return;
    const y = 12 + pocketRect(state.settlement.pocket, rules.wheel, 300).y;
    scroller.current?.scrollTo({ y: Math.max(0, y - viewH / 2 + 18), animated: true });
  }, [state.phase, state.history.length]);

  const winners = useMemo(
    () =>
      state.settlement && (state.phase === "result" || state.phase === "payout")
        ? winningSpotIds(rules, state.settlement.pocket)
        : null,
    [state.settlement, state.phase, rules],
  );

  const coachLevel = profile.coach;
  const add = (spotId: string) => dispatch({ type: "add", spotId, coach: coachLevel });
  const betting = state.phase === "bet";
  const recent = lastPockets(state.history);

  return (
    <View style={styles.page}>
      <View style={styles.column}>
        <TableTopBar
          title="Roulette"
          subtitle={describeTable(rules)}
          bankroll={state.bankroll ?? undefined}
          onBack={() => router.navigate("/lobby")}
          onBook={() => setRulesOpen(true)}
          bookLabel="Rules and payouts"
        />
        <PhaseStepper current={phaseIndex(state.phase)} steps={ROULETTE_PHASES} />
        <TestingBanner
          game="roulette"
          tested={tested}
          detail="Place its bets to play its layout; the coach still prices every bet by its house edge."
          action={{
            label: "Place its bets",
            onPress: (draft) =>
              dispatch({
                type: "layout",
                wheel: wheelOf(draft.layout.rules),
                bets: draft.layout.bets,
                coach: profile.coach,
              }),
          }}
        />

        <View style={styles.history} accessibilityLabel="Last spins" role="list">
          <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
            LAST
          </Text>
          {recent.length === 0 ? (
            <Text style={[ui(12), { color: colors.mutedForeground }]}>No spins yet</Text>
          ) : (
            recent.map((p, i) => (
              <View
                key={`${state.history.length - i}`}
                role="listitem"
                accessibilityLabel={i === 0 ? `Latest: ${pocketName(p)}` : pocketName(p)}
                style={[
                  styles.pill,
                  i === 0 ? styles.pillLatest : null,
                  { backgroundColor: POCKET_FILL[pocketColor(p)] },
                ]}
              >
                <Text style={[ui(i === 0 ? 14 : 12, 700), { color: surfaces.chipInkLight }]}>
                  {String(p)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.middle}>
          <ScrollView
            ref={scroller}
            style={styles.scroll}
            contentContainerStyle={styles.scrollBody}
            onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
          >
            <RouletteFelt
              state={state}
              winners={winners}
              onAdd={add}
              onRemove={(spotId) => dispatch({ type: "remove", spotId })}
              onLoupe={(pocket) => dispatch({ type: "loupe", pocket })}
              onPick={setPicked}
            />
          </ScrollView>
          {state.coach ? (
            <View style={styles.coach}>
              <CoachNote
                variant={state.coach.variant}
                kind={state.coach.kind}
                title={state.coach.title}
                body={state.coach.body}
                width="100%"
                primary={
                  state.coach.takeBack && betting
                    ? {
                        label: "Take it back",
                        onPress: () =>
                          dispatch({ type: "removeSpot", spotId: state.coach!.takeBack! }),
                      }
                    : { label: "Got it", onPress: () => dispatch({ type: "dismissCoach" }) }
                }
                secondary={
                  state.coach.takeBack && betting
                    ? { label: "Keep it", onPress: () => dispatch({ type: "dismissCoach" }) }
                    : undefined
                }
              />
            </View>
          ) : null}
        </View>

        {state.phase === "bet" ? (
          <BetControls
            state={state}
            dispatch={dispatch}
            coach={coachLevel}
            picked={picked}
            onSpin={onSpin}
          />
        ) : (
          <RoundPanel state={state} dispatch={dispatch} />
        )}

        <ChipRack
          selected={state.chip as ChipValue}
          onSelect={betting ? (v) => dispatch({ type: "chip", chip: v as ChipAmount }) : undefined}
          caption={chipCaption(state.chip)}
        />

        {rulesOpen ? (
          <RouletteRulesSheet
            wheel={state.wheel}
            canChange={betting}
            onWheel={(wheel) => {
              setPicked(null);
              dispatch({ type: "wheel", wheel });
            }}
            onClose={() => setRulesOpen(false)}
          />
        ) : null}
      </View>
    </View>
  );
}

type Dispatch = (a: Parameters<typeof tableReducer>[1]) => void;

function BetControls({
  state,
  dispatch,
  coach,
  picked,
  onSpin,
}: {
  state: TableState;
  dispatch: Dispatch;
  coach: CoachLevel;
  picked: Pocket | null;
  onSpin: () => void;
}) {
  const empty = state.bets.length === 0;
  const rebet = empty && state.lastBets.length > 0;
  const reset = needsReset(state);
  return (
    <View>
      <View style={styles.summary}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[ui(15, 700), { color: colors.foreground }]}>{totalBetLabel(state)}</Text>
          <Text style={[ui(12), { color: colors.mutedForeground }]} numberOfLines={2}>
            {betSummary(state)}
          </Text>
        </View>
        {picked !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Bets touching ${String(picked)}`}
            accessibilityHint="Opens the bet loupe for the last number you picked"
            onPress={() => dispatch({ type: "loupe", pocket: picked })}
            hitSlop={4}
            style={styles.loupeButton}
          >
            <ZoomIn size={18} color={colors.foreground} strokeWidth={2} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${edgeLabel(state)}. Ask the dealer why`}
          onPress={() => dispatch({ type: "hint" })}
          hitSlop={8}
          style={styles.edge}
        >
          <Info size={12} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[ui(12, 500), { color: colors.mutedForeground }]}>{edgeLabel(state)}</Text>
        </Pressable>
      </View>
      {state.error ? (
        <Text role="alert" style={[ui(12, 600), styles.error]}>
          {state.error}
        </Text>
      ) : null}
      {reset ? (
        <View style={styles.reset}>
          <Text style={[ui(13), { color: colors.foreground, flex: 1 }]}>
            {`Out of practice chips (${formatDollars(state.bankroll ?? 0)}).`}
          </Text>
          <Button
            label={`Reset to ${formatDollars(PRACTICE_BANKROLL_START)}`}
            size="sm"
            onPress={() => {
              resetBankroll("roulette");
              dispatch({ type: "resetBankroll", bankroll: PRACTICE_BANKROLL_START });
            }}
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Clear"
          icon={X}
          variant="secondary"
          disabled={empty}
          onPress={() => dispatch({ type: "clear" })}
          style={styles.action}
        />
        {rebet ? (
          <Button
            label="Rebet"
            icon={Repeat}
            variant="secondary"
            onPress={() => dispatch({ type: "rebet", coach })}
            style={styles.action}
          />
        ) : (
          <Button
            label="Undo"
            icon={Undo2}
            variant="secondary"
            disabled={state.undo.length === 0}
            onPress={() => dispatch({ type: "undo" })}
            style={styles.action}
          />
        )}
        <Button
          label="Spin"
          icon={RotateCw}
          disabled={empty || state.seed === null || state.bankroll === null}
          onPress={onSpin}
          style={styles.action}
        />
      </View>
    </View>
  );
}

function RoundPanel({ state, dispatch }: { state: TableState; dispatch: Dispatch }) {
  const rules = rulesOf(state);
  const s = state.settlement;
  if (state.phase === "spin" || !s) {
    return (
      <View style={styles.round}>
        <View style={styles.resultRow} accessibilityLiveRegion="polite">
          <View style={[styles.ball, { backgroundColor: colors.secondary }]}>
            <RotateCw size={22} color={colors.mutedForeground} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[ui(17, 700), { color: colors.foreground }]}>No more bets</Text>
            <Text style={[ui(12), { color: colors.mutedForeground }]}>
              {`The ball is spinning · ${totalBetLabel(state)}`}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button label="Spinning…" icon={RotateCw} disabled fullWidth style={styles.action} />
        </View>
      </View>
    );
  }
  const rows = payoutRows(state);
  const paid = state.phase === "payout";
  const color = pocketColor(s.pocket);
  return (
    <View style={styles.round}>
      <View
        style={styles.resultRow}
        accessible
        role="status"
        accessibilityLabel={`Ball landed on ${pocketName(s.pocket)}. ${netLabel(state)}`}
      >
        <View style={[styles.ball, { backgroundColor: POCKET_FILL[color] }]}>
          <Text style={[ui(20, 800), { color: surfaces.chipInkLight }]}>{String(s.pocket)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ui(17, 700), { color: colors.foreground }]}>
            {`${String(s.pocket)} ${color[0]!.toUpperCase()}${color.slice(1)}`}
          </Text>
          <Text style={[ui(12), { color: colors.mutedForeground }]} numberOfLines={2}>
            {pocketFacts(rules, s.pocket)}
          </Text>
        </View>
        <Text
          style={[
            ui(17, 700),
            { color: s.net > 0 ? colors.correct : s.net < 0 ? colors.mistake : colors.foreground },
          ]}
        >
          {netLabel(state)}
        </Text>
      </View>
      <View style={styles.rows} role="list" accessibilityLabel="Bets this spin">
        {rows.map((r) => (
          <View key={r.spotId} style={styles.payRow} role="listitem" accessible>
            <Text style={[ui(13, 600), { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
              {`${r.name} · ${r.amount}`}
            </Text>
            <Text style={[ui(12), { color: colors.mutedForeground }]} numberOfLines={1}>
              {r.detail}
            </Text>
            <Text
              style={[
                ui(13, 700),
                styles.net,
                { color: r.outcome === "win" ? colors.correct : colors.mistake },
              ]}
            >
              {r.net}
            </Text>
          </View>
        ))}
      </View>
      {paid && state.bankrollBefore !== null && state.bankroll !== null ? (
        <Text style={[ui(13, 600), { color: colors.primary, paddingHorizontal: 16 }]}>
          {`Bankroll ${formatDollars(state.bankrollBefore)} → ${formatDollars(state.bankroll)}`}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {paid ? (
          <Button
            label="Next spin"
            icon={RotateCw}
            fullWidth
            onPress={() => dispatch({ type: "next" })}
            style={styles.action}
          />
        ) : (
          <Button
            label="Pay out"
            fullWidth
            onPress={() => dispatch({ type: "payout" })}
            style={styles.action}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, alignItems: "center" },
  column: { flex: 1, width: "100%", maxWidth: 440, backgroundColor: colors.background },
  history: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  pill: {
    width: 30,
    height: 30,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLatest: { width: 36, height: 36, borderWidth: 2, borderColor: colors.primary },
  middle: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  scrollBody: { flexGrow: 1 },
  coach: { position: "absolute", left: 16, right: 16, bottom: 12, zIndex: 20 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  loupeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  edge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
    minHeight: 28,
  },
  error: { color: colors.mistake, paddingHorizontal: 16, paddingTop: 4 },
  reset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  action: { flex: 1, height: 52 },
  round: { paddingTop: 12, gap: 8 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  ball: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  rows: { paddingHorizontal: 16, gap: 4 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 22 },
  net: { width: 64, textAlign: "right" },
});
