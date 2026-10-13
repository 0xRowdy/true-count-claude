/**
 * Bet plans — the craps Strategy Builder (design 10b, GYRRl).
 *
 * A plan is a list of rules by phase: what to bet on every come-out, what to add once a point is
 * set, what to do when a place bet wins (collect, press, regress, take down — by 1st, 2nd and
 * 3rd+ hit) and when to walk away. The same runner drives the strategy builder's preview, the
 * seeded "play 10 shooters" test, and the simulated players at the live table, so a plan
 * behaves identically everywhere it appears.
 *
 * Pure and deterministic: simulations take a seed (ADR-0004).
 */

import { createRng } from "../../engine/rng";
import {
  type Bet,
  type BetSpec,
  YOU,
  exactStep,
  isBoxBet,
  isComeBet,
  isLineBet,
  layRatio,
  maxLayOdds,
  maxOdds,
  placePayout,
  placeRatio,
  ratioLabel,
} from "./bets";
import {
  type Dice,
  type PointNumber,
  POINT_NUMBERS,
  allDice,
  diceTotal,
  isHard,
  rollDice,
  waysToRoll,
} from "./dice";
import { blendedEdge, edgeItems, houseEdge, placeEdge, passEdge, dontPassEdge } from "./edge";
import { fullOddsRule } from "./coach";
import { formatDollars, formatSignedDollars } from "./money";
import { type CrapsRules, oddsLabel, maxOddsMultiple } from "./rules";
import {
  type BetResolution,
  type CrapsTable,
  type RollOutcome,
  type RollRecord,
  type TableAction,
  applyAction,
  canTakeDown,
  createTable,
  creditOf,
  netOf,
  onTable,
  resolveBet,
  roll,
} from "./table";

// ---------------------------------------------------------------------------
// The plan model
// ---------------------------------------------------------------------------

/** What to do after a place (or buy) bet wins. */
export type HitAction =
  | { readonly kind: "collect" }
  | { readonly kind: "press"; readonly to: number }
  | { readonly kind: "regress"; readonly to: number }
  | { readonly kind: "takeDown" };

/** "Odds" multiple: "max" takes the table's full odds (3-4-5x, 10x, ...). */
export type OddsTarget = "max" | number;

export type ComeOutRule =
  | { readonly kind: "line"; readonly side: "pass" | "dontPass"; readonly amount: number }
  | { readonly kind: "bet"; readonly spec: BetSpec };

export type PointRule =
  /** Odds behind every line and come bet with a point. */
  | { readonly kind: "odds"; readonly multiple: OddsTarget }
  /** Place bets once a point is set; `skipPoint` leaves the point number itself out. */
  | {
      readonly kind: "place";
      readonly numbers: readonly PointNumber[];
      readonly amount: number;
      readonly skipPoint: boolean;
    }
  /** Keep up to `maxBets` come (or don't come) bets working. */
  | {
      readonly kind: "come";
      readonly side: "come" | "dontCome";
      readonly amount: number;
      readonly maxBets: number;
    }
  /** Any other bet; one-roll bets are re-made every roll while the point is on. */
  | { readonly kind: "bet"; readonly spec: BetSpec };

export interface PlaceWinRule {
  /** Which place numbers this applies to ("Place 6 or Place 8 wins"); empty means all. */
  readonly numbers: readonly PointNumber[];
  readonly first: HitAction;
  readonly second: HitAction;
  readonly thirdPlus: HitAction;
  /** "Take the bet down after 4 hits". */
  readonly takeDownAfterHits: number | null;
}

export interface MoneyRule {
  /** Stop when down this much (positive dollars), e.g. 200 for "−$200". */
  readonly stopLoss: number | null;
  /** Stop when up this much, e.g. 150 for "+$150". */
  readonly stopWin: number | null;
}

export interface BetPlan {
  readonly name: string;
  readonly rules: CrapsRules;
  readonly comeOut: readonly ComeOutRule[];
  readonly pointOn: readonly PointRule[];
  readonly placeWins: PlaceWinRule | null;
  readonly money: MoneyRule;
}

// ---------------------------------------------------------------------------
// Plan rows: the rule list the builder shows, with an edge per row
// ---------------------------------------------------------------------------

export type PlanSection = "come-out" | "point" | "place-wins" | "money";

export interface PlanRow {
  readonly section: PlanSection;
  /** The "when" pill: "Every come-out", "Point is on", "1st hit", "Session". */
  readonly when: string;
  readonly text: string;
  /** House edge on the money the row puts down; null renders as "—". */
  readonly edge: number | null;
}

export const SECTION_TITLES: Readonly<Record<PlanSection, string>> = {
  "come-out": "COME-OUT ROLL",
  point: "POINT IS SET",
  "place-wins": "WHEN A PLACE BET WINS",
  money: "MONEY RULES",
};

function listNumbers(ns: readonly number[]): string {
  if (ns.length <= 1) return ns.join("");
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The reference place bet for wording hit rules ("Collect the $14 win"). */
function referencePlace(plan: BetPlan): { number: PointNumber; amount: number } | null {
  const rule = plan.pointOn.find((r) => r.kind === "place");
  if (!rule || rule.kind !== "place") return null;
  const wanted = plan.placeWins?.numbers ?? [];
  const n = rule.numbers.find((x) => wanted.length === 0 || wanted.includes(x)) ?? rule.numbers[0];
  return n ? { number: n, amount: rule.amount } : null;
}

export function hitLabel(index: 1 | 2 | 3): string {
  return index === 1 ? "1st hit" : index === 2 ? "2nd hit" : "3rd hit and after";
}

/** "Collect the $14 win", "Press to $18", "Regress to $6", "Take the bet down". */
export function hitActionText(
  action: HitAction,
  ref: { number: PointNumber; amount: number } | null,
) {
  switch (action.kind) {
    case "collect":
      return ref
        ? `Collect the ${formatDollars(placePayout(ref.number, ref.amount))} win`
        : "Collect the win";
    case "press":
      return `Press to ${formatDollars(action.to)}`;
    case "regress":
      return `Regress to ${formatDollars(action.to)}`;
    case "takeDown":
      return "Take the bet down";
  }
}

function placeRuleEdge(numbers: readonly PointNumber[]): number {
  return blendedEdge(numbers.map((n) => ({ amount: 1, edge: placeEdge(n) })));
}

/** The plan as the builder's rule rows. */
export function describePlan(plan: BetPlan): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const r of plan.comeOut) {
    if (r.kind === "line") {
      rows.push({
        section: "come-out",
        when: "Every come-out",
        text: `Bet ${formatDollars(r.amount)} on the ${r.side === "pass" ? "Pass line" : "Don't pass bar"}`,
        edge: r.side === "pass" ? passEdge() : dontPassEdge(),
      });
    } else {
      rows.push({
        section: "come-out",
        when: "Every come-out",
        text: `Bet ${formatDollars(r.spec.amount)} on ${specLabel(r.spec)}`,
        edge: houseEdge(r.spec.kind, plan.rules, "number" in r.spec ? r.spec.number : undefined),
      });
    }
  }
  for (const r of plan.pointOn) {
    switch (r.kind) {
      case "odds":
        rows.push({
          section: "point",
          when: "Point is on",
          text:
            r.multiple === "max"
              ? fullOddsRule(plan.rules)
              : `Take ${r.multiple}x odds behind the line`,
          edge: 0,
        });
        break;
      case "place": {
        const each = r.numbers.length > 1 ? " each" : "";
        const skip =
          r.skipPoint && r.numbers.length > 1
            ? `. If the point is ${r.numbers.join(" or ")}, place only the other ${r.numbers.length === 2 ? "one" : "ones"}`
            : "";
        rows.push({
          section: "point",
          when: "Point is on",
          text: `Place ${listNumbers(r.numbers)} for ${formatDollars(r.amount)}${each}${skip}`,
          edge: placeRuleEdge(r.numbers),
        });
        break;
      }
      case "come":
        rows.push({
          section: "point",
          when: "Point is on",
          text: `Keep ${r.maxBets} ${r.side === "come" ? "come" : "don't come"} ${r.maxBets === 1 ? "bet" : "bets"} of ${formatDollars(r.amount)} working`,
          edge: r.side === "come" ? passEdge() : dontPassEdge(),
        });
        break;
      case "bet":
        rows.push({
          section: "point",
          when: "Point is on",
          text: `Bet ${formatDollars(r.spec.amount)} on ${specLabel(r.spec)}${isOneRollKind(r.spec.kind) ? " every roll" : ""}`,
          edge: houseEdge(r.spec.kind, plan.rules, "number" in r.spec ? r.spec.number : undefined),
        });
    }
  }
  if (plan.placeWins) {
    const ref = referencePlace(plan);
    const w = plan.placeWins;
    const edgeFor = (a: HitAction) => (a.kind === "press" && ref ? placeEdge(ref.number) : null);
    rows.push({
      section: "place-wins",
      when: hitLabel(1),
      text: hitActionText(w.first, ref),
      edge: edgeFor(w.first),
    });
    rows.push({
      section: "place-wins",
      when: hitLabel(2),
      text: hitActionText(w.second, ref),
      edge: edgeFor(w.second),
    });
    let third = hitActionText(w.thirdPlus, ref);
    if (w.takeDownAfterHits !== null) {
      third =
        w.thirdPlus.kind === "collect"
          ? `Collect. Take the bet down after ${w.takeDownAfterHits} hits`
          : `${third}. Take the bet down after ${w.takeDownAfterHits} hits`;
    }
    rows.push({
      section: "place-wins",
      when: hitLabel(3),
      text: third,
      edge: edgeFor(w.thirdPlus),
    });
  }
  if (plan.money.stopLoss !== null || plan.money.stopWin !== null) {
    const parts: string[] = [];
    if (plan.money.stopLoss !== null) parts.push(formatSignedDollars(-plan.money.stopLoss));
    if (plan.money.stopWin !== null) parts.push(formatSignedDollars(plan.money.stopWin));
    rows.push({
      section: "money",
      when: "Session",
      text:
        parts.length === 2
          ? `Stop at ${parts[0]} or ${parts[1]}, whichever comes first`
          : `Stop at ${parts[0]}`,
      edge: null,
    });
  }
  return rows;
}

function isOneRollKind(kind: BetSpec["kind"]): boolean {
  return (
    kind === "field" ||
    kind === "anySeven" ||
    kind === "anyCraps" ||
    kind === "yo" ||
    kind === "aces" ||
    kind === "aceDeuce" ||
    kind === "twelve"
  );
}

function specLabel(spec: BetSpec): string {
  switch (spec.kind) {
    case "field":
      return "the Field";
    case "hard":
      return `Hard ${spec.number}`;
    case "place":
    case "buy":
    case "lay":
      return `${capitalize(spec.kind)} ${spec.number}`;
    case "anySeven":
      return "Any seven";
    case "anyCraps":
      return "Any craps";
    case "yo":
      return "Yo (11)";
    case "aces":
      return "Aces";
    case "aceDeuce":
      return "Ace-deuce";
    case "twelve":
      return "Twelve";
    case "pass":
      return "the Pass line";
    case "dontPass":
      return "the Don't pass bar";
    case "come":
      return "Come";
    case "dontCome":
      return "Don't come";
  }
}

// ---------------------------------------------------------------------------
// Rules check (the builder's "Rules-checked for 3-4-5x craps" panel)
// ---------------------------------------------------------------------------

export interface PlanCheck {
  readonly ok: boolean;
  readonly title: string;
  readonly problems: readonly string[];
}

/** Checks every amount in the plan against the table: minimums, odds limits and exact payouts. */
export function checkPlan(plan: BetPlan): PlanCheck {
  const { rules } = plan;
  const problems: string[] = [];
  const minFlat = (amount: number, what: string) => {
    if (amount < rules.minBet)
      problems.push(`${what} is below the ${formatDollars(rules.minBet)} minimum.`);
    if (amount > rules.maxBet)
      problems.push(`${what} is above the ${formatDollars(rules.maxBet)} maximum.`);
  };
  for (const r of plan.comeOut) {
    if (r.kind === "line")
      minFlat(r.amount, r.side === "pass" ? "The pass line bet" : "The don't pass bet");
  }
  for (const r of plan.pointOn) {
    if (r.kind === "odds" && r.multiple !== "max") {
      for (const p of POINT_NUMBERS) {
        if (r.multiple > maxOddsMultiple(rules, p)) {
          problems.push(`${r.multiple}x odds is over the ${oddsLabel(rules)} limit on the ${p}.`);
          break;
        }
      }
    }
    if (r.kind === "place") {
      minFlat(r.amount, `Place ${listNumbers(r.numbers)}`);
      for (const n of r.numbers) {
        if (r.amount % exactStep("place", n) !== 0) {
          problems.push(
            `Place ${n} for ${formatDollars(r.amount)} pays ${formatDollars(placePayout(n, r.amount))}, not an exact ${ratioLabel(placeRatio(n))}. Use steps of ${formatDollars(exactStep("place", n))}.`,
          );
        }
      }
    }
    if (r.kind === "come") minFlat(r.amount, "The come bet");
  }
  const ref = referencePlace(plan);
  if (plan.placeWins && ref) {
    for (const a of [plan.placeWins.first, plan.placeWins.second, plan.placeWins.thirdPlus]) {
      if (a.kind !== "press" && a.kind !== "regress") continue;
      const numbers = plan.placeWins.numbers.length ? plan.placeWins.numbers : [ref.number];
      for (const n of numbers) {
        if (a.to % exactStep("place", n) !== 0) {
          problems.push(
            `${a.kind === "press" ? "Pressing" : "Regressing"} to ${formatDollars(a.to)} breaks the ${ratioLabel(placeRatio(n))} payout on the ${n}. Use steps of ${formatDollars(exactStep("place", n))}.`,
          );
        }
      }
    }
  }
  const unique = [...new Set(problems)];
  return {
    ok: unique.length === 0,
    title:
      unique.length === 0 ? `Rules-checked for ${oddsLabel(rules)} craps` : "Check these amounts",
    problems: unique,
  };
}

/**
 * The note under a press: "$18 pays $21 on the next hit. Pressing uses $6 of the $14 win and
 * pockets $8."
 */
export function pressNote(n: PointNumber, from: number, to: number): string {
  const win = placePayout(n, from);
  const next = placePayout(n, to);
  if (to <= from) {
    const back = from - to;
    return `${formatDollars(to)} pays ${formatDollars(next)} on the next hit. Regressing pockets the ${formatDollars(win)} win plus ${formatDollars(back)} of the bet.`;
  }
  const uses = to - from;
  const pocket = win - uses;
  return pocket >= 0
    ? `${formatDollars(to)} pays ${formatDollars(next)} on the next hit. Pressing uses ${formatDollars(uses)} of the ${formatDollars(win)} win and pockets ${formatDollars(pocket)}.`
    : `${formatDollars(to)} pays ${formatDollars(next)} on the next hit. Pressing uses the whole ${formatDollars(win)} win plus ${formatDollars(-pocket)} from your rack.`;
}

// ---------------------------------------------------------------------------
// Running a plan against a table
// ---------------------------------------------------------------------------

export type StopReason = "stop-loss" | "stop-win" | "bankroll";

/** What the runner remembers between rolls. Plain data, so it can live in a store. */
export interface PlanMemory {
  /** Wins so far on each place number since it went up. */
  readonly hits: Readonly<Partial<Record<PointNumber, number>>>;
  /** The point the place rule was last applied for (so it runs once per point). */
  readonly placedFor: PointNumber | null;
  /** Numbers taken down by the hit rules; not re-placed until the next shooter. */
  readonly retired: readonly PointNumber[];
  readonly stopped: StopReason | null;
}

export const EMPTY_MEMORY: PlanMemory = { hits: {}, placedFor: null, retired: [], stopped: null };

function oddsTarget(multiple: OddsTarget, rules: CrapsRules, bet: Bet, point: PointNumber): number {
  const dark = bet.kind === "dontPass" || bet.kind === "dontCome";
  if (multiple === "max") {
    return dark ? maxLayOdds(rules, point, bet.amount) : maxOdds(rules, point, bet.amount);
  }
  const m = Math.min(multiple, maxOddsMultiple(rules, point));
  if (!dark) return bet.amount * m;
  const r = layRatio(point);
  return Math.floor((bet.amount * m * r.per) / r.wins);
}

/** Rounds odds down to the exact-payout step where that keeps them positive. */
function exactOdds(amount: number, point: PointNumber, dark: boolean): number {
  const step = exactStep(dark ? "layOdds" : "odds", point);
  const rounded = Math.floor(amount / step) * step;
  return rounded > 0 ? rounded : amount;
}

/**
 * The actions a plan takes before the next roll. Pure: it reads the table and memory and
 * proposes actions; the caller applies them (and may refuse any it cannot afford).
 */
export function planActions(
  plan: BetPlan,
  table: CrapsTable,
  owner: string,
  memory: PlanMemory,
): TableAction[] {
  const mine = table.bets.filter((b) => b.owner === owner);
  if (memory.stopped) {
    return mine
      .filter((b) => canTakeDown(table, b))
      .map((b) => ({ type: "takeDown", betId: b.id }));
  }
  const actions: TableAction[] = [];
  const has = (pred: (b: Bet) => boolean) => mine.some(pred);

  if (table.point === null) {
    for (const r of plan.comeOut) {
      if (r.kind === "line") {
        if (!has((b) => b.kind === r.side)) {
          actions.push({ type: "bet", spec: { kind: r.side, amount: r.amount, owner } });
        }
      } else if (!has((b) => sameKindAndNumber(b, r.spec))) {
        actions.push({ type: "bet", spec: { ...r.spec, owner } });
      }
    }
    return actions;
  }

  const point = table.point;
  for (const r of plan.pointOn) {
    switch (r.kind) {
      case "odds":
        for (const b of mine) {
          const p = isLineBet(b) ? point : isComeBet(b) ? b.point : null;
          if (p === null || !(isLineBet(b) || isComeBet(b))) continue;
          const dark = b.kind === "dontPass" || b.kind === "dontCome";
          const target = exactOdds(oddsTarget(r.multiple, plan.rules, b, p), p, dark);
          if (b.odds < target) actions.push({ type: "odds", betId: b.id, amount: target });
        }
        break;
      case "place": {
        if (memory.placedFor === point) break;
        const wanted = r.numbers.filter(
          (n) => !(r.skipPoint && n === point) && !memory.retired.includes(n),
        );
        for (const n of wanted) {
          if (!has((b) => b.kind === "place" && isBoxBet(b) && b.number === n)) {
            actions.push({
              type: "bet",
              spec: { kind: "place", number: n, amount: r.amount, owner },
            });
          }
        }
        if (r.skipPoint) {
          for (const b of mine) {
            if (
              b.kind === "place" &&
              isBoxBet(b) &&
              b.number === point &&
              r.numbers.includes(point)
            ) {
              actions.push({ type: "takeDown", betId: b.id });
            }
          }
        }
        break;
      }
      case "come": {
        const count = mine.filter((b) => b.kind === r.side).length;
        if (count < r.maxBets) {
          actions.push({ type: "bet", spec: { kind: r.side, amount: r.amount, owner } });
        }
        break;
      }
      case "bet":
        if (!has((b) => sameKindAndNumber(b, r.spec))) {
          actions.push({ type: "bet", spec: { ...r.spec, owner } });
        }
    }
  }
  return actions;
}

function sameKindAndNumber(b: Bet, spec: BetSpec): boolean {
  if (b.kind !== spec.kind) return false;
  if ("number" in spec && "number" in b) return b.number === spec.number;
  return true;
}

/** Updates memory for the bets a plan just placed (the place rule runs once per point). */
export function notePlaced(plan: BetPlan, table: CrapsTable, memory: PlanMemory): PlanMemory {
  if (table.point === null) return memory;
  if (!plan.pointOn.some((r) => r.kind === "place")) return memory;
  return { ...memory, placedFor: table.point };
}

/** The hit action for the `hit`-th win (1-based). */
export function hitActionFor(rule: PlaceWinRule, hit: number): HitAction {
  if (rule.takeDownAfterHits !== null && hit >= rule.takeDownAfterHits) return { kind: "takeDown" };
  return hit === 1 ? rule.first : hit === 2 ? rule.second : rule.thirdPlus;
}

/**
 * After a roll: counts place-bet hits, and returns the press / regress / take-down actions the
 * plan calls for, plus the updated memory. A seven-out clears hit counts and retired numbers.
 */
export function planAfterRoll(
  plan: BetPlan,
  outcome: RollOutcome,
  owner: string,
  memory: PlanMemory,
): { actions: TableAction[]; memory: PlanMemory } {
  const hits: Partial<Record<PointNumber, number>> = { ...memory.hits };
  let retired = [...memory.retired];
  const actions: TableAction[] = [];
  const rule = plan.placeWins;

  for (const r of outcome.resolutions) {
    if (r.bet.owner !== owner || !isBoxBet(r.bet) || r.bet.kind === "lay") continue;
    const n = r.bet.number;
    if (r.outcome === "lose") delete hits[n];
    if (r.outcome !== "win") continue;
    const count = (hits[n] ?? 0) + 1;
    hits[n] = count;
    if (!rule || (rule.numbers.length > 0 && !rule.numbers.includes(n))) continue;
    const action = hitActionFor(rule, count);
    const current = r.bet.amount;
    if (action.kind === "press" && action.to > current) {
      actions.push({ type: "amount", betId: r.bet.id, amount: action.to });
    } else if (action.kind === "regress" && action.to < current) {
      actions.push({ type: "amount", betId: r.bet.id, amount: action.to });
    } else if (action.kind === "takeDown") {
      actions.push({ type: "takeDown", betId: r.bet.id });
      delete hits[n];
      retired.push(n);
    }
  }

  let placedFor = memory.placedFor;
  if (outcome.record.event === "seven-out") {
    retired = [];
    placedFor = null;
    for (const k of Object.keys(hits)) delete hits[Number(k) as PointNumber];
  }
  if (outcome.record.event === "point-made") placedFor = null;
  return { actions, memory: { ...memory, hits, retired, placedFor } };
}

// ---------------------------------------------------------------------------
// Preview: the builder's "Point is 6, after 2 hits" layout and its three stat cards
// ---------------------------------------------------------------------------

export interface WorstRoll {
  /** Net result of the worst roll (negative). */
  readonly net: number;
  readonly total: number;
  readonly hard: boolean;
  /** "A seven ends it all". */
  readonly note: string;
}

export interface PlanPreview {
  readonly table: CrapsTable;
  readonly bets: readonly Bet[];
  /** Total at risk: "$78". */
  readonly onTable: number;
  /** "Pass $10 · odds $50 · place 8 $18". */
  readonly breakdown: string;
  readonly worst: WorstRoll;
  /** Money-weighted edge of this layout. */
  readonly edge: number;
}

/** Builds the layout the plan would have with `point` on after `hits` place-bet wins. */
export function previewPlan(
  plan: BetPlan,
  point: PointNumber,
  hits = 0,
  owner: string = YOU,
): PlanPreview {
  let table = createTable(plan.rules);
  let memory = EMPTY_MEMORY;
  const apply = (actions: readonly TableAction[]) => {
    for (const a of actions) {
      const res = applyAction(table, a);
      if (res.ok) table = res.table;
    }
  };
  apply(planActions(plan, table, owner, memory));
  table = { ...table, point };
  apply(planActions(plan, table, owner, memory));
  memory = notePlaced(plan, table, memory);

  for (let h = 0; h < hits; h++) {
    // Each hit: the plan's place bets win once (as if their number rolled), and the hit rules run.
    const places = table.bets.filter((b) => b.owner === owner && isBoxBet(b) && b.kind !== "lay");
    if (places.length === 0) break;
    const fake: RollOutcome = {
      table,
      record: {
        index: h,
        dice: { d1: 1, d2: 1 },
        total: 0,
        hard: false,
        pointBefore: point,
        pointAfter: point,
        event: "roll",
        shooter: 1,
        shooterRoll: h + 1,
      },
      resolutions: places.map(
        (b): BetResolution => ({
          bet: b,
          outcome: "win",
          won: 0,
          wonFlat: 0,
          wonOdds: 0,
          lost: 0,
          returned: 0,
          commission: 0,
          remains: b,
        }),
      ),
    };
    const after = planAfterRoll(plan, fake, owner, memory);
    memory = after.memory;
    apply(after.actions);
  }

  const bets = table.bets.filter((b) => b.owner === owner);
  return {
    table,
    bets,
    onTable: onTable(table, owner),
    breakdown: layoutBreakdown(bets),
    worst: worstSingleRoll(table, owner),
    edge: blendedEdge(edgeItems(bets, plan.rules)),
  };
}

/** "Pass $10 · odds $50 · place 8 $18". */
export function layoutBreakdown(bets: readonly Bet[]): string {
  const parts: string[] = [];
  for (const b of bets) {
    const name =
      b.kind === "pass"
        ? "pass"
        : b.kind === "dontPass"
          ? "don't pass"
          : isComeBet(b)
            ? `${b.kind === "come" ? "come" : "don't come"}${b.point ? ` ${b.point}` : ""}`
            : "number" in b
              ? `${b.kind} ${b.number}`
              : specLabel({ kind: b.kind, amount: b.amount } as BetSpec)
                  .replace(/^the /, "")
                  .toLowerCase();
    parts.push(`${name} ${formatDollars(b.amount)}`);
    if ((isLineBet(b) || isComeBet(b)) && b.odds > 0) {
      parts.push(
        `${b.kind === "dontPass" || b.kind === "dontCome" ? "lay odds" : "odds"} ${formatDollars(b.odds)}`,
      );
    }
  }
  return capitalize(parts.join(" · "));
}

/**
 * The single roll that costs the most, given the bets on the layout. Every distinct roll
 * (total, and hard or easy where it matters) is settled; the most negative net wins.
 */
export function worstSingleRoll(table: CrapsTable, owner: string = YOU): WorstRoll {
  const mine = table.bets.filter((b) => b.owner === owner);
  let worst: { net: number; dice: Dice } | null = null;
  const seen = new Set<string>();
  for (const d of allDice()) {
    const key = `${diceTotal(d)}${isHard(d) ? "h" : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const net = mine.reduce((s, b) => s + netOf(resolveBet(b, d, table.point, table.rules)), 0);
    if (!worst || net < worst.net) worst = { net, dice: d };
  }
  const w = worst ?? { net: 0, dice: { d1: 1, d2: 1 } as Dice };
  const total = diceTotal(w.dice);
  const atRisk = onTable(table, owner);
  const note =
    w.net >= 0
      ? "No single roll loses money"
      : total === 7 && -w.net >= atRisk
        ? "A seven ends it all"
        : `A ${total}${isHard(w.dice) ? " the hard way" : ""} costs the most`;
  return { net: Math.min(0, w.net), total, hard: isHard(w.dice), note };
}

/**
 * The plan's blended house edge — the builder's "≈ 0.6% · Engine estimate on money bet".
 * The layout the plan holds with the point on is averaged over every point, weighted by how
 * often each point is set (4/10: 3 ways, 5/9: 4, 6/8: 5), so rules like "place only the
 * other one" are priced in.
 */
export function planBlendedEdge(plan: BetPlan): number {
  let money = 0;
  let cost = 0;
  for (const p of POINT_NUMBERS) {
    const w = waysToRoll(p);
    const preview = previewPlan(plan, p, 0);
    for (const item of edgeItems(preview.bets, plan.rules)) {
      money += w * item.amount;
      cost += w * item.amount * item.edge;
    }
  }
  return money === 0 ? 0 : cost / money;
}

/** "≈ 0.6%". */
export function formatApproxEdge(edge: number): string {
  return `≈ ${(Math.round(edge * 1000) / 10).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Simulation: "Play 10 shooters with it"
// ---------------------------------------------------------------------------

export interface ShooterResult {
  /** 1-based shooter number. */
  readonly shooter: number;
  readonly rolls: number;
  readonly pointsMade: number;
  /** Bankroll change over this shooter's hand. */
  readonly net: number;
}

export interface SimulationResult {
  readonly seed: number;
  readonly shooters: readonly ShooterResult[];
  readonly rolls: readonly RollRecord[];
  readonly startBankroll: number;
  readonly endBankroll: number;
  readonly net: number;
  /** Every dollar put on the layout (flats, odds, presses). */
  readonly wagered: number;
  /** Lowest bankroll seen, relative to the start (≤ 0). */
  readonly maxDrawdown: number;
  readonly stoppedBy: StopReason | null;
}

export interface SimulationOptions {
  readonly seed: number;
  readonly shooters?: number;
  readonly bankroll?: number;
  /** Safety cap on rolls (a very hot shooter can roll for a long time). */
  readonly maxRolls?: number;
  readonly owner?: string;
}

/**
 * Plays the plan for N shooters with seeded dice. Same seed, same plan → same result, roll for
 * roll. Money rules are checked on every come-out: once triggered, everything that can come
 * down comes down and the session ends.
 */
export function simulatePlan(plan: BetPlan, options: SimulationOptions): SimulationResult {
  const shooters = options.shooters ?? 10;
  const start = options.bankroll ?? 1000;
  const maxRolls = options.maxRolls ?? 5000;
  const owner = options.owner ?? YOU;
  const rng = createRng(options.seed);

  let table = createTable(plan.rules);
  let memory = EMPTY_MEMORY;
  let bankroll = start;
  let wagered = 0;
  let low = start;
  let stoppedBy: StopReason | null = null;
  const results: ShooterResult[] = [];
  let shooterStart = start;
  let pointsMade = 0;

  const run = (actions: readonly TableAction[]) => {
    for (const a of actions) {
      const res = applyAction(table, a);
      if (!res.ok) continue;
      if (res.cash < 0 && bankroll + res.cash < 0) continue; // cannot afford it
      table = res.table;
      bankroll += res.cash;
      if (res.cash < 0) wagered -= res.cash;
    }
  };

  const log: RollRecord[] = [];
  while (table.rollCount < maxRolls) {
    if (table.point === null) {
      const net = bankroll + onTable(table, owner) - start;
      if (plan.money.stopLoss !== null && net <= -plan.money.stopLoss) stoppedBy = "stop-loss";
      else if (plan.money.stopWin !== null && net >= plan.money.stopWin) stoppedBy = "stop-win";
      if (stoppedBy) {
        memory = { ...memory, stopped: stoppedBy };
        run(planActions(plan, table, owner, memory));
        break;
      }
    }
    run(planActions(plan, table, owner, memory));
    memory = notePlaced(plan, table, memory);
    const idle = table.bets.every((b) => b.owner !== owner);
    if (idle && table.point === null && bankroll < plan.rules.minBet) {
      stoppedBy = "bankroll";
      break;
    }

    const outcome = roll(table, rollDice(rng));
    // Keep the log here rather than on the table: copying a growing history every roll
    // would make long simulations quadratic.
    table = { ...outcome.table, history: [] };
    log.push(outcome.record);
    for (const r of outcome.resolutions) bankroll += creditOf(r);
    if (outcome.record.event === "point-made") pointsMade++;

    const after = planAfterRoll(plan, outcome, owner, memory);
    memory = after.memory;
    run(after.actions);
    low = Math.min(low, bankroll + onTable(table, owner));

    if (outcome.record.event === "seven-out") {
      const value = bankroll + onTable(table, owner);
      results.push({
        shooter: outcome.record.shooter,
        rolls: outcome.record.shooterRoll,
        pointsMade,
        net: value - shooterStart,
      });
      shooterStart = value;
      pointsMade = 0;
      if (results.length >= shooters) break;
    }
  }

  // Whatever is still on the layout goes back to the rack at the end of the session.
  for (const b of table.bets.filter((x) => x.owner === owner)) {
    bankroll += b.amount + (isLineBet(b) || isComeBet(b) ? b.odds : 0);
  }
  return {
    seed: options.seed,
    shooters: results,
    rolls: log,
    startBankroll: start,
    endBankroll: bankroll,
    net: bankroll - start,
    wagered,
    maxDrawdown: Math.min(0, low - start),
    stoppedBy,
  };
}

// ---------------------------------------------------------------------------
// Ready-made plans (the design's examples, and the live table's bot styles)
// ---------------------------------------------------------------------------

/** A place bet of `amount` on every number in steps of the right unit ($10 → $12 on 6/8). */
export function placeAmountFor(n: PointNumber, base: number): number {
  const step = exactStep("place", n);
  return Math.max(step, Math.ceil(base / step) * step);
}

const COLLECT: HitAction = { kind: "collect" };

/** Design 10b: "Pass, Odds & Press the 6/8". */
export function pressTheSixEightPlan(rules: CrapsRules): BetPlan {
  return {
    name: "Pass, Odds & Press the 6/8",
    rules,
    comeOut: [{ kind: "line", side: "pass", amount: 10 }],
    pointOn: [
      { kind: "odds", multiple: "max" },
      { kind: "place", numbers: [6, 8], amount: 12, skipPoint: true },
    ],
    placeWins: {
      numbers: [6, 8],
      first: COLLECT,
      second: { kind: "press", to: 18 },
      thirdPlus: COLLECT,
      takeDownAfterHits: 4,
    },
    money: { stopLoss: 200, stopWin: 150 },
  };
}

/** The original it was forked from: "Low-Edge Place 6 & 8". */
export function lowEdgePlaceSixEightPlan(rules: CrapsRules): BetPlan {
  return {
    ...pressTheSixEightPlan(rules),
    name: "Low-Edge Place 6 & 8",
    placeWins: {
      numbers: [6, 8],
      first: COLLECT,
      second: COLLECT,
      thirdPlus: COLLECT,
      takeDownAfterHits: null,
    },
  };
}

export function passAndOddsPlan(rules: CrapsRules, amount = 10, odds: OddsTarget = "max"): BetPlan {
  return {
    name: odds === "max" ? "Pass + odds" : `Pass + ${odds}x odds`,
    rules,
    comeOut: [{ kind: "line", side: "pass", amount }],
    pointOn: [{ kind: "odds", multiple: odds }],
    placeWins: null,
    money: { stopLoss: null, stopWin: null },
  };
}

export function dontPassPlan(rules: CrapsRules, amount = 10, layOdds: OddsTarget | 0 = 0): BetPlan {
  return {
    name: "Don't pass",
    rules,
    comeOut: [{ kind: "line", side: "dontPass", amount }],
    pointOn: layOdds === 0 ? [] : [{ kind: "odds", multiple: layOdds }],
    placeWins: null,
    money: { stopLoss: null, stopWin: null },
  };
}

/** Iron Cross: field every roll plus place 5, 6 and 8 — a win on every number but 7. */
export function ironCrossPlan(rules: CrapsRules, unit = 10): BetPlan {
  return {
    name: "Iron Cross",
    rules,
    comeOut: [],
    pointOn: [
      { kind: "place", numbers: [5], amount: placeAmountFor(5, unit), skipPoint: false },
      { kind: "place", numbers: [6, 8], amount: placeAmountFor(6, unit), skipPoint: false },
      { kind: "bet", spec: { kind: "field", amount: unit } },
    ],
    placeWins: null,
    money: { stopLoss: null, stopWin: null },
  };
}

/** Lobby: "My trip plan: Pass + 2 Come". */
export function passTwoComePlan(rules: CrapsRules, amount = 10): BetPlan {
  return {
    name: "Pass + 2 Come",
    rules,
    comeOut: [{ kind: "line", side: "pass", amount }],
    pointOn: [
      { kind: "odds", multiple: "max" },
      { kind: "come", side: "come", amount, maxBets: 2 },
    ],
    placeWins: null,
    money: { stopLoss: null, stopWin: null },
  };
}

export function comeAndFieldPlan(rules: CrapsRules, amount = 10, field = 5): BetPlan {
  return {
    name: "Come + field",
    rules,
    comeOut: [{ kind: "line", side: "pass", amount }],
    pointOn: [
      { kind: "come", side: "come", amount, maxBets: 1 },
      { kind: "bet", spec: { kind: "field", amount: field } },
    ],
    placeWins: null,
    money: { stopLoss: null, stopWin: null },
  };
}
