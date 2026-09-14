/**
 * The Shoe Integrity Panel.
 *
 * "Rigged RNG" is 19% of low-star reviews across competing trainers (see
 * `docs/research/competitive-landscape.md`). Most of that is perception. Some of it is not:
 * a competitor shipped a count that did not return to zero at the end of a balanced Shoe
 * and a *user* found it first. ADR-0004's conclusion is the design brief for this screen —
 * we cannot argue a user out of distrust, so we hand them the tools to check.
 *
 * Four claims, four checks, in the order a sceptic would want them:
 *
 *   1. This Shoe has a name — the seed, copyable, and enterable so someone else's Shoe
 *      rebuilds here exactly.
 *   2. The count reconciles — at every point in the Shoe, watchable to the finish.
 *   3. The cards are all there — composition by rank, live, adding back to `decks x 4`.
 *   4. Your results are ordinary — plotted against the band a fair game produces.
 *
 * Then all of it, as a file they can send us.
 *
 * Always reachable and never gated (invariant 1): this is the cheapest credibility the
 * product can buy, and putting a price on it would be self-defeating.
 *
 * Two things arrive from outside (#19). The Shoe is built at the **configured** Rule Set, not
 * the default one — a panel that proved the integrity of a six-deck shoe to a user who plays
 * single deck would be proving the wrong thing, and the composition table would claim a count
 * of each rank they never see. And the expectation band takes an optional `session`, so it can
 * place the hands the user actually played rather than a worked example. The manual path stays
 * exactly as it was, because checking a Session played somewhere else is the case where this
 * argument is most often needed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import Constants from "expo-constants";
import { getCountingSystem, keyCount, trueCount } from "@/engine/counting";
import type { CountingSystemId } from "@/engine/counting";
import { COUNTING_SYSTEMS, DEFAULT_COUNTING_SYSTEM } from "@/engine/counting";
import { describeRules } from "@/engine/rules";
import {
  createShoe,
  deal,
  dealtCards,
  decksRemaining,
  isCutCardReached,
  remainingComposition,
  verifyComposition,
} from "@/engine/shoe";
import type { Shoe } from "@/engine/shoe";
import {
  buildIntegrityReport,
  countTrace,
  dealtComposition,
  expectationBand,
  formatIntegrityReport,
  integrityReportFileName,
  traceRange,
  zeroSumCheck,
} from "./integrity";
import type { SessionResult } from "./integrity";
import { copyText, exportReportFile } from "./share";
import type { ExportOutcome } from "./share";
import { DealtHistoryPanel } from "./DealtHistoryPanel";
import { ExpectationBandPanel } from "./ExpectationBandPanel";
import { ExportPanel } from "./ExportPanel";
import { RankTable } from "./RankTable";
import { SeedPanel } from "./SeedPanel";
import { ZeroSumCheckPanel } from "./ZeroSumCheckPanel";
import { ActionButton, Panel, Screen, SecondaryButton, SegmentedControl } from "@/ui/primitives";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import { colors, spacing, type } from "@/ui/theme";

/**
 * A fixed default rather than a random one. The web build is prerendered, and seeding from
 * a clock or `Math.random()` at first render would hand the server and the browser two
 * different Shoes. New seeds come from the button, which only ever runs in the browser.
 */
const DEFAULT_SEED = 20260914;

/** Run-out pacing. Sized from the Shoe so every deck count takes about three seconds. */
const TICK_MS = 40;
const RUN_OUT_TICKS = 80;

const SYSTEM_OPTIONS = COUNTING_SYSTEMS.map((system) => ({
  value: system.id,
  label: system.name,
}));

export interface ShoeIntegrityScreenProps {
  /**
   * A real run to place against the expectation band, in hands and betting units.
   *
   * Optional, and the panel is fully usable without it: with nothing passed the band is a
   * calculator, which is what it has to be for a user checking a Session they played
   * elsewhere. With a Session passed it opens on those numbers, and typing over them is still
   * allowed — with a way back.
   */
  readonly session?: SessionResult;
}

export function ShoeIntegrityScreen({ session: played }: ShoeIntegrityScreenProps = {}) {
  const configured = useConfiguredRules();
  const rules = configured.rules;

  const [shoe, setShoe] = useState<Shoe>(() => createShoe(rules, DEFAULT_SEED));
  const [systemId, setSystemId] = useState<CountingSystemId>(DEFAULT_COUNTING_SYSTEM.id);
  const [running, setRunning] = useState(false);

  const [seedText, setSeedText] = useState(String(DEFAULT_SEED));
  const [seedNotice, setSeedNotice] = useState<string | undefined>(undefined);
  const [handsText, setHandsText] = useState("500");
  const [netUnitsText, setNetUnitsText] = useState("-40");
  /** True once typed figures have replaced the Session's own. Never set without a Session. */
  const [typedResult, setTypedResult] = useState(false);

  /**
   * The Shoe follows the configured Rule Set, rebuilt at the same seed.
   *
   * In an effect rather than during render because the stored Rule Set is read asynchronously:
   * first paint is the default table (the web build is prerendered and must match), and the
   * user's own arrives a tick later. Rebuilding at the same seed keeps the panel's promise
   * intact — the seed on screen is still the whole description of the cards.
   */
  const builtFor = useRef(rules);
  useEffect(() => {
    if (builtFor.current === rules) return;
    builtFor.current = rules;
    setRunning(false);
    setShoe((current) => createShoe(rules, current.seed));
  }, [rules]);

  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<ExportOutcome | undefined>(undefined);

  const system = useMemo(() => getCountingSystem(systemId), [systemId]);
  const exhausted = shoe.dealtCount >= shoe.cards.length;

  // --- running the Shoe out -------------------------------------------------
  // The zero-sum check has to be watchable, not merely true. This deals the rest of the
  // Shoe a few cards at a time so the trace visibly walks to the finish line.
  useEffect(() => {
    if (!running) return undefined;
    const chunk = Math.max(1, Math.ceil(shoe.cards.length / RUN_OUT_TICKS));
    const timer = setInterval(() => {
      setShoe((current) => {
        let next = current;
        for (let i = 0; i < chunk && next.dealtCount < next.cards.length; i++) {
          next = deal(next).shoe;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [running, shoe.cards.length]);

  useEffect(() => {
    if (running && exhausted) setRunning(false);
  }, [running, exhausted]);

  // --- derived state --------------------------------------------------------
  const check = useMemo(() => zeroSumCheck(shoe, system), [shoe, system]);
  const points = useMemo(() => countTrace(shoe, system), [shoe, system]);
  const range = useMemo(() => traceRange(points, system.pivot), [points, system]);
  const remaining = useMemo(() => remainingComposition(shoe), [shoe]);
  const dealtByRank = useMemo(() => dealtComposition(shoe), [shoe]);
  const intact = useMemo(() => verifyComposition(shoe), [shoe]);
  const history = useMemo(() => dealtCards(shoe), [shoe]);

  /**
   * `trueCount` throws with no decks remaining, and means nothing for an unbalanced system
   * whose Running Count already carries a deck-count offset. Both cases resolve to
   * `undefined`, and the panel renders no True Count row rather than a wrong one.
   */
  const trueCountValue = useMemo(() => {
    if (!system.balanced) return undefined;
    const decksLeft = decksRemaining(shoe);
    if (decksLeft <= 0) return undefined;
    return trueCount(check.countNow, decksLeft);
  }, [system, shoe, check]);

  // The Session's own figures unless the user has typed over them. Held as the text the fields
  // render rather than as parsed numbers, so a half-typed minus sign is not silently a zero on
  // the way back out.
  const readingPlay = played !== undefined && !typedResult;
  const handsValue = readingPlay ? String(played.hands) : handsText;
  const netUnitsValue = readingPlay ? played.netUnits.toFixed(2) : netUnitsText;

  const session = useMemo<SessionResult>(
    () => ({ hands: parseNumber(handsValue), netUnits: parseNumber(netUnitsValue) }),
    [handsValue, netUnitsValue],
  );
  const band = useMemo(() => expectationBand(session), [session]);
  const fileName = useMemo(() => integrityReportFileName(shoe), [shoe]);
  const keyCountValue = useMemo(() => keyCount(system, rules.decks), [system, rules.decks]);

  const buildReport = useCallback(
    () =>
      formatIntegrityReport(
        buildIntegrityReport({
          shoe,
          rules,
          system,
          generatedAt: new Date().toISOString(),
          appVersion: Constants.expoConfig?.version ?? "unknown",
          ...(session.hands > 0 ? { session } : {}),
        }),
      ),
    [shoe, rules, system, session],
  );

  // --- actions --------------------------------------------------------------
  const dealCards = useCallback((count: number) => {
    setShoe((current) => {
      let next = current;
      for (let i = 0; i < count && next.dealtCount < next.cards.length; i++) {
        next = deal(next).shoe;
      }
      return next;
    });
  }, []);

  const dealToCutCard = useCallback(() => {
    setShoe((current) => {
      let next = current;
      while (next.dealtCount < next.cutIndex && next.dealtCount < next.cards.length) {
        next = deal(next).shoe;
      }
      return next;
    });
  }, []);

  const loadSeed = useCallback(
    (seed: number) => {
      setRunning(false);
      setShoe(createShoe(rules, seed));
      setSeedText(String(seed));
      setHistoryExpanded(false);
      setPreview(undefined);
      setOutcome(undefined);
    },
    [rules],
  );

  const typedSeed = parseSeed(seedText);
  const canLoadSeed = typedSeed !== undefined && typedSeed !== shoe.seed;

  const onExport = useCallback(() => {
    void exportReportFile(fileName, buildReport()).then(setOutcome);
  }, [fileName, buildReport]);

  const onCopyReport = useCallback(() => {
    void copyText("Report", buildReport()).then(setOutcome);
  }, [buildReport]);

  const onCopySeed = useCallback(() => {
    void copyText("Seed", String(shoe.seed)).then((result) => setSeedNotice(result.message));
  }, [shoe.seed]);

  const onTogglePreview = useCallback(() => {
    setPreview((current) => (current === undefined ? buildReport() : undefined));
  }, [buildReport]);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      keyboardShouldPersistTaps="handled"
    >
      <Screen>
        <Panel>
          <Text style={styles.title}>Shoe Integrity</Text>
          <Text style={styles.lede}>
            Trainers get accused of rigging their shuffle, and sometimes the accusation is
            right — a competitor shipped a count that never came back to zero, and a user found
            it before the developer did. Arguing about it is useless. So here is everything you
            need to check ours yourself.
          </Text>
          {/* Checked against *your* table, not a generic one. A six-deck proof shown to a
              single-deck player would be proving the wrong shoe. */}
          <Text style={styles.source}>Your table: {describeRules(rules)}</Text>
        </Panel>

        <SeedPanel
          shoe={shoe}
          rules={rules}
          seedText={seedText}
          onSeedTextChange={(next) => {
            setSeedText(next);
            setSeedNotice(undefined);
          }}
          {...(canLoadSeed ? { onLoadSeed: () => loadSeed(typedSeed) } : {})}
          onNewSeed={() => loadSeed(randomSeed())}
          onCopySeed={onCopySeed}
          {...(seedNotice ? { notice: seedNotice } : {})}
        />

        <Panel title="Counting System">
          <SegmentedControl options={SYSTEM_OPTIONS} value={systemId} onChange={setSystemId} />
          <Text style={styles.source}>{system.source}</Text>
        </Panel>

        <ZeroSumCheckPanel
          check={check}
          points={points}
          range={range}
          totalCards={shoe.cards.length}
          cutIndex={shoe.cutIndex}
          {...(trueCountValue === undefined ? {} : { trueCount: trueCountValue })}
          {...(keyCountValue === undefined ? {} : { keyCount: keyCountValue })}
          controls={
            <ShoeControls
              running={running}
              exhausted={exhausted}
              cutCardReached={isCutCardReached(shoe)}
              dealtCount={shoe.dealtCount}
              onDeal={dealCards}
              onDealToCutCard={dealToCutCard}
              onRunOut={() => setRunning(true)}
              onStop={() => setRunning(false)}
              onReset={() => loadSeed(shoe.seed)}
            />
          }
        />

        <RankTable
          remaining={remaining}
          dealt={dealtByRank}
          tags={system.tags}
          systemName={system.name}
          expectedPerRank={rules.decks * 4}
          intact={intact}
        />

        <ExpectationBandPanel
          handsText={handsValue}
          netUnitsText={netUnitsValue}
          onHandsChange={(next) => {
            setTypedResult(true);
            setHandsText(next);
          }}
          onNetUnitsChange={(next) => {
            setTypedResult(true);
            setNetUnitsText(next);
          }}
          band={band}
          {...(readingPlay
            ? { source: "These are the hands you actually played, in your own betting unit." }
            : {})}
          {...(played !== undefined && typedResult
            ? {
                onUseRecorded: () => {
                  setTypedResult(false);
                },
              }
            : {})}
        />

        <DealtHistoryPanel
          cards={history}
          system={system}
          expanded={historyExpanded}
          onToggleExpanded={() => setHistoryExpanded((current) => !current)}
        />

        <ExportPanel
          fileName={fileName}
          {...(preview === undefined ? {} : { contents: preview })}
          onExport={onExport}
          onCopy={onCopyReport}
          {...(outcome ? { outcome } : {})}
          previewOpen={preview !== undefined}
          onTogglePreview={onTogglePreview}
        />

        <Text style={styles.footer}>
          This panel is part of the app, not part of a purchase. It stays available on every
          build, forever.
        </Text>
      </Screen>
    </ScrollView>
  );
}

/**
 * The Shoe controls, rendered from what is actually possible.
 *
 * Invariant 7: never a disabled legal action. A greyed-out button is a claim that an action
 * exists and is being withheld; if dealing is impossible because the Shoe is empty, the
 * honest interface simply has no deal button.
 */
function ShoeControls({
  running,
  exhausted,
  cutCardReached,
  dealtCount,
  onDeal,
  onDealToCutCard,
  onRunOut,
  onStop,
  onReset,
}: {
  running: boolean;
  exhausted: boolean;
  cutCardReached: boolean;
  dealtCount: number;
  onDeal: (count: number) => void;
  onDealToCutCard: () => void;
  onRunOut: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  if (running) {
    return <ActionButton label="Stop" onPress={onStop} tone="warn" />;
  }

  return (
    <>
      {exhausted ? null : (
        <>
          <ActionButton label="Deal 1" onPress={() => onDeal(1)} />
          <ActionButton label="Deal 10" onPress={() => onDeal(10)} />
          {cutCardReached ? null : (
            <ActionButton label="To the cut card" onPress={onDealToCutCard} tone="warn" />
          )}
          <ActionButton
            label="Run the Shoe out"
            onPress={onRunOut}
            tone="good"
            accessibilityHint="Deals every remaining card so you can watch the Running Count finish."
          />
        </>
      )}
      {dealtCount > 0 ? <SecondaryButton label="Reset this Shoe" onPress={onReset} /> : null}
    </>
  );
}

/** Tolerant of an empty or half-typed field: anything unparseable is simply zero. */
function parseNumber(text: string): number {
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : 0;
}

/** A seed must be a whole, non-negative number — the PRNG takes a 32-bit unsigned state. */
function parseSeed(text: string): number | undefined {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    return undefined;
  }
  return value;
}

/**
 * `Math.random()` is banned in `src/engine` (ADR-0004) so the Shoe stays reproducible. Here
 * in the UI it is exactly right: it picks *which* reproducible Shoe to build, and the
 * answer is immediately shown to the user as a seed they can write down.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  pageContent: { flexGrow: 1, paddingBottom: spacing.xl },
  title: { ...type.title, color: colors.text },
  lede: { ...type.body, color: colors.textMuted },
  source: { ...type.caption, color: colors.textMuted },
  footer: { ...type.caption, color: colors.textMuted, textAlign: "center" },
});
