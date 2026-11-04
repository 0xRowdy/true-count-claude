/**
 * Strategy Builder: Blackjack (design 10, frame RYP9O). The chart editor (Totals / Pairs /
 * Surrender), the selected-decision inspector with the EV-engine rules check, and the
 * Game & rules, Explain and Test & submit steps.
 */

import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { type ChartCode, type RuleSet, DEALER_UPCARDS } from "@/engine";
import { formatDollars } from "@/games/craps";
import { Badge, Button, SegmentedControl, StatCard, colors, ui } from "@/ui/ds";
import type { BlackjackDraft } from "@/state/strategies";
import {
  type CellRef,
  type CellSection,
  CODE_NAMES,
  HARD_ROWS,
  MOVE_LABELS,
  PAIR_ROWS,
  SOFT_ROWS,
  SURRENDER_ROWS,
  basicCode,
  cellGlyph,
  cellKey,
  cellTitle,
  chartChanges,
  checkCell,
  checkChart,
  codeForMove,
  draftCode,
  isFlagged,
  moveOf,
  movesFor,
  parseCellKey,
  resetToBasic,
  rowLabel,
  rulesCheckTarget,
  rulesShort,
  setCell,
  sourceCode,
  testDraft,
  upcardLabel,
} from "./blackjack";
import {
  RAMP_LABELS,
  checkRamp,
  rampOf,
  rampRows,
  spreadLabel,
  stepUnit,
  stepUnits,
} from "./betRamp";
import { exportDraft, testInTrainerHref } from "./library";
import { CELL, builder, cellColors } from "./palette";
import {
  BuilderHead,
  BuilderLayout,
  Card,
  ChangeNav,
  CoachNoteEditor,
  ComparePanel,
  EngineCheck,
  ExplainStep,
  InfoNote,
  InspectorHead,
  Label,
  SharePanel,
  StepRail,
  Stepper,
  SubmitPanel,
  styles as p,
} from "./parts";
import { BuilderMissing, BuilderLoading } from "./states";
import { StrategyShell } from "./StrategyShell";
import { useBuilderDraft } from "./useBuilderDraft";

type Tab = "totals" | "pairs" | "surrender" | "sizing";
type Panel = "none" | "compare" | "share" | "submit";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "totals", label: "Totals" },
  { value: "pairs", label: "Pairs" },
  { value: "surrender", label: "Surrender" },
  { value: "sizing", label: "Bet sizing" },
];

const LEGEND: readonly { glyph: keyof typeof CELL; label: string }[] = [
  { glyph: "H", label: "Hit" },
  { glyph: "S", label: "Stand" },
  { glyph: "D", label: "Double" },
  { glyph: "Ds", label: "Double, else stand" },
  { glyph: "P", label: "Split" },
  { glyph: "R", label: "Surrender" },
];

export function BlackjackBuilder() {
  const state = useBuilderDraft("blackjack");
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
  draft: BlackjackDraft;
  readOnly: boolean;
  update: (d: BlackjackDraft) => void;
  fork: () => void;
}) {
  const changes = chartChanges(draft);
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState<Tab>("totals");
  const [panel, setPanel] = useState<Panel>("none");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected: CellRef = (selectedKey ? parseCellKey(selectedKey) : undefined) ??
    changes[0]?.ref ?? { section: "hard", row: "16", upcard: 10 };

  const select = (ref: CellRef) => {
    setSelectedKey(cellKey(ref));
    setTab(ref.section === "pairs" ? "pairs" : tab === "surrender" ? "surrender" : "totals");
    setStep(1);
  };

  const notesWritten = changes.filter((c) => draft.notes[c.key]).length;
  const steps = [
    {
      title: "Game & rules",
      detail: `Blackjack · ${rulesShort(draft.rules).split(" · ").slice(0, 3).join(" · ")}`,
    },
    { title: "Decisions", detail: "Edit the chart" },
    { title: "Explain your changes", detail: `${notesWritten} of ${changes.length} notes written` },
    { title: "Test & submit", detail: "Play 50 hands with it" },
  ];
  const changeItems = changes.map((c) => ({
    key: c.key,
    title: cellTitle(c.ref),
    from: CODE_NAMES[c.from],
    to: CODE_NAMES[c.to],
  }));
  const setNote = (key: string, text: string) => {
    const notes = { ...draft.notes };
    if (text.trim()) notes[key] = text;
    else delete notes[key];
    update({ ...draft, notes });
  };

  const submitCheck = () => {
    const c = checkChart(draft);
    return { ok: c.ok, title: c.title, body: c.body };
  };

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
              original={draft.forkedFrom?.title ?? "Basic Strategy for these rules"}
              changes={changeItems}
              onPick={(k) => {
                const ref = parseCellKey(k);
                if (ref) select(ref);
                setPanel("none");
              }}
              onClose={() => setPanel("none")}
            />
          ) : panel === "share" ? (
            <SharePanel text={exportDraft(draft)} onClose={() => setPanel("none")} />
          ) : panel === "submit" ? (
            <SubmitPanel {...submitCheck()} onClose={() => setPanel("none")} />
          ) : null}
        </>
      )}
      rail={
        <StepRail
          steps={steps}
          active={step}
          onSelect={setStep}
          footer="Craps and roulette strategies use bet plans: which bets, how much and when to press. Video poker uses hold rankings."
        />
      }
      inspector={
        step === 1 && tab === "sizing" ? (
          <RampInspector draft={draft} readOnly={readOnly} onNote={setNote} />
        ) : step === 1 ? (
          <Inspector
            draft={draft}
            selected={selected}
            readOnly={readOnly}
            update={update}
            changes={changes.map((c) => c.ref)}
            onSelect={select}
            onNote={setNote}
          />
        ) : undefined
      }
    >
      {step === 0 ? (
        <RulesStep draft={draft} readOnly={readOnly} update={update} />
      ) : step === 1 ? (
        <ChartEditor
          draft={draft}
          tab={tab}
          onTab={setTab}
          selected={selected}
          onSelect={(ref) => setSelectedKey(cellKey(ref))}
          readOnly={readOnly}
          update={update}
        />
      ) : step === 2 ? (
        <ExplainStep
          changes={changeItems}
          notes={draft.notes}
          onNote={setNote}
          readOnly={readOnly}
        />
      ) : (
        <TestStep draft={draft} onSubmit={() => setPanel("submit")} onSelect={select} />
      )}
    </BuilderLayout>
  );
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

function ChartEditor({
  draft,
  tab,
  onTab,
  selected,
  onSelect,
  readOnly,
  update,
}: {
  draft: BlackjackDraft;
  tab: Tab;
  onTab: (t: Tab) => void;
  selected: CellRef;
  onSelect: (ref: CellRef) => void;
  readOnly: boolean;
  update: (d: BlackjackDraft) => void;
}) {
  // Measured after mount: on a phone the chart scrolls sideways and its cells grow to 44pt.
  const [width, setWidth] = useState<number | null>(null);
  const tall = width !== null && width < 600;
  const table = (title: string, rows: readonly { section: CellSection; row: string }[]) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.chartScroll}
    >
      <ChartTable
        title={title}
        draft={draft}
        rows={rows}
        selected={selected}
        onSelect={onSelect}
        tall={tall}
      />
    </ScrollView>
  );
  return (
    <Card style={s.editor}>
      <View style={s.editorHead}>
        <View style={s.tabs} accessibilityRole="tablist" accessibilityLabel="Chart">
          {TABS.map((t) => {
            const on = t.value === tab;
            return (
              <Pressable
                key={t.value}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                aria-selected={on}
                onPress={() => onTab(t.value)}
                hitSlop={6}
                style={[s.tab, on && { backgroundColor: colors.card }]}
              >
                <Text
                  style={[
                    ui(13, on ? 600 : 500),
                    { color: on ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {tab === "sizing" ? null : (
          <View style={s.legend}>
            {LEGEND.filter((l) => l.glyph !== "P" || tab !== "totals").map((l) => (
              <View key={l.glyph} style={s.legendItem}>
                <Swatch glyph={l.glyph} />
                <Text style={[ui(12), { color: colors.mutedForeground }]}>{l.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} />
      {tab === "sizing" ? (
        <RampEditor draft={draft} readOnly={readOnly} update={update} />
      ) : tab === "totals" ? (
        <>
          {table(
            "Hard totals",
            HARD_ROWS.map((row) => ({ section: "hard" as const, row })),
          )}
          {table(
            "Soft totals",
            SOFT_ROWS.map((row) => ({ section: "soft" as const, row })),
          )}
        </>
      ) : tab === "pairs" ? (
        table(
          "Pairs",
          PAIR_ROWS.map((row) => ({ section: "pairs" as const, row })),
        )
      ) : (
        <>
          <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.mutedForeground }]}>
            {draft.rules.surrender === "none"
              ? "This table offers no surrender, so these cells play their second choice. Change the rules in step 1 to allow it."
              : "Late surrender: give up half the bet on your first two cards, after the dealer checks for blackjack. These are the only rows where it is ever right."}
          </Text>
          {table("Surrender rows", SURRENDER_ROWS)}
        </>
      )}
    </Card>
  );
}

function Swatch({ glyph }: { glyph: keyof typeof CELL }) {
  const c = CELL[glyph];
  return (
    <View style={[s.swatch, { backgroundColor: c.bg }]}>
      <Text style={[ui(11, 800), { color: c.fg }]}>{glyph === "R" ? "R" : glyph}</Text>
    </View>
  );
}

function ChartTable({
  title,
  draft,
  rows,
  selected,
  onSelect,
  tall,
}: {
  title: string;
  draft: BlackjackDraft;
  rows: readonly { section: CellSection; row: string }[];
  selected: CellRef;
  onSelect: (ref: CellRef) => void;
  /** Phone layout: 44pt cells (the minimum tap target) in a sideways-scrolling chart. */
  tall: boolean;
}) {
  const selKey = cellKey(selected);
  return (
    <View style={[s.table, tall && s.tableTall]} accessibilityLabel={title}>
      <Text style={[ui(11, 700, { letterSpacing: 1.2 }), { color: colors.mutedForeground }]}>
        {title.toUpperCase()}
      </Text>
      <View style={s.tr}>
        <Text style={[ui(11, 600), s.corner, { color: colors.mutedForeground }]}>
          You ↓ Dealer →
        </Text>
        {DEALER_UPCARDS.map((u) => (
          <View key={u} style={s.up}>
            <Text style={[ui(13, 700), { color: colors.foreground }]}>{upcardLabel(u)}</Text>
          </View>
        ))}
      </View>
      {rows.map(({ section, row }) => (
        <View key={`${section}${row}`} style={s.tr}>
          <Text style={[ui(13, 600), s.rowLabel, { color: colors.foreground }]}>
            {rowLabel(section, row)}
          </Text>
          {DEALER_UPCARDS.map((upcard) => {
            const ref: CellRef = { section, row, upcard };
            const key = cellKey(ref);
            const code = draftCode(draft, ref);
            const changed = code !== sourceCode(draft.base, ref);
            const flagged = isFlagged(draft, ref);
            const on = key === selKey;
            const c = cellColors(code);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${rowLabel(section, row)} vs ${upcardLabel(upcard)}: ${CODE_NAMES[code]}${changed ? ", changed" : ""}${flagged ? ", loses money under these rules" : ""}`}
                aria-selected={on}
                onPress={() => onSelect(ref)}
                style={[
                  s.cell,
                  tall && s.cellTall,
                  { backgroundColor: c.bg },
                  changed && s.changed,
                  flagged && s.flagged,
                  on && s.selected,
                ]}
              >
                <Text style={[ui(12, 800), { color: c.fg }]}>{cellGlyph(code)}</Text>
                {changed ? <View style={s.dot} /> : null}
                {flagged ? <View style={s.flagDot} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bet sizing (the 4th tab, Pencil node QQRzH)
// ---------------------------------------------------------------------------

function RampEditor({
  draft,
  readOnly,
  update,
}: {
  draft: BlackjackDraft;
  readOnly: boolean;
  update: (d: BlackjackDraft) => void;
}) {
  const ramp = rampOf(draft);
  const set = (next: typeof ramp) => {
    if (!readOnly) update({ ...draft, ramp: next });
  };
  return (
    <View style={s.ramp}>
      <View style={s.rampHead}>
        <View style={[p.gap2, p.flex]}>
          <Text accessibilityRole="header" style={[ui(15, 600), { color: colors.foreground }]}>
            Bet by the true count
          </Text>
          <Text style={[ui(13), { color: colors.mutedForeground }]}>
            Units to bet at each true count. Practice chips only.
          </Text>
        </View>
        <Badge label={spreadLabel(ramp)} tone="primary" />
      </View>
      <View style={s.rampRow}>
        <View style={s.rampWhen}>
          <Text style={[ui(12, 600), { color: colors.mutedForeground }]}>One unit</Text>
        </View>
        <View style={p.flex}>
          <Stepper
            label="Unit size"
            value={formatDollars(ramp.unit)}
            onMinus={() => set(stepUnit(ramp, -1))}
            onPlus={() => set(stepUnit(ramp, 1))}
          />
        </View>
        <View style={s.rampDollars} />
      </View>
      {rampRows(ramp).map((r, i) => (
        <View
          key={r.label}
          style={s.rampRow}
          accessibilityLabel={`True count ${r.label}: ${r.units} units, ${r.dollars}`}
        >
          <View style={s.rampWhen}>
            <Text style={[ui(12, 600), { color: colors.mutedForeground }]}>TC {r.label}</Text>
          </View>
          <View style={p.flex}>
            <Stepper
              label={`Units at true count ${RAMP_LABELS[i]}`}
              value={`${r.units} ${r.units === 1 ? "unit" : "units"}`}
              onMinus={() => set(stepUnits(ramp, i, -1))}
              onPlus={() => set(stepUnits(ramp, i, 1))}
            />
          </View>
          <Text style={[ui(14, 700), s.rampDollars, { color: colors.foreground }]}>
            {r.dollars}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RampInspector({
  draft,
  readOnly,
  onNote,
}: {
  draft: BlackjackDraft;
  readOnly: boolean;
  onNote: (key: string, text: string) => void;
}) {
  const ramp = rampOf(draft);
  const check = checkRamp(ramp, draft.rules);
  const rows = rampRows(ramp);
  return (
    <Card>
      <InspectorHead
        eyebrow="Bet sizing"
        title={spreadLabel(ramp)}
        original={`Table: ${formatDollars(draft.rules.minBet)}–${formatDollars(draft.rules.maxBet)}`}
        yours={`${rows[0]?.dollars ?? ""} to ${rows[rows.length - 1]?.dollars ?? ""}`}
      />
      <EngineCheck
        ok={check.level === "ok"}
        warn={check.level === "warn"}
        title={check.title}
        body={check.body}
      />
      <CoachNoteEditor
        value={draft.notes.ramp ?? ""}
        onChange={(t) => onNote("ramp", t)}
        previewTitle={`Bet sizing: ${spreadLabel(ramp)}`}
        readOnly={readOnly}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

function Inspector({
  draft,
  selected,
  readOnly,
  update,
  changes,
  onSelect,
  onNote,
}: {
  draft: BlackjackDraft;
  selected: CellRef;
  readOnly: boolean;
  update: (d: BlackjackDraft) => void;
  changes: readonly CellRef[];
  onSelect: (ref: CellRef) => void;
  onNote: (key: string, text: string) => void;
}) {
  const key = cellKey(selected);
  const code = draftCode(draft, selected);
  const original = sourceCode(draft.base, selected);
  const check = checkCell(draft.rules, selected, code, original);
  const index = changes.findIndex((r) => cellKey(r) === key);
  const moves = movesFor(selected.section);
  const current = moveOf(code);
  const go = (dir: 1 | -1) => {
    if (changes.length === 0) return;
    const next =
      index === -1
        ? dir === 1
          ? 0
          : changes.length - 1
        : (index + dir + changes.length) % changes.length;
    const ref = changes[next];
    if (ref) onSelect(ref);
  };
  const rows = [moves.slice(0, 3), moves.slice(3)];
  return (
    <Card>
      <InspectorHead
        eyebrow="Selected decision"
        title={cellTitle(selected)}
        original={`Original: ${CODE_NAMES[original]}`}
        yours={code !== original ? `Yours: ${CODE_NAMES[code]}` : "Unchanged"}
      />
      {readOnly ? null : (
        <View style={p.gap8}>
          <Label>Correct move</Label>
          {rows.map((r, i) => (
            <View
              key={i}
              style={s.moveRow}
              accessibilityRole="radiogroup"
              accessibilityLabel="Correct move"
            >
              {r.map((m) => {
                const on = m === current;
                const glyph = m === "R" ? "R" : m;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="radio"
                    accessibilityLabel={MOVE_LABELS[m]}
                    aria-checked={on}
                    onPress={() => update(setCell(draft, selected, codeForMove(m, selected)))}
                    style={[s.move, on && s.moveOn]}
                  >
                    <Swatch glyph={glyph} />
                    <Text
                      style={[ui(13, on ? 600 : 500), { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {MOVE_LABELS[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
      <EngineCheck ok={check.verdict !== "worse"} title={check.title} body={check.body} />
      <CoachNoteEditor
        value={draft.notes[key] ?? ""}
        onChange={(t) => onNote(key, t)}
        previewTitle={`${cellTitle(selected)}: ${CODE_NAMES[code]}`}
        readOnly={readOnly}
      />
      <ChangeNav
        label={
          index === -1
            ? `Not a change · ${changes.length} in all`
            : `Change ${index + 1} of ${changes.length}`
        }
        onPrev={() => go(-1)}
        onNext={() => go(1)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Game & rules
// ---------------------------------------------------------------------------

function RulesStep({
  draft,
  readOnly,
  update,
}: {
  draft: BlackjackDraft;
  readOnly: boolean;
  update: (d: BlackjackDraft) => void;
}) {
  const r = draft.rules;
  const set = (change: Partial<RuleSet>) => {
    if (!readOnly) update({ ...draft, rules: { ...r, ...change } });
  };
  const check = useMemo(() => checkChart(draft), [draft]);
  return (
    <Card>
      <View style={p.gap4}>
        <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
          Game & rules
        </Text>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>
          The table this chart is for. The rules check prices every cell for these rules.
        </Text>
      </View>
      <RuleRow label="Decks">
        <SegmentedControl
          accessibilityLabel="Decks"
          options={[1, 2, 6, 8].map((d) => ({
            value: String(d),
            label: `${d} ${d === 1 ? "deck" : "decks"}`,
          }))}
          value={String(r.decks)}
          onChange={(v) => set({ decks: Number(v) })}
        />
      </RuleRow>
      <RuleRow label="Dealer soft 17">
        <SegmentedControl
          accessibilityLabel="Dealer soft 17"
          options={[
            { value: "stand", label: "Stands (S17)" },
            { value: "hit", label: "Hits (H17)" },
          ]}
          value={r.dealerSoft17}
          onChange={(v) => set({ dealerSoft17: v })}
        />
      </RuleRow>
      <RuleRow label="Double after split">
        <SegmentedControl
          accessibilityLabel="Double after split"
          options={[
            { value: "yes", label: "Allowed" },
            { value: "no", label: "Not allowed" },
          ]}
          value={r.doubleAfterSplit ? "yes" : "no"}
          onChange={(v) => set({ doubleAfterSplit: v === "yes" })}
        />
      </RuleRow>
      <RuleRow label="Surrender">
        <SegmentedControl
          accessibilityLabel="Surrender"
          options={[
            { value: "none", label: "None" },
            { value: "late", label: "Late" },
          ]}
          value={r.surrender === "early" ? "late" : r.surrender}
          onChange={(v) => set({ surrender: v })}
        />
      </RuleRow>
      <EngineCheck ok={check.ok} title={check.title} body={check.body} />
      {!readOnly ? (
        <View style={p.row8}>
          <Button
            label={`Use basic strategy for ${rulesCheckTarget(r)}`}
            variant="secondary"
            onPress={() => update(resetToBasic(draft))}
          />
        </View>
      ) : null}
    </Card>
  );
}

function RuleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={p.gap8}>
      <Label>{label}</Label>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Test & submit
// ---------------------------------------------------------------------------

const TEST_SEED = 2026;

function TestStep({
  draft,
  onSubmit,
  onSelect,
}: {
  draft: BlackjackDraft;
  onSubmit: () => void;
  onSelect: (ref: CellRef) => void;
}) {
  const check = useMemo(() => checkChart(draft), [draft]);
  const [result, setResult] = useState<ReturnType<typeof testDraft> | null>(null);
  const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)} bets`;
  return (
    <Card>
      <View style={p.gap4}>
        <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
          Test & submit
        </Text>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>
          The rules check first, then 50 seeded hands beside basic strategy on the same cards.
        </Text>
      </View>
      <EngineCheck ok={check.ok} title={check.title} body={check.body} />
      {check.flagged.map((f) => (
        <Pressable
          key={cellKey(f.ref)}
          accessibilityRole="button"
          accessibilityLabel={`Fix ${cellTitle(f.ref)}`}
          onPress={() => onSelect(f.ref)}
          style={s.flagRow}
        >
          <Text style={[ui(13, 600), p.flex, { color: colors.foreground }]}>
            {cellTitle(f.ref)}
          </Text>
          <Text style={[ui(13), { color: colors.mistake }]}>
            {CODE_NAMES[draftCode(draft, f.ref)]} · basic:{" "}
            {CODE_NAMES[basicCode(draft.rules, f.ref)]}
          </Text>
        </Pressable>
      ))}
      <View style={p.row8}>
        <Button
          label="Play 50 hands with it"
          variant="secondary"
          onPress={() => setResult(testDraft(draft, TEST_SEED))}
        />
        <Button label="Submit to community" onPress={onSubmit} />
      </View>
      {result ? (
        <>
          <View style={s.tiles}>
            <StatCard
              width="auto"
              label="Your chart"
              value={fmt(result.yours.net)}
              delta={`${result.yours.wins} won · ${result.yours.losses} lost · ${result.yours.pushes} pushed`}
              deltaTone="muted"
            />
            <StatCard
              width="auto"
              label="Basic strategy, same cards"
              value={fmt(result.basic.net)}
              delta={`${result.basic.wins} won · ${result.basic.losses} lost · ${result.basic.pushes} pushed`}
              deltaTone="muted"
            />
          </View>
          <InfoNote text="Fifty hands is luck, not proof: a strategy's worth shows over thousands of hands. The rules check above is the exact answer; this is a feel for how it plays." />
        </>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  editor: { gap: 16 },
  editorHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 10,
    backgroundColor: colors.muted,
  },
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 7 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: {
    width: 24,
    height: 20,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  table: { gap: 3, flexGrow: 1 },
  tableTall: { minWidth: 76 + 10 * 44 + 30 },
  chartScroll: { flexGrow: 1 },
  cellTall: { height: 44, minWidth: 44 },
  tr: { flexDirection: "row", alignItems: "center", gap: 3 },
  corner: { width: 76 },
  rowLabel: { width: 76 },
  up: { flex: 1, height: 24, alignItems: "center", justifyContent: "center" },
  cell: { flex: 1, height: 30, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  changed: { borderWidth: 2.5, borderColor: colors.primary },
  flagged: { borderWidth: 2.5, borderColor: colors.mistake },
  selected: { borderWidth: 3, borderColor: builder.selectedCell },
  dot: {
    position: "absolute",
    left: 3,
    top: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: builder.dotRing,
  },
  flagDot: {
    position: "absolute",
    right: 3,
    top: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.mistake,
    borderWidth: 1.5,
    borderColor: builder.dotRing,
  },
  moveRow: { flexDirection: "row", gap: 8 },
  move: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  moveOn: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: builder.primaryWashStrong,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  ramp: { gap: 10 },
  rampHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 6 },
  rampRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  rampWhen: {
    width: 120,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: colors.muted,
  },
  rampDollars: { width: 64, textAlign: "right" },
});

export type { ChartCode };
