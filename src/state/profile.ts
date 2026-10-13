/**
 * The player profile: what onboarding asks, and what the rest of the app tailors itself to.
 *
 * Local only, no account (invariant 8). It holds the player's goal, the games they plan to
 * play, how often the coach speaks up, and an optional trip date. Nothing here is personal
 * beyond a first name the player may choose to give.
 *
 * Pure: parsing and serialisation run in plain Node against `createMemoryStore()`. The React
 * binding lives in `src/ui/profile/profileStore.ts`.
 *
 * Reads are paranoid, as for the Rule Set: an unrecognised field value drops that field back
 * to its default rather than letting a half-valid profile through.
 */

import type { KeyValueStore } from "./store";

export const GAMES = ["blackjack", "craps", "roulette", "video-poker", "baccarat"] as const;
export type GameId = (typeof GAMES)[number];

export const GAME_NAMES: Readonly<Record<GameId, string>> = {
  blackjack: "Blackjack",
  craps: "Craps",
  roulette: "Roulette",
  "video-poker": "Video Poker",
  baccarat: "Baccarat",
};

export const GOALS = ["fun", "trip", "master"] as const;
export type Goal = (typeof GOALS)[number];

export const SKILLS = ["new", "few-times", "regular"] as const;
export type Skill = (typeof SKILLS)[number];

/** How often the coach speaks up: "Only if asked" / "On mistakes" / "Every decision". */
export const COACH_LEVELS = ["asked", "mistakes", "every"] as const;
export type CoachLevel = (typeof COACH_LEVELS)[number];

export interface PlayerProfile {
  /** True once the player finished (or skipped) onboarding. */
  readonly onboarded: boolean;
  readonly name: string | null;
  readonly skill: Skill;
  readonly goal: Goal;
  readonly games: readonly GameId[];
  readonly coach: CoachLevel;
  /** ISO calendar date (YYYY-MM-DD) of the planned trip, if any. */
  readonly tripDate: string | null;
}

export const DEFAULT_PROFILE: PlayerProfile = {
  onboarded: false,
  name: null,
  skill: "few-times",
  goal: "trip",
  games: ["blackjack"],
  coach: "mistakes",
  tripDate: null,
};

export const PROFILE_KEY = "tableside/profile/v1";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Parses a stored profile. Never throws; unknown or invalid fields fall back to defaults. */
export function parseProfile(raw: string | null): PlayerProfile | undefined {
  if (raw === null) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== "object" || data === null) return undefined;
  const d = data as Record<string, unknown>;
  const games = Array.isArray(d.games)
    ? GAMES.filter((g) => (d.games as unknown[]).includes(g))
    : DEFAULT_PROFILE.games;
  const name =
    typeof d.name === "string" && d.name.trim() !== "" ? d.name.trim().slice(0, 40) : null;
  return {
    onboarded: d.onboarded === true,
    name,
    skill: pick(SKILLS, d.skill, DEFAULT_PROFILE.skill),
    goal: pick(GOALS, d.goal, DEFAULT_PROFILE.goal),
    games: games.length > 0 ? games : DEFAULT_PROFILE.games,
    coach: pick(COACH_LEVELS, d.coach, DEFAULT_PROFILE.coach),
    tripDate: typeof d.tripDate === "string" && ISO_DATE.test(d.tripDate) ? d.tripDate : null,
  };
}

export interface ProfileRepository {
  load(): Promise<PlayerProfile | undefined>;
  save(profile: PlayerProfile): Promise<void>;
  clear(): Promise<void>;
}

export function createProfileRepository(kv: KeyValueStore): ProfileRepository {
  return {
    load: async () => parseProfile(await kv.getItem(PROFILE_KEY)),
    save: (profile) => kv.setItem(PROFILE_KEY, JSON.stringify(profile)),
    clear: () => kv.removeItem(PROFILE_KEY),
  };
}

/**
 * Whole days from `today` to the trip (both ISO dates), or null without a trip date.
 * The caller supplies `today`, read after mount, so prerendered markup never depends on a clock.
 */
export function daysUntilTrip(profile: PlayerProfile, today: string): number | null {
  if (!profile.tripDate || !ISO_DATE.test(today)) return null;
  const ms = Date.parse(`${profile.tripDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}
