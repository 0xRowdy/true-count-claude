/**
 * Strategy Builder: Craps (design 10b, frame GYRRl). The bet plan with its mini layout
 * preview, the rules by phase with edges and "Changed" tags, the selected-rule inspector,
 * the three stat cards, and the Game & rules, Explain and Test & submit steps.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  type BetPlan,
  type CrapsPresetId,
  type PlanSection,
  type PointNumber,
  CRAPS_PRESETS,
  POINT_NUMBERS,
  formatDollars,
  oddsLabel,
} from "@/games/craps";
import { Button, SegmentedControl, colors, display, ui, StatCard } from "@/ui/ds";
import type { CrapsDraft } from "@/state/strategies";
import {
  type HitKind,
  type PreviewChoice,
  type RuleKey,
  type RuleRow,
  PREVIEW_HITS,
  addRule,
  allRows,
  amountBeforeHit,
  amountStep,
  canMove,
  changeCount,
  checkRule,
  crapsRulesLine,
  hitAction,
  hitWhen,
  moveRule,
  parseRuleKey,
  planChanges,
  planPhases,
  planStats,
  previewLabel,
  removeRule,
  ruleAmount,
  ruleKeyId,
  ruleShort,
  ruleTitle,
  setHitKind,
  setTakeDownAfter,
  stepHelp,
  stepMoney,
  stepRuleAmount,
  templatesFor,
  testPlan,
  togglePlaceNumber,
  updateComeOut,
  updatePoint,
  withRules,
} from "./craps";
import { Felt, FeltChip } from "./felt";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus } from "@/ui/ds/icons";
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
  ExplainStep,
  InfoNote,
  InspectorHead,
  Label,
  Pill,
  Segmented,
  SharePanel,
  StatTile,
  StepRail,
  Stepper,
  SubmitPanel,
  styles as p,
} from "./parts";
import { BuilderLoading, BuilderMissing } from "./states";
import { StrategyShell } from "./StrategyShell";
import { useBuilderDraft } from "./useBuilderDraft";

type Panel = "none" | "compare" | "share" | "submit";

export function CrapsBuilder() {
  const state = useBuilderDraft("craps");
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
  draft: CrapsDraft;
  readOnly: boolean;
  update: (d: CrapsDraft) => void;
  fork: () => void;
}) {
  const plan = draft.plan;
  const phases = planPhases(plan, draft.original);
  const rows = allRows(phases);
  const changed = planChanges(plan, draft.original).rows;
  const count = changeCount(plan, draft.original);
  const [step, setStep] = useState(1);
  const [panel, setPanel] = useState<Panel>("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewChoice>({ point: 6, hits: 2 });
  const selected: RuleRow | undefined =
    rows.find((r) => r.id === selectedId) ?? changed[0] ?? rows[0];

  const setPlan = (next: BetPlan, select?: RuleKey) => {
    update({ ...draft, plan: next });
    if (select) setSelectedId(ruleKeyId(select));
  };
  const setNote = (key: string, text: string) => {
    const notes = { ...draft.notes };
    if (text.trim()) notes[key] = text;
    else delete notes[key];
    update({ ...draft, notes });
  };

  const changeItems = changed.map((r) => ({
    key: r.id,
    title: `${r.number} ${ruleTitle(plan, r.key)}`,
    from: ruleShort(draft.original, r.key) ?? "Not in the original",
    to: ruleShort(plan, r.key) ?? "",
  }));
  const written = changeItems.filter((c) => draft.notes[c.key]).length;
  const steps = [
    { title: "Game & rules", detail: crapsRulesLine(plan.rules) },
    { title: "Bet plan", detail: "What to bet, and when" },
    { title: "Explain your changes", detail: `${written} of ${changeItems.length} notes written` },
    { title: "Test & submit", detail: "Play 10 shooters with it" },
  ];
  const planCheck = () => {
    const c = checkRule(plan, { kind: "money" });
    return c.ok
      ? {
          ok: true,
          title: c.title,
          body: "Every amount in the plan pays exactly at this table, and every rule shows its house edge.",
        }
      : c;
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
            changes={count}
            compareOpen={panel === "compare"}
            onCompare={() => setPanel(panel === "compare" ? "none" : "compare")}
            onShare={() => setPanel("share")}
            testHref={testInTrainerHref(draft)}
            onSubmit={() => setPanel("submit")}
            onFork={fork}
            onRename={(title) => update({ ...draft, title, plan: { ...plan, name: title } })}
          />
          {panel === "compare" ? (
            <ComparePanel
              original={draft.forkedFrom?.title ?? "the starting plan"}
              changes={changeItems}
              onPick={(k) => {
                setSelectedId(k);
                setStep(1);
                setPanel("none");
              }}
              onClose={() => setPanel("none")}
            />
          ) : panel === "share" ? (
            <SharePanel text={exportDraft(draft)} onClose={() => setPanel("none")} />
          ) : panel === "submit" ? (
            <SubmitPanel {...planCheck()} onClose={() => setPanel("none")} />
          ) : null}
        </>
      )}
      rail={
        <StepRail
          steps={steps}
          active={step}
          onSelect={setStep}
          footer="Blackjack uses a decision chart. Roulette uses bet layouts. Every plan is checked against the real payouts."
        />
      }
      inspector={
        step === 1 && selected ? (
          <Inspector
            draft={draft}
            row={selected}
            readOnly={readOnly}
            setPlan={setPlan}
            changed={changed}
            onSelect={setSelectedId}
            onNote={setNote}
          />
        ) : undefined
      }
    >
      {step === 0 ? (
        <RulesStep draft={draft} readOnly={readOnly} setPlan={setPlan} />
      ) : step === 1 ? (
        <Card>
          <View style={s.planHead}>
            <View style={[p.gap2, p.flex]}>
              <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
                Bet plan
              </Text>
              <Text style={[ui(13), { color: colors.mutedForeground }]} numberOfLines={1}>
                Rules run top to bottom. The coach checks every bet you make against them.
              </Text>
            </View>
            <PreviewPicker value={preview} onChange={setPreview} />
          </View>
          <PlanFelt plan={plan} preview={preview} />
          <View style={s.phases}>
            {phases.map((ph) => (
              <PhaseList
                key={ph.section}
                plan={plan}
                section={ph.section}
                number={ph.number}
                title={ph.title}
                rows={ph.rows}
                selectedId={selected?.id ?? null}
                readOnly={readOnly}
                onSelect={setSelectedId}
                onAdd={(t) => {
                  const r = addRule(plan, t);
                  setPlan(r.plan, r.key);
                }}
              />
            ))}
          </View>
          <PlanMath plan={plan} preview={preview} />
          <InfoNote text="No bet plan beats the house edge. A good one keeps the edge low and tells you when to walk away. We show the edge on every rule so the community can judge." />
        </Card>
      ) : step === 2 ? (
        <ExplainStep
          changes={changeItems}
          notes={draft.notes}
          onNote={setNote}
          readOnly={readOnly}
        />
      ) : (
        <TestStep plan={plan} check={planCheck()} onSubmit={() => setPanel("submit")} />
      )}
    </BuilderLayout>
  );
}

// ---------------------------------------------------------------------------
// Preview picker and felt
// ---------------------------------------------------------------------------

function PreviewPicker({
  value,
  onChange,
}: {
  value: PreviewChoice;
  onChange: (c: PreviewChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Preview: ${previewLabel(value)}`}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={s.picker}
      >
        <Text style={[ui(13), { color: colors.mutedForeground }]}>Preview:</Text>
        <Text style={[ui(13, 600), { color: colors.foreground }]}>{previewLabel(value)}</Text>
        <ChevronDown size={14} color={colors.mutedForeground} />
      </Pressable>
      {open ? (
        <View style={s.popover}>
          <Label>Point</Label>
          <Segmented
            label="Point"
            options={POINT_NUMBERS.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(value.point)}
            onChange={(v) => onChange({ ...value, point: Number(v) as PointNumber })}
          />
          <Label>Place bet hits</Label>
          <Segmented
            label="Place bet hits"
            options={PREVIEW_HITS.map((h) => ({ value: String(h), label: String(h) }))}
            value={String(value.hits)}
            onChange={(v) => onChange({ ...value, hits: Number(v) })}
          />
          <Button label="Done" size="sm" variant="secondary" onPress={() => setOpen(false)} />
        </View>
      ) : null}
    </View>
  );
}

const NUMBER_WORDS: Partial<Record<PointNumber, string>> = { 6: "SIX", 9: "NINE" };
const PAYS: Record<PointNumber, string> = {
  4: "9:5",
  5: "7:5",
  6: "7:6",
  8: "7:6",
  9: "7:5",
  10: "9:5",
};

function PlanFelt({ plan, preview }: { plan: BetPlan; preview: PreviewChoice }) {
  const { felt } = planStats(plan, preview);
  return (
    <Felt style={s.felt}>
      <View style={s.feltInner} accessibilityLabel={`Layout preview. ${previewLabel(preview)}`}>
        <View style={s.places}>
          {POINT_NUMBERS.map((n) => {
            const bet = felt.place[n];
            const isPoint = n === felt.point;
            const word = NUMBER_WORDS[n];
            return (
              <View
                key={n}
                style={[s.place, !bet && !isPoint && s.dim]}
                accessibilityLabel={`Place ${n}${bet ? `: $${bet.amount}${bet.pressed ? ", pressed" : ""}` : ""}${isPoint ? ", the point" : ""}`}
              >
                <Text
                  style={[word ? display(15, 600) : display(22, 600), { color: colors.feltText }]}
                >
                  {word ?? n}
                </Text>
                <Text style={[ui(11), { color: builder.feltCaption }]}>{PAYS[n]}</Text>
                {isPoint ? (
                  <View style={s.puck}>
                    <Text
                      style={[ui(9, 800), { color: builder.puckInk }]}
                      maxFontSizeMultiplier={1}
                    >
                      ON
                    </Text>
                  </View>
                ) : null}
                {bet?.pressed ? (
                  <View style={s.pressed}>
                    <Text
                      style={[ui(8, 800), { color: colors.primaryForeground }]}
                      maxFontSizeMultiplier={1}
                    >
                      PRESSED
                    </Text>
                  </View>
                ) : null}
                {bet ? <FeltChip amount={bet.amount} style={s.placeChip} /> : null}
              </View>
            );
          })}
        </View>
        <View style={[s.band, !felt.come && s.dim]}>
          <Text style={[display(15, 400, { letterSpacing: 3 }), { color: colors.feltText }]}>
            COME
          </Text>
          {felt.come ? <FeltChip amount={felt.come} style={s.bandChip} /> : null}
        </View>
        <View style={[s.band, !felt.field && s.dim]}>
          <Text style={[display(15, 400, { letterSpacing: 3 }), { color: colors.feltText }]}>
            FIELD
          </Text>
          {felt.field ? <FeltChip amount={felt.field} style={s.bandChip} /> : null}
        </View>
        <View style={[s.pass, !(felt.passFlat || felt.dontPass) && s.passOff]}>
          <Text style={[display(18, 400, { letterSpacing: 3 }), { color: colors.feltText }]}>
            {felt.dontPass && !felt.passFlat ? "DON'T PASS BAR" : "PASS LINE"}
          </Text>
          <View style={s.passChips}>
            {felt.passFlat ? <FeltChip amount={felt.passFlat} /> : null}
            {felt.passOdds ? <FeltChip amount={felt.passOdds} /> : null}
            {felt.dontPass && !felt.passFlat ? <FeltChip amount={felt.dontPass} /> : null}
            {felt.oddsLabel ? (
              <View style={s.oddsLabel}>
                <Text style={[ui(9, 800), { color: colors.feltText }]} maxFontSizeMultiplier={1}>
                  {felt.oddsLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Felt>
  );
}

// ---------------------------------------------------------------------------
// Rule lists
// ---------------------------------------------------------------------------

function PhaseList({
  plan,
  section,
  number,
  title,
  rows,
  selectedId,
  readOnly,
  onSelect,
  onAdd,
}: {
  plan: BetPlan;
  section: PlanSection;
  number: number;
  title: string;
  rows: readonly RuleRow[];
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onAdd: (t: ReturnType<typeof templatesFor>[number]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const templates = templatesFor(plan, section);
  return (
    <View style={s.phase}>
      <View style={s.phaseHead}>
        <View style={s.phaseN}>
          <Text style={[ui(11, 700), { color: colors.foreground }]}>{number}</Text>
        </View>
        <Text
          accessibilityRole="header"
          style={[ui(11, 700, { letterSpacing: 1.2 }), { color: colors.mutedForeground }]}
        >
          {title}
        </Text>
      </View>
      {rows.map((r) => {
        const on = r.id === selectedId;
        return (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={`Rule ${r.number}: ${r.when}. ${r.text}${r.changed ? ". Changed" : ""}. Edge ${r.edgeText}`}
            aria-selected={on}
            onPress={() => onSelect(r.id)}
            style={[s.rule, on && s.ruleOn]}
          >
            <GripVertical size={16} color={colors.mutedForeground} />
            <View style={s.when}>
              <Text style={[ui(12, 600), { color: colors.mutedForeground }]} numberOfLines={1}>
                {r.when}
              </Text>
            </View>
            <Text style={[ui(14, 400, { lineHeight: 19 }), p.flex, { color: colors.foreground }]}>
              {r.text}
            </Text>
            {r.changed ? (
              <View style={s.changedTag}>
                <View style={s.changedDot} />
                <Text style={[ui(11, 600), { color: colors.primary }]}>Changed</Text>
              </View>
            ) : null}
            <View style={s.edge}>
              <Text
                style={[
                  ui(12, 600),
                  { color: r.edge === 0 ? colors.correct : colors.mutedForeground },
                ]}
              >
                {r.edgeText}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {readOnly ? null : adding && templates.length === 0 ? (
        <View style={s.addRow}>
          <Text role="status" style={[ui(13), p.flex, { color: colors.mutedForeground }]}>
            {section === "place-wins"
              ? "Hit rules have one row per hit: pick a row and change what happens in the panel."
              : "This plan already has its money rule: pick it to change the amounts."}
          </Text>
          <Pill label="OK" onPress={() => setAdding(false)} />
        </View>
      ) : adding ? (
        <View style={s.addRow}>
          {templates.map((t) => (
            <Pill
              key={t.label}
              label={t.label}
              onPress={() => {
                setAdding(false);
                onAdd(t);
              }}
            />
          ))}
          <Pill label="Cancel" onPress={() => setAdding(false)} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add rule: ${title.toLowerCase()}`}
          onPress={() => setAdding(true)}
          style={s.add}
          hitSlop={8}
        >
          <Plus size={14} color={colors.mutedForeground} />
          <Text style={[ui(13, 500), { color: colors.mutedForeground }]}>Add rule</Text>
        </Pressable>
      )}
    </View>
  );
}

function PlanMath({ plan, preview }: { plan: BetPlan; preview: PreviewChoice }) {
  const st = planStats(plan, preview);
  return (
    <View style={s.tiles}>
      <StatTile label="On the table" value={st.onTable} sub={st.breakdown} />
      <StatTile
        label="Worst single roll"
        value={st.worst}
        sub={st.worstNote}
        tone={st.worst.startsWith("−") ? "mistake" : undefined}
      />
      <StatTile label="Blended house edge" value={st.blended} sub="Engine estimate on money bet" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

const HIT_KINDS: readonly { value: HitKind; label: string }[] = [
  { value: "collect", label: "Collect" },
  { value: "press", label: "Press" },
  { value: "regress", label: "Regress" },
  { value: "takeDown", label: "Take down" },
];

function Inspector({
  draft,
  row,
  readOnly,
  setPlan,
  changed,
  onSelect,
  onNote,
}: {
  draft: CrapsDraft;
  row: RuleRow;
  readOnly: boolean;
  setPlan: (plan: BetPlan, select?: RuleKey) => void;
  changed: readonly RuleRow[];
  onSelect: (id: string) => void;
  onNote: (key: string, text: string) => void;
}) {
  const plan = draft.plan;
  const key = row.key;
  const before = ruleShort(draft.original, key);
  const mine = ruleShort(plan, key);
  const check = checkRule(plan, key);
  const index = changed.findIndex((r) => r.id === row.id);
  const go = (dir: 1 | -1) => {
    if (changed.length === 0) return;
    const next =
      index === -1
        ? dir === 1
          ? 0
          : changed.length - 1
        : (index + dir + changed.length) % changed.length;
    const r = changed[next];
    if (r) onSelect(r.id);
  };
  const amount = ruleAmount(plan, key);

  return (
    <Card>
      <InspectorHead
        eyebrow={`Selected rule · ${row.number}`}
        title={ruleTitle(plan, key)}
        original={before === null ? "Original: not in the plan" : `Original: ${before}`}
        yours={row.changed && mine ? `Yours: ${mine}` : "Unchanged"}
      />
      {readOnly ? null : (
        <>
          {key.kind === "hit" ? (
            <HitEditor plan={plan} hit={key.hit} setPlan={setPlan} />
          ) : key.kind === "money" ? (
            <View style={p.gap8}>
              <Label>Stop when down</Label>
              <Stepper
                label="Stop when down"
                value={
                  plan.money.stopLoss === null ? "Off" : `−${formatDollars(plan.money.stopLoss)}`
                }
                onMinus={() => setPlan(stepMoney(plan, "stopLoss", -1))}
                onPlus={() => setPlan(stepMoney(plan, "stopLoss", 1))}
              />
              <Label>Stop when up</Label>
              <Stepper
                label="Stop when up"
                value={
                  plan.money.stopWin === null ? "Off" : `+${formatDollars(plan.money.stopWin)}`
                }
                onMinus={() => setPlan(stepMoney(plan, "stopWin", -1))}
                onPlus={() => setPlan(stepMoney(plan, "stopWin", 1))}
              />
            </View>
          ) : (
            <RuleEditor plan={plan} rkey={key} setPlan={setPlan} />
          )}
          {amount !== null && key.kind !== "hit" ? (
            <View style={p.gap8}>
              <Label>Amount</Label>
              <Stepper
                label="Amount"
                value={formatDollars(amount)}
                onMinus={() => setPlan(stepRuleAmount(plan, key, -1))}
                onPlus={() => setPlan(stepRuleAmount(plan, key, 1))}
              />
              <Text style={[ui(12), { color: colors.mutedForeground }]}>
                Steps of {formatDollars(amountStep(plan, key))}.
              </Text>
            </View>
          ) : null}
          {key.kind === "comeOut" || key.kind === "point" ? (
            <View style={p.row8}>
              <Button
                label="Move up"
                size="sm"
                variant="secondary"
                icon={ArrowUp}
                disabled={!canMove(plan, key, -1)}
                onPress={() => {
                  const m = moveRule(plan, key, -1);
                  setPlan(m.plan, m.key);
                }}
              />
              <Button
                label="Move down"
                size="sm"
                variant="secondary"
                icon={ArrowDown}
                disabled={!canMove(plan, key, 1)}
                onPress={() => {
                  const m = moveRule(plan, key, 1);
                  setPlan(m.plan, m.key);
                }}
              />
              <Button
                label="Remove rule"
                size="sm"
                variant="ghost"
                onPress={() => setPlan(removeRule(plan, key))}
              />
            </View>
          ) : (
            <Button
              label={key.kind === "hit" ? "Remove hit rules" : "Remove money rule"}
              size="sm"
              variant="ghost"
              onPress={() => setPlan(removeRule(plan, key))}
            />
          )}
        </>
      )}
      <EngineCheck ok={check.ok} title={check.title} body={check.body} />
      <CoachNoteEditor
        value={draft.notes[row.id] ?? ""}
        onChange={(t) => onNote(row.id, t)}
        previewTitle={mine ?? ruleTitle(plan, key)}
        readOnly={readOnly}
      />
      <ChangeNav
        label={
          index === -1
            ? `Not a change · ${changed.length} in all`
            : `Change ${index + 1} of ${changed.length}`
        }
        onPrev={() => go(-1)}
        onNext={() => go(1)}
      />
    </Card>
  );
}

function HitEditor({
  plan,
  hit,
  setPlan,
}: {
  plan: BetPlan;
  hit: 1 | 2 | 3;
  setPlan: (plan: BetPlan, select?: RuleKey) => void;
}) {
  const action = hitAction(plan, hit);
  const showAmount = action && (action.kind === "press" || action.kind === "regress");
  const takeDown = plan.placeWins?.takeDownAfterHits ?? null;
  return (
    <>
      <View style={p.gap8}>
        <Label>When</Label>
        <View style={s.select}>
          <Text style={[ui(14), { color: colors.foreground }]}>{hitWhen(plan)}</Text>
          <ChevronDown size={16} color={colors.mutedForeground} />
        </View>
        <Segmented
          label="Which hit"
          options={[
            { value: "1", label: "1st hit" },
            { value: "2", label: "2nd hit" },
            { value: "3", label: "3rd+" },
          ]}
          value={String(hit)}
          onChange={(v) => setPlan(plan, { kind: "hit", hit: Number(v) as 1 | 2 | 3 })}
        />
      </View>
      <View style={p.gap8}>
        <Label>Then</Label>
        <Segmented
          label="Then"
          options={HIT_KINDS}
          value={action?.kind ?? null}
          onChange={(k) => setPlan(setHitKind(plan, hit, k))}
        />
        {showAmount ? (
          <>
            <Stepper
              label="Press amount"
              value={`${formatDollars(action.to)} each`}
              onMinus={() => setPlan(stepRuleAmount(plan, { kind: "hit", hit }, -1))}
              onPlus={() => setPlan(stepRuleAmount(plan, { kind: "hit", hit }, 1))}
            />
            <Text style={[ui(12), { color: colors.mutedForeground }]}>{stepHelp(plan)}</Text>
          </>
        ) : (
          <Text style={[ui(12), { color: colors.mutedForeground }]}>
            The bet stays at {formatDollars(amountBeforeHit(plan, hit))} each.
          </Text>
        )}
        {hit === 3 ? (
          <>
            <Label>Take the bet down after</Label>
            <Stepper
              label="Take down after hits"
              value={takeDown === null ? "Never" : `${takeDown} hits`}
              onMinus={() =>
                setPlan(
                  setTakeDownAfter(plan, takeDown === null || takeDown <= 2 ? null : takeDown - 1),
                )
              }
              onPlus={() =>
                setPlan(setTakeDownAfter(plan, takeDown === null ? 3 : Math.min(10, takeDown + 1)))
              }
            />
          </>
        ) : null}
      </View>
    </>
  );
}

function RuleEditor({
  plan,
  rkey,
  setPlan,
}: {
  plan: BetPlan;
  rkey: RuleKey;
  setPlan: (plan: BetPlan, select?: RuleKey) => void;
}) {
  if (rkey.kind === "comeOut") {
    const r = plan.comeOut[rkey.index];
    if (r?.kind !== "line") return null;
    return (
      <View style={p.gap8}>
        <Label>Bet</Label>
        <Segmented
          label="Line"
          options={[
            { value: "pass", label: "Pass line" },
            { value: "dontPass", label: "Don't pass" },
          ]}
          value={r.side}
          onChange={(side) => setPlan(updateComeOut(plan, rkey.index, { ...r, side }))}
        />
      </View>
    );
  }
  if (rkey.kind !== "point") return null;
  const r = plan.pointOn[rkey.index];
  if (!r) return null;
  if (r.kind === "odds") {
    return (
      <View style={p.gap8}>
        <Label>Odds</Label>
        <Segmented
          label="Odds"
          options={[
            { value: "1", label: "1x" },
            { value: "2", label: "2x" },
            { value: "max", label: `Full (${oddsLabel(plan.rules)})` },
          ]}
          value={String(r.multiple)}
          onChange={(v) =>
            setPlan(
              updatePoint(plan, rkey.index, {
                kind: "odds",
                multiple: v === "max" ? "max" : Number(v),
              }),
            )
          }
        />
      </View>
    );
  }
  if (r.kind === "place") {
    return (
      <View style={p.gap8}>
        <Label>Numbers</Label>
        <View style={p.row8}>
          {POINT_NUMBERS.map((n) => (
            <Pill
              key={n}
              label={`Place ${n}`}
              on={r.numbers.includes(n)}
              onPress={() => setPlan(togglePlaceNumber(plan, rkey.index, n))}
            />
          ))}
        </View>
        <Segmented
          label="When the point is one of them"
          options={[
            { value: "skip", label: "Place only the others" },
            { value: "all", label: "Place them all" },
          ]}
          value={r.skipPoint ? "skip" : "all"}
          onChange={(v) =>
            setPlan(updatePoint(plan, rkey.index, { ...r, skipPoint: v === "skip" }))
          }
        />
      </View>
    );
  }
  if (r.kind === "come") {
    return (
      <View style={p.gap8}>
        <Label>Keep working</Label>
        <Stepper
          label="Come bets working"
          value={`${r.maxBets} ${r.maxBets === 1 ? "bet" : "bets"}`}
          onMinus={() =>
            setPlan(updatePoint(plan, rkey.index, { ...r, maxBets: Math.max(1, r.maxBets - 1) }))
          }
          onPlus={() =>
            setPlan(updatePoint(plan, rkey.index, { ...r, maxBets: Math.min(5, r.maxBets + 1) }))
          }
        />
      </View>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Steps 1 and 4
// ---------------------------------------------------------------------------

function RulesStep({
  draft,
  readOnly,
  setPlan,
}: {
  draft: CrapsDraft;
  readOnly: boolean;
  setPlan: (plan: BetPlan) => void;
}) {
  const current = (Object.keys(CRAPS_PRESETS) as CrapsPresetId[]).find(
    (k) => oddsLabel(CRAPS_PRESETS[k]) === oddsLabel(draft.plan.rules),
  );
  const check = checkRule(draft.plan, { kind: "money" });
  return (
    <Card>
      <View style={p.gap4}>
        <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
          Game & rules
        </Text>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>
          The table this plan is for: its odds limit and minimum bet. Every amount is checked
          against it.
        </Text>
      </View>
      <View style={p.gap8}>
        <Label>Odds and limits</Label>
        <SegmentedControl
          accessibilityLabel="Table odds"
          options={(Object.keys(CRAPS_PRESETS) as CrapsPresetId[]).map((k) => ({
            value: k,
            label: `${k} · ${formatDollars(CRAPS_PRESETS[k].minBet)} min`,
          }))}
          value={current ?? "3-4-5x"}
          onChange={(k) => {
            if (!readOnly) setPlan(withRules(draft.plan, CRAPS_PRESETS[k]));
          }}
        />
      </View>
      <EngineCheck
        ok={check.ok}
        title={check.title}
        body={check.ok ? "Every amount in the plan pays exactly at this table." : check.body}
      />
    </Card>
  );
}

function TestStep({
  plan,
  check,
  onSubmit,
}: {
  plan: BetPlan;
  check: { ok: boolean; title: string; body: string };
  onSubmit: () => void;
}) {
  const [result, setResult] = useState<ReturnType<typeof testPlan> | null>(null);
  return (
    <Card>
      <View style={p.gap4}>
        <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
          Test & submit
        </Text>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>
          The rules check, then ten seeded shooters played exactly by your plan from a $1,000 rack.
        </Text>
      </View>
      <EngineCheck {...check} />
      <View style={p.row8}>
        <Button
          label="Play 10 shooters with it"
          variant="secondary"
          onPress={() => setResult(testPlan(plan, 2026))}
        />
        <Button label="Submit to community" onPress={onSubmit} />
      </View>
      {result ? (
        <>
          <View style={s.tiles}>
            <StatCard
              width="auto"
              label="Net"
              value={result.net}
              delta={result.stopped}
              deltaTone={result.netValue < 0 ? "mistake" : "correct"}
            />
            <StatCard
              width="auto"
              label="Money bet"
              value={result.wagered}
              delta="Flats, odds and presses"
              deltaTone="muted"
            />
            <StatCard
              width="auto"
              label="Deepest dip"
              value={result.drawdown}
              delta="Lowest point of the session"
              deltaTone="muted"
            />
          </View>
          {result.shooters.map((sh) => (
            <View key={sh.label} style={s.shooter}>
              <Text style={[ui(13, 600), p.flex, { color: colors.foreground }]}>{sh.label}</Text>
              <Text style={[ui(13), { color: colors.mutedForeground }]}>{sh.detail}</Text>
              <Text
                style={[
                  ui(13, 700),
                  s.net,
                  { color: sh.value < 0 ? colors.mistake : colors.correct },
                ]}
              >
                {sh.net}
              </Text>
            </View>
          ))}
          <InfoNote text="Ten shooters is luck, not proof. The blended house edge is what the plan costs on average; this shows how it can swing." />
        </>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  planHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    zIndex: 2,
  },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.muted,
  },
  popover: {
    position: "absolute",
    right: 0,
    top: 44,
    width: 300,
    padding: 14,
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.popover,
    zIndex: 10,
  },
  felt: {},
  feltInner: { padding: 14, gap: 6 },
  places: { flexDirection: "row", gap: 4 },
  place: {
    flex: 1,
    height: 64,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  dim: { opacity: 0.5 },
  puck: {
    position: "absolute",
    left: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: builder.pressedPuck,
    borderWidth: 2,
    borderColor: builder.puckInk,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    position: "absolute",
    left: 6,
    top: 6,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
  },
  placeChip: { position: "absolute", right: 6, bottom: 2 },
  band: {
    height: 40,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
  },
  bandChip: { position: "absolute", left: 60, top: 4 },
  pass: {
    height: 52,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  passOff: { borderColor: colors.feltLine, borderWidth: 1.5, opacity: 0.5 },
  passChips: {
    position: "absolute",
    left: 60,
    top: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  oddsLabel: {
    backgroundColor: builder.feltLabel,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  phases: { gap: 16 },
  phase: { gap: 6 },
  phaseHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 2 },
  phaseN: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  rule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  ruleOn: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: builder.primaryWash,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  when: {
    width: 132,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: colors.muted,
  },
  changedTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  changedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  edge: { width: 58, alignItems: "flex-end" },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  addRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  select: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 36,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  net: { width: 70, textAlign: "right" },
});

export { parseRuleKey };
