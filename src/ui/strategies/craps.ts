/**
 * The craps Strategy Builder's view model (design 10b, GYRRl), on top of the craps engine's
 * bet plans: the rule rows by phase with their edges and "Changed" tags, the selected rule's
 * editor, the "Point is 6, after 2 hits" preview and its three stat cards.
 *
 * React-free, so it runs under vitest with the engine.
 */

import {
  type BetPlan,
  type ComeOutRule,
  type CrapsRules,
  type HitAction,
  type PlaceWinRule,
  type PlanCheck,
  type PlanRow,
  type PlanSection,
  type PointNumber,
  type PointRule,
  POINT_NUMBERS,
  SECTION_TITLES,
  checkPlan,
  describePlan,
  exactStep,
  formatApproxEdge,
  formatDollars,
  formatEdge,
  formatSignedDollars,
  hitLabel,
  isBoxBet,
  isComeBet,
  isLineBet,
  oddsLabel,
  planBlendedEdge,
  placePayout,
  pressNote,
  previewPlan,
  simulatePlan,
} from "@/games/craps";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Where a row's rule lives in the plan. */
export type RuleKey =
  | { readonly kind: "comeOut"; readonly index: number }
  | { readonly kind: "point"; readonly index: number }
  | { readonly kind: "hit"; readonly hit: 1 | 2 | 3 }
  | { readonly kind: "money" };

export function ruleKeyId(key: RuleKey): string {
  switch (key.kind) {
    case "comeOut":
      return `comeOut.${key.index}`;
    case "point":
      return `point.${key.index}`;
    case "hit":
      return `hit.${key.hit}`;
    case "money":
      return "money";
  }
}

export function parseRuleKey(id: string): RuleKey | undefined {
  const [kind, n] = id.split(".");
  const index = Number(n);
  if (kind === "comeOut" && Number.isInteger(index)) return { kind, index };
  if (kind === "point" && Number.isInteger(index)) return { kind, index };
  if (kind === "hit" && (index === 1 || index === 2 || index === 3)) return { kind, hit: index };
  if (kind === "money") return { kind };
  return undefined;
}

export interface RuleRow extends PlanRow {
  readonly key: RuleKey;
  readonly id: string;
  /** "3.2": phase number, then position in the phase. */
  readonly number: string;
  /** "1.41%", "0%", or "—". */
  readonly edgeText: string;
  readonly changed: boolean;
}

export interface Phase {
  readonly section: PlanSection;
  readonly number: number;
  readonly title: string;
  readonly rows: readonly RuleRow[];
}

const SECTIONS: readonly PlanSection[] = ["come-out", "point", "place-wins", "money"];

function keysFor(plan: BetPlan): RuleKey[] {
  const keys: RuleKey[] = [];
  plan.comeOut.forEach((_, index) => keys.push({ kind: "comeOut", index }));
  plan.pointOn.forEach((_, index) => keys.push({ kind: "point", index }));
  if (plan.placeWins) {
    keys.push({ kind: "hit", hit: 1 }, { kind: "hit", hit: 2 }, { kind: "hit", hit: 3 });
  }
  if (plan.money.stopLoss !== null || plan.money.stopWin !== null) keys.push({ kind: "money" });
  return keys;
}

/** The plan's rows, keyed, in the order `describePlan` lists them. */
function keyedRows(plan: BetPlan): { key: RuleKey; row: PlanRow }[] {
  const rows = describePlan(plan);
  const keys = keysFor(plan);
  return rows.map((row, i) => ({ row, key: keys[i] ?? { kind: "money" } }));
}

/** The four phases, each with its rows and "Changed" tags against the original. */
export function planPhases(plan: BetPlan, original: BetPlan): Phase[] {
  const before = new Map(keyedRows(original).map(({ key, row }) => [ruleKeyId(key), row.text]));
  const rows = keyedRows(plan);
  return SECTIONS.map((section, s) => {
    const mine = rows.filter((r) => r.row.section === section);
    return {
      section,
      number: s + 1,
      title: SECTION_TITLES[section],
      rows: mine.map(({ key, row }, i) => {
        const id = ruleKeyId(key);
        return {
          ...row,
          key,
          id,
          number: `${s + 1}.${i + 1}`,
          edgeText: row.edge === null ? "—" : formatEdge(row.edge),
          changed: before.get(id) !== row.text,
        };
      }),
    };
  });
}

export function allRows(phases: readonly Phase[]): RuleRow[] {
  return phases.flatMap((p) => p.rows);
}

/** Rows that differ from the original, plus original rules this plan dropped. */
export function planChanges(plan: BetPlan, original: BetPlan): { rows: RuleRow[]; removed: number } {
  const rows = allRows(planPhases(plan, original)).filter((r) => r.changed);
  const mine = new Set(keyedRows(plan).map(({ key }) => ruleKeyId(key)));
  const removed = keyedRows(original).filter(({ key }) => !mine.has(ruleKeyId(key))).length;
  return { rows, removed };
}

export function changeCount(plan: BetPlan, original: BetPlan): number {
  const { rows, removed } = planChanges(plan, original);
  return rows.length + removed;
}

// ---------------------------------------------------------------------------
// The selected rule
// ---------------------------------------------------------------------------

const HIT_TITLES = { 1: "First hit", 2: "Second hit", 3: "Third hit and after" } as const;

/** "Press to $18", "Collect", "Regress to $6", "Take down". */
export function hitShort(action: HitAction): string {
  switch (action.kind) {
    case "collect":
      return "Collect";
    case "press":
      return `Press to ${formatDollars(action.to)}`;
    case "regress":
      return `Regress to ${formatDollars(action.to)}`;
    case "takeDown":
      return "Take down";
  }
}

function placeNumbersOf(plan: BetPlan): PointNumber[] {
  const rule = plan.placeWins;
  if (rule && rule.numbers.length) return [...rule.numbers];
  const place = plan.pointOn.find((r) => r.kind === "place");
  return place && place.kind === "place" ? [...place.numbers] : [];
}

/** "Place 6 or Place 8 wins". */
export function hitWhen(plan: BetPlan): string {
  const ns = placeNumbersOf(plan);
  return ns.length ? `${ns.map((n) => `Place ${n}`).join(" or ")} wins` : "Any place bet wins";
}

/** The rule as a short phrase for "Original: …" / "Yours: …". */
export function ruleShort(plan: BetPlan, key: RuleKey): string | null {
  switch (key.kind) {
    case "hit": {
      const w = plan.placeWins;
      if (!w) return null;
      return hitShort(key.hit === 1 ? w.first : key.hit === 2 ? w.second : w.thirdPlus);
    }
    default: {
      const row = keyedRows(plan).find((r) => ruleKeyId(r.key) === ruleKeyId(key));
      return row ? row.row.text : null;
    }
  }
}

/** The inspector's title: "Second hit on a place 6 or 8", "Bet on the Pass line". */
export function ruleTitle(plan: BetPlan, key: RuleKey): string {
  switch (key.kind) {
    case "hit": {
      const ns = placeNumbersOf(plan);
      return `${HIT_TITLES[key.hit]} on a place ${ns.join(" or ") || "bet"}`;
    }
    case "comeOut": {
      const r = plan.comeOut[key.index];
      if (!r) return "Come-out bet";
      if (r.kind === "line") return r.side === "pass" ? "Pass line bet" : "Don't pass bet";
      return r.spec.kind === "field" ? "Field bet" : "Come-out bet";
    }
    case "point": {
      const r = plan.pointOn[key.index];
      if (!r) return "Point rule";
      if (r.kind === "odds") return "Odds behind the line";
      if (r.kind === "place") return `Place ${r.numbers.join(" and ")}`;
      if (r.kind === "come") return r.side === "come" ? "Come bets" : "Don't come bets";
      return r.spec.kind === "field" ? "Field every roll" : "Point bet";
    }
    case "money":
      return "When to walk away";
  }
}

/** The place amount before the `hit`-th win: the base, after the earlier hit rules ran. */
export function amountBeforeHit(plan: BetPlan, hit: 1 | 2 | 3): number {
  const place = plan.pointOn.find((r) => r.kind === "place");
  let amount = place && place.kind === "place" ? place.amount : 0;
  const w = plan.placeWins;
  if (!w) return amount;
  const steps = [w.first, w.second].slice(0, hit - 1);
  for (const a of steps) if (a.kind === "press" || a.kind === "regress") amount = a.to;
  return amount;
}

/** The step a press / place amount moves by so the payout stays exact: $6 on 6/8. */
export function placeStep(plan: BetPlan): { step: number; numbers: PointNumber[] } {
  const ns = placeNumbersOf(plan);
  const step = ns.reduce((s, n) => Math.max(s, exactStep("place", n)), 1);
  return { step, numbers: ns };
}

/** "Steps of $6 so the 7:6 payout comes out exact." */
export function stepHelp(plan: BetPlan): string {
  const { step, numbers } = placeStep(plan);
  const n = numbers[0];
  if (!n) return `Steps of ${formatDollars(step)}.`;
  const ratio = n === 6 || n === 8 ? "7:6" : n === 5 || n === 9 ? "7:5" : "9:5";
  return `Steps of ${formatDollars(step)} so the ${ratio} payout comes out exact.`;
}

export interface RuleCheck {
  readonly ok: boolean;
  readonly title: string;
  readonly body: string;
}

/** The inspector's "Rules-checked for 3-4-5x craps" panel for one rule. */
export function checkRule(plan: BetPlan, key: RuleKey): RuleCheck {
  const check: PlanCheck = checkPlan(plan);
  if (!check.ok) return { ok: false, title: check.title, body: check.problems.join(" ") };
  let body = "Every amount pays exactly at this table.";
  if (key.kind === "hit" && plan.placeWins) {
    const w = plan.placeWins;
    const action = key.hit === 1 ? w.first : key.hit === 2 ? w.second : w.thirdPlus;
    const before = amountBeforeHit(plan, key.hit);
    const n = placeNumbersOf(plan).includes(8) ? 8 : (placeNumbersOf(plan)[0] ?? 6);
    if ((action.kind === "press" || action.kind === "regress") && before > 0) {
      body = pressNote(n, before, action.to);
    } else if (action.kind === "collect" && before > 0) {
      body = `Collect the ${formatDollars(placePayout(n, before))} win and leave ${formatDollars(before)} up.`;
    } else if (action.kind === "takeDown") {
      body = `The ${formatDollars(before)} comes back to your rack with the win.`;
    }
  } else if (key.kind === "point") {
    const r = plan.pointOn[key.index];
    if (r?.kind === "odds") body = "Odds pay true odds: no house edge on that money.";
  }
  return { ok: true, title: check.title, body };
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export type HitKind = HitAction["kind"];

function withHit(plan: BetPlan, hit: 1 | 2 | 3, action: HitAction): BetPlan {
  if (!plan.placeWins) return plan;
  const w: PlaceWinRule = { ...plan.placeWins };
  const next =
    hit === 1 ? { ...w, first: action } : hit === 2 ? { ...w, second: action } : { ...w, thirdPlus: action };
  return { ...plan, placeWins: next };
}

/** Picks Collect / Press / Regress / Take down for a hit, with a sensible first amount. */
export function setHitKind(plan: BetPlan, hit: 1 | 2 | 3, kind: HitKind): BetPlan {
  const before = amountBeforeHit(plan, hit);
  const { step } = placeStep(plan);
  switch (kind) {
    case "collect":
      return withHit(plan, hit, { kind });
    case "takeDown":
      return withHit(plan, hit, { kind });
    case "press":
      return withHit(plan, hit, { kind, to: before + step });
    case "regress":
      return withHit(plan, hit, { kind, to: Math.max(step, before - step) });
  }
}

export function hitAction(plan: BetPlan, hit: 1 | 2 | 3): HitAction | null {
  const w = plan.placeWins;
  if (!w) return null;
  return hit === 1 ? w.first : hit === 2 ? w.second : w.thirdPlus;
}

/** Moves a press / regress target by one exact step. */
export function stepHitAmount(plan: BetPlan, hit: 1 | 2 | 3, dir: 1 | -1): BetPlan {
  const action = hitAction(plan, hit);
  if (!action || (action.kind !== "press" && action.kind !== "regress")) return plan;
  const { step } = placeStep(plan);
  return withHit(plan, hit, { ...action, to: Math.max(step, action.to + dir * step) });
}

export function setTakeDownAfter(plan: BetPlan, hits: number | null): BetPlan {
  if (!plan.placeWins) return plan;
  return { ...plan, placeWins: { ...plan.placeWins, takeDownAfterHits: hits } };
}

export function updateComeOut(plan: BetPlan, index: number, rule: ComeOutRule): BetPlan {
  return { ...plan, comeOut: plan.comeOut.map((r, i) => (i === index ? rule : r)) };
}

export function updatePoint(plan: BetPlan, index: number, rule: PointRule): BetPlan {
  return { ...plan, pointOn: plan.pointOn.map((r, i) => (i === index ? rule : r)) };
}

/** The amount stepper's step for a rule: exact-payout steps for place bets, $5 otherwise. */
export function amountStep(plan: BetPlan, key: RuleKey): number {
  if (key.kind === "hit") return placeStep(plan).step;
  if (key.kind === "point") {
    const r = plan.pointOn[key.index];
    if (r?.kind === "place") return r.numbers.reduce((s, n) => Math.max(s, exactStep("place", n)), 1);
  }
  if (key.kind === "money") return 50;
  return 5;
}

/** The rule's flat amount, if it has one. */
export function ruleAmount(plan: BetPlan, key: RuleKey): number | null {
  if (key.kind === "comeOut") {
    const r = plan.comeOut[key.index];
    return r ? (r.kind === "line" ? r.amount : r.spec.amount) : null;
  }
  if (key.kind === "point") {
    const r = plan.pointOn[key.index];
    if (!r || r.kind === "odds") return null;
    return r.kind === "bet" ? r.spec.amount : r.amount;
  }
  if (key.kind === "hit") {
    const a = hitAction(plan, key.hit);
    return a && (a.kind === "press" || a.kind === "regress") ? a.to : null;
  }
  return null;
}

/** Steps a rule's amount (never below one step). */
export function stepRuleAmount(plan: BetPlan, key: RuleKey, dir: 1 | -1): BetPlan {
  const step = amountStep(plan, key);
  const bump = (a: number) => Math.max(step, a + dir * step);
  if (key.kind === "hit") return stepHitAmount(plan, key.hit, dir);
  if (key.kind === "comeOut") {
    const r = plan.comeOut[key.index];
    if (!r) return plan;
    return updateComeOut(
      plan,
      key.index,
      r.kind === "line" ? { ...r, amount: bump(r.amount) } : { ...r, spec: { ...r.spec, amount: bump(r.spec.amount) } },
    );
  }
  if (key.kind === "point") {
    const r = plan.pointOn[key.index];
    if (!r || r.kind === "odds") return plan;
    if (r.kind === "bet") return updatePoint(plan, key.index, { ...r, spec: { ...r.spec, amount: bump(r.spec.amount) } });
    return updatePoint(plan, key.index, { ...r, amount: bump(r.amount) });
  }
  return plan;
}

export function stepMoney(plan: BetPlan, which: "stopLoss" | "stopWin", dir: 1 | -1): BetPlan {
  const current = plan.money[which] ?? 0;
  const next = Math.max(0, current + dir * 50);
  return { ...plan, money: { ...plan.money, [which]: next === 0 ? null : next } };
}

export function togglePlaceNumber(plan: BetPlan, index: number, n: PointNumber): BetPlan {
  const r = plan.pointOn[index];
  if (!r || r.kind !== "place") return plan;
  const has = r.numbers.includes(n);
  const numbers = has ? r.numbers.filter((x) => x !== n) : POINT_NUMBERS.filter((x) => x === n || r.numbers.includes(x));
  if (numbers.length === 0) return plan;
  return updatePoint(plan, index, { ...r, numbers });
}

/** Templates for "Add rule", per phase. */
export interface RuleTemplate {
  readonly label: string;
  readonly section: PlanSection;
}

export function templatesFor(plan: BetPlan, section: PlanSection): RuleTemplate[] {
  const out: RuleTemplate[] = [];
  const t = (label: string) => out.push({ label, section });
  if (section === "come-out") {
    const sides = plan.comeOut.map((r) => (r.kind === "line" ? r.side : null));
    if (!sides.includes("pass")) t("Pass line");
    if (!sides.includes("dontPass")) t("Don't pass");
    t("Field");
  } else if (section === "point") {
    if (!plan.pointOn.some((r) => r.kind === "odds")) t("Take odds");
    t("Place bets");
    if (!plan.pointOn.some((r) => r.kind === "come")) t("Come bets");
    t("Field every roll");
  } else if (section === "place-wins") {
    if (!plan.placeWins) t("Hit rules");
  } else if (!(plan.money.stopLoss !== null || plan.money.stopWin !== null)) {
    t("Stop-loss and stop-win");
  }
  return out;
}

/** Adds a rule from a template; returns the plan and the new rule's key. */
export function addRule(plan: BetPlan, template: RuleTemplate): { plan: BetPlan; key: RuleKey } {
  const min = plan.rules.minBet;
  switch (template.label) {
    case "Pass line":
    case "Don't pass": {
      const rule: ComeOutRule = { kind: "line", side: template.label === "Pass line" ? "pass" : "dontPass", amount: min };
      return { plan: { ...plan, comeOut: [...plan.comeOut, rule] }, key: { kind: "comeOut", index: plan.comeOut.length } };
    }
    case "Field":
      return {
        plan: { ...plan, comeOut: [...plan.comeOut, { kind: "bet", spec: { kind: "field", amount: min } }] },
        key: { kind: "comeOut", index: plan.comeOut.length },
      };
    case "Take odds":
      return { plan: { ...plan, pointOn: [...plan.pointOn, { kind: "odds", multiple: "max" }] }, key: { kind: "point", index: plan.pointOn.length } };
    case "Place bets":
      return {
        plan: { ...plan, pointOn: [...plan.pointOn, { kind: "place", numbers: [6, 8], amount: Math.ceil(min / 6) * 6, skipPoint: true }] },
        key: { kind: "point", index: plan.pointOn.length },
      };
    case "Come bets":
      return {
        plan: { ...plan, pointOn: [...plan.pointOn, { kind: "come", side: "come", amount: min, maxBets: 2 }] },
        key: { kind: "point", index: plan.pointOn.length },
      };
    case "Field every roll":
      return {
        plan: { ...plan, pointOn: [...plan.pointOn, { kind: "bet", spec: { kind: "field", amount: min } }] },
        key: { kind: "point", index: plan.pointOn.length },
      };
    case "Hit rules":
      return {
        plan: {
          ...plan,
          placeWins: { numbers: placeNumbersOf(plan), first: { kind: "collect" }, second: { kind: "collect" }, thirdPlus: { kind: "collect" }, takeDownAfterHits: null },
        },
        key: { kind: "hit", hit: 1 },
      };
    default:
      return { plan: { ...plan, money: { stopLoss: 200, stopWin: 150 } }, key: { kind: "money" } };
  }
}

/** Removes a rule (the hit rules go as a group). */
export function removeRule(plan: BetPlan, key: RuleKey): BetPlan {
  switch (key.kind) {
    case "comeOut":
      return { ...plan, comeOut: plan.comeOut.filter((_, i) => i !== key.index) };
    case "point":
      return { ...plan, pointOn: plan.pointOn.filter((_, i) => i !== key.index) };
    case "hit":
      return { ...plan, placeWins: null };
    case "money":
      return { ...plan, money: { stopLoss: null, stopWin: null } };
  }
}

/** Moves a come-out or point rule up or down within its phase (rules run top to bottom). */
export function moveRule(plan: BetPlan, key: RuleKey, dir: -1 | 1): { plan: BetPlan; key: RuleKey } {
  if (key.kind !== "comeOut" && key.kind !== "point") return { plan, key };
  const list = key.kind === "comeOut" ? [...plan.comeOut] : [...plan.pointOn];
  const to = key.index + dir;
  if (to < 0 || to >= list.length) return { plan, key };
  const [item] = list.splice(key.index, 1);
  if (item === undefined) return { plan, key };
  list.splice(to, 0, item as never);
  const next =
    key.kind === "comeOut"
      ? { ...plan, comeOut: list as ComeOutRule[] }
      : { ...plan, pointOn: list as PointRule[] };
  return { plan: next, key: { ...key, index: to } };
}

export function canMove(plan: BetPlan, key: RuleKey, dir: -1 | 1): boolean {
  if (key.kind !== "comeOut" && key.kind !== "point") return false;
  const len = key.kind === "comeOut" ? plan.comeOut.length : plan.pointOn.length;
  const to = key.index + dir;
  return to >= 0 && to < len;
}

export function withRules(plan: BetPlan, rules: CrapsRules): BetPlan {
  return { ...plan, rules };
}

/** "Craps · 3-4-5x odds · $10 min". */
export function crapsRulesLine(rules: CrapsRules): string {
  return `Craps · ${oddsLabel(rules)} odds · ${formatDollars(rules.minBet)} min`;
}

// ---------------------------------------------------------------------------
// Preview and stats
// ---------------------------------------------------------------------------

export interface PreviewChoice {
  readonly point: PointNumber;
  readonly hits: number;
}

export const PREVIEW_HITS = [0, 1, 2, 3, 4] as const;

/** "Point is 6, after 2 hits". */
export function previewLabel(c: PreviewChoice): string {
  const hits = c.hits === 0 ? "before any hits" : `after ${c.hits} ${c.hits === 1 ? "hit" : "hits"}`;
  return `Point is ${c.point}, ${hits}`;
}

export interface FeltSpot {
  readonly amount: number;
  /** Bigger than the place rule's starting amount. */
  readonly pressed: boolean;
}

export interface FeltView {
  readonly point: PointNumber;
  readonly place: Partial<Record<PointNumber, FeltSpot>>;
  readonly passFlat: number;
  readonly passOdds: number;
  readonly dontPass: number;
  readonly come: number;
  readonly field: number;
  /** "$10 + 5x ODDS". */
  readonly oddsLabel: string | null;
}

export interface PlanStats {
  readonly onTable: string;
  readonly breakdown: string;
  readonly worst: string;
  readonly worstNote: string;
  readonly blended: string;
  readonly felt: FeltView;
}

export function planStats(plan: BetPlan, choice: PreviewChoice): PlanStats {
  const p = previewPlan(plan, choice.point, choice.hits);
  const placeRule = plan.pointOn.find((r) => r.kind === "place");
  const base = placeRule && placeRule.kind === "place" ? placeRule.amount : 0;
  const place: Partial<Record<PointNumber, FeltSpot>> = {};
  let passFlat = 0;
  let passOdds = 0;
  let dontPass = 0;
  let come = 0;
  let field = 0;
  for (const b of p.bets) {
    if (isBoxBet(b)) place[b.number] = { amount: (place[b.number]?.amount ?? 0) + b.amount, pressed: b.amount > base && base > 0 };
    else if (isLineBet(b) && b.kind === "pass") {
      passFlat += b.amount;
      passOdds += b.odds;
    } else if (isLineBet(b)) dontPass += b.amount + b.odds;
    else if (isComeBet(b)) come += b.amount + b.odds;
    else if (b.kind === "field") field += b.amount;
  }
  const multiple = passFlat > 0 ? Math.round(passOdds / passFlat) : 0;
  return {
    onTable: formatDollars(p.onTable),
    breakdown: p.breakdown,
    worst: formatSignedDollars(p.worst.net),
    worstNote: p.worst.note,
    blended: formatApproxEdge(planBlendedEdge(plan)),
    felt: {
      point: choice.point,
      place,
      passFlat,
      passOdds,
      dontPass,
      come,
      field,
      oddsLabel: passOdds > 0 ? `${formatDollars(passFlat)} + ${multiple}x ODDS` : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Test & submit: "Play 10 shooters with it"
// ---------------------------------------------------------------------------

export function testPlan(plan: BetPlan, seed: number) {
  const r = simulatePlan(plan, { seed, shooters: 10, bankroll: 1000 });
  return {
    net: formatSignedDollars(r.net),
    netValue: r.net,
    wagered: formatDollars(r.wagered),
    drawdown: formatSignedDollars(r.maxDrawdown),
    shooters: r.shooters.map((s) => ({
      label: `Shooter ${s.shooter}`,
      detail: `${s.rolls} rolls · ${s.pointsMade} ${s.pointsMade === 1 ? "point" : "points"} made`,
      net: formatSignedDollars(s.net),
      value: s.net,
    })),
    stopped:
      r.stoppedBy === "stop-loss"
        ? "Stopped at the stop-loss."
        : r.stoppedBy === "stop-win"
          ? "Stopped at the stop-win."
          : r.stoppedBy === "bankroll"
            ? "Ran out of practice chips."
            : `Played all ${r.shooters.length} shooters.`,
  };
}

export { hitLabel };
