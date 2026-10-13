/**
 * "Your starting point": the first three lessons onboarding proposes, derived from the
 * player's answers. Pure (no React, no clock): the caller passes today's date, read after mount.
 */

import {
  daysUntilTrip,
  GAME_NAMES,
  type CoachLevel,
  type GameId,
  type Goal,
  type PlayerProfile,
  type Skill,
} from "@/state/profile";

export type StopIcon = "hand" | "cap" | "dice" | "cards" | "target";

export interface Stop {
  title: string;
  desc: string;
  icon: StopIcon;
}

interface Lesson {
  name: string;
  desc: string;
  icon: StopIcon;
}

/** Per game: how a hand plays, the core strategy, and the next step up. */
const LESSONS: Record<GameId, { intro: Lesson; core: Lesson; advanced: Lesson }> = {
  blackjack: {
    intro: {
      name: "How a hand plays",
      desc: "8 min · hand signals, when to touch chips",
      icon: "hand",
    },
    core: {
      name: "Basic strategy, hard totals",
      desc: "Every hard total against every dealer card",
      icon: "cap",
    },
    advanced: {
      name: "Hi-Lo counting",
      desc: "Running count to true count, then the index plays",
      icon: "target",
    },
  },
  craps: {
    intro: {
      name: "How a roll plays",
      desc: "6 min · the come-out, the point, when to bet",
      icon: "hand",
    },
    core: {
      name: "Pass line & odds",
      desc: "The two bets that carry the lowest house edge",
      icon: "dice",
    },
    advanced: {
      name: "Place bets and systems",
      desc: "What each system costs you per roll",
      icon: "target",
    },
  },
  roulette: {
    intro: {
      name: "How a spin plays",
      desc: "5 min · colour chips, the dolly, when bets close",
      icon: "hand",
    },
    core: {
      name: "Inside and outside bets",
      desc: "Every bet type and exactly what it pays",
      icon: "cap",
    },
    advanced: {
      name: "Single zero and La Partage",
      desc: "Why the wheel you pick matters more than any system",
      icon: "target",
    },
  },
  "video-poker": {
    intro: {
      name: "How a hand plays",
      desc: "5 min · deal, hold, draw and the pay table",
      icon: "hand",
    },
    core: {
      name: "Jacks or Better holds",
      desc: "The holds that matter on a 9/6 machine",
      icon: "cards",
    },
    advanced: {
      name: "Every pay table",
      desc: "Deuces Wild and Double Double holds",
      icon: "target",
    },
  },
  baccarat: {
    intro: {
      name: "How a coup plays",
      desc: "5 min · player, banker, who draws",
      icon: "hand",
    },
    core: {
      name: "Banker, player, tie",
      desc: "Why banker is the best bet on the table",
      icon: "cards",
    },
    advanced: {
      name: "Third-card rules",
      desc: "When each hand draws, and the side-bet odds",
      icon: "target",
    },
  },
};

/** What the coach does on the first strategy lesson, per "How often the coach speaks up". */
export const COACH_LINE: Record<CoachLevel, string> = {
  every: "Coach on full guidance · eases off at 90%",
  mistakes: "Coach steps in on mistakes · explains each one",
  asked: "Coach stays quiet · ask for a hint any time",
};

export const GOAL_TITLE: Record<Goal, string> = {
  fun: "Straight to the tables",
  trip: "Table-ready for your trip",
  master: "Strategy, drilled until automatic",
};

export const SKILL_LABEL: Record<Skill, string> = {
  new: "I'm brand new",
  "few-times": "I've played a few times",
  regular: "I play regularly",
};

const stop = (game: GameId, lesson: Lesson, desc = lesson.desc): Stop => ({
  title: `${GAME_NAMES[game]} · ${lesson.name}`,
  desc,
  icon: lesson.icon,
});

/** The three lessons for these answers. */
export function startingStops(profile: PlayerProfile): Stop[] {
  const first = profile.games[0] ?? "blackjack";
  const second = profile.games[1];
  const main = LESSONS[first];
  const core = stop(first, main.core, COACH_LINE[profile.coach]);
  const beginner = profile.skill !== "regular" && profile.goal !== "master";
  const lead = beginner ? [stop(first, main.intro), core] : [core, stop(first, main.advanced)];
  const third = second
    ? stop(second, beginner ? LESSONS[second].core : LESSONS[second].advanced)
    : stop(first, beginner ? main.advanced : main.intro);
  // A regular player with one game does not need "how a hand plays"; drill mixed decisions.
  if (!second && !beginner) {
    return [
      ...lead,
      { title: "Mixed drills", desc: "Every chart, weighted to your misses", icon: "target" },
    ];
  }
  return [...lead, third];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 14" from an ISO date, without a locale (identical on server and client). */
export function shortDate(iso: string): string {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Minutes a day that cover the plan (about 5 hours of play) before the trip, in 5s, 5–30. */
export function minutesPerDay(days: number): number {
  return Math.min(30, Math.max(5, Math.ceil(300 / Math.max(1, days) / 5) * 5));
}

export interface TripLine {
  title: string;
  detail: string;
}

/** The trip row of the panel, or null when there is nothing to say about a trip. */
export function tripLine(profile: PlayerProfile, today: string | null): TripLine | null {
  if (!profile.tripDate) {
    return profile.goal === "trip"
      ? { title: "No trip date yet", detail: "Add one and we'll pace the plan to it." }
      : null;
  }
  const date = shortDate(profile.tripDate);
  const days = today ? daysUntilTrip(profile, today) : null;
  if (days === null) return { title: `Trip on ${date}`, detail: "We'll pace the plan to it." };
  if (days < 0)
    return { title: `Trip was on ${date}`, detail: "Pick a new date for the next one." };
  if (days === 0)
    return { title: `Trip on ${date} · today`, detail: "A few warm-up hands are plenty." };
  const away = days === 1 ? "1 day away" : `${days} days away`;
  return {
    title: `Trip on ${date} · ${away}`,
    detail: `About ${minutesPerDay(days)} minutes a day gets you there.`,
  };
}

/** ISO date `days` after `today` (both local calendar dates). */
export function addDays(today: string, days: number): string {
  const ms = Date.parse(`${today}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
