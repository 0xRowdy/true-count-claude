/**
 * Selectors over a `ProgressState` (usually the merged view: recorded progress plus the
 * blackjack Session log). Pure and clock-free: every "today" is an ISO date the caller reads
 * after mount (`localIsoDate(new Date())`).
 *
 * Rates are `null`, never 0, when nothing was measured — a new player has no accuracy, not 0%.
 */

import { GAMES, type GameId } from "./profile";
import {
  DECISION_CATEGORIES,
  PRACTICE_BANKROLL_START,
  categoryLabel,
  type ProgressDecision,
  type ProgressHand,
  type ProgressSession,
  type ProgressState,
} from "./progress";

export type Scope = GameId | "all";

// ---------------------------------------------------------------------------------------------
// Calendar arithmetic on ISO dates (UTC midnights, so no time zone and no clock).

const DAY_MS = 86_400_000;

export function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

export function addDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayMon(day: string): number {
  return (new Date(dayNumber(day) * DAY_MS).getUTCDay() + 6) % 7;
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Yesterday", or "Oct 9". */
export function relativeDayLabel(day: string, today: string): string {
  const d = daysBetween(day, today);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  const [, m, dd] = day.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(dd)}`;
}

// ---------------------------------------------------------------------------------------------
// Ranges

export type RangeId = "7d" | "30d" | "90d" | "all";

export const RANGES: ReadonlyArray<{ id: RangeId; label: string; days: number | null }> = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];

export interface DayWindow {
  /** Inclusive first day, or null for "since the beginning". */
  readonly from: string | null;
  /** Inclusive last day. */
  readonly to: string;
}

export function rangeWindow(range: RangeId, today: string): DayWindow {
  const days = RANGES.find((r) => r.id === range)?.days ?? null;
  return { from: days === null ? null : addDays(today, -(days - 1)), to: today };
}

/** The window of the same length immediately before `range`, or null for "All time". */
export function previousWindow(range: RangeId, today: string): DayWindow | null {
  const days = RANGES.find((r) => r.id === range)?.days ?? null;
  if (days === null) return null;
  return { from: addDays(today, -(2 * days - 1)), to: addDays(today, -days) };
}

const inWindow = (day: string, w: DayWindow) => (w.from === null || day >= w.from) && day <= w.to;
const inScope = (game: GameId, scope: Scope) => scope === "all" || game === scope;

export function decisionsIn(
  data: ProgressState,
  scope: Scope,
  window?: DayWindow,
): ProgressDecision[] {
  return data.decisions.filter(
    (d) => inScope(d.game, scope) && (!window || inWindow(d.day, window)),
  );
}

export function handsIn(data: ProgressState, scope: Scope, window?: DayWindow): ProgressHand[] {
  return data.hands.filter((h) => inScope(h.game, scope) && (!window || inWindow(h.day, window)));
}

export function sessionsIn(
  data: ProgressState,
  scope: Scope,
  window?: DayWindow,
): ProgressSession[] {
  return data.sessions.filter(
    (s) => inScope(s.game, scope) && (!window || inWindow(s.day, window)),
  );
}

// ---------------------------------------------------------------------------------------------
// Accuracy

export interface Tally {
  readonly correct: number;
  readonly total: number;
  /** correct / total, or null when total is 0. */
  readonly rate: number | null;
}

export function tally(decisions: readonly ProgressDecision[]): Tally {
  let correct = 0;
  for (const d of decisions) if (d.correct) correct++;
  return {
    correct,
    total: decisions.length,
    rate: decisions.length ? correct / decisions.length : null,
  };
}

export function accuracy(data: ProgressState, scope: Scope, window?: DayWindow): Tally {
  return tally(decisionsIn(data, scope, window));
}

/** Accuracy over the most recent `lastN` decisions of a game (or all games). */
export function recentAccuracy(data: ProgressState, scope: Scope, lastN: number): Tally {
  return tally(decisionsIn(data, scope).slice(-lastN));
}

/** Change in accuracy, in percentage points, against the window before; null without both. */
export function accuracyDelta(
  data: ProgressState,
  scope: Scope,
  range: RangeId,
  today: string,
): number | null {
  const prev = previousWindow(range, today);
  if (!prev) return null;
  const now = accuracy(data, scope, rangeWindow(range, today)).rate;
  const before = accuracy(data, scope, prev).rate;
  return now === null || before === null ? null : (now - before) * 100;
}

export interface CategoryAccuracy extends Tally {
  readonly category: string;
  readonly label: string;
}

/** Per-category accuracy over a game's last `lastN` decisions, in the game's category order. */
export function categoryAccuracy(
  data: ProgressState,
  game: GameId,
  lastN = 500,
): CategoryAccuracy[] {
  const recent = decisionsIn(data, game).slice(-lastN);
  return DECISION_CATEGORIES[game].map((c) => ({
    category: c.id,
    label: c.label,
    ...tally(recent.filter((d) => d.category === c.id)),
  }));
}

export interface WeekAccuracy extends Tally {
  readonly label: string;
  /** Monday of the week. */
  readonly start: string;
}

/** Accuracy per Monday-start week, oldest first, the last entry being this week. */
export function weeklyAccuracy(
  data: ProgressState,
  scope: Scope,
  today: string,
  weeks = 12,
): WeekAccuracy[] {
  const thisWeek = addDays(today, -weekdayMon(today));
  const decisions = decisionsIn(data, scope);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, -7 * (weeks - 1 - i));
    const window = { from: start, to: addDays(start, 6) };
    return {
      label: `W${i + 1}`,
      start,
      ...tally(decisions.filter((d) => inWindow(d.day, window))),
    };
  });
}

/** Longest run of consecutive correct decisions. */
export function bestStreak(decisions: readonly ProgressDecision[]): number {
  let best = 0;
  let run = 0;
  for (const d of decisions) {
    run = d.correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Hands, win rate, bankroll

export interface HandRecord {
  readonly hands: number;
  readonly wins: number;
  readonly losses: number;
  readonly pushes: number;
  /** wins / (wins + losses): pushes are left out, as the real-table figures quote it. */
  readonly winRate: number | null;
  readonly net: number;
}

export function handRecord(hands: readonly ProgressHand[]): HandRecord {
  let wins = 0;
  let losses = 0;
  let net = 0;
  for (const h of hands) {
    if (h.net > 0) wins++;
    else if (h.net < 0) losses++;
    net += h.net;
  }
  return {
    hands: hands.length,
    wins,
    losses,
    pushes: hands.length - wins - losses,
    winRate: wins + losses ? wins / (wins + losses) : null,
    net,
  };
}

/** Real-table win rates (pushes excluded) to set a practice win rate against. */
export const WIN_RATE_EXPECTATION: Readonly<Record<GameId, string>> = {
  blackjack: "46–49%",
  craps: "≈ 49% on the pass line",
  roulette: "≈ 49% on even money",
  "video-poker": "≈ 45% of hands pay",
  baccarat: "≈ 49–51%",
};

/** A game's practice-chip bankroll now. */
export function bankroll(data: ProgressState, game: GameId): number {
  let net = toCents(data.bankrollBase[game] ?? 0);
  for (const h of data.hands) if (h.game === game) net += toCents(h.net);
  return (toCents(PRACTICE_BANKROLL_START) + net) / 100;
}

/** The practice chips across every game: the header balance. */
export function chipBalance(data: ProgressState): number {
  return GAMES.reduce((sum, g) => sum + toCents(bankroll(data, g)), 0) / 100;
}

/**
 * Practice chips are dollars that can carry cents (a 5¢ video poker machine). Money is summed in
 * whole cents so a long run of fractional nets never drifts into float noise (10057.599999…).
 */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export interface BankrollSeries {
  readonly start: number;
  readonly now: number;
  /** Bankroll after each hand in the window, starting with the opening balance. */
  readonly points: readonly number[];
}

/** Bankroll over a window, downsampled to at most `maxPoints` points (the last is exact). */
export function bankrollSeries(
  data: ProgressState,
  scope: Scope,
  window: DayWindow,
  maxPoints = 80,
): BankrollSeries {
  const games = scope === "all" ? GAMES : [scope];
  // Summed in whole cents (see `toCents`), reported in dollars.
  let value = 0;
  for (const g of games) value += toCents(PRACTICE_BANKROLL_START + (data.bankrollBase[g] ?? 0));
  const points: number[] = [];
  for (const h of data.hands) {
    if (!inScope(h.game, scope)) continue;
    if (window.from !== null && h.day < window.from) {
      value += toCents(h.net);
      continue;
    }
    if (h.day > window.to) continue;
    if (points.length === 0) points.push(value / 100);
    value += toCents(h.net);
    points.push(value / 100);
  }
  if (points.length === 0) points.push(value / 100);
  const start = points[0]!;
  const now = points[points.length - 1]!;
  if (points.length <= maxPoints) return { start, now, points };
  const step = (points.length - 1) / (maxPoints - 1);
  const sampled = Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * step)]!);
  return { start, now, points: sampled };
}

// ---------------------------------------------------------------------------------------------
// Practice days

export function practiceDays(data: ProgressState): Set<string> {
  const days = new Set<string>();
  for (const d of data.decisions) days.add(d.day);
  for (const h of data.hands) days.add(h.day);
  return days;
}

/** Consecutive practice days ending today, or yesterday when today is not practised yet. */
export function practiceStreak(data: ProgressState, today: string): number {
  const days = practiceDays(data);
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export type TickState = "done" | "today" | "missed" | "upcoming";

/** This week, Monday to Sunday, for the Today's drill ticks. */
export function weekTicks(
  data: ProgressState,
  today: string,
): Array<{ day: string; label: string; state: TickState }> {
  const days = practiceDays(data);
  const monday = addDays(today, -weekdayMon(today));
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  return labels.map((label, i) => {
    const day = addDays(monday, i);
    const state: TickState = days.has(day)
      ? "done"
      : day === today
        ? "today"
        : day < today
          ? "missed"
          : "upcoming";
    return { day, label, state };
  });
}

// ---------------------------------------------------------------------------------------------
// Levels and mastery

export interface Criterion {
  /** "Soft totals 95%+". */
  readonly label: string;
  /** null = every decision of the game. */
  readonly category: string | null;
  readonly target: number;
  /** Decisions the target must hold over (the most recent ones). */
  readonly required: number;
}

export interface LevelDef {
  readonly level: number;
  readonly title: string;
  /** Level 1 has none: it is reached by playing at all. */
  readonly criteria: readonly Criterion[];
}

const crit = (
  game: GameId,
  category: string | null,
  target: number,
  required: number,
): Criterion => ({
  label: `${category ? categoryLabel(game, category) : "Overall"} ${Math.round(target * 100)}%+`,
  category,
  target,
  required,
});

function genericLadder(game: GameId): LevelDef[] {
  const cats = DECISION_CATEGORIES[game].slice(0, 3);
  const levels: LevelDef[] = [
    { level: 1, title: "First steps", criteria: [] },
    { level: 2, title: "Getting started", criteria: [crit(game, null, 0.7, 30)] },
    { level: 3, title: "Learning the layout", criteria: [crit(game, null, 0.8, 60)] },
  ];
  for (const c of cats) {
    levels.push({
      level: levels.length + 1,
      title: c.label,
      criteria: [crit(game, c.id, 0.85, 40)],
    });
  }
  levels.push({
    level: levels.length + 1,
    title: "Table-ready",
    criteria: [crit(game, null, 0.9, 200)],
  });
  levels.push({
    level: levels.length + 1,
    title: "Sharp",
    criteria: [crit(game, null, 0.95, 400)],
  });
  return levels;
}

/** Each game's level ladder. Blackjack's follows the design (7 "Table-ready", 8 "Shoe Reader"). */
export const LEVELS: Readonly<Record<GameId, readonly LevelDef[]>> = {
  blackjack: [
    { level: 1, title: "First steps", criteria: [] },
    { level: 2, title: "Getting started", criteria: [crit("blackjack", null, 0.7, 30)] },
    { level: 3, title: "Hard hands", criteria: [crit("blackjack", "hard", 0.85, 100)] },
    { level: 4, title: "Doubling down", criteria: [crit("blackjack", "doubles", 0.85, 50)] },
    { level: 5, title: "Splitting pairs", criteria: [crit("blackjack", "pairs", 0.85, 50)] },
    { level: 6, title: "Soft hands", criteria: [crit("blackjack", "soft", 0.85, 100)] },
    { level: 7, title: "Table-ready", criteria: [crit("blackjack", null, 0.9, 300)] },
    {
      level: 8,
      title: "Shoe Reader",
      criteria: [
        crit("blackjack", "hard", 0.95, 200),
        crit("blackjack", "pairs", 0.9, 100),
        crit("blackjack", "soft", 0.95, 200),
      ],
    },
    {
      level: 9,
      title: "Sharp",
      criteria: [crit("blackjack", null, 0.95, 500), crit("blackjack", "doubles", 0.95, 100)],
    },
    {
      level: 10,
      title: "Advantage-ready",
      criteria: [
        crit("blackjack", null, 0.98, 1000),
        crit("blackjack", "insurance-surrender", 0.95, 50),
      ],
    },
  ],
  craps: genericLadder("craps"),
  roulette: genericLadder("roulette"),
  "video-poker": genericLadder("video-poker"),
  baccarat: genericLadder("baccarat"),
};

export interface CriterionStatus extends Criterion {
  /** Decisions counted (at most `required`). */
  readonly count: number;
  readonly rate: number | null;
  readonly met: boolean;
  /** 0–1: share of the sample collected × how close the accuracy is to the target. */
  readonly progress: number;
  /** "soft totals hold 95% over 200 hands". */
  readonly phrase: string;
}

export function evaluateCriterion(
  data: ProgressState,
  game: GameId,
  c: Criterion,
): CriterionStatus {
  const pool = decisionsIn(data, game).filter(
    (d) => c.category === null || d.category === c.category,
  );
  const t = tally(pool.slice(-c.required));
  const met = t.total >= c.required && (t.rate ?? 0) >= c.target - 1e-9;
  const progress = met
    ? 1
    : Math.min(1, t.total / c.required) * Math.min(1, (t.rate ?? 0) / c.target);
  const what = c.category ? categoryLabel(game, c.category).toLowerCase() : "your decisions";
  return {
    ...c,
    count: t.total,
    rate: t.rate,
    met,
    progress,
    phrase: `${what} hold ${Math.round(c.target * 100)}% over ${c.required} hands`,
  };
}

export interface Mastery {
  readonly game: GameId;
  readonly started: boolean;
  /** 0 when not started. */
  readonly level: number;
  /** "Table-ready", or "Not started". */
  readonly title: string;
  readonly next: {
    readonly level: number;
    readonly title: string;
    readonly criteria: readonly CriterionStatus[];
    /** Mean progress of the criteria, 0–1. */
    readonly progress: number;
  } | null;
  /** 0–1 progress towards the game's "Table-ready" level. */
  readonly tableReadiness: number;
  /** "Next: soft totals", "5-minute table intro", "Top level reached". */
  readonly nextStep: string;
}

export function mastery(data: ProgressState, game: GameId): Mastery {
  const ladder = LEVELS[game];
  const started =
    data.decisions.some((d) => d.game === game) || data.hands.some((h) => h.game === game);
  let level = started ? 1 : 0;
  if (started) {
    for (const def of ladder.slice(1)) {
      if (def.criteria.every((c) => evaluateCriterion(data, game, c).met)) level = def.level;
      else break;
    }
  }
  const nextDef = ladder.find((l) => l.level === level + 1);
  const next = nextDef
    ? (() => {
        const criteria = nextDef.criteria.map((c) => evaluateCriterion(data, game, c));
        const progress = criteria.length
          ? criteria.reduce((s, c) => s + c.progress, 0) / criteria.length
          : 0;
        return { level: nextDef.level, title: nextDef.title, criteria, progress };
      })()
    : null;
  const readyLevel = ladder.find((l) => l.title === "Table-ready")?.level ?? ladder.length;
  const tableReadiness =
    level >= readyLevel
      ? 1
      : level === 0
        ? 0
        : (level - 1 + (next?.progress ?? 0)) / (readyLevel - 1);
  const firstUnmet = next?.criteria.find((c) => !c.met);
  const nextStep = !started
    ? "5-minute table intro"
    : !next
      ? "Top level reached"
      : `Next: ${firstUnmet && firstUnmet.category ? categoryLabel(game, firstUnmet.category).toLowerCase() : "overall accuracy"}`;
  return {
    game,
    started,
    level,
    title: started ? (ladder.find((l) => l.level === level)?.title ?? "") : "Not started",
    next,
    tableReadiness,
    nextStep,
  };
}

// ---------------------------------------------------------------------------------------------
// Weak spots

export interface WeakSpot {
  readonly game: GameId;
  readonly category: string;
  readonly label: string;
  readonly rate: number;
  readonly total: number;
  /** Mistakes in this category in the most recent session that had any of it. */
  readonly mistakesLastSession: number;
}

/**
 * The weakest category over the last `lastN` decisions of each game in `games`, counting only
 * categories with at least `minSample` decisions. Null when nothing qualifies or all are perfect.
 */
export function weakestCategory(
  data: ProgressState,
  games: readonly GameId[] = GAMES,
  lastN = 200,
  minSample = 10,
): WeakSpot | null {
  let worst: WeakSpot | null = null;
  for (const game of games) {
    const recent = decisionsIn(data, game).slice(-lastN);
    for (const c of DECISION_CATEGORIES[game]) {
      const t = tally(recent.filter((d) => d.category === c.id));
      if (t.total < minSample || t.rate === null || t.rate >= 1) continue;
      if (!worst || t.rate < worst.rate || (t.rate === worst.rate && t.total > worst.total)) {
        worst = {
          game,
          category: c.id,
          label: c.label,
          rate: t.rate,
          total: t.total,
          mistakesLastSession: 0,
        };
      }
    }
  }
  if (!worst) return null;
  return { ...worst, mistakesLastSession: mistakesLastSession(data, worst.game, worst.category) };
}

export function mistakesLastSession(data: ProgressState, game: GameId, category: string): number {
  const relevant = data.decisions.filter((d) => d.game === game && d.category === category);
  const last = relevant[relevant.length - 1];
  if (!last) return 0;
  const sameRun = relevant.filter((d) =>
    last.sessionId === null
      ? d.day === last.day && d.sessionId === null
      : d.sessionId === last.sessionId,
  );
  return sameRun.filter((d) => !d.correct).length;
}

// ---------------------------------------------------------------------------------------------
// Sessions

export interface SessionRow {
  readonly id: string;
  readonly game: GameId;
  readonly day: string;
  readonly strategyName: string | null;
  readonly hands: number;
  readonly accuracy: number | null;
  readonly net: number;
  readonly coached: number;
  readonly decisions: number;
  /** Null for an open session with nothing recorded after its start. */
  readonly durationMs: number | null;
}

/** Sessions in scope and window, newest first. */
export function sessionRows(data: ProgressState, scope: Scope, window?: DayWindow): SessionRow[] {
  const sessions = sessionsIn(data, scope, window);
  const byId = new Map<string, { d: ProgressDecision[]; h: ProgressHand[] }>();
  for (const s of sessions) byId.set(s.id, { d: [], h: [] });
  for (const d of data.decisions) if (d.sessionId) byId.get(d.sessionId)?.d.push(d);
  for (const h of data.hands) if (h.sessionId) byId.get(h.sessionId)?.h.push(h);
  return sessions
    .map((s) => {
      const { d, h } = byId.get(s.id)!;
      let last = s.startedAt;
      for (const x of d) if (x.at > last) last = x.at;
      for (const x of h) if (x.at > last) last = x.at;
      const end = s.endedAt ?? last;
      return {
        id: s.id,
        game: s.game,
        day: s.day,
        strategyName: s.strategyName,
        hands: h.length,
        accuracy: tally(d).rate,
        net: h.reduce((sum, x) => sum + x.net, 0),
        coached: d.filter((x) => x.coached).length,
        decisions: d.length,
        durationMs: end > s.startedAt ? end - s.startedAt : null,
        startedAt: s.startedAt,
      };
    })
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(({ startedAt: _startedAt, ...row }) => row);
}

export interface SessionStats {
  readonly sessions: number;
  /** Mean length of sessions with a measurable duration, in minutes. */
  readonly avgMinutes: number | null;
  readonly longestWinStreak: number;
  readonly longestLosingStreak: number;
  readonly coachCorrections: number;
  readonly decisions: number;
  /** Decisions per coach correction ("1 per 31 decisions"), null with no corrections. */
  readonly decisionsPerCorrection: number | null;
}

export function sessionStats(data: ProgressState, scope: Scope, window?: DayWindow): SessionStats {
  const rows = sessionRows(data, scope, window);
  const timed = rows.filter((r) => r.durationMs !== null);
  const hands = handsIn(data, scope, window);
  let win = 0;
  let lose = 0;
  let w = 0;
  let l = 0;
  for (const h of hands) {
    if (h.net > 0) {
      w++;
      l = 0;
    } else if (h.net < 0) {
      l++;
      w = 0;
    }
    win = Math.max(win, w);
    lose = Math.max(lose, l);
  }
  const decisions = decisionsIn(data, scope, window);
  const coached = decisions.filter((d) => d.coached).length;
  return {
    sessions: rows.length,
    avgMinutes: timed.length
      ? timed.reduce((s, r) => s + (r.durationMs ?? 0), 0) / timed.length / 60_000
      : null,
    longestWinStreak: win,
    longestLosingStreak: lose,
    coachCorrections: coached,
    decisions: decisions.length,
    decisionsPerCorrection: coached ? Math.round(decisions.length / coached) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Achievements

export type AchievementId =
  | "table-ready"
  | "ice-cold"
  | "hard-way"
  | "remixed"
  | "no-nudges"
  | "royal-hold";

export interface Achievement {
  readonly id: AchievementId;
  readonly title: string;
  readonly description: string;
  readonly unlocked: boolean;
  /** 0–1 towards unlocking. */
  readonly progress: number;
}

/** The six achievements of the design, each computed from the record. */
export function achievements(data: ProgressState): Achievement[] {
  const bj = recentAccuracy(data, "blackjack", 300);
  const tableReady = bj.total >= 300 && (bj.rate ?? 0) >= 0.9;

  const best = bestStreak(data.decisions);

  const rows = sessionRows(data, "all");
  const crapsOdds = new Map<string, { n: number; ok: boolean }>();
  for (const d of data.decisions) {
    if (d.game !== "craps" || d.category !== "odds" || !d.sessionId) continue;
    const e = crapsOdds.get(d.sessionId) ?? { n: 0, ok: true };
    crapsOdds.set(d.sessionId, { n: e.n + 1, ok: e.ok && d.correct });
  }
  const hardWay = [...crapsOdds.values()].some((e) => e.ok && e.n >= 3);

  let cleanHands = 0;
  for (const r of rows) if (r.coached === 0 && r.hands > cleanHands) cleanHands = r.hands;

  const vpStreak = bestStreak(decisionsIn(data, "video-poker"));

  const list: Achievement[] = [
    {
      id: "table-ready",
      title: "Table-ready",
      description: "Blackjack basic strategy at 90%+ over 300 hands",
      unlocked: tableReady,
      progress: tableReady ? 1 : Math.min(1, bj.total / 300) * Math.min(1, (bj.rate ?? 0) / 0.9),
    },
    {
      id: "ice-cold",
      title: "Ice cold hands",
      description:
        best >= 25 ? `${best} correct decisions in a row` : "25 correct decisions in a row",
      unlocked: best >= 25,
      progress: Math.min(1, best / 25),
    },
    {
      id: "hard-way",
      title: "Hard way",
      description: "Took full odds on every point for a whole session",
      unlocked: hardWay,
      progress: hardWay ? 1 : 0,
    },
    {
      // Strategy sharing is simulated in this build, so nothing can be forked yet.
      id: "remixed",
      title: "Remixed",
      description: "A strategy you wrote was forked 5 times",
      unlocked: false,
      progress: 0,
    },
    {
      id: "no-nudges",
      title: "No nudges",
      description: "A 50-hand session with zero coach corrections",
      unlocked: cleanHands >= 50,
      progress: Math.min(1, cleanHands / 50),
    },
    {
      id: "royal-hold",
      title: "Royal hold",
      description: "Held every video poker hand optimally for 100 draws",
      unlocked: vpStreak >= 100,
      progress: Math.min(1, vpStreak / 100),
    },
  ];
  return [...list.filter((a) => a.unlocked), ...list.filter((a) => !a.unlocked)];
}
