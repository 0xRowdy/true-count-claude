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

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30, which Date.parse would roll over). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** The device's *local* calendar date as YYYY-MM-DD. Call it after mount, never during render. */
export function localIsoDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Trims a name and caps it at 40 characters without splitting a surrogate pair (emoji). */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return Array.from(value.trim()).slice(0, 40).join("");
}

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
  return normalizeProfile(data as Record<string, unknown>);
}

/** Cleans any profile-shaped value into a valid `PlayerProfile` (used on read and on write). */
export function normalizeProfile(d: Readonly<Record<string, unknown>>): PlayerProfile {
  const games = Array.isArray(d.games)
    ? GAMES.filter((g) => (d.games as unknown[]).includes(g))
    : DEFAULT_PROFILE.games;
  const name = cleanName(d.name);
  return {
    onboarded: d.onboarded === true,
    name,
    skill: pick(SKILLS, d.skill, DEFAULT_PROFILE.skill),
    goal: pick(GOALS, d.goal, DEFAULT_PROFILE.goal),
    games: games.length > 0 ? games : DEFAULT_PROFILE.games,
    coach: pick(COACH_LEVELS, d.coach, DEFAULT_PROFILE.coach),
    tripDate: isIsoDate(d.tripDate) ? d.tripDate : null,
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
 * Whole days from `today` to the trip (both ISO dates), or null without a trip date. Negative
 * once the trip has passed. Pass the player's *local* date (`localIsoDate(new Date())`), read
 * after mount, so the countdown is right in the evening and prerendered markup has no clock.
 */
export function daysUntilTrip(profile: PlayerProfile, today: string): number | null {
  if (!profile.tripDate || !isIsoDate(today)) return null;
  const ms = Date.parse(`${profile.tripDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

export type ProfileStatus = "loading" | "stored" | "default" | "unavailable";

export interface ProfileState {
  /** `DEFAULT_PROFILE` (plus any early changes) until storage answers. */
  readonly profile: PlayerProfile;
  /**
   * False until storage has answered. Screens wait for it before redirecting on `onboarded`
   * or greeting by name, so the default profile never flashes as the player's own.
   */
  readonly ready: boolean;
  /** "unavailable": storage failed; choices work for this launch but will not survive a restart. */
  readonly status: ProfileStatus;
}

export const INITIAL_PROFILE_STATE: ProfileState = {
  profile: DEFAULT_PROFILE,
  ready: false,
  status: "loading",
};

export interface ProfileStore {
  subscribe(listener: () => void): () => void;
  snapshot(): ProfileState;
  /** Reads storage once. Idempotent. */
  load(): Promise<void>;
  /** Merges a partial change. Before storage answers, the change waits and is applied on top of the stored profile. */
  update(change: Partial<PlayerProfile>): Promise<void>;
  /** Forgets the stored profile. */
  reset(): Promise<void>;
}

/**
 * The profile state machine, free of React and platform storage so it is testable in Node.
 *
 * Unlike the Rule Set (always replaced whole), profile changes are partial merges. A merge
 * made before the stored profile has loaded must not be written over the defaults: that would
 * erase a returning player's name, trip and onboarding. So early changes queue up and are
 * replayed on top of whatever storage returns, and nothing is written until then.
 */
export function createProfileStore(repo: ProfileRepository): ProfileStore {
  let state: ProfileState = INITIAL_PROFILE_STATE;
  const listeners = new Set<() => void>();
  let loading: Promise<void> | undefined;
  /** Changes made before storage answered, replayed on top of the stored profile. */
  let pendingReset = false;
  let pendingChange: Partial<PlayerProfile> | undefined;
  let writes: Promise<unknown> = Promise.resolve();

  const publish = (next: ProfileState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  /**
   * Queues a write. Callers queue *before* publishing, so a listener that reacts to the
   * publish with a newer change queues its write after this one and wins on disk.
   */
  const persist = (work: () => Promise<void>) => {
    writes = writes.then(work).catch(() => publish({ ...state, status: "unavailable" }));
    return writes.then(() => undefined);
  };
  const merge = (base: PlayerProfile, change: Partial<PlayerProfile>) =>
    normalizeProfile({ ...base, ...change });

  function load(): Promise<void> {
    loading ??= repo.load().then(
      (stored) => {
        const base = pendingReset ? DEFAULT_PROFILE : (stored ?? DEFAULT_PROFILE);
        const change = pendingChange;
        const reset = pendingReset;
        pendingChange = undefined;
        pendingReset = false;
        if (change) {
          const profile = merge(base, change);
          const saved = persist(() => repo.save(profile));
          publish({ profile, ready: true, status: "stored" });
          return saved;
        }
        if (reset) {
          const cleared = persist(() => repo.clear());
          publish({ profile: DEFAULT_PROFILE, ready: true, status: "default" });
          return cleared;
        }
        publish({ profile: base, ready: true, status: stored ? "stored" : "default" });
        return undefined;
      },
      () => {
        const profile = pendingChange ? merge(DEFAULT_PROFILE, pendingChange) : DEFAULT_PROFILE;
        pendingChange = undefined;
        pendingReset = false;
        publish({ profile, ready: true, status: "unavailable" });
      },
    );
    return loading;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
    load,
    update(change) {
      if (!state.ready) {
        pendingChange = { ...pendingChange, ...change };
        publish({ ...state, profile: merge(state.profile, change) });
        return load();
      }
      const profile = merge(state.profile, change);
      const saved = persist(() => repo.save(profile));
      publish({
        ...state,
        profile,
        status: state.status === "unavailable" ? "unavailable" : "stored",
      });
      return saved;
    },
    reset() {
      if (!state.ready) {
        pendingReset = true;
        pendingChange = undefined;
        publish({ ...state, profile: DEFAULT_PROFILE });
        return load();
      }
      const cleared = persist(() => repo.clear());
      publish({
        profile: DEFAULT_PROFILE,
        ready: true,
        status: state.status === "unavailable" ? "unavailable" : "default",
      });
      return cleared;
    },
  };
}
