import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { Platform, Share } from "react-native";
import type { LeaderboardMode, LiveTableState } from "@/games/craps";
import type { ChipValue } from "@/ui/ds/format";
import {
  BET_WINDOW_SECONDS,
  type Notice,
  type Spot,
  type Step,
  FIXTURE_SEED,
  addOdds,
  botReply,
  closeBets,
  openingTable,
  parseSeed,
  placeYourBet,
  postChat,
  reseed,
  specFor,
} from "./session";

/** The chips in the design's rack, smallest first. */
export const RACK_CHIPS: readonly ChipValue[] = [5, 25, 100, 500];

interface UiState {
  readonly table: LiveTableState;
  readonly notice: Notice | null;
  readonly chip: ChipValue;
  readonly mode: LeaderboardMode;
  readonly muted: boolean;
  /** Seconds left in the betting window; null until the timer starts (after mount). */
  readonly secondsLeft: number | null;
  /** `?pace=manual`: bets close only on Confirm (a deterministic test hook). */
  readonly manual: boolean;
  /** One-line status for Invite / Report, shown in place. */
  readonly status: string | null;
}

type Action =
  | { type: "start"; seed: number; manual: boolean }
  | { type: "step"; step: Step }
  | { type: "place"; spot: Spot }
  | { type: "odds" }
  | { type: "close" }
  | { type: "tick" }
  | { type: "chat"; text: string }
  | { type: "reply"; text: string }
  | { type: "chip"; chip: ChipValue }
  | { type: "mode"; mode: LeaderboardMode }
  | { type: "mute" }
  | { type: "status"; text: string | null };

function rolled(s: UiState): UiState {
  const step = closeBets(s.table);
  return {
    ...s,
    table: step.state,
    notice: step.notice,
    secondsLeft: s.secondsLeft === null ? null : BET_WINDOW_SECONDS,
  };
}

function reducer(s: UiState, a: Action): UiState {
  switch (a.type) {
    case "start":
      return {
        ...s,
        table: reseed(s.table, a.seed),
        manual: a.manual,
        secondsLeft: BET_WINDOW_SECONDS,
      };
    case "step":
      return { ...s, table: a.step.state, notice: a.step.notice };
    case "place": {
      const step = placeYourBet(s.table, specFor(a.spot, s.chip));
      return { ...s, table: step.state, notice: step.notice };
    }
    case "odds": {
      const step = addOdds(s.table, s.chip);
      return { ...s, table: step.state, notice: step.notice };
    }
    case "close":
      return rolled(s);
    case "tick": {
      if (s.secondsLeft === null || s.manual) return s;
      if (s.secondsLeft <= 1) return rolled(s);
      return { ...s, secondsLeft: s.secondsLeft - 1 };
    }
    case "chat":
      return { ...s, table: postChat(s.table, a.text) };
    case "reply":
      return { ...s, table: botReply(s.table, a.text) };
    case "chip":
      return { ...s, chip: a.chip };
    case "mode":
      return { ...s, mode: a.mode };
    case "mute":
      return { ...s, muted: !s.muted };
    case "status":
      return { ...s, status: a.text };
  }
}

function initial(): UiState {
  return {
    table: openingTable(FIXTURE_SEED),
    notice: null,
    chip: 25,
    mode: "decisions",
    muted: false,
    secondsLeft: null,
    manual: false,
    status: null,
  };
}

/** The invite link: this table's route on the current host. */
function inviteUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/live/craps`;
  }
  return "/live/craps";
}

/**
 * Holds the simulated live table in React state.
 *
 * The first render is the design's opening table on the fixture seed, identical to the
 * prerendered HTML. Only after mount is the real seed chosen (`?seed=` or a fresh draw) and
 * the betting timer started, so neither randomness nor the clock can cause a hydration
 * mismatch.
 */
export function useLiveCraps() {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const params = useLocalSearchParams<{ seed?: string; pace?: string }>();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // After mount: pick the seed, start the clock.
  const seedParam = params.seed;
  const paceParam = params.pace;
  useEffect(() => {
    const seed = parseSeed(seedParam) ?? Math.floor(Math.random() * 0xffffffff) >>> 0;
    dispatch({ type: "start", seed, manual: paceParam === "manual" });
  }, [seedParam, paceParam]);

  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "tick" }), 1000);
    const pending = timers.current;
    return () => {
      clearInterval(id);
      pending.forEach(clearTimeout);
    };
  }, []);

  const later = useCallback((ms: number, f: () => void) => {
    timers.current.push(setTimeout(f, ms));
  }, []);

  const say = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      dispatch({ type: "chat", text: trimmed });
      later(900, () => dispatch({ type: "reply", text: trimmed }));
    },
    [later],
  );

  const flash = useCallback(
    (text: string) => {
      dispatch({ type: "status", text });
      later(4000, () => dispatch({ type: "status", text: null }));
    },
    [later],
  );

  const invite = useCallback(async () => {
    const url = inviteUrl();
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(url);
        flash("Invite link copied. Friends get their own practice table.");
      } else {
        await Share.share({ message: `Practice craps with me on Tableside: ${url}` });
      }
    } catch {
      flash(`Copy this link to invite a friend: ${url}`);
    }
  }, [flash]);

  return {
    ...state,
    place: (spot: Spot) => dispatch({ type: "place", spot }),
    addOdds: () => dispatch({ type: "odds" }),
    confirm: () => dispatch({ type: "close" }),
    setChip: (chip: ChipValue) => dispatch({ type: "chip", chip }),
    setMode: (mode: LeaderboardMode) => dispatch({ type: "mode", mode }),
    toggleMute: () => dispatch({ type: "mute" }),
    say,
    invite,
    flash,
  };
}

export type LiveCraps = ReturnType<typeof useLiveCraps>;
