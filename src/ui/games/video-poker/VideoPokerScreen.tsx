/**
 * Video Poker (frame xfJEh): a 9/6 Jacks or Better machine by default, with Deuces Wild and
 * Double Double Bonus behind the book icon. Bet → Hold & draw → Result → Payout.
 *
 * The state and every rule live in `model.ts`; this component holds the state, runs the deal
 * animation, and records each graded hold and each hand's net into progress.
 *
 * Hydration: the first render is the empty Bet phase with no bankroll; the seed (from `?seed=`
 * or random) and the stored profile and progress arrive after mount.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { betCents, formatMoney as formatCents, getPayTable, holdMask } from "@/games/video-poker";
import { PRACTICE_BANKROLL_START } from "@/state/progress";
import { bankroll as bankrollOf } from "@/state/progressSelectors";
import {
  Button,
  CoachNote,
  Gradient,
  PhaseStepper,
  SegmentedControl,
  TableTopBar,
  colors,
  icons,
  radius,
  ui,
} from "@/ui/ds";
import { useProfile } from "@/ui/profile/profileStore";
import {
  endProgressSession,
  makeSessionId,
  recordDecision,
  recordHand,
  resetBankroll,
  startProgressSession,
  useProgressView,
} from "@/ui/progress/progressStore";
import { Gauge, Layers } from "./icons";
import {
  COIN_OPTIONS,
  DENOMINATION_OPTIONS,
  INITIAL_VP_STATE,
  VP_STEPS,
  type VpRecord,
  type VpState,
  askHint,
  betDollars,
  betTag,
  canChangeSettings,
  changeBet,
  collect,
  deal,
  dealBlocker,
  decisionSummary,
  denominationLabel,
  draw,
  handName,
  highlightedLine,
  hintFor,
  hintVisible,
  holdBest,
  isBroke,
  keepTags,
  mathRows,
  parseSeed,
  payLines,
  resolveMistake,
  resultHeadline,
  setCoins,
  setDenomination,
  setPayTable,
  statusLine,
  stepIndex,
  subtitle,
  toggle,
  toggleMath,
  withSeed,
} from "./model";
import {
  DecisionLine,
  HandRow,
  HistoryStrip,
  MathTable,
  NotePointer,
  PayTablePanel,
  ResultBanner,
  type SlotView,
} from "./parts";
import { RulesSheet } from "./RulesSheet";
import { machine } from "./theme";

const COLUMN = 390;
/** Milliseconds between cards turning over, per speed. */
const REVEAL_MS = { normal: 110, fast: 0 } as const;
type Speed = keyof typeof REVEAL_MS;

function readSeedParam(): number | null {
  if (typeof window === "undefined") return null;
  return parseSeed(new URLSearchParams(window.location.search).get("seed"));
}

export function VideoPokerScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const coach = profile.coach;
  const progress = useProgressView(false);
  const [state, setState] = useState<VpState>(INITIAL_VP_STATE);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const sessionRef = useRef<string | null>(null);

  // The seed is drawn after mount (hydration); `?seed=` makes a session reproducible.
  useEffect(() => {
    const seed = readSeedParam() ?? Math.floor(Math.random() * 0x100000000) >>> 0;
    setState((s) => (s.seed === null ? withSeed(s, seed) : s));
  }, []);

  useEffect(
    () => () => {
      if (sessionRef.current) endProgressSession(sessionRef.current);
    },
    [],
  );

  const storedBankroll = progress.ready ? bankrollOf(progress.data, "video-poker") : undefined;
  // The stake sits in the machine while the hand is in play.
  const shownBankroll =
    storedBankroll === undefined
      ? undefined
      : storedBankroll - (state.phase === "hold" ? betDollars(state.settings) : 0);

  const record = useCallback((r: VpRecord | null) => {
    if (!r) return;
    recordDecision({ game: "video-poker", ...r.decision });
    recordHand({ game: "video-poker", net: r.net });
  }, []);

  const onDeal = () => {
    if (dealBlocker(state, storedBankroll)) return;
    if (!sessionRef.current) {
      sessionRef.current = makeSessionId("video-poker");
      startProgressSession({ id: sessionRef.current, game: "video-poker" });
    }
    setState(deal(state));
  };
  const onDraw = () => {
    const next = draw(state, coach);
    setState(next.state);
    record(next.record);
  };
  const onResolve = (choice: "take-back" | "keep") => {
    const next = resolveMistake(state, choice);
    setState(next.state);
    record(next.record);
  };

  // ------------------------------------------------------------------------------------------
  // Deal animation: cards that changed turn over one by one.

  const round = state.round;
  const visibleCards = round ? (round.phase === "drawn" ? round.final : round.dealt) : null;
  const [faceUp, setFaceUp] = useState<boolean[]>([false, false, false, false, false]);
  const shownRef = useRef<readonly unknown[] | null>(null);
  const cardsKey = visibleCards?.map((c) => `${c.rank}${c.suit}`).join(" ") ?? "";
  useEffect(() => {
    const prev = shownRef.current as string[] | null;
    const now = cardsKey ? cardsKey.split(" ") : null;
    shownRef.current = now;
    if (!now) {
      setFaceUp([false, false, false, false, false]);
      return;
    }
    const changed = now.map((c, i) => !prev || prev[i] !== c);
    if (REVEAL_MS[speed] === 0) {
      setFaceUp([true, true, true, true, true]);
      return;
    }
    setFaceUp((f) => f.map((up, i) => (changed[i] ? false : up)));
    const order = changed.flatMap((c, i) => (c ? [i] : []));
    const timers = order.map((index, n) =>
      setTimeout(
        () => setFaceUp((f) => f.map((up, i) => (i === index ? true : up))),
        (n + 1) * REVEAL_MS[speed],
      ),
    );
    return () => {
      timers.forEach(clearTimeout);
      setFaceUp([true, true, true, true, true]);
    };
    // Re-run only when the cards on screen change, not on a speed toggle.
  }, [cardsKey]);

  // ------------------------------------------------------------------------------------------
  // View

  const tags = keepTags(state, coach);
  const slots: SlotView[] = [0, 1, 2, 3, 4].map((i) => ({
    card: visibleCards?.[i] ?? null,
    faceUp: !!visibleCards && (faceUp[i] ?? false),
    held: !!round && (round.held[i] ?? false),
    keep: tags[i] ?? false,
  }));
  const lines = useMemo(
    () => payLines(state.settings, highlightedLine(state, coach)),
    [state, coach],
  );
  const showHint = hintVisible(state, coach);
  const hint = showHint ? hintFor(state) : null;
  const blocker = dealBlocker(state, storedBankroll);
  const broke = storedBankroll !== undefined && isBroke(storedBankroll);
  const betText = formatCents(betCents(state.settings));

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, title: "Video Poker" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <TableTopBar
            title="Video Poker"
            subtitle={subtitle(state.settings)}
            bankroll={shownBankroll}
            onBack={() => router.push("/lobby")}
            onBook={() => setRulesOpen(true)}
            bookLabel="Rules and pay tables"
          />
          <PhaseStepper current={stepIndex(state.phase)} steps={VP_STEPS} />

          <View style={styles.machine}>
            <Gradient from={machine.from} to={machine.to} />
            <PayTablePanel left={lines.left} right={lines.right} />
            <HandRow
              slots={slots}
              interactive={state.phase === "hold" && !state.mistake}
              onToggle={(i) => setState((s) => toggle(s, i))}
            />
            <View style={styles.status}>
              <Text style={[ui(13), { color: machine.label, flex: 1 }]} numberOfLines={2}>
                {statusLine(state)}
              </Text>
              <Text style={[ui(13, 800, { letterSpacing: 1 }), { color: machine.gold }]}>
                {betTag(state.settings)}
              </Text>
            </View>
          </View>

          <View style={styles.below}>
            {state.phase === "bet" ? (
              <BetControls
                state={state}
                betText={betText}
                blocker={storedBankroll === undefined || state.seed === null ? null : blocker}
                broke={broke}
                onCoins={(c) => setState((s) => setCoins(s, c))}
                onDenomination={(d) => setState((s) => setDenomination(s, d))}
              />
            ) : null}

            {state.phase === "hold" && state.mistake ? (
              <View style={styles.coachLayer}>
                <NotePointer />
                <CoachNote
                  variant="mistake"
                  width="100%"
                  kind={state.mistake.tag}
                  title={state.mistake.title}
                  body={state.mistake.body}
                  primary={{
                    label: "Hold the better cards",
                    onPress: () => onResolve("take-back"),
                  }}
                  secondary={{ label: "Keep my hold", onPress: () => onResolve("keep") }}
                />
              </View>
            ) : null}

            {state.phase === "hold" && hint ? (
              <View style={styles.coachLayer}>
                <NotePointer />
                <CoachNote
                  variant="hint"
                  width="100%"
                  kind={hint.tag}
                  title={hint.title}
                  body={hint.body}
                  primary={{ label: hint.holdLabel, onPress: () => setState(holdBest) }}
                  secondary={{
                    label: state.mathOpen ? "Hide the math" : "Show the math",
                    onPress: () => setState(toggleMath),
                  }}
                />
                {state.mathOpen && round ? (
                  <View style={styles.mathWrap}>
                    <MathTable rows={mathRows(round, holdMask(round.held))} />
                  </View>
                ) : null}
              </View>
            ) : null}

            {state.phase === "hold" && !hint && !state.mistake ? (
              <View style={styles.hintRow}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={icons.Lightbulb}
                  label="Hint"
                  accessibilityLabel="Ask Marcus for a hint"
                  onPress={() => setState(askHint)}
                />
              </View>
            ) : null}

            {state.phase === "result" && round?.phase === "drawn" ? (
              <View style={styles.resultBlock}>
                <ResultBanner
                  won={round.winCents > 0}
                  headline={resultHeadline(round)}
                  detail={
                    round.winCents > 0
                      ? `${handName(round.result, round.settings.payTableId)} pays ${round.coinsWon} coins at ${denominationLabel(round.settings.denominationCents)}.`
                      : `No paying hand. The ${betText} bet is lost.`
                  }
                />
                {state.decision ? (
                  <DecisionLine {...decisionSummary(state.decision, state.settings)} />
                ) : null}
              </View>
            ) : null}

            {state.phase === "payout" && round?.phase === "drawn" ? (
              <View style={styles.resultBlock}>
                <Text style={[ui(14), { color: colors.mutedForeground }]}>
                  {round.winCents > 0
                    ? `${formatCents(round.winCents)} collected. `
                    : "Nothing to collect. "}
                  {shownBankroll !== undefined
                    ? `Practice bankroll ${formatCents(Math.round(shownBankroll * 100))}.`
                    : ""}
                </Text>
                {blocker && !broke && storedBankroll !== undefined ? (
                  <Text style={[ui(13, 600), { color: colors.mistake }]}>{blocker}</Text>
                ) : null}
                {broke ? <ResetOffer /> : null}
              </View>
            ) : null}

            {state.phase === "payout" || state.phase === "bet" ? (
              <View style={styles.historyWrap}>
                <HistoryStrip history={state.history} />
              </View>
            ) : null}
          </View>

          <View style={styles.actions}>
            {state.phase === "payout" ? (
              <Button
                variant="secondary"
                size="md"
                label="Change bet"
                onPress={() => setState(changeBet)}
                style={styles.side}
              />
            ) : (
              <Button
                variant="secondary"
                size="md"
                icon={Gauge}
                label={speed === "fast" ? "Fast" : "Speed"}
                accessibilityLabel={`Deal speed: ${speed}. Switch to ${speed === "fast" ? "normal" : "fast"}`}
                onPress={() => setSpeed((s) => (s === "fast" ? "normal" : "fast"))}
                style={styles.side}
              />
            )}
            {state.phase === "bet" ? (
              <Button
                label="Deal"
                size="lg"
                icon={Layers}
                accessibilityLabel={`Deal, bet ${betText}`}
                disabled={blocker !== null}
                onPress={onDeal}
                style={styles.main}
              />
            ) : null}
            {state.phase === "hold" && !state.mistake ? (
              <Button label="Draw" size="lg" icon={Layers} onPress={onDraw} style={styles.main} />
            ) : null}
            {state.phase === "result" && round?.phase === "drawn" ? (
              <Button
                label={round.winCents > 0 ? `Collect ${formatCents(round.winCents)}` : "Continue"}
                size="lg"
                onPress={() => setState(collect)}
                style={styles.main}
              />
            ) : null}
            {state.phase === "payout" ? (
              <Button
                label="Deal again"
                size="lg"
                icon={Layers}
                accessibilityLabel={`Deal again, bet ${betText}`}
                disabled={blocker !== null}
                onPress={onDeal}
                style={styles.main}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
      {rulesOpen ? (
        <View style={styles.sheetLayer}>
          <View style={styles.sheetColumn}>
            <RulesSheet
              current={state.settings.payTableId}
              canSwitch={canChangeSettings(state)}
              onSelect={(id) => setState((s) => setPayTable(s, id))}
              onClose={() => setRulesOpen(false)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ResetOffer() {
  return (
    <View style={styles.reset}>
      <Text style={[ui(14), { color: colors.foreground }]}>
        Your video poker bankroll is out of practice chips.
      </Text>
      <Button
        label={`Reset to ${formatCents(PRACTICE_BANKROLL_START * 100)}`}
        accessibilityLabel="Reset practice bankroll"
        onPress={() => resetBankroll("video-poker")}
      />
    </View>
  );
}

function BetControls({
  state,
  betText,
  blocker,
  broke,
  onCoins,
  onDenomination,
}: {
  state: VpState;
  betText: string;
  blocker: string | null;
  broke: boolean;
  onCoins: (coins: number) => void;
  onDenomination: (cents: number) => void;
}) {
  const table = getPayTable(state.settings.payTableId);
  return (
    <View style={styles.bet}>
      <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
        COINS
      </Text>
      <SegmentedControl
        accessibilityLabel="Coins"
        options={COIN_OPTIONS.map((c) => ({
          value: String(c),
          label: `${c} coin${c === 1 ? "" : "s"}`,
        }))}
        value={String(state.settings.coins)}
        onChange={(v) => onCoins(Number(v))}
      />
      <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
        COIN VALUE
      </Text>
      <SegmentedControl
        accessibilityLabel="Coin value"
        options={DENOMINATION_OPTIONS.map((d) => ({
          value: String(d),
          label: denominationLabel(d),
        }))}
        value={String(state.settings.denominationCents)}
        onChange={(v) => onDenomination(Number(v))}
      />
      <Text style={[ui(13), { color: colors.mutedForeground }]}>
        {`Bet ${betText} on ${table.name}. `}
        {state.settings.coins === 5
          ? "Five coins pay 4,000 on a royal flush."
          : "Only five coins pay 4,000 on a royal flush; fewer pay 250 per coin."}
      </Text>
      {blocker && !broke ? (
        <Text style={[ui(13, 600), { color: colors.mistake }]}>{blocker}</Text>
      ) : null}
      {broke ? <ResetOffer /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { alignItems: "center" },
  column: { width: "100%", maxWidth: COLUMN },
  machine: {
    gap: 14,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 18,
    overflow: "hidden",
  },
  status: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  below: { gap: 14, paddingBottom: 4 },
  coachLayer: { alignItems: "center", paddingHorizontal: 16, paddingBottom: 4, marginTop: -14 },
  mathWrap: { width: "100%" },
  hintRow: { alignItems: "center", paddingTop: 10 },
  resultBlock: { gap: 14, paddingHorizontal: 16, paddingTop: 16 },
  historyWrap: { paddingHorizontal: 16 },
  bet: { gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  reset: {
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  side: { width: 130, height: 52, paddingHorizontal: 14 },
  main: { flex: 1 },
  sheetLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    zIndex: 10,
  },
  sheetColumn: { flex: 1, width: "100%", maxWidth: COLUMN },
});
