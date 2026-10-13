/**
 * The view model beneath the simulated live craps table (design 11, QEqUW).
 *
 * React-free on purpose (it runs under vitest): everything here is a pure function of the
 * engine's plain-data `LiveTableState`. The screen holds the state; the timer, the seed draw
 * and the clipboard live in `useLiveCraps`.
 *
 * There is no backend (ADR-0003). The other players are the engine's seeded bots, and the
 * table is labelled as a practice table with simulated players wherever it says "Live".
 */

import { createRng } from "@/engine/rng";
import {
  type Bet,
  type BetSpec,
  type BotProfile,
  type ChatLine,
  type CrapsTable,
  type HardNumber,
  type LeaderboardMode,
  type LiveSeat,
  type LiveTableState,
  type OneRollKind,
  type PointNumber,
  type RollOutcome,
  BET_WINDOW_SECONDS,
  DOWNTOWN_BOTS,
  YOU,
  botsBet,
  coachRoll,
  createLiveTable,
  deriveSeed,
  dice,
  formatDollars,
  formatSignedDollars,
  isComeBet,
  isLineBet,
  leaderboard,
  liveRoll,
  multipleLabel,
  oddsLimit,
  oddsNudge,
  reviewBet,
  sendChat,
  yourAction,
} from "@/games/craps";
import { colors } from "@/ui/ds/tokens";

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

/**
 * The seed the static export prerenders with. The browser's first render must produce the same
 * text as that HTML (hydration, #32), so a fresh seed is only drawn after mount.
 */
export const FIXTURE_SEED = 8;

/** `?seed=42` → 42. Anything that is not a whole number in uint32 range is ignored. */
export function parseSeed(raw: string | string[] | undefined | null): number | null {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (text == null || !/^\d{1,10}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n <= 0xffffffff ? n >>> 0 : null;
}

/** Points the table at a new seed. Everything after this roll is dealt from it. */
export function reseed(state: LiveTableState, seed: number): LiveTableState {
  return { ...state, seed: seed >>> 0 };
}

// ---------------------------------------------------------------------------
// The opening state: the design's moment
// ---------------------------------------------------------------------------

/** What the design shows for each seat as you sit down: bankroll and decision record. */
const DESIGN_SEATS: Readonly<
  Record<string, { bankroll: number; decisions: number; correct: number }>
> = {
  rail_rita: { bankroll: 4210, decisions: 41, correct: 40 },
  dicecontrol_dee: { bankroll: 3380, decisions: 30, correct: 27 },
  vegas_val: { bankroll: 2905, decisions: 24, correct: 21 },
  mtn_mike: { bankroll: 1770, decisions: 38, correct: 35 },
  lucky_lou: { bankroll: 980, decisions: 19, correct: 14 },
  [YOU]: { bankroll: 2641, decisions: 27, correct: 26 },
};

export const YOUR_NAME = "Carol";
const YOUR_CHAT = "Thanks! Taking 3x. First time at a full table";
const MIKE_CHAT = "Pressing my 6 if she hits it again 🎲";

interface Starting {
  readonly bots: readonly BotProfile[];
  readonly you: { name: string; bankroll: number; stats: LiveSeat["stats"] };
}

/**
 * Plays the hand that leads to the design's frame: you take the pass line for $25, the shooter
 * sets the point at 8, you back it with 3x odds, the bots make their bets, a 4 · 2 rolls, and
 * the bots put their next bets down.
 */
function playOpening(seed: number, start: Starting): LiveTableState {
  let s = createLiveTable({ seed, bots: start.bots, you: start.you });
  s = must(yourAction(s, { type: "bet", spec: { kind: "pass", amount: 25 } }));
  s = liveRoll(botsBet(s), dice(5, 3));
  const line = s.table.bets.find((b) => b.owner === YOU && b.kind === "pass") as Bet;
  s = must(yourAction(s, { type: "odds", betId: line.id, amount: 75 }));
  return botsBet(liveRoll(botsBet(s), dice(4, 2)));
}

function must(
  r: { ok: true; state: LiveTableState } | { ok: false; reason: string },
): LiveTableState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/**
 * The table as the design draws it (frame QEqUW): point 8, Dee shooting, the 4 · 2 just
 * called, your $25 pass line with 3x odds, and the bots' bets down for the next roll.
 *
 * The opening hand is played for real on the engine. Starting bankrolls and records are then
 * set so the seats read what the design reads once that hand is over, and the chat shows the
 * design's lines (the engine's own calls, in the design's order).
 */
export function openingTable(seed: number = FIXTURE_SEED): LiveTableState {
  const plain: Starting = {
    bots: DOWNTOWN_BOTS,
    you: { name: YOUR_NAME, bankroll: 2641, stats: { decisions: 27, correct: 26, longestRoll: 5 } },
  };
  const draft = playOpening(seed, plain);
  const adjust = (id: string, bankroll: number, stats: LiveSeat["stats"]) => {
    const seat = draft.seats.find((x) => x.id === id) as LiveSeat;
    const want = DESIGN_SEATS[id];
    if (!want) return { bankroll, stats };
    return {
      bankroll: bankroll + want.bankroll - seat.bankroll,
      stats: {
        ...stats,
        decisions: Math.max(0, stats.decisions + want.decisions - seat.stats.decisions),
        correct: Math.max(0, stats.correct + want.correct - seat.stats.correct),
      },
    };
  };
  const tuned: Starting = {
    bots: DOWNTOWN_BOTS.map((b) => {
      const stats = b.stats ?? { decisions: 0, correct: 0, longestRoll: 0 };
      return { ...b, ...adjust(b.id, b.bankroll, stats) };
    }),
    you: { name: YOUR_NAME, ...adjust(YOU, plain.you.bankroll, plain.you.stats) },
  };
  const played = playOpening(seed, tuned);

  // The design's chat: the point call, the host's welcome, your reply, Mike, the dealer.
  const find = (pred: (c: ChatLine) => boolean) => played.chat.find(pred);
  const lines: Omit<ChatLine, "id">[] = [];
  const point = find((c) => c.kind === "system" && c.text.startsWith("Point is"));
  const welcome = find((c) => c.kind === "player" && c.seatId === "rail_rita");
  const dealer = [...played.chat].reverse().find((c) => c.kind === "dealer");
  if (point) lines.push(point);
  if (welcome) lines.push(welcome);
  lines.push({ kind: "player", seatId: YOU, text: YOUR_CHAT });
  lines.push({ kind: "player", seatId: "mtn_mike", text: MIKE_CHAT });
  if (dealer) lines.push(dealer);
  const chat = lines.map((c, i) => ({ ...c, id: i + 1 }));
  return { ...played, chat, nextChatId: chat.length + 1 };
}

// ---------------------------------------------------------------------------
// Your actions
// ---------------------------------------------------------------------------

export type NoticeTone = "hint" | "good" | "mistake";

export interface Notice {
  readonly tone: NoticeTone;
  readonly text: string;
}

export interface Step {
  readonly state: LiveTableState;
  readonly notice: Notice | null;
}

/** Places (or adds to) your bet on a spot, graded by the coach as it goes down. */
export function placeYourBet(state: LiveTableState, spec: BetSpec): Step {
  const res = yourAction(state, { type: "bet", spec });
  if (!res.ok) return { state, notice: { tone: "hint", text: res.reason } };
  const review = reviewBet(spec, state.table.rules);
  return {
    state: res.state,
    notice: {
      tone: review.correct ? "good" : review.verdict === "costly" ? "mistake" : "hint",
      text: review.message,
    },
  };
}

/** Your line bet (pass or don't pass), if you have one down. */
export function yourLine(table: CrapsTable): Bet | null {
  return table.bets.find((b) => b.owner === YOU && isLineBet(b)) ?? null;
}

/** The bet "Add odds" would add to: your line bet first, then a come bet on its number. */
export function oddsTarget(table: CrapsTable): Bet | null {
  const mine = table.bets.filter((b) => b.owner === YOU && (isLineBet(b) || isComeBet(b)));
  const open = mine.filter((b) => {
    const odds = isLineBet(b) || isComeBet(b) ? b.odds : 0;
    return odds < oddsLimit(table, b);
  });
  return open.find(isLineBet) ?? open[0] ?? null;
}

/** "Add odds" is only offered when there is a bet that can take more (never shown disabled). */
export function canAddOdds(table: CrapsTable): boolean {
  return oddsTarget(table) !== null;
}

/** Adds one chip of odds behind your line (or come) bet, up to the table's limit. */
export function addOdds(state: LiveTableState, chip: number): Step {
  const bet = oddsTarget(state.table);
  if (!bet || !(isLineBet(bet) || isComeBet(bet))) {
    return {
      state,
      notice: { tone: "hint", text: "Odds go behind a pass or come bet once its point is set." },
    };
  }
  const limit = oddsLimit(state.table, bet);
  const amount = Math.min(limit, bet.odds + chip);
  const res = yourAction(state, { type: "odds", betId: bet.id, amount });
  if (!res.ok) return { state, notice: { tone: "hint", text: res.reason } };
  const full = amount >= limit;
  const x = multipleLabel(amount, bet.amount);
  return {
    state: res.state,
    notice: {
      tone: "good",
      text: `${full ? "Full odds" : `${x} odds`} (${formatDollars(amount)}) behind your ${formatDollars(bet.amount)}. Odds pay true odds, so the house has no edge on them.`,
    },
  };
}

/**
 * Bets close: the dice roll, every bet settles, then the bots put their next bets down so the
 * layout shows them during the next betting window.
 */
export function closeBets(state: LiveTableState): Step {
  const rolled = liveRoll(state);
  const last = rolled.last;
  const next = botsBet(rolled);
  if (!last) return { state: next, notice: null };
  const outcome: RollOutcome = {
    table: rolled.table,
    record: last.record,
    resolutions: last.resolutions,
  };
  const net = last.netBySeat[YOU] ?? 0;
  const note = coachRoll(outcome);
  const result = net === 0 ? "" : `${formatSignedDollars(net)} this roll. `;
  if (note) {
    return {
      state: next,
      notice: {
        tone: note.tone === "good" ? "good" : note.tone === "mistake" ? "mistake" : "hint",
        text: `${result}${note.title} ${note.body}`.trim(),
      },
    };
  }
  if (net !== 0) {
    return {
      state: next,
      notice: { tone: net > 0 ? "good" : "hint", text: `${result}${last.call}`.trim() },
    };
  }
  return { state: next, notice: null };
}

/**
 * The coach's line under the chip rack: your last action's feedback first, then the max-odds
 * nudge, then what to do next.
 */
export function coachHint(state: LiveTableState, notice: Notice | null): Notice {
  if (notice) return notice;
  const nudge = oddsNudge(state.table, YOU);
  if (nudge) return { tone: "hint", text: nudge };
  const { table } = state;
  const line = yourLine(table);
  const min = formatDollars(table.rules.minBet);
  if (table.point === null) {
    return line
      ? {
          tone: "hint",
          text: `Come-out roll. Your ${formatDollars(line.amount)} line bet wins on 7 or 11 and loses on 2, 3 or 12. Any other number becomes the point.`,
        }
      : {
          tone: "hint",
          text: `Come-out roll: pick a chip and tap PASS LINE (${min} minimum). Once a point is set, back it with odds.`,
        };
  }
  if (line) {
    return {
      tone: "good",
      text: `Point is ${table.point} and you have full odds. A come bet (${min}) works like a second pass line.`,
    };
  }
  return {
    tone: "hint",
    text: `Point is ${table.point}. Pass line bets wait for the next come-out; a come bet (${min}) works like one now.`,
  };
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

export type Spot =
  | { readonly kind: "box"; readonly number: PointNumber }
  | { readonly kind: "come" | "dontCome" | "field" | "pass" | "dontPass" }
  | { readonly kind: "hard"; readonly number: HardNumber }
  | { readonly kind: "oneRoll"; readonly bet: Exclude<OneRollKind, "field" | "aceDeuce"> };

/** What tapping a spot bets, with the selected chip. Box numbers are place bets. */
export function specFor(spot: Spot, amount: number): BetSpec {
  switch (spot.kind) {
    case "box":
      return { kind: "place", number: spot.number, amount };
    case "hard":
      return { kind: "hard", number: spot.number, amount };
    case "oneRoll":
      return { kind: spot.bet, amount };
    default:
      return { kind: spot.kind, amount };
  }
}

function onSpot(bet: Bet, spot: Spot): boolean {
  switch (spot.kind) {
    case "box":
      return (
        ((bet.kind === "place" || bet.kind === "buy" || bet.kind === "lay") &&
          bet.number === spot.number) ||
        (isComeBet(bet) && bet.point === spot.number)
      );
    case "come":
    case "dontCome":
      return bet.kind === spot.kind && isComeBet(bet) && bet.point === null;
    case "hard":
      return bet.kind === "hard" && bet.number === spot.number;
    case "oneRoll":
      return bet.kind === spot.bet;
    default:
      return bet.kind === spot.kind;
  }
}

export interface ChipView {
  readonly key: string;
  readonly owner: string;
  readonly mine: boolean;
  readonly amount: number;
  /** Chip colour: the player's seat colour, gold for you. */
  readonly color: string;
}

/** Each seat's colour on the layout, as the design gives them. */
const SEAT_COLORS: Readonly<Record<string, string>> = {
  rail_rita: colors.chip500,
  dicecontrol_dee: colors.chip5,
  vegas_val: colors.coachAccent,
  mtn_mike: colors.chip25,
  lucky_lou: colors.suitDiamond,
  [YOU]: colors.chip1k,
};
const FALLBACK_COLORS = [colors.chip500, colors.chip5, colors.chip25, colors.suitDiamond];

export function seatColor(id: string): string {
  const known = SEAT_COLORS[id];
  if (known) return known;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length] as string;
}

/**
 * The chips on one spot: everyone else's first (one chip per bet, flat plus odds), then yours
 * (flat and odds as separate chips, the way the design draws "25 · 75" on the pass line).
 */
export function chipsOn(table: CrapsTable, spot: Spot): ChipView[] {
  const bets = table.bets.filter((b) => onSpot(b, spot));
  const theirs: ChipView[] = bets
    .filter((b) => b.owner !== YOU)
    .map((b) => ({
      key: b.id,
      owner: b.owner,
      mine: false,
      amount: b.amount + (isLineBet(b) || isComeBet(b) ? b.odds : 0),
      color: seatColor(b.owner),
    }));
  const mine: ChipView[] = bets
    .filter((b) => b.owner === YOU)
    .flatMap((b) => {
      const flat = { key: b.id, owner: YOU, mine: true, amount: b.amount, color: colors.primary };
      const odds = isLineBet(b) || isComeBet(b) ? b.odds : 0;
      return odds > 0 ? [flat, { ...flat, key: `${b.id}-odds`, amount: odds }] : [flat];
    });
  return [...theirs, ...mine];
}

/** Your total on a spot (flats plus odds), 0 if none. */
export function yourStakeOn(table: CrapsTable, spot: Spot): number {
  return chipsOn(table, spot)
    .filter((c) => c.mine)
    .reduce((s, c) => s + c.amount, 0);
}

/** The tag above your chips on the line: "YOU · $25 + 3x odds". */
export function yourLineTag(table: CrapsTable, kind: "pass" | "dontPass"): string | null {
  const bet = table.bets.find((b) => b.owner === YOU && b.kind === kind);
  if (!bet || !isLineBet(bet)) return null;
  const base = `YOU · ${formatDollars(bet.amount)}`;
  return bet.odds > 0 ? `${base} + ${multipleLabel(bet.odds, bet.amount)} odds` : base;
}

/** Chip faces on the felt: "12", "1.2K". */
export function chipText(amount: number): string {
  if (amount >= 1000) {
    const k = Math.round(amount / 100) / 10;
    return `${k}K`;
  }
  return String(amount);
}

// ---------------------------------------------------------------------------
// The rail and the social column
// ---------------------------------------------------------------------------

export interface RailLayout {
  readonly top: readonly LiveSeat[];
  readonly bottom: readonly LiveSeat[];
  readonly openSeats: number;
}

/** Four seats along the top rail; the rest (you included) and one open seat below. */
export function railLayout(state: LiveTableState): RailLayout {
  return {
    top: state.seats.slice(0, 4),
    bottom: state.seats.slice(4),
    openSeats: Math.max(0, state.capacity - state.seats.length),
  };
}

export function yourSeat(state: LiveTableState): LiveSeat {
  return state.seats.find((s) => s.isYou) as LiveSeat;
}

/** "Bets close in 0:12". */
export function timerLabel(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `Bets close in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export { BET_WINDOW_SECONDS };

export interface LeaderRow {
  readonly rank: number;
  readonly seatId: string;
  readonly handle: string;
  readonly initials: string;
  readonly isYou: boolean;
  readonly detail: string;
  readonly value: string;
  readonly color: string;
}

export const LEADERBOARD_TABS: ReadonlyArray<{ value: LeaderboardMode; label: string }> = [
  { value: "decisions", label: "Best decisions" },
  { value: "longest-roll", label: "Longest roll" },
];

/** The leaderboard rows for a tab: accuracy with decision counts, or longest hand in rolls. */
export function leaderRows(state: LiveTableState, mode: LeaderboardMode): LeaderRow[] {
  return leaderboard(state, mode, 3).map((r) => ({
    rank: r.rank,
    seatId: r.seatId,
    handle: r.handle,
    initials: r.initials,
    isYou: r.isYou,
    detail: mode === "decisions" ? `${r.decisions} decisions` : "longest hand tonight",
    value:
      mode === "decisions"
        ? `${r.accuracy}%`
        : `${r.longestRoll} ${r.longestRoll === 1 ? "roll" : "rolls"}`,
    color: seatColor(r.seatId),
  }));
}

export type ChatItem =
  | { readonly id: number; readonly type: "pill"; readonly text: string }
  | {
      readonly id: number;
      readonly type: "message";
      readonly handle: string;
      readonly initials: string;
      readonly color: string;
      readonly isYou: boolean;
      readonly text: string;
    };

/** Chat lines as the panel draws them. Muting hides the other players, never the dealer. */
export function chatItems(state: LiveTableState, muted = false): ChatItem[] {
  const items: ChatItem[] = [];
  for (const line of state.chat) {
    if (line.kind !== "player") {
      items.push({ id: line.id, type: "pill", text: line.text });
      continue;
    }
    const seat = state.seats.find((s) => s.id === line.seatId);
    if (!seat || (muted && !seat.isYou)) continue;
    items.push({
      id: line.id,
      type: "message",
      handle: seat.handle,
      initials: seat.initials,
      color: seatColor(seat.id),
      isYou: seat.isYou,
      text: line.text,
    });
  }
  return items;
}

/** Posts your chat message (trimmed, capped by the engine). */
export function postChat(state: LiveTableState, text: string): LiveTableState {
  return sendChat(state, text);
}

const REPLIES: ReadonlyArray<{ match: RegExp; lines: readonly string[] }> = [
  {
    match: /nice|great|hot/i,
    lines: ["Thanks! Keep 'em coming 🎲", "She's rolling tonight.", "🙌"],
  },
  { match: /luck/i, lines: ["You too!", "Good luck, Carol.", "Let's get a long hand going."] },
  { match: /👏|🎉|🙌/u, lines: ["👏👏", "🙌", "🎲🎲"] },
  { match: /odds/i, lines: ["Full odds is the move.", "Odds are the only free bet in the house."] },
];
const GENERIC = ["Welcome to the rail!", "Ha, same.", "Let's see a point.", "Good table tonight."];

/**
 * A bot answers what you said, if the seeded draw says one does (most of the time). The
 * speaker and the line are a pure function of the table seed and the chat position, so a
 * replayed table answers the same way.
 */
export function botReply(state: LiveTableState, said: string): LiveTableState {
  const rng = createRng(deriveSeed(state.seed ^ 0xc4a7, state.nextChatId));
  if (rng.next() > 0.8) return state;
  const bots = state.seats.filter((s) => !s.isYou);
  if (bots.length === 0) return state;
  const speaker = bots[rng.nextInt(bots.length)] as LiveSeat;
  const pool = REPLIES.find((r) => r.match.test(said))?.lines ?? GENERIC;
  const text = pool[rng.nextInt(pool.length)] as string;
  const line: ChatLine = { id: state.nextChatId, kind: "player", seatId: speaker.id, text };
  return { ...state, chat: [...state.chat, line].slice(-60), nextChatId: state.nextChatId + 1 };
}

/** Plain-language table rules for the "Table rules" sheet. */
export function rulesSummary(state: LiveTableState): string[] {
  const r = state.table.rules;
  const odds =
    r.odds.kind === "3-4-5x"
      ? "Odds: 3x on 4 and 10, 4x on 5 and 9, 5x on 6 and 8."
      : `Odds: ${r.odds.multiple}x on every point.`;
  return [
    `Bets ${formatDollars(r.minBet)} to ${formatDollars(r.maxBet)} on the line, come and place bets.`,
    odds,
    "Place bets pay 9:5 on 4 and 10, 7:5 on 5 and 9, 7:6 on 6 and 8; they are off on the come-out.",
    `Field pays 1:1 on 3, 4, 9, 10 and 11; ${r.fieldTwoPays === 2 ? "double" : "triple"} on 2 and ${r.fieldTwelvePays === 2 ? "double" : "triple"} on 12.`,
    "Don't pass and don't come bar 12: a 12 on the come-out pushes.",
    `Bets close after ${BET_WINDOW_SECONDS} seconds, or when you confirm.`,
    "Practice table: the other players are simulated on this device, and every chip is a practice chip.",
  ];
}
