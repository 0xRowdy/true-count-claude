/**
 * The Play surface, Tableside (frames CcmBm 04a Betting, N6Lcl 04b Dealing · mistake caught,
 * WSAfm 04c Result, w7wLdL 04d Payout): a full round of blackjack on the felt — bet, deal,
 * act, settle, collect — in a phone-width column, centred on a wide screen.
 *
 * The constraints are requirements rather than taste (CONTEXT.md):
 *
 * 1. **Buttons, never gestures; never a disabled legal action** (invariant 7). The action bar
 *    renders exactly `currentLegalActions`. The bet spot's long-press has a button twin
 *    (Clear, and the chip rack), so no wager depends on a gesture.
 * 2. **Feedback while the cards are visible; every wrong verdict explained** (invariants 2,
 *    3). Every play is graded at the tap (`tableExplanation.ts`). With the coach on, a wrong
 *    play pauses the hand on a Coach Note before it reaches the cards; with it off, the Result
 *    reviews every Decision with the felt still dealt, and each opens its full Explanation.
 * 3. **Never a dead end** (invariant 6): a bankroll below the minimum is met with a reset in
 *    place of the Deal button.
 * 4. **Report a bug** (invariant 10) is in the book panel, one tap from every moment of a
 *    round, and it captures the live Shoe and round.
 *
 * The count, the shoe and the chart sit behind the book icon and the SHOE on the felt, as
 * the design draws them, rather than on the cloth.
 */

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Stack, useRouter } from "expo-router";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import type { Action } from "@/engine/hand";
import { DEFAULT_RULES } from "@/engine/rules";
import {
  type RoundState,
  currentLegalActions,
  insuranceStake,
  visibleDealerCards,
} from "@/engine/round";
import { isCutCardReached } from "@/engine/shoe";
import type { DrillAction } from "@/drills/explanation";
import {
  Badge,
  Button,
  ChipRack,
  CoachNote,
  PhaseStepper,
  TableTopBar,
  icons,
  portraits,
  type CardSize,
  type LucideIcon,
} from "@/ui/ds";
import { type ChipValue, formatMoney } from "@/ui/ds/format";
import { colors, display, radius, ui } from "@/ui/ds/tokens";
import { ACTION_NAME } from "@/ui/explanation/explanationFormat";
import { useProfile } from "@/ui/profile/profileStore";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import { TestingBanner, useTestedStrategy } from "@/ui/strategies/TestingBanner";
import { type PlaySession, usePlaySession } from "@/ui/session/usePlaySession";
import {
  type CoachedDecision,
  type ReviewRow,
  hintCopy,
  hintsEveryDecision,
  mistakeCopy,
  offersHintButton,
  reviewRows,
  shouldCatch,
  takeBackAction,
} from "./coach";
import type { CountVisibility } from "./CountPanel";
import {
  BetCircle,
  ChipStackView,
  DealerLabel,
  DealerTray,
  FeltPill,
  FeltRules,
  FeltSurface,
  HandBox,
  ShoeButton,
} from "./Felt";
import { felt } from "./feltTokens";
import { useTableFeedback } from "./feedback";
import { type DraftAdvice, draftAdvice } from "./draftCoach";
import { type TableDecision, gradeTableInsurance, gradeTablePlay } from "./tableExplanation";
import { type SheetTab, TableSheet } from "./TableSheet";
import {
  PHASE_INDEX,
  type BetSizing,
  type HistoryChip,
  type OutcomeSummary,
  type TablePhase,
  type TotalLabel,
  addChip,
  betSizing,
  chipStack,
  collectAmount,
  dealerTotal,
  feltRules,
  historyChips,
  outcomeSummary,
  playerTotal,
  rackChips,
  removeChip,
  shownBankroll,
  tablePhase,
  tableSubtitle,
} from "./tableView";
import {
  type PlayTable as PlayTableState,
  STARTING_BANKROLL,
  availableBankroll,
  insuranceWithheld,
  isBroke,
  usePlayTable,
} from "./usePlayTable";

/** The design's phone frame is 390 wide; a little more is allowed before the column stops. */
const COLUMN_MAX = 430;

/** The order actions sit in, so muscle memory holds from hand to hand. */
const ACTION_ORDER: readonly Action[] = ["hit", "stand", "double", "split", "surrender"];

const ACTION_HINT: Record<Action, string> = {
  hit: "Draw one more card to this hand.",
  stand: "Take no more cards and move on.",
  double: "Double the wager and take exactly one card.",
  split: "Split the pair into two hands, each with its own wager.",
  surrender: "Give up the hand and keep half the wager.",
};

/** A play the coach caught before it reached the cards. */
type Caught =
  | { readonly kind: "play"; readonly action: Action; readonly result: TableDecision }
  | { readonly kind: "insurance"; readonly take: boolean; readonly result: TableDecision };

function handStake(round: RoundState): number {
  return round.playerHands.reduce(
    (total, hand) => total + (hand.doubled ? hand.bet * 2 : hand.bet),
    0,
  );
}

function pillOf(label: TotalLabel) {
  return { text: label.text, tone: label.tone };
}

export function PlayTable() {
  const configured = useConfiguredRules();
  // Must stay ahead of `usePlaySession`: its seed effect has to reach the prerendered table
  // before the Session's restore and rules effects replace it (#32).
  const controller = usePlayTable();
  const { table } = controller;
  // Every transition goes through the Session controller, so a Decision cannot be made
  // without being recorded and a round cannot settle without its result being written.
  const play = usePlaySession(controller, configured);
  const { profile } = useProfile();
  const coach = profile.coach;
  const feedback = useTableFeedback();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // The hand's graded Decisions, each carrying its Explanation. Cleared at the next deal,
  // never at settlement: the cards stay up through the Result, and so does the why.
  const [decisions, setDecisions] = useState<readonly CoachedDecision[]>([]);
  const [caught, setCaught] = useState<Caught | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [collected, setCollected] = useState(false);
  const [spot, setSpot] = useState(DEFAULT_RULES.minBet);
  const [chip, setChip] = useState<ChipValue>(25);
  const [capNote, setCapNote] = useState<string | null>(null);
  const [lastBet, setLastBet] = useState<number | null>(null);
  const [dealtFrom, setDealtFrom] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetTab | null>(null);
  const [focus, setFocus] = useState<number | undefined>(undefined);
  const [explanationOpen, setExplanationOpen] = useState(true);
  const [visibility, setVisibility] = useState<CountVisibility>("shown");
  // "Test in trainer" (`?strategy=<id>`): the draft under test, and what the coach last said
  // about it. Grading and the Session log stay against the engine (see draftCoach.ts).
  const tested = useTestedStrategy("blackjack");
  const testedDraft = tested.status === "ready" ? tested.draft : null;
  const [draftNote, setDraftNote] = useState<DraftAdvice | null>(null);

  const round = table.round;
  const phase: TablePhase = tablePhase(round, collected);
  const rules = table.rules;
  const available = availableBankroll(table);
  const broke = isBroke(table);

  // The coach's portrait is fetched before the first note, so a caught mistake never shows an
  // empty disc while the photo loads.
  useEffect(() => {
    const source = portraits.dealer as unknown;
    const uri =
      typeof source === "string"
        ? source
        : typeof source === "object" && source !== null && "uri" in source
          ? String((source as { uri: unknown }).uri)
          : null;
    if (uri) Image.prefetch(uri).catch(() => undefined);
  }, []);

  // The wager the engine actually dealt — `deal` clamps it to the bankroll and the table — is
  // the one Rebet and Next hand repeat, never the amount that was asked for.
  const dealtBet = round?.bet ?? null;
  useEffect(() => {
    if (dealtBet === null) return;
    setLastBet(dealtBet);
    setSpot(dealtBet);
  }, [dealtBet]);

  // A configured table with a higher minimum lifts an under-minimum spot to it.
  useEffect(() => {
    setSpot((current) => (current > 0 && current < rules.minBet ? rules.minBet : current));
  }, [rules.minBet]);

  const chips = rackChips(rules, available);
  const selected: ChipValue | undefined = chips.includes(chip) ? chip : chips[chips.length - 1];

  const hint = useMemo(() => {
    const wanted = hintsEveryDecision(coach) || hintOpen;
    return wanted && phase === "deal" && caught === null ? hintCopy(table) : null;
  }, [coach, hintOpen, phase, caught, table]);

  const openSheet = (tab: SheetTab, at?: number) => {
    setFocus(at);
    setSheet(tab);
  };

  // --- Transitions -------------------------------------------------------------------------

  const startDeal = (bet: number) => {
    feedback.play("deal");
    setDecisions([]);
    setDraftNote(null);
    setCaught(null);
    setHintOpen(false);
    setCollected(false);
    setCapNote(null);
    setDealtFrom(available);
    play.deal(bet);
  };

  const remember = (result: TableDecision | null, playedInstead: DrillAction | null) => {
    if (result) setDecisions((current) => [...current, { result, playedInstead }]);
  };

  const applyPlay = (action: Action, result: TableDecision | null, takenBack?: Action) => {
    // Doubling and splitting push chips out; everything else is a card off the shoe.
    feedback.play(action === "double" || action === "split" ? "chips" : "card");
    remember(result, takenBack === undefined ? null : action);
    setCaught(null);
    setHintOpen(false);
    play.act(action, takenBack);
  };

  const onAction = (action: Action) => {
    // Graded against the table as it stands *before* the action — the hand on the felt.
    const result = gradeTablePlay(table, action, Date.now());
    const advice =
      testedDraft && result?.kind === "decision"
        ? draftAdvice(testedDraft, result.explanation, action, result.correctAction)
        : null;
    setDraftNote(advice);
    // The draft's own move is what is being tested: the coach explains it rather than stopping it.
    if (result && shouldCatch(coach, result) && advice?.kind !== "follows") {
      setCaught({ kind: "play", action, result });
      setHintOpen(false);
      return;
    }
    applyPlay(action, result);
  };

  const applyInsurance = (take: boolean, result: TableDecision | null, takenBack?: boolean) => {
    if (take) feedback.play("chips");
    remember(result, takenBack === undefined ? null : take ? "insurance" : "decline-insurance");
    setCaught(null);
    setHintOpen(false);
    play.insurance(take, takenBack);
  };

  const onInsurance = (take: boolean) => {
    const result = gradeTableInsurance(table, take, Date.now());
    if (result && shouldCatch(coach, result)) {
      setCaught({ kind: "insurance", take, result });
      setHintOpen(false);
      return;
    }
    applyInsurance(take, result);
  };

  const collect = () => {
    const net = round?.settlement?.net ?? 0;
    feedback.play(net > 0 ? "win" : net < 0 ? "lose" : "push");
    setCollected(true);
  };

  /** From the payout back to the bet prompt, with `amount` on the spot. */
  const toBetting = (amount: number) => {
    setCollected(false);
    setSpot(amount);
    play.next();
  };

  const onSpotPress = () => {
    if (selected === undefined) return;
    const change = addChip(spot, selected, rules, table.bankroll);
    setSpot(change.amount);
    setCapNote(change.capped);
  };

  const onSpotLongPress = () => {
    if (selected === undefined) return;
    setSpot((current) => removeChip(current, selected));
    setCapNote(null);
  };

  const startNew = () => {
    setDecisions([]);
    setCaught(null);
    setCollected(false);
    play.startNew();
  };

  // --- Rendering ---------------------------------------------------------------------------

  const fr = feltRules(rules);
  const compact = width < 380;
  const handCount = round?.playerHands.length ?? 0;
  const cardSize: CardSize = handCount > 2 || (handCount === 2 && compact) ? "sm" : "md";
  const history = historyChips(play.session?.rounds ?? []);
  const settledNet = round?.settlement?.net ?? 0;
  const bankrollColor = phase === "payout" && settledNet > 0 ? colors.correct : colors.primary;
  const roomy = phase === "bet" || phase === "payout";
  const stake = round ? handStake(round) : spot;
  const single = round && round.playerHands.length === 1 ? round.playerHands[0] : undefined;

  const lastEntry = decisions[decisions.length - 1];
  const tag: { text: string; mistake: boolean } | null =
    caught !== null
      ? {
          text:
            caught.kind === "play"
              ? `You: ${ACTION_NAME[caught.action]}`
              : `You: ${caught.take ? "Insure" : "No insurance"}`,
          mistake: true,
        }
      : phase === "deal" && lastEntry
        ? {
            text: `You: ${ACTION_NAME[lastEntry.playedInstead ?? lastEntry.result.actionTaken]}`,
            mistake: false,
          }
        : null;

  const feltView = (
    <FeltSurface height={roomy ? 460 : 410}>
      <DealerTray />
      <ShoeButton onPress={() => openSheet("count")} />

      <View style={{ marginTop: roomy ? 20 : 14 }}>
        <DealerLabel />
      </View>
      <View style={[styles.row3, styles.dealerRow]}>
        <View style={styles.side} />
        {round ? (
          <HandBox
            label="Dealer's hand"
            holeCard={!round.dealerHoleCardRevealed}
            spread={!round.dealerHoleCardRevealed}
            cards={visibleDealerCards(round)}
            tilt={false}
            dim={phase === "payout"}
          />
        ) : (
          <HandBox label="Dealer's hand, empty" cards={[]} />
        )}
        <View style={[styles.side, styles.sideRight]}>
          {round && round.dealerHoleCardRevealed && phase !== "payout" ? (
            <FeltPill {...pillOf(dealerTotal(round.dealerHand.cards))} />
          ) : null}
        </View>
      </View>

      <View style={styles.rulesBlock}>
        <FeltRules pays={fr.pays} dealer={fr.dealer} />
      </View>

      <View style={[styles.row3, { marginTop: roomy ? 24 : 18 }]}>
        <View style={[styles.side, styles.sideLeft]}>
          {tag ? (
            <FeltPill
              text={tag.text}
              tone={tag.mistake ? "mistake" : "neutral"}
              icon={icons.Hand}
              size={12}
            />
          ) : phase === "result" && single ? (
            <FeltPill {...pillOf(playerTotal(single))} />
          ) : null}
        </View>
        {round ? (
          <View style={styles.hands}>
            {round.playerHands.map((hand, index) => (
              <View key={index} style={styles.handColumn}>
                <HandBox
                  label={`Your hand${round.playerHands.length > 1 ? ` ${index + 1}` : ""}`}
                  cards={hand.cards}
                  doubled={hand.doubled}
                  size={cardSize}
                  active={
                    round.phase === "player" &&
                    round.playerHands.length > 1 &&
                    index === round.activeHandIndex
                  }
                  dim={phase === "payout"}
                />
                {round.playerHands.length > 1 && phase !== "payout" ? (
                  <FeltPill {...pillOf(playerTotal(hand))} size={11} />
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <HandBox label="Your hand, empty" cards={[]} placeholder="Your cards" />
        )}
        <View style={[styles.side, styles.sideRight]}>
          {phase === "deal" && single ? <FeltPill {...pillOf(playerTotal(single))} /> : null}
        </View>
      </View>

      {phase === "payout" && round ? <CollectHint round={round} /> : null}

      <View style={[styles.row3, { marginTop: phase === "payout" ? 10 : 14 }]}>
        <View style={[styles.side, styles.sideLeft]}>
          {phase === "payout" ? <FeltPill text={`Bet ${formatMoney(stake)}`} size={14} /> : null}
        </View>
        <BetCircle
          amount={stake}
          chips={chipStack(stake)}
          active={roomy}
          {...(phase === "bet" && !broke
            ? {
                onPress: onSpotPress,
                onLongPress: onSpotLongPress,
                ...(selected !== undefined
                  ? { removeLabel: `Remove a ${formatMoney(selected)} chip` }
                  : {}),
              }
            : {})}
        />
        <View style={[styles.side, styles.sideRight]}>
          {phase === "payout" && round ? (
            <PayoutStack net={settledNet} paid={outcomeSummary(round).paid} />
          ) : stake > 0 ? (
            <FeltPill text={formatMoney(stake)} size={14} />
          ) : null}
        </View>
      </View>

      {phase === "bet" ? <BankrollTip compact={compact} /> : null}
    </FeltSurface>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, title: "Blackjack" }} />
      <View style={styles.column}>
        <TableTopBar
          title="Blackjack"
          subtitle={tableSubtitle(rules)}
          bankroll={shownBankroll(available, round, phase)}
          bankrollColor={bankrollColor}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          onBook={() => openSheet(decisions.length > 0 ? "why" : "table")}
        />
        <PhaseStepper current={PHASE_INDEX[phase]} />
        <TestingBanner
          game="blackjack"
          tested={tested}
          detail="The coach checks your plays against this chart and shows what each departure from the table's play costs."
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {feltView}

          {roomy ? (
            <>
              <HistoryRail chips={history} highlightNewest={phase === "payout"} />
              <Notices
                table={table}
                play={play}
                capNote={capNote}
                onDetails={() => openSheet("table")}
                onStartNew={startNew}
              />
              {broke ? (
                <OutOfChips
                  bankroll={table.bankroll}
                  minBet={rules.minBet}
                  onReset={play.resetBankroll}
                  {...(play.recording ? { onEnd: () => play.end("bankroll-exhausted") } : {})}
                />
              ) : phase === "bet" ? (
                <BetActions
                  spot={spot}
                  minBet={rules.minBet}
                  lastBet={lastBet}
                  onClear={() => {
                    setSpot(0);
                    setCapNote(null);
                  }}
                  onRebet={() => {
                    if (lastBet !== null) setSpot(lastBet);
                  }}
                  onDeal={() => startDeal(spot)}
                />
              ) : (
                <PayoutActions
                  lastBet={lastBet ?? spot}
                  onClear={() => toBetting(0)}
                  onRebet={() => toBetting(lastBet ?? spot)}
                  onNext={() => startDeal(lastBet ?? spot)}
                />
              )}
              {!broke && selected !== undefined ? (
                <ChipRack selected={selected} onSelect={setChip} values={chips} />
              ) : null}
            </>
          ) : null}

          {draftNote && (phase === "deal" || phase === "result") ? (
            <View style={styles.coachLayer}>
              <CoachNote
                variant="hint"
                kind={draftNote.eyebrow}
                title={draftNote.title}
                body={draftNote.body}
                width="100%"
              />
            </View>
          ) : null}
          {phase === "deal" && round ? (
            <View style={styles.dealArea}>
              <Notices
                table={table}
                play={play}
                capNote={null}
                onDetails={() => openSheet("table")}
                onStartNew={startNew}
              />
              {caught ? (
                <MistakeLayer
                  caught={caught}
                  legal={currentLegalActions(round)}
                  onTakeBack={(replacement) => {
                    if (caught.kind === "play") {
                      applyPlay(replacement as Action, caught.result, caught.action);
                    } else {
                      applyInsurance(replacement === "insurance", caught.result, caught.take);
                    }
                  }}
                  onKeep={() => {
                    if (caught.kind === "play") applyPlay(caught.action, caught.result);
                    else applyInsurance(caught.take, caught.result);
                  }}
                />
              ) : (
                <>
                  {hint ? (
                    <View style={styles.coachLayer}>
                      <CoachNote
                        variant="hint"
                        {...(hint.kind ? { kind: hint.kind } : {})}
                        title={hint.title}
                        body={hint.body}
                        width="100%"
                      />
                    </View>
                  ) : null}
                  {round.phase === "insurance" ? (
                    <InsuranceBar stake={insuranceStake(round.bet)} onDecide={onInsurance} />
                  ) : (
                    <ActionBar
                      legal={currentLegalActions(round)}
                      handLabel={
                        round.playerHands.length > 1
                          ? `Hand ${round.activeHandIndex + 1} of ${round.playerHands.length}`
                          : null
                      }
                      withheldStake={insuranceWithheld(table) ? insuranceStake(round.bet) : null}
                      onAction={onAction}
                    />
                  )}
                  {offersHintButton(coach) && !hintOpen ? (
                    <View style={styles.hintRow}>
                      <Button
                        label="Hint"
                        variant="ghost"
                        icon={icons.Lightbulb}
                        onPress={() => setHintOpen(true)}
                        accessibilityHint="Ask the dealer for the right play on this hand."
                      />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {phase === "result" && round ? (
            <ResultPanel
              summary={outcomeSummary(round)}
              rows={reviewRows(decisions)}
              sizing={dealtFrom !== null ? betSizing(round.bet, dealtFrom) : null}
              collect={collectAmount(round)}
              onWhy={(index) => openSheet("why", index)}
              onReplay={() => openSheet("why", decisions.length > 0 ? 0 : undefined)}
              onCollect={collect}
            />
          ) : null}
        </ScrollView>
      </View>

      <TableSheet
        tab={sheet}
        onChangeTab={(tab) => {
          setFocus(undefined);
          setSheet(tab);
        }}
        onClose={() => setSheet(null)}
        table={table}
        play={play}
        decisions={decisions.map((entry) => entry.result)}
        focus={focus}
        roundOver={round === null}
        explanationOpen={explanationOpen}
        onChangeExplanationOpen={setExplanationOpen}
        visibility={visibility}
        onChangeVisibility={setVisibility}
        onShuffle={() => {
          feedback.play("shuffle");
          play.shuffle();
        }}
        onStartNew={() => {
          setSheet(null);
          startNew();
        }}
      />
    </View>
  );
}

// --- On the felt ---------------------------------------------------------------------------

/** "Keep bets near 2% of your bankroll." — the bankroll tip on the felt (CcmBm). */
function BankrollTip({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.tip, compact && styles.tipCompact]} role="note">
      <View style={styles.tipHead}>
        <icons.Lightbulb size={12} color={colors.coachAccent} strokeWidth={2} />
        <Text style={[ui(9, 800, { letterSpacing: 1 }), { color: colors.coachAccent }]}>TIP</Text>
      </View>
      <Text style={[ui(11, 400, { lineHeight: 15 }), { color: colors.ink }]}>
        Keep bets near 2% of your bankroll.
      </Text>
    </View>
  );
}

function CollectHint({ round }: { round: RoundState }) {
  const amount = collectAmount(round);
  return (
    <View style={styles.collectHint}>
      <icons.ArrowDown size={14} color={felt.collect} strokeWidth={2} />
      <Text style={[ui(12, 600), { color: felt.collect }]}>
        {amount > 0
          ? `${formatMoney(amount)} moving to your rack`
          : `Dealer takes ${formatMoney(handStake(round))}`}
      </Text>
    </View>
  );
}

/** The win stack and its label: "+$100 / paid 1:1" (w7wLdL). */
function PayoutStack({ net, paid }: { net: number; paid: string }) {
  if (net <= 0) {
    return (
      <FeltPill
        text={net < 0 ? `−${formatMoney(-net)}` : "Push"}
        tone={net < 0 ? "mistake" : "neutral"}
        size={14}
      />
    );
  }
  return (
    <View style={styles.payout}>
      <ChipStackView chips={chipStack(net, 4)} />
      <View style={styles.paid} accessible accessibilityLabel={`Won ${formatMoney(net)}, ${paid}`}>
        <Text style={[ui(15, 800), { color: felt.onCorrect }]}>+{formatMoney(net)}</Text>
        <Text style={[ui(10, 600), { color: felt.onCorrectMuted }]}>{paid}</Text>
      </View>
    </View>
  );
}

// --- Below the felt ------------------------------------------------------------------------

const HISTORY_STYLE: Record<HistoryChip["tone"], { bg: string; fg: string }> = {
  blackjack: { bg: colors.primary, fg: colors.primaryForeground },
  win: { bg: colors.correct, fg: felt.onCorrect },
  loss: { bg: colors.muted, fg: colors.foreground },
  push: { bg: colors.muted, fg: colors.mutedForeground },
};

/** The "LAST" strip: the Session's latest rounds, newest first (CcmBm, w7wLdL). */
function HistoryRail({
  chips,
  highlightNewest,
}: {
  chips: readonly HistoryChip[];
  highlightNewest: boolean;
}) {
  return (
    <View style={styles.history} accessibilityLabel="Last hands">
      <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
        LAST
      </Text>
      {chips.length === 0 ? (
        <Text style={[ui(12), { color: colors.mutedForeground }]}>No hands yet</Text>
      ) : (
        chips.map((chip, i) => {
          const tone = HISTORY_STYLE[chip.tone];
          return (
            <View
              key={chip.key}
              style={[
                styles.historyChip,
                { backgroundColor: tone.bg },
                highlightNewest && i === 0 && styles.historyNew,
              ]}
            >
              <Text style={[ui(12, 700), { color: tone.fg }]}>{chip.label}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

function Notices({
  table,
  play,
  capNote,
  onDetails,
  onStartNew,
}: {
  table: PlayTableState;
  play: PlaySession;
  capNote: string | null;
  onDetails: () => void;
  onStartNew: () => void;
}) {
  const cutCardOut = isCutCardReached(table.round?.shoe ?? table.shoe);
  const items: ReactNode[] = [];
  if (capNote) items.push(<Badge key="cap" label={capNote} tone="primary" />);
  if (table.justShuffled) {
    items.push(
      <Badge key="shuffle" label="Cut card reached — new shoe, count reset" tone="primary" />,
    );
  } else if (cutCardOut && table.round !== null) {
    items.push(
      <Badge key="cut" label="Cut card is out — last round on this shoe" tone="mistake" />,
    );
  }
  if (play.pendingRules) {
    items.push(
      <Pressable
        key="pending"
        accessibilityRole="button"
        accessibilityLabel="New table waiting — details"
        onPress={onDetails}
        style={styles.noticeTap}
      >
        <Badge label="New table waiting — details" tone="primary" />
      </Pressable>,
    );
  }
  if (play.ended) {
    items.push(
      <View key="ended" style={styles.ended}>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>
          Session closed — its statistics are kept.
        </Text>
        <Button label="Start a new session" variant="secondary" size="sm" onPress={onStartNew} />
      </View>,
    );
  }
  if (play.error) {
    items.push(
      <Text key="error" style={[ui(12), { color: colors.mistake }]}>
        {play.error}
      </Text>,
    );
  }
  if (items.length === 0) return null;
  return <View style={styles.notices}>{items}</View>;
}

function BetActions({
  spot,
  minBet,
  lastBet,
  onClear,
  onRebet,
  onDeal,
}: {
  spot: number;
  minBet: number;
  lastBet: number | null;
  onClear: () => void;
  onRebet: () => void;
  onDeal: () => void;
}) {
  const short = spot < minBet;
  return (
    <View>
      <View style={styles.actions}>
        <Button
          label="Clear"
          variant="secondary"
          icon={icons.X}
          onPress={onClear}
          accessibilityHint="Take every chip off the spot."
          style={styles.grow}
        />
        <Button
          label="Rebet"
          variant="secondary"
          icon={icons.Repeat}
          onPress={onRebet}
          // Not a player action: there is simply no previous bet to repeat yet.
          disabled={lastBet === null}
          accessibilityHint={
            lastBet === null
              ? "No previous bet yet."
              : `Put ${formatMoney(lastBet)} back on the spot.`
          }
          style={styles.grow}
        />
        <Button
          label="Deal"
          icon={icons.Play}
          onPress={onDeal}
          // Not a player action either: nothing to deal for until the minimum is on the spot.
          disabled={short}
          accessibilityHint={
            short
              ? `Place at least ${formatMoney(minBet)} to deal.`
              : `Deal a hand for ${formatMoney(spot)}.`
          }
          style={styles.grow}
        />
      </View>
      {short ? (
        <Text style={[ui(12), styles.centerNote]}>
          Table minimum {formatMoney(minBet)} — tap the spot to add chips.
        </Text>
      ) : null}
    </View>
  );
}

function PayoutActions({
  lastBet,
  onClear,
  onRebet,
  onNext,
}: {
  lastBet: number;
  onClear: () => void;
  onRebet: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.actions}>
      <Button
        label="Clear"
        variant="secondary"
        icon={icons.X}
        onPress={onClear}
        accessibilityHint="Back to the bet prompt with an empty spot."
        style={styles.grow}
      />
      <Button
        label={`Rebet ${formatMoney(lastBet)}`}
        variant="secondary"
        icon={icons.Repeat}
        onPress={onRebet}
        accessibilityHint={`Back to the bet prompt with ${formatMoney(lastBet)} on the spot.`}
        style={styles.grow}
      />
      <Button
        label="Next hand"
        icon={icons.Play}
        onPress={onNext}
        accessibilityHint={`Deal the next hand for ${formatMoney(lastBet)}.`}
        style={styles.grow}
      />
    </View>
  );
}

/** Invariant 6: never a dead end. The reset is here, in place of Deal. */
function OutOfChips({
  bankroll,
  minBet,
  onReset,
  onEnd,
}: {
  bankroll: number;
  minBet: number;
  onReset: () => void;
  onEnd?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={[ui(16, 700), { color: colors.foreground }]}>
        Out of chips
      </Text>
      <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.mutedForeground }]}>
        The bankroll is {formatMoney(bankroll)}, below the {formatMoney(minBet)} table minimum.
        Reset it here and keep playing — going broke stays in your statistics either way.
      </Text>
      <View style={styles.wrapRow}>
        <Button
          label={`Reset to ${formatMoney(STARTING_BANKROLL)}`}
          onPress={onReset}
          accessibilityHint="Restore the practice bankroll and carry on from this hand."
        />
        {onEnd ? (
          <Button
            label="End session instead"
            variant="secondary"
            onPress={onEnd}
            accessibilityHint="Close this Session here and keep its statistics."
          />
        ) : null}
      </View>
    </View>
  );
}

function ActionBar({
  legal,
  handLabel,
  withheldStake,
  onAction,
}: {
  legal: readonly Action[];
  handLabel: string | null;
  /**
   * The engine withholds the insurance offer when the bankroll cannot cover the stake, rather
   * than offering a button that throws. That absence is said in words (invariant 7).
   */
  withheldStake: number | null;
  onAction: (action: Action) => void;
}) {
  const ordered = ACTION_ORDER.filter((action) => legal.includes(action));
  return (
    <View style={styles.actionBlock}>
      {handLabel ? (
        <Text style={[ui(12, 600, { letterSpacing: 0.5 }), { color: colors.mutedForeground }]}>
          {handLabel.toUpperCase()}
        </Text>
      ) : null}
      {withheldStake !== null ? (
        <Text style={[ui(12), { color: colors.mutedForeground }]}>
          Insurance was not offered: the bankroll is below the {formatMoney(withheldStake)} stake.
        </Text>
      ) : null}
      <View style={styles.actionGrid}>
        {ordered.map((action) => (
          <Button
            key={action}
            label={ACTION_NAME[action]}
            variant="secondary"
            accessibilityHint={ACTION_HINT[action]}
            onPress={() => onAction(action)}
            style={styles.actionButton}
          />
        ))}
      </View>
    </View>
  );
}

function InsuranceBar({ stake, onDecide }: { stake: number; onDecide: (take: boolean) => void }) {
  return (
    <View style={styles.actionBlock}>
      <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.mutedForeground }]}>
        The dealer shows an ace. Insurance costs {formatMoney(stake)} and pays 2:1 if the dealer has
        a natural — a bet on tens, not on your hand.
      </Text>
      <View style={styles.actionGrid}>
        <Button
          label="Take insurance"
          variant="secondary"
          accessibilityHint="Place the half-bet side wager against a dealer natural."
          onPress={() => onDecide(true)}
          style={styles.actionButton}
        />
        <Button
          label="No insurance"
          variant="secondary"
          accessibilityHint="Decline the side wager and play the hand out."
          onPress={() => onDecide(false)}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

/** The caught mistake, pointing up at the hand it paused (N6Lcl). */
function MistakeLayer({
  caught,
  legal,
  onTakeBack,
  onKeep,
}: {
  caught: Caught;
  legal: readonly Action[];
  onTakeBack: (replacement: DrillAction) => void;
  onKeep: () => void;
}) {
  const replacement = takeBackAction(caught.result, legal);
  const copy = mistakeCopy(caught.result, replacement);
  return (
    <View style={styles.coachLayer}>
      <Svg width={22} height={11} viewBox="0 0 22 11">
        <Path d="M11 0 L22 11 L0 11 Z" fill={colors.coach} />
      </Svg>
      <CoachNote
        variant="mistake"
        title={copy.title}
        body={copy.body}
        width="100%"
        {...(replacement !== null && copy.takeBackLabel
          ? { primary: { label: copy.takeBackLabel, onPress: () => onTakeBack(replacement) } }
          : {})}
        secondary={{ label: copy.keepLabel, onPress: onKeep }}
      />
    </View>
  );
}

const MARK: Record<ReviewRow["mark"], { bg: string; icon: LucideIcon }> = {
  correct: { bg: colors.correct, icon: icons.Check },
  replayed: { bg: colors.mistake, icon: icons.RotateCcw },
  miss: { bg: colors.mistake, icon: icons.X },
};

function ResultPanel({
  summary,
  rows,
  sizing,
  collect,
  onWhy,
  onReplay,
  onCollect,
}: {
  summary: OutcomeSummary;
  rows: readonly ReviewRow[];
  sizing: BetSizing | null;
  collect: number;
  onWhy: (index: number) => void;
  onReplay: () => void;
  onCollect: () => void;
}) {
  const badge =
    summary.tone === "win"
      ? { bg: colors.correct, icon: icons.Check }
      : summary.tone === "loss"
        ? { bg: colors.mistake, icon: icons.X }
        : { bg: colors.muted, icon: icons.Minus };
  const BadgeIcon = badge.icon;
  return (
    <View style={styles.result}>
      <View style={styles.outcome}>
        <View style={[styles.outcomeBadge, { backgroundColor: badge.bg }]}>
          <BadgeIcon size={22} color={felt.onCorrect} strokeWidth={2.5} />
        </View>
        <View style={styles.outcomeText}>
          <Text accessibilityRole="header" style={[display(26, 500), { color: colors.foreground }]}>
            {summary.headline}
          </Text>
          <Text style={[ui(13, 400, { lineHeight: 18 }), { color: colors.mutedForeground }]}>
            {summary.detail}
          </Text>
        </View>
      </View>

      <View style={styles.review}>
        <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
          DECISIONS THIS HAND
        </Text>
        {rows.length === 0 ? (
          <ReviewItem
            mark={{ bg: colors.muted, icon: icons.Minus }}
            title="No decisions this hand"
            detail="A natural settled it before anyone had to act."
          />
        ) : (
          rows.map((row) => (
            <ReviewItem
              key={row.key}
              mark={MARK[row.mark]}
              title={row.title}
              detail={row.detail}
              onPress={() => onWhy(row.index)}
            />
          ))
        )}
        {sizing ? (
          <ReviewItem
            mark={sizing.onPlan ? MARK.correct : MARK.miss}
            title={sizing.title}
            detail={sizing.detail}
          />
        ) : null}
      </View>

      <View style={styles.resultActions}>
        <Button
          label="Replay hand"
          variant="secondary"
          icon={icons.History}
          onPress={onReplay}
          accessibilityHint="Step through this hand's decisions with the full why behind each."
          style={styles.grow}
        />
        <Button
          label={collect > 0 ? `Collect ${formatMoney(collect)}` : "Continue"}
          icon={icons.HandCoins}
          onPress={onCollect}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

function ReviewItem({
  mark,
  title,
  detail,
  onPress,
}: {
  mark: { bg: string; icon: LucideIcon };
  title: string;
  detail: string;
  onPress?: () => void;
}) {
  const MarkIcon = mark.icon;
  const body = (
    <>
      <View style={[styles.mark, { backgroundColor: mark.bg }]}>
        <MarkIcon size={12} color={felt.onBadge} strokeWidth={2.5} />
      </View>
      <View style={styles.reviewText}>
        <Text style={[ui(14, 600), { color: colors.foreground }]}>{title}</Text>
        <Text style={[ui(12), { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
      {onPress ? <Text style={[ui(12, 600), { color: colors.primary }]}>Why</Text> : null}
    </>
  );
  if (!onPress) return <View style={styles.reviewRow}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Why: ${title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.reviewRow, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, alignItems: "center" },
  column: { flex: 1, width: "100%", maxWidth: COLUMN_MAX },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  row3: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  dealerRow: { marginTop: 8 },
  rulesBlock: { marginTop: 20, alignSelf: "stretch" },
  side: { flex: 1, minWidth: 0 },
  sideLeft: { alignItems: "flex-end", paddingRight: 10 },
  sideRight: { alignItems: "flex-start", paddingLeft: 8 },
  hands: { flexDirection: "row", gap: 8, flexShrink: 1, justifyContent: "center" },
  handColumn: { alignItems: "center", gap: 6 },
  tip: {
    position: "absolute",
    left: 16,
    top: 250,
    width: 104,
    gap: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: felt.tip,
  },
  tipCompact: { width: 92, left: 10 },
  tipHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  collectHint: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  payout: { flexDirection: "row", alignItems: "center", gap: 4 },
  paid: {
    backgroundColor: colors.correct,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  history: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  historyChip: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  historyNew: { borderWidth: 1.5, borderColor: colors.foreground },
  notices: { gap: 8, paddingHorizontal: 16, paddingBottom: 8, alignItems: "flex-start" },
  noticeTap: { minHeight: 44, justifyContent: "center" },
  ended: { gap: 8, alignItems: "flex-start" },
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  // Three to a row at 390: the button's own 20pt sides and 8pt gap would truncate "Next hand".
  grow: { flex: 1, height: 52, paddingHorizontal: 4, gap: 6, alignSelf: "auto" },
  centerNote: { color: colors.mutedForeground, textAlign: "center", paddingBottom: 8 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dealArea: { paddingTop: 12, gap: 12 },
  coachLayer: { alignItems: "center", paddingHorizontal: 16 },
  actionBlock: { gap: 8, paddingHorizontal: 16 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { flexGrow: 1, flexBasis: "30%", height: 52, alignSelf: "auto" },
  hintRow: { alignItems: "center" },
  result: { gap: 14, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 },
  outcome: { flexDirection: "row", gap: 12, alignItems: "center" },
  outcomeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  outcomeText: { flex: 1, gap: 2 },
  review: {
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  reviewRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", minHeight: 44 },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewText: { flex: 1, gap: 2 },
  resultActions: { flexDirection: "row", gap: 8 },
  pressed: { opacity: 0.85 },
});
