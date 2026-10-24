/**
 * Strategy Builder: Roulette (design 10c, frame D0h320). The interactive betting layout,
 * coverage, the exact "What happens on each spin" table, the progression selector and its
 * warning, session rules, the selected-bet inspector, and the Game & rules, Explain and
 * Test & submit steps.
 */

import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  type Pocket,
  type ProgressionAction,
  type RouletteRules,
  AMERICAN_RULES,
  EUROPEAN_RULES,
  FRENCH_RULES,
  DEFAULT_CUSTOM_PROGRESSION,
  PROGRESSION_ACTIONS,
  getSpot,
  pocketColor,
  spotTitle,
} from "@/games/roulette";
import { Badge, Button, SegmentedControl, colors, icons as ds, ui, StatCard } from "@/ui/ds";
import type { RouletteDraft, RouletteLayoutPlan } from "@/state/strategies";
import { Felt, FeltChip } from "./felt";
import { Grid3x3, Timer, TrendingDown } from "@/ui/ds/icons";
import { exportDraft, testInTrainerHref } from "./library";
import { builder } from "./palette";
import {
  BuilderHead,
  BuilderLayout,
  Card,
  ChangeNav,
  CoachNoteEditor,
  ComparePanel,
  EngineCheck,
  Eyebrow,
  ExplainStep,
  InfoNote,
  InspectorHead,
  Label,
  Pill,
  SharePanel,
  StepRail,
  Stepper,
  SubmitPanel,
  styles as p,
} from "./parts";
import {
  type SessionField,
  AMOUNT_PRESETS,
  applyPreset,
  betPanel,
  checkBet,
  checkLayout,
  coverage,
  coveredPockets,
  layoutChanges,
  moveBet,
  outcomeTable,
  progressionOptions,
  progressionWarning,
  progressionDescription,
  removeBet,
  rouletteRulesLine,
  sessionCards,
  spinTotal,
  stepBet,
  stepSession,
  tapSpot,
  testLayout,
  widenOptions,
} from "./roulette";
import { BuilderLoading, BuilderMissing } from "./states";
import { StrategyShell } from "./StrategyShell";
import { useBuilderDraft } from "./useBuilderDraft";

type Panel = "none" | "compare" | "share" | "submit";

export function RouletteBuilder() {
  const state = useBuilderDraft("roulette");
  return (
    <StrategyShell>
      {state.status === "loading" ? (
        <BuilderLoading />
      ) : state.status === "missing" ? (
        <BuilderMissing />
      ) : (
        <Editor
          draft={state.draft}
          readOnly={state.readOnly}
          update={state.update}
          fork={state.fork}
        />
      )}
    </StrategyShell>
  );
}

function Editor({
  draft,
  readOnly,
  update,
  fork,
}: {
  draft: RouletteDraft;
  readOnly: boolean;
  update: (d: RouletteDraft) => void;
  fork: () => void;
}) {
  const layout = draft.layout;
  const changes = layoutChanges(layout, draft.original);
  const [step, setStep] = useState(1);
  const [panel, setPanel] = useState<Panel>("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    layout.bets.find((b) => b.spotId === selectedId)?.spotId ??
    layout.bets[1]?.spotId ??
    layout.bets[0]?.spotId ??
    null;

  const setLayout = (next: RouletteLayoutPlan, select?: string | null) => {
    if (readOnly) return;
    update({ ...draft, layout: next });
    if (select !== undefined) setSelectedId(select);
  };
  const setNote = (key: string, text: string) => {
    const notes = { ...draft.notes };
    if (text.trim()) notes[key] = text;
    else delete notes[key];
    update({ ...draft, notes });
  };
  const tap = (spotId: string) => {
    if (!readOnly && !layout.bets.some((b) => b.spotId === spotId))
      setLayout(tapSpot(layout, spotId), spotId);
    else setSelectedId(spotId);
  };

  const written = changes.filter((c) => draft.notes[c.key]).length;
  const steps = [
    { title: "Game & rules", detail: rouletteRulesLine(layout.rules) },
    { title: "Bet layout", detail: "Where your chips go" },
    { title: "Explain your changes", detail: `${written} of ${changes.length} notes written` },
    { title: "Test & submit", detail: "Play 50 spins with it" },
  ];

  return (
    <BuilderLayout
      head={(bleed, wide) => (
        <>
          <BuilderHead
            bleed={bleed}
            wide={wide}
            title={draft.title}
            savedAt={draft.savedAt}
            readOnly={readOnly}
            forkedFrom={draft.forkedFrom}
            changes={changes.length}
            compareOpen={panel === "compare"}
            onCompare={() => setPanel(panel === "compare" ? "none" : "compare")}
            onShare={() => setPanel("share")}
            testHref={testInTrainerHref(draft)}
            onSubmit={() => setPanel("submit")}
            onFork={fork}
            onRename={(title) => update({ ...draft, title })}
          />
          {panel === "compare" ? (
            <ComparePanel
              original={draft.forkedFrom?.title ?? "the starting layout"}
              changes={changes}
              onPick={(k) => {
                if (k.startsWith("bet:")) setSelectedId(k.slice(4));
                setStep(k.startsWith("bet:") ? 1 : 2);
                setPanel("none");
              }}
              onClose={() => setPanel("none")}
            />
          ) : panel === "share" ? (
            <SharePanel text={exportDraft(draft)} onClose={() => setPanel("none")} />
          ) : panel === "submit" ? (
            <SubmitPanel {...checkLayout(layout)} onClose={() => setPanel("none")} />
          ) : null}
        </>
      )}
      rail={
        <StepRail
          steps={steps}
          active={step}
          onSelect={setStep}
          footer="Blackjack uses a decision chart. Craps uses bet plans. Every layout is checked against the real payouts."
        />
      }
      inspector={
        step === 1 && selected ? (
          <Inspector
            draft={draft}
            spotId={selected}
            readOnly={readOnly}
            setLayout={setLayout}
            onSelect={setSelectedId}
            onNote={setNote}
          />
        ) : undefined
      }
    >
      {step === 0 ? (
        <RulesStep layout={layout} readOnly={readOnly} setLayout={setLayout} />
      ) : step === 1 ? (
        <LayoutEditor
          layout={layout}
          selected={selected}
          onTap={tap}
          readOnly={readOnly}
          setLayout={setLayout}
        />
      ) : step === 2 ? (
        <ExplainStep changes={changes} notes={draft.notes} onNote={setNote} readOnly={readOnly} />
      ) : (
        <TestStep layout={layout} onSubmit={() => setPanel("submit")} />
      )}
    </BuilderLayout>
  );
}

// ---------------------------------------------------------------------------
// The layout editor
// ---------------------------------------------------------------------------

function LayoutEditor({
  layout,
  selected,
  onTap,
  readOnly,
  setLayout,
}: {
  layout: RouletteLayoutPlan;
  selected: string | null;
  onTap: (spotId: string) => void;
  readOnly: boolean;
  setLayout: (l: RouletteLayoutPlan, select?: string | null) => void;
}) {
  const cov = coverage(layout);
  const table = outcomeTable(layout);
  return (
    <Card>
      <View style={s.head}>
        <View style={[p.gap2, p.flex]}>
          <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
            Bet layout · {spinTotal(layout)} per spin
          </Text>
          <Text style={[ui(13), { color: colors.mutedForeground }]}>
            Tap a spot to add a bet. The coach checks each spin's chips against this layout.
          </Text>
        </View>
        <Badge label={cov.label} icon={Grid3x3} tone="primary" style={s.coverage} />
      </View>
      <BettingFelt layout={layout} selected={selected} onTap={onTap} />
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.legendSw, { backgroundColor: colors.primary }]} />
          <Text style={[ui(12), { color: colors.mutedForeground }]}>Bets in this plan</Text>
        </View>
        {table.uncovered ? (
          <View style={s.legendItem}>
            <View style={[s.legendSw, { backgroundColor: builder.uncoveredSwatch }]} />
            <Text style={[ui(12), { color: colors.mutedForeground }]}>{table.uncovered}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.section}>
        <Eyebrow aside={table.caption}>What happens on each spin</Eyebrow>
        <View style={s.bar} accessibilityLabel="Outcome distribution">
          {table.rows.map((r, i) => (
            <View
              key={i}
              style={{
                flex: r.count,
                backgroundColor:
                  r.shade < 0
                    ? colors.mistake
                    : builder.winShades[r.shade % builder.winShades.length],
              }}
            />
          ))}
        </View>
        <View style={s.table}>
          {table.rows.map((r, i) => (
            <View
              key={r.title}
              style={[s.tr, i > 0 && s.trBorder]}
              accessibilityLabel={`${r.title}: ${r.pockets}, ${r.percent}, ${r.net}`}
            >
              <View
                style={[
                  s.sw,
                  {
                    backgroundColor:
                      r.shade < 0
                        ? colors.mistake
                        : builder.winShades[r.shade % builder.winShades.length],
                  },
                ]}
              />
              <Text style={[ui(14, 600), p.flex, { color: colors.foreground }]}>{r.title}</Text>
              <Text style={[ui(13), s.colPockets, { color: colors.mutedForeground }]}>
                {r.pockets}
              </Text>
              <Text style={[ui(13), s.colPct, { color: colors.mutedForeground }]}>{r.percent}</Text>
              <Text
                style={[
                  ui(14, 700),
                  s.colNet,
                  { color: r.netValue < 0 ? colors.mistake : colors.correct },
                ]}
              >
                {r.net}
              </Text>
            </View>
          ))}
          <View style={[s.tr, s.trBorder, s.expected]}>
            <Text style={[ui(14, 600), p.flex, { color: colors.foreground }]}>
              Average result per spin
            </Text>
            <Text style={[ui(12), { color: colors.mutedForeground }]}>{table.averageCaption}</Text>
            <Text
              style={[
                ui(14, 700),
                s.colNet,
                { color: table.averageValue < 0 ? colors.mistake : colors.foreground },
              ]}
            >
              {table.average}
            </Text>
          </View>
        </View>
      </View>

      <View style={s.section}>
        <Eyebrow>After each spin</Eyebrow>
        <View
          style={s.progTrack}
          accessibilityRole="radiogroup"
          accessibilityLabel="After each spin"
        >
          {progressionOptions(layout).map((o) => {
            const on = o.id === layout.progression;
            return (
              <Pressable
                key={o.id}
                accessibilityRole="radio"
                accessibilityLabel={o.label}
                aria-checked={on}
                onPress={() => {
                  if (!readOnly) setLayout({ ...layout, progression: o.id });
                }}
                style={[s.prog, on && { backgroundColor: colors.paper }]}
              >
                <Text
                  style={[ui(13, on ? 700 : 600), { color: on ? colors.ink : colors.foreground }]}
                >
                  {o.label}
                </Text>
                <Text style={[ui(11), { color: on ? colors.inkMuted : colors.mutedForeground }]}>
                  {o.detail}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {layout.progression === "custom" ? (
          <CustomProgressionEditor layout={layout} readOnly={readOnly} setLayout={setLayout} />
        ) : null}
        <InfoNote text={progressionWarning(layout)} />
      </View>

      <View style={s.section}>
        <Eyebrow>Session rules</Eyebrow>
        <View style={s.sessionRow}>
          {sessionCards(layout).map((c) => (
            <SessionCard
              key={c.field}
              field={c.field}
              label={c.label}
              value={c.value}
              readOnly={readOnly}
              onStep={(dir) => setLayout(stepSession(layout, c.field, dir))}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

function CustomProgressionEditor({
  layout,
  readOnly,
  setLayout,
}: {
  layout: RouletteLayoutPlan;
  readOnly: boolean;
  setLayout: (layout: RouletteLayoutPlan) => void;
}) {
  const custom = layout.customProgression ?? DEFAULT_CUSTOM_PROGRESSION;
  const labels: Record<ProgressionAction, string> = {
    reset: "Reset to base",
    hold: "Keep stake",
    add: "Add units",
    subtract: "Remove units",
    double: "Double stake",
  };
  const update = (next: typeof custom) => {
    if (!readOnly) setLayout({ ...layout, customProgression: next });
  };
  return (
    <View style={p.gap8}>
      {(["afterLoss", "afterWin"] as const).map((field) => (
        <View key={field} style={p.gap8}>
          <Label>{field === "afterLoss" ? "After a losing spin" : "After a winning spin"}</Label>
          <View
            style={s.customActions}
            accessibilityRole="radiogroup"
            accessibilityLabel={field === "afterLoss" ? "After a loss" : "After a win"}
          >
            {PROGRESSION_ACTIONS.map((action) => (
              <Pressable
                key={action}
                accessibilityRole="radio"
                accessibilityLabel={labels[action]}
                aria-checked={custom[field] === action}
                onPress={() => update({ ...custom, [field]: action })}
                style={[
                  s.customAction,
                  custom[field] === action && { backgroundColor: colors.paper },
                ]}
              >
                <Text
                  style={[
                    ui(13, 600),
                    { color: custom[field] === action ? colors.ink : colors.foreground },
                  ]}
                >
                  {labels[action]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Stepper
        label="Unit change"
        value={String(custom.units)}
        onMinus={() => update({ ...custom, units: Math.max(1, custom.units - 1) })}
        onPlus={() => update({ ...custom, units: Math.min(10, custom.units + 1) })}
      />
      <Text style={[ui(13), { color: colors.mutedForeground }]}>
        One unit is your whole base layout. Add or remove 1–10 units; the first spin starts at one
        unit.
      </Text>
      <Text role="status" style={[ui(14), { color: colors.foreground }]}>
        {progressionDescription(layout)}.
      </Text>
    </View>
  );
}

const SESSION_ICONS = {
  stopWhenUp: ds.TrendingUp,
  stopWhenDown: TrendingDown,
  maxSpins: Timer,
} as const;

function SessionCard({
  field,
  label,
  value,
  readOnly,
  onStep,
}: {
  field: SessionField;
  label: string;
  value: string;
  readOnly: boolean;
  onStep: (dir: 1 | -1) => void;
}) {
  const Icon = SESSION_ICONS[field];
  return (
    <View style={s.sessionCard} accessibilityLabel={`${label}: ${value}`}>
      <Icon size={16} color={colors.mutedForeground} />
      <View style={p.flex}>
        <Text style={[ui(11), { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[ui(15, 700), { color: colors.foreground }]}>{value}</Text>
      </View>
      {readOnly ? null : (
        <View style={s.miniSteps}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Less: ${label}`}
            onPress={() => onStep(-1)}
            style={s.mini}
            hitSlop={6}
          >
            <Text style={[ui(14, 700), { color: colors.mutedForeground }]}>−</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More: ${label}`}
            onPress={() => onStep(1)}
            style={s.mini}
            hitSlop={6}
          >
            <Text style={[ui(14, 700), { color: colors.mutedForeground }]}>+</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The felt
// ---------------------------------------------------------------------------

const CELL_W = 44;
const CELL_H = 40;
const GAP = 3;
const GRID_W = 12 * CELL_W + 11 * GAP;
const GRID_H = 3 * CELL_H + 2 * GAP;

/** Number grid position: column = street (0-11), row 0 = the 3-6-9 line at the top. */
function cellPos(n: number) {
  const street = Math.floor((n - 1) / 3);
  const row = 2 - ((n - 1) % 3);
  return { x: street * (CELL_W + GAP), y: row * (CELL_H + GAP) };
}

function pocketFill(p: Pocket): string {
  const c = pocketColor(p);
  return c === "red" ? builder.red : c === "black" ? builder.black : builder.green;
}

const DOZENS = ["dozen:1", "dozen:2", "dozen:3"];
const EVEN_MONEY = [
  { id: "low", label: "1–18" },
  { id: "even", label: "EVEN" },
  { id: "red", label: "RED" },
  { id: "black", label: "BLACK" },
  { id: "odd", label: "ODD" },
  { id: "high", label: "19–36" },
];

function BettingFelt({
  layout,
  selected,
  onTap,
}: {
  layout: RouletteLayoutPlan;
  selected: string | null;
  onTap: (spotId: string) => void;
}) {
  const covered = coveredPockets(layout);
  const amountOn = (id: string) => layout.bets.find((b) => b.spotId === id)?.amount;
  const zeros: Pocket[] = layout.rules.wheel === "american" ? [0, "00"] : [0];
  const zeroH = (GRID_H - (zeros.length - 1) * GAP) / zeros.length;
  // Inside bets on more than one number are drawn as a bracket over the numbers they cover.
  const groups = layout.bets
    .map((b) => ({ bet: b, spot: getSpot(layout.rules, b.spotId) }))
    .filter(
      (g) =>
        g.spot &&
        g.spot.pockets.length > 1 &&
        g.spot.pockets.length <= 6 &&
        g.spot.pockets.every((x) => typeof x === "number" && x > 0),
    );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.feltScroll}
    >
      <Felt style={s.felt} centerY={0.4}>
        <View style={s.feltInner}>
          <View style={s.numbersRow}>
            <View style={{ gap: GAP }}>
              {zeros.map((z) => {
                const id = `straight:${z}`;
                const amt = amountOn(id);
                return (
                  <Pressable
                    key={String(z)}
                    accessibilityRole="button"
                    accessibilityLabel={`${z}${amt ? `: $${amt} bet` : ""}`}
                    aria-selected={selected === id}
                    onPress={() => onTap(id)}
                    style={[
                      s.zero,
                      { height: zeroH },
                      amt !== undefined && s.betOn,
                      !covered.has(String(z)) && s.uncovered,
                    ]}
                  >
                    <Text style={[ui(16, 800), { color: colors.paper }]}>{z}</Text>
                    {amt !== undefined ? (
                      <FeltChip amount={amt} style={[s.zeroChip, selected === id && s.chipSel]} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ width: GRID_W, height: GRID_H }}>
              {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => {
                const { x, y } = cellPos(n);
                const id = `straight:${n}`;
                const amt = amountOn(id);
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    accessibilityLabel={`${n}${amt ? `: $${amt} bet` : ""}`}
                    aria-selected={selected === id}
                    onPress={() => onTap(id)}
                    style={[
                      s.num,
                      { left: x, top: y, backgroundColor: pocketFill(n) },
                      !covered.has(String(n)) && s.uncovered,
                      amt !== undefined && s.betOn,
                    ]}
                  >
                    <Text style={[ui(14, 700), { color: colors.paper }]}>{n}</Text>
                  </Pressable>
                );
              })}
              {groups.map(({ bet, spot }) => {
                if (!spot) return null;
                const ps = spot.pockets.map((x) => cellPos(x as number));
                const left = Math.min(...ps.map((q) => q.x));
                const top = Math.min(...ps.map((q) => q.y));
                const right = Math.max(...ps.map((q) => q.x)) + CELL_W;
                const bottom = Math.max(...ps.map((q) => q.y)) + CELL_H;
                const on = selected === bet.spotId;
                return (
                  <View
                    key={bet.spotId}
                    pointerEvents="box-none"
                    style={[s.bracket, { left, top, width: right - left, height: bottom - top }]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${spotTitle(spot)}: $${bet.amount} bet`}
                      aria-selected={on}
                      onPress={() => onTap(bet.spotId)}
                      style={[s.bracketChip, { left: (right - left) / 2 - 15 }]}
                      hitSlop={8}
                    >
                      <FeltChip amount={bet.amount} style={on ? s.chipSel : undefined} />
                    </Pressable>
                  </View>
                );
              })}
              {layout.bets.map((b) => {
                const spot = getSpot(layout.rules, b.spotId);
                if (
                  !spot ||
                  spot.type !== "straight" ||
                  typeof spot.pockets[0] !== "number" ||
                  spot.pockets[0] === 0
                )
                  return null;
                const { x, y } = cellPos(spot.pockets[0]);
                return (
                  <View
                    key={b.spotId}
                    pointerEvents="none"
                    style={[s.numChip, { left: x + 7, top: y + 5 }]}
                  >
                    <FeltChip
                      amount={b.amount}
                      style={selected === b.spotId ? s.chipSel : undefined}
                    />
                  </View>
                );
              })}
            </View>
            <View style={{ gap: GAP }}>
              {["column:3", "column:2", "column:1"].map((id) => (
                <OutsideSpot
                  key={id}
                  id={id}
                  label="2 to 1"
                  width={52}
                  height={CELL_H}
                  amount={amountOn(id)}
                  selected={selected === id}
                  onTap={onTap}
                />
              ))}
            </View>
          </View>
          <View style={s.outsideRow}>
            {DOZENS.map((id, i) => (
              <OutsideSpot
                key={id}
                id={id}
                label={`${["1st", "2nd", "3rd"][i]} 12`}
                width={4 * CELL_W + 3 * GAP}
                height={36}
                amount={amountOn(id)}
                selected={selected === id}
                onTap={onTap}
              />
            ))}
          </View>
          <View style={s.outsideRow}>
            {EVEN_MONEY.map((o) => (
              <OutsideSpot
                key={o.id}
                id={o.id}
                label={o.label}
                width={2 * CELL_W + GAP}
                height={36}
                amount={amountOn(o.id)}
                selected={selected === o.id}
                onTap={onTap}
                fill={o.id === "red" ? builder.red : o.id === "black" ? builder.black : undefined}
              />
            ))}
          </View>
        </View>
      </Felt>
    </ScrollView>
  );
}

function OutsideSpot({
  id,
  label,
  width,
  height,
  amount,
  selected,
  onTap,
  fill,
}: {
  id: string;
  label: string;
  width: number;
  height: number;
  amount: number | undefined;
  selected: boolean;
  onTap: (id: string) => void;
  fill?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${id.startsWith("column") ? ` ${id.slice(-1)}` : ""}${amount ? `: $${amount} bet` : ""}`}
      aria-selected={selected}
      onPress={() => onTap(id)}
      style={[
        s.outside,
        { width, height },
        fill ? { backgroundColor: fill } : null,
        amount !== undefined && s.betOn,
      ]}
    >
      {fill ? <View style={[s.diamond, { backgroundColor: fill }]} /> : null}
      <Text
        style={[
          ui(id.startsWith("column") ? 10 : 11, 700, { letterSpacing: 0.5 }),
          { color: colors.feltText },
        ]}
      >
        {label}
      </Text>
      {amount !== undefined ? (
        <FeltChip amount={amount} style={[s.outsideChip, selected && s.chipSel]} />
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

function Inspector({
  draft,
  spotId,
  readOnly,
  setLayout,
  onSelect,
  onNote,
}: {
  draft: RouletteDraft;
  spotId: string;
  readOnly: boolean;
  setLayout: (l: RouletteLayoutPlan, select?: string | null) => void;
  onSelect: (id: string) => void;
  onNote: (key: string, text: string) => void;
}) {
  const layout = draft.layout;
  const panel = betPanel(layout, draft.original, spotId);
  if (!panel) return null;
  const check = checkBet(layout, draft.original, spotId);
  const index = layout.bets.findIndex((b) => b.spotId === spotId);
  const n = layout.bets.length;
  const go = (dir: 1 | -1) => {
    const b = layout.bets[(index + dir + n) % n];
    if (b) onSelect(b.spotId);
  };
  const widen = readOnly ? [] : widenOptions(layout, spotId);
  const noteKey = `bet:${spotId}`;
  return (
    <Card>
      <InspectorHead
        eyebrow="Selected bet"
        title={panel.title}
        original={panel.original}
        yours={panel.yours}
      />
      <View style={p.gap8}>
        <Label>Covers</Label>
        <View style={s.covers}>
          {panel.covers.map((c) => (
            <View
              key={c.label}
              style={[
                s.cover,
                panel.covers.length > 6 && s.coverSmall,
                {
                  backgroundColor:
                    c.color === "red"
                      ? builder.red
                      : c.color === "black"
                        ? builder.black
                        : builder.green,
                },
              ]}
            >
              <Text style={[ui(13, 700), { color: colors.paper }]}>{c.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.facts}>
        <Fact label="Pays" value={panel.pays} />
        <Fact label="Wins" value={panel.wins} />
        <Fact label="If it hits" value={panel.ifItHits} />
      </View>
      {readOnly ? null : (
        <View style={p.gap8}>
          <Label>Amount</Label>
          <Stepper
            label="Amount"
            value={panel.amount}
            onMinus={() => setLayout(stepBet(layout, spotId, -1))}
            onPlus={() => setLayout(stepBet(layout, spotId, 1))}
          />
          <View style={p.row8}>
            {AMOUNT_PRESETS.map((a) => (
              <Pill
                key={a.id}
                label={a.label}
                on={a.id === "match" && panel.matchesOriginalShare}
                onPress={() => setLayout(applyPreset(layout, draft.original, spotId, a.id))}
              />
            ))}
          </View>
          {widen.length ? (
            <>
              <Label>Change the bet to</Label>
              <View style={p.row8}>
                {widen.map((w) => (
                  <Pill
                    key={w.id}
                    label={spotTitle(w)}
                    onPress={() => setLayout(moveBet(layout, spotId, w.id), w.id)}
                  />
                ))}
              </View>
            </>
          ) : null}
          <Button
            label="Remove bet"
            size="sm"
            variant="ghost"
            onPress={() => setLayout(removeBet(layout, spotId), null)}
          />
        </View>
      )}
      <EngineCheck ok={check.ok} title={check.title} body={check.body} />
      <CoachNoteEditor
        value={draft.notes[noteKey] ?? ""}
        onChange={(t) => onNote(noteKey, t)}
        previewTitle={panel.title}
        readOnly={readOnly}
      />
      <ChangeNav label={`Bet ${index + 1} of ${n}`} onPrev={() => go(-1)} onNext={() => go(1)} />
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.fact} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[ui(11), { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[ui(14, 700), { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Steps 1 and 4
// ---------------------------------------------------------------------------

const WHEELS: Record<string, RouletteRules> = {
  european: EUROPEAN_RULES,
  french: FRENCH_RULES,
  american: AMERICAN_RULES,
};

function RulesStep({
  layout,
  readOnly,
  setLayout,
}: {
  layout: RouletteLayoutPlan;
  readOnly: boolean;
  setLayout: (l: RouletteLayoutPlan) => void;
}) {
  const current =
    layout.rules.wheel === "american" ? "american" : layout.rules.laPartage ? "french" : "european";
  const check = checkLayout(layout);
  return (
    <Card>
      <View style={p.gap4}>
        <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
          Game & rules
        </Text>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>
          The wheel and table limits. The outcome table and every rules check use them.
        </Text>
      </View>
      <SegmentedControl
        accessibilityLabel="Wheel"
        options={[
          { value: "european", label: "European" },
          { value: "french", label: "French (La Partage)" },
          { value: "american", label: "American" },
        ]}
        value={current}
        onChange={(v) => {
          if (readOnly) return;
          const rules = WHEELS[v] ?? EUROPEAN_RULES;
          setLayout({
            ...layout,
            rules,
            bets: layout.bets.filter((b) => getSpot(rules, b.spotId)),
          });
        }}
      />
      <EngineCheck {...check} />
    </Card>
  );
}

function TestStep({ layout, onSubmit }: { layout: RouletteLayoutPlan; onSubmit: () => void }) {
  const [result, setResult] = useState<ReturnType<typeof testLayout> | null>(null);
  const check = checkLayout(layout);
  return (
    <Card>
      <View style={p.gap4}>
        <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
          Test & submit
        </Text>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>
          The rules check, then 50 seeded spins with your progression and session rules, and 200
          sessions for the long view.
        </Text>
      </View>
      <EngineCheck {...check} />
      <View style={p.row8}>
        <Button
          label="Play 50 spins with it"
          variant="secondary"
          disabled={layout.bets.length === 0}
          onPress={() => setResult(testLayout(layout, 2026))}
        />
        <Button label="Submit to community" onPress={onSubmit} />
      </View>
      {result ? (
        <>
          <View style={s.tiles}>
            <StatCard
              width="auto"
              label={`${result.spins} spins`}
              value={result.net}
              delta={result.stopped}
              deltaTone={result.netValue < 0 ? "mistake" : "correct"}
            />
            <StatCard
              width="auto"
              label="Best and worst point"
              value={`${result.peak} / ${result.trough}`}
              delta="Session high and low"
              deltaTone="muted"
            />
            <StatCard
              width="auto"
              label={`${result.sessions} sessions`}
              value={result.averageNet}
              delta={`${result.winning} finished ahead · realised edge ${result.realisedEdge}`}
              deltaTone="muted"
            />
          </View>
          <InfoNote text="Any one session is luck. Across many sessions the realised edge settles near the house edge, whatever the progression." />
        </>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  coverage: { paddingVertical: 6, paddingHorizontal: 12 },
  feltScroll: { flexGrow: 1 },
  felt: { flexGrow: 1 },
  feltInner: { paddingVertical: 14, gap: GAP, alignItems: "center" },
  numbersRow: { flexDirection: "row", gap: GAP },
  zero: {
    width: 44,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: builder.green,
    alignItems: "center",
    justifyContent: "center",
  },
  zeroChip: { position: "absolute", left: 5, bottom: 10 },
  num: {
    position: "absolute",
    width: CELL_W,
    height: CELL_H,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: builder.feltCellEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  uncovered: { opacity: 0.3 },
  betOn: { borderWidth: 2, borderColor: colors.primary },
  numChip: { position: "absolute" },
  bracket: {
    position: "absolute",
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: builder.primaryWash,
  },
  bracketChip: { position: "absolute", bottom: -16 },
  chipSel: { borderColor: colors.paper, borderWidth: 3 },
  outsideRow: { flexDirection: "row", gap: GAP, paddingLeft: 47, paddingRight: 55 },
  diamond: {
    width: 9,
    height: 9,
    borderWidth: 1.5,
    borderColor: builder.chipEdge,
    transform: [{ rotate: "45deg" }],
  },
  outside: {
    flexDirection: "row",
    gap: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
  },
  outsideChip: { position: "absolute", right: 0, top: 3 },
  legend: { flexDirection: "row", alignItems: "center", gap: 18, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSw: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: builder.swatchEdge,
  },
  section: { gap: 10 },
  bar: { height: 14, borderRadius: 7, overflow: "hidden", flexDirection: "row", gap: 2 },
  table: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  trBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  expected: { backgroundColor: colors.muted, paddingVertical: 12 },
  sw: { width: 10, height: 10, borderRadius: 2 },
  colPockets: { width: 90 },
  colPct: { width: 60, textAlign: "right" },
  colNet: { width: 70, textAlign: "right" },
  progTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 4,
    borderRadius: 10,
    backgroundColor: colors.muted,
  },
  prog: {
    flex: 1,
    minWidth: 120,
    alignItems: "center",
    gap: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  customActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  customAction: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.muted,
  },
  sessionRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  sessionCard: {
    flex: 1,
    minWidth: 170,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  miniSteps: { flexDirection: "row", gap: 2 },
  mini: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  covers: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cover: {
    flexGrow: 1,
    flexBasis: 40,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: builder.coverEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  coverSmall: { flexBasis: 34, flexGrow: 0, width: 34, height: 30 },
  facts: { flexDirection: "row", gap: 8 },
  fact: {
    flex: 1,
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.muted,
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
