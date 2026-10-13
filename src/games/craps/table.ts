/**
 * The craps table — a pure state machine.
 *
 * Phases: the **come-out** (no point) and **point on**. A come-out 7 or 11 is a natural, 2/3/12
 * is craps, and any box number becomes the point. With the point on, rolling it is "point
 * made" and a seven is "seven out": the dice pass to the next shooter.
 *
 * Every transition returns a new `CrapsTable`; nothing is mutated and the only randomness is
 * the `Dice` handed to `roll` (ADR-0002, ADR-0004). Money is not tracked here: each operation
 * reports the cash it takes from or returns to its owner, so one table can carry the bets of
 * many players (the simulated live table) and the caller owns the bankrolls.
 */

import type { Rng } from "../../engine/rng";
import {
  type Bet,
  type BetSpec,
  type BoxBet,
  type ComeBet,
  type HardBet,
  type LineBet,
  type OneRollBet,
  YOU,
  betName,
  buyCommission,
  fieldMultiple,
  hardPayout,
  isBoxBet,
  isComeBet,
  isHardBet,
  isLineBet,
  layCommission,
  layOddsPayout,
  maxLayOdds,
  maxOdds,
  oddsPayout,
  oneRollRatio,
  payAt,
  placePayout,
  specProblem,
  upfrontCommission,
} from "./bets";
import { type Dice, type PointNumber, diceTotal, isHard, isPointNumber, rollDice } from "./dice";
import { formatDollars } from "./money";
import { type CrapsRules, DEFAULT_CRAPS_RULES } from "./rules";

export type CrapsPhase = "come-out" | "point";

/** What a roll did to the game, as the stickman would call it. */
export type RollEvent =
  | "natural" // come-out 7 or 11
  | "craps" // come-out 2, 3 or 12
  | "point-set" // come-out box number
  | "point-made" // the point, before a seven
  | "seven-out" // a seven with the point on
  | "roll"; // anything else with the point on

export interface RollRecord {
  /** 0-based index of the roll at this table. */
  readonly index: number;
  readonly dice: Dice;
  readonly total: number;
  /** A pair on 4, 6, 8 or 10. */
  readonly hard: boolean;
  readonly pointBefore: PointNumber | null;
  readonly pointAfter: PointNumber | null;
  readonly event: RollEvent;
  /** 1-based shooter number (increments after each seven-out). */
  readonly shooter: number;
  /** 1-based roll number within this shooter's hand. */
  readonly shooterRoll: number;
}

export interface ShooterState {
  /** 1-based count of shooters at this table. */
  readonly number: number;
  /** Rolls this shooter has made so far. */
  readonly rolls: number;
}

export interface CrapsTable {
  readonly rules: CrapsRules;
  readonly point: PointNumber | null;
  readonly bets: readonly Bet[];
  /**
   * Rolls so far, oldest first. Long-running callers (simulations, the live table) may trim
   * this; `rollCount` keeps counting regardless.
   */
  readonly history: readonly RollRecord[];
  /** Total rolls made at this table. */
  readonly rollCount: number;
  readonly shooter: ShooterState;
  /** Monotonic counter behind bet ids, so ids are deterministic. */
  readonly nextBetId: number;
}

export function createTable(rules: CrapsRules = DEFAULT_CRAPS_RULES): CrapsTable {
  return {
    rules,
    point: null,
    bets: [],
    history: [],
    rollCount: 0,
    shooter: { number: 1, rolls: 0 },
    nextBetId: 1,
  };
}

export function phaseOf(table: { readonly point: PointNumber | null }): CrapsPhase {
  return table.point === null ? "come-out" : "point";
}

// ---------------------------------------------------------------------------
// Working / off
// ---------------------------------------------------------------------------

/**
 * Whether a bet (for line and come bets: its *odds*) is working on the next roll.
 *
 * Defaults, overridable per bet with `working`:
 * - place and buy bets are off on the come-out; lay bets always work;
 * - hardways are off on the come-out unless the table says otherwise;
 * - come-bet odds are off on the come-out; don't-come lay odds always work;
 * - line flats, come flats and one-roll bets always work (and cannot be turned off,
 *   except one-roll bets, which may be called off).
 */
export function isWorking(bet: Bet, point: PointNumber | null, rules: CrapsRules): boolean {
  const comeOut = point === null;
  if (bet.working !== undefined && !isLineBet(bet)) return bet.working;
  switch (bet.kind) {
    case "place":
    case "buy":
      return !comeOut;
    case "lay":
      return true;
    case "hard":
      return !comeOut || rules.hardwaysWorkOnComeOut;
    case "come":
      return !comeOut;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export type Outcome =
  | "win"
  | "lose"
  | "push" // no decision but money handed back (bar 12, odds returned when off)
  | "travel" // a come / don't come bet moved to its number
  | "stay" // no decision this roll
  | "off"; // the bet was not working

export interface BetResolution {
  /** The bet as it stood before the roll. */
  readonly bet: Bet;
  readonly outcome: Outcome;
  /** Profit paid, net of any commission. */
  readonly won: number;
  /** Of `won`, the part paid on the flat bet. */
  readonly wonFlat: number;
  /** Of `won`, the part paid on odds (free odds or lay odds). */
  readonly wonOdds: number;
  /** Stake lost to the house. */
  readonly lost: number;
  /** Stake handed back to the player (the bet, or part of it, came down). */
  readonly returned: number;
  /** Commission taken from the win this roll. */
  readonly commission: number;
  /** The bet left on the layout after the roll, or null if it came down. */
  readonly remains: Bet | null;
}

/** Chips handed to the player: returned stake plus winnings. */
export function creditOf(r: BetResolution): number {
  return r.returned + r.won;
}

/** Net result of the roll for the player: winnings minus stake lost. */
export function netOf(r: BetResolution): number {
  return r.won - r.lost;
}

interface RollContext {
  readonly total: number;
  readonly hard: boolean;
  readonly point: PointNumber | null;
  readonly rules: CrapsRules;
}

const result = (
  bet: Bet,
  outcome: Outcome,
  fields: Partial<Omit<BetResolution, "bet" | "outcome">>,
): BetResolution => {
  const wonFlat = fields.wonFlat ?? 0;
  const wonOdds = fields.wonOdds ?? 0;
  const commission = fields.commission ?? 0;
  return {
    bet,
    outcome,
    wonFlat,
    wonOdds,
    won: wonFlat + wonOdds - commission,
    lost: fields.lost ?? 0,
    returned: fields.returned ?? 0,
    commission,
    remains: fields.remains === undefined ? bet : fields.remains,
  };
};

/** Settles one bet against one roll. Pure; exported for the tests and the plan evaluator. */
export function resolveBet(
  bet: Bet,
  roll: Dice,
  point: PointNumber | null,
  rules: CrapsRules,
): BetResolution {
  const ctx: RollContext = { total: diceTotal(roll), hard: isHard(roll), point, rules };
  if (isLineBet(bet)) return resolveLine(bet, ctx);
  if (isComeBet(bet)) return resolveCome(bet, ctx);
  if (isBoxBet(bet)) return resolveBox(bet, ctx);
  if (isHardBet(bet)) return resolveHard(bet, ctx);
  return resolveOneRoll(bet as OneRollBet, ctx);
}

function resolveLine(bet: LineBet, { total, point }: RollContext): BetResolution {
  const pass = bet.kind === "pass";
  if (point === null) {
    // Come-out roll. Any odds on a line bet without a point are simply returned.
    if (total === 7 || total === 11) {
      return pass
        ? result(bet, "win", { wonFlat: bet.amount, returned: bet.odds, remains: noOdds(bet) })
        : result(bet, "lose", { lost: bet.amount, returned: bet.odds, remains: null });
    }
    if (total === 2 || total === 3) {
      return pass
        ? result(bet, "lose", { lost: bet.amount, returned: bet.odds, remains: null })
        : result(bet, "win", { wonFlat: bet.amount, returned: bet.odds, remains: noOdds(bet) });
    }
    if (total === 12) {
      // Bar 12: the don't side pushes.
      return pass
        ? result(bet, "lose", { lost: bet.amount, returned: bet.odds, remains: null })
        : result(bet, "push", {});
    }
    return result(bet, "stay", {});
  }
  if (total === point) {
    return pass
      ? result(bet, "win", {
          wonFlat: bet.amount,
          wonOdds: oddsPayout(point, bet.odds),
          returned: bet.odds,
          remains: noOdds(bet),
        })
      : result(bet, "lose", { lost: bet.amount + bet.odds, remains: null });
  }
  if (total === 7) {
    return pass
      ? result(bet, "lose", { lost: bet.amount + bet.odds, remains: null })
      : result(bet, "win", {
          wonFlat: bet.amount,
          wonOdds: layOddsPayout(point, bet.odds),
          returned: bet.odds,
          remains: noOdds(bet),
        });
  }
  return result(bet, "stay", {});
}

function noOdds(bet: LineBet): LineBet {
  return { ...bet, odds: 0 };
}

function resolveCome(bet: ComeBet, ctx: RollContext): BetResolution {
  const { total } = ctx;
  const come = bet.kind === "come";
  if (bet.point === null) {
    // The come bet's own come-out roll.
    if (total === 7 || total === 11) {
      return come
        ? result(bet, "win", { wonFlat: bet.amount, returned: bet.amount, remains: null })
        : result(bet, "lose", { lost: bet.amount, remains: null });
    }
    if (total === 2 || total === 3) {
      return come
        ? result(bet, "lose", { lost: bet.amount, remains: null })
        : result(bet, "win", { wonFlat: bet.amount, returned: bet.amount, remains: null });
    }
    if (total === 12) {
      return come
        ? result(bet, "lose", { lost: bet.amount, remains: null })
        : result(bet, "push", {});
    }
    // A box number: the bet travels there.
    return result(bet, "travel", { remains: { ...bet, point: total as PointNumber } });
  }

  const cp = bet.point;
  const oddsWork = isWorking(bet, ctx.point, ctx.rules) || !come;
  if (total === cp) {
    if (!come) return result(bet, "lose", { lost: bet.amount + bet.odds, remains: null });
    return result(bet, "win", {
      wonFlat: bet.amount,
      wonOdds: oddsWork ? oddsPayout(cp, bet.odds) : 0,
      returned: bet.amount + bet.odds,
      remains: null,
    });
  }
  if (total === 7) {
    if (come) {
      return oddsWork
        ? result(bet, "lose", { lost: bet.amount + bet.odds, remains: null })
        : result(bet, "lose", { lost: bet.amount, returned: bet.odds, remains: null });
    }
    return result(bet, "win", {
      wonFlat: bet.amount,
      wonOdds: layOddsPayout(cp, bet.odds),
      returned: bet.amount + bet.odds,
      remains: null,
    });
  }
  return result(bet, "stay", {});
}

function resolveBox(bet: BoxBet, ctx: RollContext): BetResolution {
  const { total, rules } = ctx;
  if (total !== 7 && total !== bet.number) return result(bet, "stay", {});
  if (!isWorking(bet, ctx.point, rules)) return result(bet, "off", {});

  if (bet.kind === "lay") {
    if (total === bet.number) return result(bet, "lose", { lost: bet.amount, remains: null });
    // Commission on the win: either collected now, or (upfront tables) the vig for the
    // bet's next decision, since it stays up.
    return result(bet, "win", {
      wonFlat: layOddsPayout(bet.number, bet.amount),
      commission: layCommission(bet.number, bet.amount, rules),
    });
  }
  if (total === 7) return result(bet, "lose", { lost: bet.amount, remains: null });
  if (bet.kind === "place") {
    return result(bet, "win", { wonFlat: placePayout(bet.number, bet.amount) });
  }
  return result(bet, "win", {
    wonFlat: oddsPayout(bet.number, bet.amount),
    commission: buyCommission(bet.amount, rules),
  });
}

function resolveHard(bet: HardBet, ctx: RollContext): BetResolution {
  const { total, hard } = ctx;
  if (total !== 7 && total !== bet.number) return result(bet, "stay", {});
  if (!isWorking(bet, ctx.point, ctx.rules)) return result(bet, "off", {});
  if (total === bet.number && hard) {
    return result(bet, "win", { wonFlat: hardPayout(bet.number, bet.amount) });
  }
  return result(bet, "lose", { lost: bet.amount, remains: null });
}

function resolveOneRoll(bet: OneRollBet, ctx: RollContext): BetResolution {
  if (bet.working === false) return result(bet, "off", {});
  const { total, rules } = ctx;
  let wins: number;
  if (bet.kind === "field") {
    const m = fieldMultiple(total, rules);
    wins = m * bet.amount;
  } else {
    const hit =
      (bet.kind === "anySeven" && total === 7) ||
      (bet.kind === "anyCraps" && (total === 2 || total === 3 || total === 12)) ||
      (bet.kind === "yo" && total === 11) ||
      (bet.kind === "aces" && total === 2) ||
      (bet.kind === "aceDeuce" && total === 3) ||
      (bet.kind === "twelve" && total === 12);
    wins = hit ? payAt(oneRollRatio(bet.kind), bet.amount) : 0;
  }
  return wins > 0
    ? result(bet, "win", { wonFlat: wins, returned: bet.amount, remains: null })
    : result(bet, "lose", { lost: bet.amount, remains: null });
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

export interface RollOutcome {
  readonly table: CrapsTable;
  readonly record: RollRecord;
  readonly resolutions: readonly BetResolution[];
}

/** What a roll does to the game, before any bet is considered. */
export function rollEvent(point: PointNumber | null, total: number): RollEvent {
  if (point === null) {
    if (total === 7 || total === 11) return "natural";
    if (total === 2 || total === 3 || total === 12) return "craps";
    return "point-set";
  }
  if (total === point) return "point-made";
  if (total === 7) return "seven-out";
  return "roll";
}

/** Rolls the given dice: settles every bet, moves the puck, passes the dice on a seven-out. */
export function roll(table: CrapsTable, d: Dice): RollOutcome {
  const total = diceTotal(d);
  const event = rollEvent(table.point, total);
  const resolutions = table.bets.map((b) => resolveBet(b, d, table.point, table.rules));

  let pointAfter: PointNumber | null = table.point;
  if (event === "point-set") pointAfter = total as PointNumber;
  if (event === "point-made" || event === "seven-out") pointAfter = null;

  const record: RollRecord = {
    index: table.rollCount,
    dice: d,
    total,
    hard: isHard(d),
    pointBefore: table.point,
    pointAfter,
    event,
    shooter: table.shooter.number,
    shooterRoll: table.shooter.rolls + 1,
  };

  const shooter: ShooterState =
    event === "seven-out"
      ? { number: table.shooter.number + 1, rolls: 0 }
      : { number: table.shooter.number, rolls: table.shooter.rolls + 1 };

  const next: CrapsTable = {
    ...table,
    point: pointAfter,
    bets: resolutions.flatMap((r) => (r.remains ? [r.remains] : [])),
    history: [...table.history, record],
    rollCount: table.rollCount + 1,
    shooter,
  };
  return { table: next, record, resolutions };
}

/** Rolls seeded dice. */
export function rollWith(table: CrapsTable, rng: Rng): RollOutcome {
  return roll(table, rollDice(rng));
}

// ---------------------------------------------------------------------------
// Making, changing and taking down bets
// ---------------------------------------------------------------------------

export type TableAction =
  | { readonly type: "bet"; readonly spec: BetSpec }
  | { readonly type: "odds"; readonly betId: string; readonly amount: number }
  | { readonly type: "amount"; readonly betId: string; readonly amount: number }
  | { readonly type: "takeDown"; readonly betId: string }
  | { readonly type: "working"; readonly betId: string; readonly working: boolean | undefined };

export type ActionResult =
  | {
      readonly ok: true;
      readonly table: CrapsTable;
      /** Cash to the player: negative is a cost (bet, odds, press), positive a refund. */
      readonly cash: number;
      /** The bet affected, as it now stands (null when taken down). */
      readonly bet: Bet | null;
    }
  | { readonly ok: false; readonly reason: string };

const fail = (reason: string): ActionResult => ({ ok: false, reason });

export function findBet(table: CrapsTable, betId: string): Bet | undefined {
  return table.bets.find((b) => b.id === betId);
}

/** The bets belonging to one player. */
export function betsOf(table: CrapsTable, owner: string = YOU): Bet[] {
  return table.bets.filter((b) => b.owner === owner);
}

/** Total at risk on the layout for one player (flats plus odds). */
export function onTable(table: CrapsTable, owner: string = YOU): number {
  return betsOf(table, owner).reduce(
    (sum, b) => sum + b.amount + (isLineBet(b) || isComeBet(b) ? b.odds : 0),
    0,
  );
}

export function applyAction(table: CrapsTable, action: TableAction): ActionResult {
  switch (action.type) {
    case "bet":
      return placeBet(table, action.spec);
    case "odds":
      return setOdds(table, action.betId, action.amount);
    case "amount":
      return setAmount(table, action.betId, action.amount);
    case "takeDown":
      return takeDown(table, action.betId);
    case "working":
      return setWorking(table, action.betId, action.working);
  }
}

/**
 * The minimum for a bet of this kind: the table minimum for line, come and box bets. Hardways,
 * the field and the center bets take any whole dollar (the design shows a $5 field at a $10 table).
 */
function minimumFor(kind: BetSpec["kind"], rules: CrapsRules): number {
  switch (kind) {
    case "hard":
    case "field":
    case "anySeven":
    case "anyCraps":
    case "yo":
    case "aces":
    case "aceDeuce":
    case "twelve":
      return 1;
    default:
      return rules.minBet;
  }
}

/** Same owner, same spot — where a new chip would simply be added to an existing bet. */
function sameSpot(a: Bet, spec: BetSpec, owner: string): boolean {
  if (a.owner !== owner || a.kind !== spec.kind) return false;
  if (isComeBet(a)) return false; // every come bet is its own contract
  if ("number" in spec && "number" in a) return a.number === spec.number;
  return true;
}

/** Makes a bet (or adds to the same bet already on that spot). */
export function placeBet(table: CrapsTable, spec: BetSpec): ActionResult {
  const problem = specProblem(spec);
  if (problem) return fail(problem);
  const { rules, point } = table;
  const owner = spec.owner ?? YOU;

  if ((spec.kind === "pass" || spec.kind === "dontPass") && point !== null) {
    return fail(
      spec.kind === "pass"
        ? "Pass line bets go down before the come-out roll."
        : "Don't pass is only made on the come-out roll.",
    );
  }
  if ((spec.kind === "come" || spec.kind === "dontCome") && point === null) {
    return fail(
      "Come bets are made once a point is on. On the come-out, bet the pass or don't pass line.",
    );
  }

  const existing = table.bets.find((b) => sameSpot(b, spec, owner));
  const amount = spec.amount + (existing?.amount ?? 0);
  const minimum = minimumFor(spec.kind, rules);
  if (amount < minimum) {
    return fail(`${betName(spec)} needs at least ${formatDollars(minimum)}.`);
  }
  if (amount > rules.maxBet) {
    return fail(`The table maximum is ${formatDollars(rules.maxBet)}.`);
  }

  let bet: Bet;
  let nextBetId = table.nextBetId;
  if (existing) {
    bet = { ...existing, amount };
  } else {
    const base = { id: `b${nextBetId++}`, owner, amount: spec.amount };
    const working = spec.working === undefined ? {} : { working: spec.working };
    switch (spec.kind) {
      case "pass":
      case "dontPass":
        bet = { ...base, ...working, kind: spec.kind, odds: 0 };
        break;
      case "come":
      case "dontCome":
        bet = { ...base, ...working, kind: spec.kind, point: null, odds: 0 };
        break;
      case "place":
      case "buy":
      case "lay":
        bet = { ...base, ...working, kind: spec.kind, number: spec.number };
        break;
      case "hard":
        bet = { ...base, ...working, kind: "hard", number: spec.number };
        break;
      default:
        bet = { ...base, ...working, kind: spec.kind };
    }
  }

  const vig = upfrontCommission(bet, rules) - (existing ? upfrontCommission(existing, rules) : 0);
  const bets = existing
    ? table.bets.map((b) => (b.id === existing.id ? bet : b))
    : [...table.bets, bet];
  return {
    ok: true,
    table: { ...table, bets, nextBetId },
    cash: -(spec.amount + Math.max(0, vig)),
    bet,
  };
}

/** The point a line or come bet's odds sit behind, if it has one yet. */
export function oddsPoint(table: CrapsTable, bet: Bet): PointNumber | null {
  if (isLineBet(bet)) return table.point;
  if (isComeBet(bet)) return bet.point;
  return null;
}

/** Most odds this line or come bet may take right now (0 if it cannot take odds yet). */
export function oddsLimit(table: CrapsTable, bet: Bet): number {
  const p = oddsPoint(table, bet);
  if (p === null) return 0;
  return bet.kind === "pass" || bet.kind === "come"
    ? maxOdds(table.rules, p, bet.amount)
    : maxLayOdds(table.rules, p, bet.amount);
}

/** Takes, changes or removes (amount 0) odds behind a line or come bet. */
export function setOdds(table: CrapsTable, betId: string, amount: number): ActionResult {
  const bet = findBet(table, betId);
  if (!bet) return fail("No such bet.");
  if (!isLineBet(bet) && !isComeBet(bet)) return fail("Only line and come bets take odds.");
  if (!Number.isInteger(amount) || amount < 0) return fail("Odds are whole dollars.");
  const p = oddsPoint(table, bet);
  if (p === null) {
    return fail(
      isLineBet(bet)
        ? "Odds go behind the line once a point is set."
        : "Odds go on a come bet once it has moved to its number.",
    );
  }
  const limit = oddsLimit(table, bet);
  if (amount > limit) {
    return fail(`Odds on the ${p} go up to ${formatDollars(limit)} here.`);
  }
  const updated: Bet = { ...bet, odds: amount };
  return {
    ok: true,
    table: { ...table, bets: table.bets.map((b) => (b.id === betId ? updated : b)) },
    cash: bet.odds - amount,
    bet: updated,
  };
}

/** Presses or regresses a bet to `amount`. Line and come flats are fixed once they have a point. */
export function setAmount(table: CrapsTable, betId: string, amount: number): ActionResult {
  const bet = findBet(table, betId);
  if (!bet) return fail("No such bet.");
  if (amount === 0) return takeDown(table, betId);
  if (!Number.isInteger(amount) || amount < 0) return fail("Bets are whole dollars.");
  if (isLineBet(bet) && table.point !== null) {
    return fail("A line bet can't be changed once the point is set. Add odds instead.");
  }
  if (isComeBet(bet) && bet.point !== null) {
    return fail("A come bet is set once it moves to its number. Add odds instead.");
  }
  const minimum = minimumFor(bet.kind, table.rules);
  if (amount < minimum) return fail(`${betName(bet)} needs at least ${formatDollars(minimum)}.`);
  if (amount > table.rules.maxBet) {
    return fail(`The table maximum is ${formatDollars(table.rules.maxBet)}.`);
  }
  const updated: Bet = { ...bet, amount };
  const vig = upfrontCommission(updated, table.rules) - upfrontCommission(bet, table.rules);
  return {
    ok: true,
    table: { ...table, bets: table.bets.map((b) => (b.id === betId ? updated : b)) },
    cash: bet.amount - amount - Math.max(0, vig),
    bet: updated,
  };
}

/** Whether a bet may come down now. Pass and come bets with a point are contract bets. */
export function canTakeDown(table: CrapsTable, bet: Bet): boolean {
  if (bet.kind === "pass") return table.point === null;
  if (bet.kind === "come") return bet.point === null;
  return true;
}

/** Takes a bet down, returning its stake (and odds). */
export function takeDown(table: CrapsTable, betId: string): ActionResult {
  const bet = findBet(table, betId);
  if (!bet) return fail("No such bet.");
  if (!canTakeDown(table, bet)) {
    return fail(
      `${betName(bet)} is a contract bet once the point is set. Its odds can come down, the bet can't.`,
    );
  }
  const refund = bet.amount + (isLineBet(bet) || isComeBet(bet) ? bet.odds : 0);
  return {
    ok: true,
    table: { ...table, bets: table.bets.filter((b) => b.id !== betId) },
    cash: refund,
    bet: null,
  };
}

/** Calls a bet working or off (undefined restores the table default). */
export function setWorking(
  table: CrapsTable,
  betId: string,
  working: boolean | undefined,
): ActionResult {
  const bet = findBet(table, betId);
  if (!bet) return fail("No such bet.");
  if (isLineBet(bet) || bet.kind === "dontCome") {
    return fail(`${betName(bet)} is always working.`);
  }
  const { working: _old, ...rest } = bet;
  const updated = (working === undefined ? rest : { ...rest, working }) as Bet;
  return {
    ok: true,
    table: { ...table, bets: table.bets.map((b) => (b.id === betId ? updated : b)) },
    cash: 0,
    bet: updated,
  };
}

/** Sums the cash each owner receives from a roll's resolutions. */
export function creditsByOwner(resolutions: readonly BetResolution[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of resolutions) {
    out[r.bet.owner] = (out[r.bet.owner] ?? 0) + creditOf(r);
  }
  return out;
}

/** Net result of a roll per owner (winnings minus losses). */
export function netByOwner(resolutions: readonly BetResolution[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of resolutions) {
    out[r.bet.owner] = (out[r.bet.owner] ?? 0) + netOf(r);
  }
  return out;
}

/** Validates that `n` is a box number — a guard for callers building specs from UI input. */
export function asPointNumber(n: number): PointNumber | null {
  return isPointNumber(n) ? n : null;
}
