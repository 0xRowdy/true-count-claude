import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  PROFILE_KEY,
  type PlayerProfile,
  createProfileRepository,
  daysUntilTrip,
  parseProfile,
} from "./profile";
import { createMemoryStore } from "./store";

const carol: PlayerProfile = {
  onboarded: true,
  name: "Carol",
  skill: "few-times",
  goal: "trip",
  games: ["blackjack", "craps"],
  coach: "every",
  tripDate: "2026-11-14",
};

describe("parseProfile", () => {
  it("returns undefined for nothing stored or unreadable JSON", () => {
    expect(parseProfile(null)).toBeUndefined();
    expect(parseProfile("{nope")).toBeUndefined();
    expect(parseProfile("42")).toBeUndefined();
  });

  it("round-trips a full profile", () => {
    expect(parseProfile(JSON.stringify(carol))).toEqual(carol);
  });

  it("drops invalid fields back to their defaults", () => {
    const parsed = parseProfile(
      JSON.stringify({ onboarded: "yes", goal: "gamble", coach: 3, tripDate: "Nov 14", games: [] }),
    );
    expect(parsed).toEqual({ ...DEFAULT_PROFILE, onboarded: false });
  });

  it("keeps only known games, in canonical order, and trims the name", () => {
    const parsed = parseProfile(
      JSON.stringify({ games: ["craps", "keno", "blackjack"], name: "  Al " }),
    );
    expect(parsed?.games).toEqual(["blackjack", "craps"]);
    expect(parsed?.name).toBe("Al");
  });
});

describe("profile repository", () => {
  it("saves, loads and clears", async () => {
    const kv = createMemoryStore();
    const repo = createProfileRepository(kv);
    expect(await repo.load()).toBeUndefined();
    await repo.save(carol);
    expect(await kv.getItem(PROFILE_KEY)).not.toBeNull();
    expect(await repo.load()).toEqual(carol);
    await repo.clear();
    expect(await repo.load()).toBeUndefined();
  });
});

describe("daysUntilTrip", () => {
  it("counts whole days to the trip", () => {
    expect(daysUntilTrip(carol, "2026-10-11")).toBe(34);
    expect(daysUntilTrip(carol, "2026-11-14")).toBe(0);
  });

  it("is null without a trip or with a malformed today", () => {
    expect(daysUntilTrip(DEFAULT_PROFILE, "2026-10-11")).toBeNull();
    expect(daysUntilTrip(carol, "today")).toBeNull();
  });
});
