import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  PROFILE_KEY,
  type PlayerProfile,
  createProfileRepository,
  createProfileStore,
  daysUntilTrip,
  isIsoDate,
  localIsoDate,
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

describe("createProfileStore", () => {
  /** A repository whose load resolves only when the test says so. */
  function slowRepo(stored: PlayerProfile | undefined) {
    const kv = createMemoryStore(stored ? { [PROFILE_KEY]: JSON.stringify(stored) } : {});
    const repo = createProfileRepository(kv);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    return {
      kv,
      release,
      repo: { ...repo, load: async () => (await gate, repo.load()) },
    };
  }

  it("starts loading, then publishes the stored profile", async () => {
    const store = createProfileStore(
      createProfileRepository(createMemoryStore({ [PROFILE_KEY]: JSON.stringify(carol) })),
    );
    expect(store.snapshot()).toEqual({ profile: DEFAULT_PROFILE, ready: false, status: "loading" });
    await store.load();
    expect(store.snapshot()).toEqual({ profile: carol, ready: true, status: "stored" });
  });

  it("applies a change made before the load on top of the stored profile, never over the defaults", async () => {
    const { kv, release, repo } = slowRepo(carol);
    const store = createProfileStore(repo);
    const updating = store.update({ coach: "asked" });
    expect(store.snapshot().ready).toBe(false);
    release();
    await updating;
    const expected = { ...carol, coach: "asked" as const };
    expect(store.snapshot()).toEqual({ profile: expected, ready: true, status: "stored" });
    expect(parseProfile(await kv.getItem(PROFILE_KEY))).toEqual(expected);
  });

  it("an early reset then an early change start from the defaults", async () => {
    const { kv, release, repo } = slowRepo(carol);
    const store = createProfileStore(repo);
    void store.reset();
    const updating = store.update({ name: "Dee" });
    release();
    await updating;
    expect(store.snapshot().profile).toEqual({ ...DEFAULT_PROFILE, name: "Dee" });
    expect(parseProfile(await kv.getItem(PROFILE_KEY))?.name).toBe("Dee");
  });

  it("an early change then an early reset clears the stored profile", async () => {
    const { kv, release, repo } = slowRepo(carol);
    const store = createProfileStore(repo);
    void store.update({ name: "Dee" });
    const resetting = store.reset();
    release();
    await resetting;
    expect(store.snapshot()).toEqual({ profile: DEFAULT_PROFILE, ready: true, status: "default" });
    expect(await kv.getItem(PROFILE_KEY)).toBeNull();
  });

  it("a listener's synchronous follow-up change is the one that lands on disk", async () => {
    const kv = createMemoryStore();
    const store = createProfileStore(createProfileRepository(kv));
    await store.load();
    let followed = false;
    store.subscribe(() => {
      if (followed) return;
      followed = true;
      void store.update({ coach: "every" });
    });
    await store.update({ coach: "asked" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(parseProfile(await kv.getItem(PROFILE_KEY))?.coach).toBe("every");
  });

  it("normalises writes the same way it normalises reads", async () => {
    const store = createProfileStore(createProfileRepository(createMemoryStore()));
    await store.load();
    await store.update({ games: [], name: "   ", tripDate: "2026-02-30" });
    expect(store.snapshot().profile).toEqual({ ...DEFAULT_PROFILE, name: null, tripDate: null });
  });

  it("reports unavailable storage instead of failing silently", async () => {
    const broken = {
      load: () => Promise.reject(new Error("no storage")),
      save: () => Promise.reject(new Error("no storage")),
      clear: () => Promise.reject(new Error("no storage")),
    };
    const store = createProfileStore(broken);
    await store.load();
    expect(store.snapshot()).toMatchObject({ ready: true, status: "unavailable" });
    await store.update({ onboarded: true });
    expect(store.snapshot()).toMatchObject({ status: "unavailable", profile: { onboarded: true } });
  });

  it("reset forgets the stored profile", async () => {
    const kv = createMemoryStore({ [PROFILE_KEY]: JSON.stringify(carol) });
    const store = createProfileStore(createProfileRepository(kv));
    await store.load();
    await store.reset();
    expect(store.snapshot()).toEqual({ profile: DEFAULT_PROFILE, ready: true, status: "default" });
    expect(await kv.getItem(PROFILE_KEY)).toBeNull();
  });

  it("notifies subscribers", async () => {
    const store = createProfileStore(createProfileRepository(createMemoryStore()));
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    await store.load();
    unsubscribe();
    await store.update({ goal: "fun" });
    expect(calls).toBe(1);
  });
});

describe("dates", () => {
  it("rejects impossible calendar dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(parseProfile(JSON.stringify({ tripDate: "2026-04-31" }))?.tripDate).toBeNull();
  });

  it("formats the local calendar date, not the UTC one", () => {
    expect(localIsoDate(new Date(2026, 9, 11, 23, 30))).toBe("2026-10-11");
    expect(localIsoDate(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
  });

  it("is negative once the trip has passed", () => {
    expect(daysUntilTrip(carol, "2026-11-20")).toBe(-6);
  });

  it("never splits an emoji when capping the name", () => {
    const name = `${"a".repeat(39)}😀😀`;
    expect(parseProfile(JSON.stringify({ name }))?.name).toBe(`${"a".repeat(39)}😀`);
  });
});
