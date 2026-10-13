import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../engine";
import { createMemoryStore } from "./store";
import {
  type BlackjackDraft,
  STRATEGIES_KEY,
  createDraftRepository,
  createDraftStore,
  normalizeDraft,
  parseDrafts,
  uniqueDraftId,
} from "./strategies";

const draft = (id: string, extra: Partial<BlackjackDraft> = {}): BlackjackDraft => ({
  id,
  game: "blackjack",
  title: `Draft ${id}`,
  forkedFrom: null,
  notes: {},
  savedAt: null,
  rules: DEFAULT_RULES,
  base: { rules: DEFAULT_RULES, cells: {} },
  cells: {},
  ...extra,
});

describe("parsing", () => {
  it("drops unusable drafts and fields, keeps the rest", () => {
    const raw = JSON.stringify({
      drafts: [
        draft("a", { cells: { "hard:16:10": "S", "hard:12:2": "Z" as never }, notes: { x: "", y: "ok" } }),
        { id: "b", game: "poker", title: "x" },
        draft("a"),
        { ...draft("c"), rules: { ...DEFAULT_RULES, decks: 99 } },
      ],
    });
    const parsed = parseDrafts(raw)!;
    expect(parsed.map((d) => d.id)).toEqual(["a"]);
    expect((parsed[0] as BlackjackDraft).cells).toEqual({ "hard:16:10": "S" });
    expect(parsed[0]?.notes).toEqual({ y: "ok" });
    expect(parseDrafts("not json")).toBeUndefined();
    expect(parseDrafts(null)).toBeUndefined();
  });

  it("caps notes at 160 characters", () => {
    const d = normalizeDraft(draft("a", { notes: { k: "x".repeat(200) } }));
    expect(d?.notes.k).toHaveLength(160);
  });

  it("finds a free id", () => {
    expect(uniqueDraftId("fork-x", [])).toBe("fork-x");
    expect(uniqueDraftId("fork-x", ["fork-x", "fork-x-2"])).toBe("fork-x-3");
  });
});

describe("the draft store", () => {
  it("loads, saves most-recent first, removes, and persists", async () => {
    const kv = createMemoryStore({ [STRATEGIES_KEY]: JSON.stringify({ drafts: [draft("old")] }) });
    const store = createDraftStore(createDraftRepository(kv));
    await store.load();
    expect(store.snapshot()).toMatchObject({ ready: true, status: "stored" });
    await store.save(draft("new"));
    expect(store.snapshot().drafts.map((d) => d.id)).toEqual(["new", "old"]);
    await store.save(draft("old", { title: "Renamed" }));
    expect(store.snapshot().drafts.map((d) => d.title)).toEqual(["Renamed", "Draft new"]);
    await store.remove("new");
    const again = createDraftStore(createDraftRepository(kv));
    await again.load();
    expect(again.snapshot().drafts.map((d) => d.id)).toEqual(["old"]);
  });

  it("an autosave before storage answers is replayed on top of stored drafts", async () => {
    const kv = createMemoryStore({ [STRATEGIES_KEY]: JSON.stringify({ drafts: [draft("kept")] }) });
    const store = createDraftStore(createDraftRepository(kv));
    const saving = store.save(draft("early"));
    expect(store.snapshot().ready).toBe(false);
    await saving;
    expect(store.snapshot().drafts.map((d) => d.id)).toEqual(["early", "kept"]);
    expect(parseDrafts(await kv.getItem(STRATEGIES_KEY))?.map((d) => d.id)).toEqual(["early", "kept"]);
  });

  it("keeps working in memory when storage fails", async () => {
    const broken = {
      load: () => Promise.reject(new Error("no storage")),
      save: () => Promise.reject(new Error("no storage")),
    };
    const store = createDraftStore(broken);
    await store.load();
    expect(store.snapshot().status).toBe("unavailable");
    await store.save(draft("a"));
    expect(store.snapshot()).toMatchObject({ status: "unavailable", drafts: [{ id: "a" }] });
  });
});
