/**
 * The words and destinations behind the Lobby and Progress screens: routes per game, the
 * "Up next" lesson for a weak category, the drill of the day, greetings, and the fixture rows
 * for the parts of the design that are simulated in this build (live tables, community,
 * followed strategies). React-free so it is unit-tested.
 */

import type { Rank, Suit } from "@/engine/cards";
import { GAME_NAMES, type GameId } from "@/state/profile";
import { type WeakSpot, weekdayMon } from "@/state/progressSelectors";

/** Where each game is played (route map). */
export const GAME_ROUTE: Readonly<Record<GameId, string>> = {
  blackjack: "/play",
  craps: "/games/craps",
  roulette: "/games/roulette",
  "video-poker": "/games/video-poker",
  baccarat: "/games/baccarat",
};

/** Where a game is drilled: blackjack has its trainer; the other tables coach as you play. */
export const TRAINER_ROUTE: Readonly<Record<GameId, string>> = {
  ...GAME_ROUTE,
  blackjack: "/drills/basic-strategy",
};

/** "Good morning" before noon, "Good afternoon" until 6pm, then "Good evening". */
export function greeting(hour: number, name: string | null): string {
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}${name ? `, ${name}` : ""}`;
}

/** "blackjack", "blackjack and craps", "blackjack, craps and roulette". */
export function gameList(games: readonly GameId[]): string {
  const names = games.map((g) => GAME_NAMES[g].toLowerCase());
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function percent(rate: number | null, digits = 0): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(digits)}%`;
}

/** "+$150", "−$35" (a true minus sign), "$0". */
export function signedMoney(n: number): string {
  const abs = Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n > 0 ? `+$${abs}` : n < 0 ? `−$${abs}` : "$0";
}

export interface HandVisual {
  readonly player: ReadonlyArray<readonly [Rank, Suit]>;
  readonly dealer: readonly [Rank, Suit];
  readonly caption: string;
}

export interface Lesson {
  readonly title: string;
  readonly hand?: HandVisual;
}

const LESSONS: Readonly<Record<GameId, Readonly<Record<string, Lesson>>>> = {
  blackjack: {
    soft: {
      title: "Soft totals: when an Ace means double",
      hand: {
        player: [
          ["A", "s"],
          ["7", "h"],
        ],
        dealer: ["9", "d"],
        caption: "Soft 18 vs 9  →  Hit",
      },
    },
    hard: {
      title: "Hard totals: when to stop hitting",
      hand: {
        player: [
          ["10", "c"],
          ["2", "d"],
        ],
        dealer: ["4", "s"],
        caption: "Hard 12 vs 4  →  Stand",
      },
    },
    doubles: {
      title: "Doubles: press when the dealer is weak",
      hand: {
        player: [
          ["6", "s"],
          ["5", "h"],
        ],
        dealer: ["6", "d"],
        caption: "11 vs 6  →  Double",
      },
    },
    pairs: {
      title: "Pairs: which ones to split, and when",
      hand: {
        player: [
          ["8", "s"],
          ["8", "h"],
        ],
        dealer: ["10", "d"],
        caption: "8,8 vs 10  →  Split",
      },
    },
    "insurance-surrender": {
      title: "Insurance & surrender: the side doors",
      hand: {
        player: [
          ["10", "s"],
          ["6", "h"],
        ],
        dealer: ["A", "d"],
        caption: "Insurance  →  No",
      },
    },
  },
  craps: {
    line: { title: "Line bets: pass, don't pass, and why" },
    odds: { title: "Odds: the only bet with no house edge" },
    come: { title: "Come bets: a pass line that starts mid-roll" },
    place: { title: "Place bets: which numbers are worth it" },
    payouts: { title: "Payouts: call the number before the dealer" },
  },
  roulette: {
    inside: { title: "Inside bets: splits, streets and corners" },
    outside: { title: "Outside bets: what even money really pays" },
    payouts: { title: "Payouts: 35 to 1 and everything below" },
  },
  "video-poker": {
    "made-hands": { title: "Made hands: what to keep after the deal" },
    pairs: { title: "Pairs: low pair or four to a flush?" },
    "flush-draws": { title: "Flush draws: when four suited cards win" },
    "straight-draws": { title: "Straight draws: open-ended or inside?" },
    "high-cards": { title: "High cards: which ones to hold" },
  },
  baccarat: {
    "bet-choice": { title: "Banker or player: why the banker wins more" },
    "side-bets": { title: "Side bets: what the ties really cost" },
    payouts: { title: "Payouts: the banker's 5% commission" },
  },
};

const INTRO: Readonly<Record<GameId, Lesson>> = {
  blackjack: {
    title: "Basic strategy, one hand at a time",
    hand: {
      player: [
        ["10", "c"],
        ["6", "h"],
      ],
      dealer: ["10", "d"],
      caption: "Hard 16 vs 10  →  ?",
    },
  },
  craps: { title: "Craps: the pass line in five minutes" },
  roulette: { title: "Roulette: read the layout in five minutes" },
  "video-poker": { title: "Video poker: which cards to hold" },
  baccarat: { title: "Baccarat: banker, player and the third card" },
};

export interface UpNext {
  readonly eyebrow: string;
  readonly title: string;
  readonly why: string;
  readonly hand?: HandVisual;
  readonly game: GameId;
  readonly primaryLabel: string;
  readonly primaryHref: string;
  readonly secondaryLabel: string;
  readonly secondaryHref: string;
}

const unit = (game: GameId) =>
  game === "blackjack" || game === "video-poker"
    ? "hands"
    : game === "craps"
      ? "rolls"
      : game === "roulette"
        ? "spins"
        : "coups";

/** The Lobby hero: the weakest category when there is one, otherwise where to start. */
export function upNext(weak: WeakSpot | null, fallbackGame: GameId, started: boolean): UpNext {
  const kind = (g: GameId) => (g === "blackjack" ? "TRAINER" : "TABLE");
  if (weak) {
    const lesson = LESSONS[weak.game][weak.category] ?? { title: weak.label };
    const lead =
      weak.mistakesLastSession > 0
        ? `${weak.label} tripped you up ${weak.mistakesLastSession} ${weak.mistakesLastSession === 1 ? "time" : "times"} last session.`
        : `${weak.label} is your weakest spot at ${percent(weak.rate)}.`;
    return {
      eyebrow: `UP NEXT · ${GAME_NAMES[weak.game].toUpperCase()} ${kind(weak.game)}`,
      title: lesson.title,
      why: `${lead} Today's drill is 20 ${unit(weak.game)} built around it.`,
      hand: lesson.hand,
      game: weak.game,
      primaryLabel: "Resume training",
      primaryHref: TRAINER_ROUTE[weak.game],
      secondaryLabel: "Free play instead",
      secondaryHref: GAME_ROUTE[weak.game],
    };
  }
  const lesson = INTRO[fallbackGame];
  return {
    eyebrow: `${started ? "UP NEXT" : "START HERE"} · ${GAME_NAMES[fallbackGame].toUpperCase()} ${kind(fallbackGame)}`,
    title: lesson.title,
    why: started
      ? "No weak spot stands out yet. Keep playing and the coach will pick one for you."
      : "Every decision is graded on the spot, with the reason why. Twenty hands is enough to see where you stand.",
    hand: lesson.hand,
    game: fallbackGame,
    primaryLabel: started ? "Resume training" : "Start training",
    primaryHref: TRAINER_ROUTE[fallbackGame],
    secondaryLabel: "Free play instead",
    secondaryHref: GAME_ROUTE[fallbackGame],
  };
}

export interface DailyDrill {
  readonly game: GameId;
  readonly description: string;
  readonly minutes: number;
  readonly href: string;
}

const DRILLS: Readonly<Record<GameId, Omit<DailyDrill, "game" | "href">>> = {
  blackjack: {
    description:
      "20 soft-total hands against a dealer 7 through ace. The cells most players get wrong.",
    minutes: 5,
  },
  craps: {
    description:
      "20 craps payouts: place 6 and 8, odds on 4 and 10. Fast payout math is what dealers notice first.",
    minutes: 6,
  },
  roulette: {
    description: "20 spins: call the payout on every bet before the ball drops.",
    minutes: 5,
  },
  "video-poker": {
    description: "20 Jacks or Better deals with a low pair or four to a flush. Which do you hold?",
    minutes: 6,
  },
  baccarat: {
    description: "20 coups: call the third-card rule before the dealer does.",
    minutes: 4,
  },
};

/** Today's drill rotates through the player's games by weekday. */
export function dailyDrill(games: readonly GameId[], today: string): DailyDrill {
  const list = games.length ? games : (["blackjack"] as const);
  const game = list[weekdayMon(today) % list.length]!;
  return { game, href: TRAINER_ROUTE[game], ...DRILLS[game] };
}

// ---------------------------------------------------------------------------------------------
// Fixtures: the design's social and live surfaces, simulated in this build (ADR-0003).

export const LIVE_TABLES = [
  {
    game: "craps" as GameId,
    title: "Craps · Downtown rules",
    detail: "3-4-5x odds · Hosted by @rail_rita",
    seats: "6/8",
    href: "/live/craps",
  },
  {
    game: "blackjack" as GameId,
    title: "Blackjack · 6 deck, S17",
    detail: "Counting practice · coach on mistakes",
    seats: "5/7",
    href: "/live",
  },
  {
    game: "roulette" as GameId,
    title: "Roulette · European",
    detail: "La Partage · casual",
    seats: "9/12",
    href: "/live",
  },
] as const;

export const COMMUNITY = [
  { icon: "fork", text: "@mtn_mike forked “My trip plan”", time: "2h" },
  { icon: "upvote", text: "Hi-Lo notes by @shoe_reader reached 100 upvotes", time: "1d" },
  { icon: "trophy", text: "@vegas_val passed Basic Strategy, 100 in a row", time: "1d" },
] as const;

export const FOLLOWING = [
  {
    id: "basic-strategy",
    game: "blackjack" as GameId,
    title: "Basic Strategy · 6 deck, S17",
    meta: "Curated by Tableside",
    curated: true,
    action: "Practice",
    href: "/strategies/blackjack",
    practiceHref: "/drills/basic-strategy",
  },
  {
    id: "iron-cross",
    game: "craps" as GameId,
    title: "Iron Cross, explained",
    meta: "by @dicecontrol_dee · Forked from Classic Iron Cross by @rail_rita",
    curated: false,
    action: "Practice",
    href: "/strategies/craps",
    practiceHref: "/games/craps",
  },
  {
    id: "trip-plan",
    game: "craps" as GameId,
    title: "My trip plan: Pass + 2 Come",
    meta: "by you · draft · Forked from Iron Cross, explained by @dicecontrol_dee",
    curated: false,
    action: "Edit",
    href: "/strategies/craps",
    practiceHref: "/strategies/craps",
  },
] as const;
