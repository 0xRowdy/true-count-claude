/**
 * A simulated "live" craps table (design 11, QEqUW).
 *
 * There is no backend (ADR-0003): the other players are deterministic, seeded bots, each
 * running a bet plan (`plan.ts`) in a named style — "Pass + odds", "Don't pass", "Iron Cross",
 * "Come + field". The whole table is plain data (a seed plus a roll counter rather than a live
 * Rng), so a UI can store it, replay it, and render it identically on the server and the
 * client. Same seed, same actions → same table, roll for roll.
 */

import { createRng } from "../../engine/rng";
import { type BetSpec, YOU, isComeBet, isLineBet } from "./bets";
import { dealerLine, rollCall, rolledBy, tablePayoutCalls } from "./calls";
import { reviewBet } from "./coach";
import { type Dice, deriveSeed, rollDice } from "./dice";
import {
  type BetPlan,
  EMPTY_MEMORY,
  type OddsTarget,
  type PlanMemory,
  comeAndFieldPlan,
  dontPassPlan,
  ironCrossPlan,
  notePlaced,
  passAndOddsPlan,
  passTwoComePlan,
  planActions,
  planAfterRoll,
} from "./plan";
import { formatDollars } from "./money";
import { type CrapsRules, DOWNTOWN_RULES, tableLabel } from "./rules";
import {
  type BetResolution,
  type CrapsTable,
  type RollOutcome,
  type RollRecord,
  type TableAction,
  applyAction,
  createTable,
  creditOf,
  netByOwner,
  roll,
} from "./table";

export type BotStyle =
  | "pass-odds"
  | "pass-3x"
  | "dont-pass"
  | "iron-cross"
  | "come-field"
  | "pass-2-come";

export const STYLE_LABELS: Readonly<Record<BotStyle, string>> = {
  "pass-odds": "Pass + odds",
  "pass-3x": "Pass + 3x odds",
  "dont-pass": "Don't pass",
  "iron-cross": "Iron Cross",
  "come-field": "Come + field",
  "pass-2-come": "Pass + 2 Come",
};

/** The bet plan behind each style. */
export function planForStyle(style: BotStyle, rules: CrapsRules): BetPlan {
  switch (style) {
    case "pass-odds": {
      // The host's classic: line, full odds, and the 6 and 8 placed for $12.
      const base = passAndOddsPlan(rules, 10, "max");
      return {
        ...base,
        pointOn: [...base.pointOn, { kind: "place", numbers: [6, 8], amount: 12, skipPoint: true }],
      };
    }
    case "pass-3x":
      return passAndOddsPlan(rules, 25, 3 as OddsTarget);
    case "dont-pass":
      return dontPassPlan(rules, 10, 2);
    case "iron-cross":
      return ironCrossPlan(rules, 10);
    case "come-field":
      return comeAndFieldPlan(rules, 10, 5);
    case "pass-2-come":
      return passTwoComePlan(rules, 10);
  }
}

export interface SeatStats {
  /** Betting decisions graded by the coach. */
  readonly decisions: number;
  readonly correct: number;
  /** Most rolls in one turn with the dice. */
  readonly longestRoll: number;
}

export interface BotProfile {
  readonly id: string;
  readonly handle: string;
  /** Short name used in payout calls: "Rita". */
  readonly name: string;
  readonly initials: string;
  readonly style: BotStyle;
  readonly bankroll: number;
  /** Probability each decision is the low-edge one (drives the accuracy leaderboard). */
  readonly accuracy: number;
  readonly host?: boolean;
  readonly stats?: SeatStats;
}

export interface LiveSeat {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly initials: string;
  /** Null for the human player. */
  readonly style: BotStyle | null;
  readonly styleLabel: string;
  readonly host: boolean;
  readonly isYou: boolean;
  readonly accuracy: number;
  readonly bankroll: number;
  readonly stats: SeatStats;
  readonly memory: PlanMemory;
}

export type ChatKind = "system" | "dealer" | "player";

export interface ChatLine {
  readonly id: number;
  readonly kind: ChatKind;
  /** The speaking seat, for player lines. */
  readonly seatId: string | null;
  readonly text: string;
}

export interface LiveRoll {
  readonly record: RollRecord;
  readonly resolutions: readonly BetResolution[];
  /** "Six, easy six. Point is still 8." */
  readonly call: string;
  /** "@dicecontrol_dee rolled 4 · 2 · Place 6 pays: Rita +$14, Mike +$14". */
  readonly summary: string;
  readonly payoutCalls: readonly string[];
  /** Net result of the roll per seat id. */
  readonly netBySeat: Readonly<Record<string, number>>;
}

export interface LiveTableState {
  readonly name: string;
  readonly seed: number;
  readonly rollIndex: number;
  readonly table: CrapsTable;
  readonly seats: readonly LiveSeat[];
  /** Index into `seats` of the player holding the dice. */
  readonly shooterIndex: number;
  readonly capacity: number;
  readonly chat: readonly ChatLine[];
  readonly nextChatId: number;
  readonly last: LiveRoll | null;
}

/** How long the UI keeps the betting window open between rolls. */
export const BET_WINDOW_SECONDS = 15;
export const LIVE_TABLE_CAPACITY = 8;
export const QUICK_REPLIES: readonly string[] = ["Nice roll!", "Good luck", "👏"];
const CHAT_LIMIT = 60;
const HISTORY_LIMIT = 200;

/** The design's Downtown Craps regulars. */
export const DOWNTOWN_BOTS: readonly BotProfile[] = [
  {
    id: "rail_rita",
    handle: "@rail_rita",
    name: "Rita",
    initials: "RR",
    style: "pass-odds",
    bankroll: 4210,
    accuracy: 0.98,
    host: true,
    stats: { decisions: 41, correct: 40, longestRoll: 14 },
  },
  {
    id: "dicecontrol_dee",
    handle: "@dicecontrol_dee",
    name: "Dee",
    initials: "DD",
    style: "pass-2-come",
    bankroll: 3380,
    accuracy: 0.93,
    stats: { decisions: 30, correct: 27, longestRoll: 22 },
  },
  {
    id: "vegas_val",
    handle: "@vegas_val",
    name: "Val",
    initials: "VV",
    style: "dont-pass",
    bankroll: 2905,
    accuracy: 0.9,
    stats: { decisions: 24, correct: 21, longestRoll: 6 },
  },
  {
    id: "mtn_mike",
    handle: "@mtn_mike",
    name: "Mike",
    initials: "MM",
    style: "iron-cross",
    bankroll: 1770,
    accuracy: 0.91,
    stats: { decisions: 38, correct: 35, longestRoll: 11 },
  },
  {
    id: "lucky_lou",
    handle: "@lucky_lou",
    name: "Lou",
    initials: "LL",
    style: "come-field",
    bankroll: 980,
    accuracy: 0.8,
    stats: { decisions: 19, correct: 14, longestRoll: 9 },
  },
];

export interface LiveTableOptions {
  readonly seed: number;
  readonly name?: string;
  readonly rules?: CrapsRules;
  readonly bots?: readonly BotProfile[];
  readonly you?: { readonly name: string; readonly bankroll: number; readonly stats?: SeatStats };
  /** Seat index the human sits at (the design puts Carol fifth). */
  readonly yourSeat?: number;
  /** Seat index of the first shooter. */
  readonly shooter?: number;
}

function seatFromBot(bot: BotProfile): LiveSeat {
  return {
    id: bot.id,
    handle: bot.handle,
    name: bot.name,
    initials: bot.initials,
    style: bot.style,
    styleLabel: STYLE_LABELS[bot.style],
    host: bot.host ?? false,
    isYou: false,
    accuracy: bot.accuracy,
    bankroll: bot.bankroll,
    stats: bot.stats ?? { decisions: 0, correct: 0, longestRoll: 0 },
    memory: EMPTY_MEMORY,
  };
}

/** Seats the bots and the player, and opens the chat with the host's welcome. */
export function createLiveTable(options: LiveTableOptions): LiveTableState {
  const rules = options.rules ?? DOWNTOWN_RULES;
  const bots = options.bots ?? DOWNTOWN_BOTS;
  const you = options.you ?? { name: "Carol", bankroll: 2641 };
  const seats: LiveSeat[] = bots.map(seatFromBot);
  const yourSeat: LiveSeat = {
    id: YOU,
    handle: `${you.name} (you)`,
    name: you.name,
    initials: you.name.charAt(0).toUpperCase(),
    style: null,
    styleLabel: "Pass + 3x odds",
    host: false,
    isYou: true,
    accuracy: 1,
    bankroll: you.bankroll,
    stats: you.stats ?? { decisions: 27, correct: 26, longestRoll: 5 },
    memory: EMPTY_MEMORY,
  };
  const at = Math.min(options.yourSeat ?? 4, seats.length);
  seats.splice(at, 0, yourSeat);
  const host = seats.find((s) => s.host);
  let state: LiveTableState = {
    name: options.name ?? "Downtown Craps",
    seed: options.seed >>> 0,
    rollIndex: 0,
    table: createTable(rules),
    seats,
    shooterIndex: Math.min(options.shooter ?? 1, seats.length - 1),
    capacity: LIVE_TABLE_CAPACITY,
    chat: [],
    nextChatId: 1,
    last: null,
  };
  if (host) {
    state = say(
      state,
      "player",
      host.id,
      `Welcome ${you.name}! Pass line and odds is the classic way to start.`,
    );
  }
  return state;
}

/** "Hosted by @rail_rita · 3-4-5x odds · $10 minimum · practice chips only". */
export function liveTableSubtitle(state: LiveTableState): string {
  const host = state.seats.find((s) => s.host);
  const odds = tableLabel(state.table.rules).split(" · ")[0];
  const by = host ? `Hosted by ${host.handle} · ` : "";
  return `${by}${odds} · ${formatDollars(state.table.rules.minBet)} minimum · practice chips only`;
}

/** "Live · 6 of 8 at the rail". */
export function occupancyLabel(state: LiveTableState): string {
  return `Live · ${state.seats.length} of ${state.capacity} at the rail`;
}

export function shooterOf(state: LiveTableState): LiveSeat {
  return state.seats[state.shooterIndex] as LiveSeat;
}

/** The seat card's second line: "Host · Pass + odds", "Shooter · rolling", "Iron Cross". */
export function seatStatus(state: LiveTableState, seat: LiveSeat): string {
  if (shooterOf(state).id === seat.id) return "Shooter · rolling";
  return seat.host ? `Host · ${seat.styleLabel}` : seat.styleLabel;
}

function say(
  state: LiveTableState,
  kind: ChatKind,
  seatId: string | null,
  text: string,
): LiveTableState {
  const line: ChatLine = { id: state.nextChatId, kind, seatId, text };
  return {
    ...state,
    chat: [...state.chat, line].slice(-CHAT_LIMIT),
    nextChatId: state.nextChatId + 1,
  };
}

/** A chat message from the human player. */
export function sendChat(state: LiveTableState, text: string): LiveTableState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  return say(state, "player", YOU, trimmed.slice(0, 200));
}

function updateSeat(
  state: LiveTableState,
  id: string,
  f: (s: LiveSeat) => LiveSeat,
): LiveTableState {
  return { ...state, seats: state.seats.map((s) => (s.id === id ? f(s) : s)) };
}

/**
 * Applies one action for a seat, paying for it from that seat's bankroll. Refuses what the
 * seat cannot afford.
 */
function act(
  state: LiveTableState,
  seatId: string,
  action: TableAction,
): { ok: true; state: LiveTableState } | { ok: false; reason: string } {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return { ok: false, reason: "No such seat." };
  const owned: TableAction =
    action.type === "bet"
      ? { ...action, spec: { ...action.spec, owner: seatId } as BetSpec }
      : action;
  if (owned.type !== "bet") {
    const bet = state.table.bets.find((b) => b.id === owned.betId);
    if (!bet || bet.owner !== seatId) return { ok: false, reason: "That bet isn't yours." };
  }
  const res = applyAction(state.table, owned);
  if (!res.ok) return res;
  if (seat.bankroll + res.cash < 0) return { ok: false, reason: "Not enough practice chips." };
  const next = updateSeat({ ...state, table: res.table }, seatId, (s) => ({
    ...s,
    bankroll: s.bankroll + res.cash,
  }));
  return { ok: true, state: next };
}

/** Grades a decision for the leaderboard. Odds and low-edge bets are correct. */
function grade(state: LiveTableState, action: TableAction): boolean {
  if (action.type === "odds") return true;
  if (action.type === "bet") return reviewBet(action.spec, state.table.rules).correct;
  return true;
}

function recordDecision(state: LiveTableState, seatId: string, correct: boolean): LiveTableState {
  return updateSeat(state, seatId, (s) => ({
    ...s,
    stats: {
      ...s.stats,
      decisions: s.stats.decisions + 1,
      correct: s.stats.correct + (correct ? 1 : 0),
    },
  }));
}

/** The human player's bet, odds, press or take-down. Graded for the leaderboard. */
export function yourAction(
  state: LiveTableState,
  action: TableAction,
): { ok: true; state: LiveTableState } | { ok: false; reason: string } {
  const res = act(state, YOU, action);
  if (!res.ok) return res;
  return { ok: true, state: recordDecision(res.state, YOU, grade(state, action)) };
}

const MISTAKE_BETS: readonly BetSpec[] = [
  { kind: "anySeven", amount: 5 },
  { kind: "hard", number: 6, amount: 5 },
  { kind: "yo", amount: 5 },
];

/**
 * Every bot makes its bets for the next roll, per its plan. A bot sometimes slips — skipping
 * its odds or tossing a center bet — at a seeded rate set by its accuracy, which is what moves
 * the decision leaderboard.
 */
export function botsBet(state: LiveTableState): LiveTableState {
  let s = state;
  const base = deriveSeed(state.seed, state.rollIndex * 2 + 1);
  state.seats.forEach((seat, i) => {
    if (!seat.style) return;
    const rng = createRng(deriveSeed(base, i));
    const plan = planForStyle(seat.style, s.table.rules);
    const current = s.seats.find((x) => x.id === seat.id) as LiveSeat;
    const actions = planActions(plan, s.table, seat.id, current.memory);
    for (const a of actions) {
      const slip = rng.next() > seat.accuracy;
      if (slip && a.type === "odds") {
        s = recordDecision(s, seat.id, false);
        continue;
      }
      const res = act(s, seat.id, a);
      if (!res.ok) continue;
      s = recordDecision(res.state, seat.id, true);
      if (slip && a.type === "bet") {
        const extra = MISTAKE_BETS[rng.nextInt(MISTAKE_BETS.length)] as BetSpec;
        const more = act(s, seat.id, { type: "bet", spec: extra });
        if (more.ok) s = recordDecision(more.state, seat.id, false);
      }
    }
    s = updateSeat(s, seat.id, (x) => ({ ...x, memory: notePlaced(plan, s.table, x.memory) }));
  });
  return s;
}

/** The dice for the table's next roll — a pure function of the seed and the roll index. */
export function nextDice(state: LiveTableState): Dice {
  return rollDice(createRng(deriveSeed(state.seed, state.rollIndex * 2)));
}

const POINT_MADE_LINES = ["Nice roll!", "Pay the line!", "That's how it's done."];
const SEVEN_OUT_LINES = [
  "Tough out.",
  "Next shooter, let's go.",
  "That seven had to come sometime.",
];

/**
 * Rolls the dice: settles every seat's bets, pays bankrolls, runs the bots' press / take-down
 * rules, passes the dice on a seven-out, and adds the dealer's call and a little table talk.
 * Pass `dice` to force a roll (tests, replays); otherwise the seed decides.
 */
export function liveRoll(state: LiveTableState, dice?: Dice): LiveTableState {
  const shooter = shooterOf(state);
  const outcome: RollOutcome = roll(state.table, dice ?? nextDice(state));
  const table = { ...outcome.table, history: outcome.table.history.slice(-HISTORY_LIMIT) };
  let s: LiveTableState = { ...state, table, rollIndex: state.rollIndex + 1 };

  for (const r of outcome.resolutions) {
    const credit = creditOf(r);
    if (credit !== 0)
      s = updateSeat(s, r.bet.owner, (x) => ({ ...x, bankroll: x.bankroll + credit }));
  }

  // Bots follow their hit rules (press, regress, take down).
  for (const seat of s.seats) {
    if (!seat.style) continue;
    const plan = planForStyle(seat.style, s.table.rules);
    const after = planAfterRoll(plan, outcome, seat.id, seat.memory);
    s = updateSeat(s, seat.id, (x) => ({ ...x, memory: after.memory }));
    for (const a of after.actions) {
      const res = act(s, seat.id, a);
      if (res.ok) s = res.state;
    }
  }

  const { record } = outcome;
  const nameOf = (owner: string) => s.seats.find((x) => x.id === owner)?.name ?? owner;
  const payoutCalls = tablePayoutCalls(outcome.resolutions, nameOf);
  const summary = [rolledBy(shooter.handle, record), ...payoutCalls.slice(0, 1)].join(" · ");

  if (record.event === "seven-out") {
    s = updateSeat(s, shooter.id, (x) => ({
      ...x,
      stats: { ...x.stats, longestRoll: Math.max(x.stats.longestRoll, record.shooterRoll) },
    }));
    s = { ...s, shooterIndex: (s.shooterIndex + 1) % s.seats.length };
  }

  s = say(s, "dealer", null, dealerLine(record, outcome.resolutions));
  if (record.event === "point-set") {
    s = say(s, "system", null, `Point is ${record.total} · ${shooter.handle} is shooting`);
  }
  if (record.event === "seven-out") {
    s = say(s, "system", null, `New shooter: ${shooterOf(s).handle}`);
  }
  s = botChatter(s, record, outcome.resolutions);

  const netBySeat = netByOwner(outcome.resolutions);
  return {
    ...s,
    last: {
      record,
      resolutions: outcome.resolutions,
      call: rollCall(record),
      summary,
      payoutCalls,
      netBySeat,
    },
  };
}

function botChatter(
  state: LiveTableState,
  record: RollRecord,
  resolutions: readonly BetResolution[],
): LiveTableState {
  const rng = createRng(deriveSeed(state.seed ^ 0x5eed, state.rollIndex));
  if (rng.next() > 0.4) return state;
  const bots = state.seats.filter((x) => x.style !== null);
  if (bots.length === 0) return state;
  const speaker = bots[rng.nextInt(bots.length)] as LiveSeat;
  if (record.event === "point-made") {
    return say(
      state,
      "player",
      speaker.id,
      POINT_MADE_LINES[rng.nextInt(POINT_MADE_LINES.length)] as string,
    );
  }
  if (record.event === "seven-out") {
    return say(
      state,
      "player",
      speaker.id,
      SEVEN_OUT_LINES[rng.nextInt(SEVEN_OUT_LINES.length)] as string,
    );
  }
  const placeWin = resolutions.find(
    (r) => r.outcome === "win" && r.bet.kind === "place" && r.bet.owner !== YOU,
  );
  if (placeWin && "number" in placeWin.bet) {
    return say(
      state,
      "player",
      placeWin.bet.owner,
      `Pressing my ${placeWin.bet.number} if she hits it again 🎲`,
    );
  }
  return state;
}

/** One full turn of the table: bots bet, then the dice roll. */
export function advanceLiveTable(state: LiveTableState, dice?: Dice): LiveTableState {
  return liveRoll(botsBet(state), dice);
}

export type LeaderboardMode = "decisions" | "longest-roll";

export interface LeaderboardRow {
  readonly rank: number;
  readonly seatId: string;
  readonly handle: string;
  readonly initials: string;
  readonly isYou: boolean;
  readonly decisions: number;
  /** Whole-percent decision accuracy, e.g. 98. */
  readonly accuracy: number;
  readonly longestRoll: number;
}

/**
 * "Table leaderboard": ranked by decision accuracy (not chips won), or by longest roll.
 * Seats with no graded decisions are left off the accuracy board.
 */
export function leaderboard(
  state: LiveTableState,
  mode: LeaderboardMode = "decisions",
  limit = 3,
): LeaderboardRow[] {
  const rows = state.seats
    .filter((s) => mode === "longest-roll" || s.stats.decisions > 0)
    .map((s) => ({
      seatId: s.id,
      handle: s.handle,
      initials: s.initials,
      isYou: s.isYou,
      decisions: s.stats.decisions,
      accuracy: s.stats.decisions ? Math.round((100 * s.stats.correct) / s.stats.decisions) : 0,
      exact: s.stats.decisions ? s.stats.correct / s.stats.decisions : 0,
      longestRoll: s.stats.longestRoll,
    }));
  rows.sort((a, b) =>
    mode === "decisions"
      ? b.exact - a.exact || b.decisions - a.decisions
      : b.longestRoll - a.longestRoll || (a.handle < b.handle ? -1 : 1),
  );
  return rows.slice(0, limit).map(({ exact: _exact, ...r }, i) => ({ ...r, rank: i + 1 }));
}

/** Total at risk for one seat — what its chips on the layout add up to. */
export function seatOnTable(state: LiveTableState, seatId: string): number {
  return state.table.bets
    .filter((b) => b.owner === seatId)
    .reduce((sum, b) => sum + b.amount + (isLineBet(b) || isComeBet(b) ? b.odds : 0), 0);
}
