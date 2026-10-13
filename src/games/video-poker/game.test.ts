import { describe, expect, it } from "vitest";
import { cardId } from "../../engine/cards";
import { createRng } from "../../engine/rng";
import {
  DEFAULT_VIDEO_POKER_SETTINGS,
  assertValidSettings,
  betCents,
  dealRound,
  drawRound,
  setHolds,
  settleHand,
  toggleHold,
  type VideoPokerSettings,
} from "./game";
import { getPayTable } from "./paytables";
import { cards } from "./test-helpers";

const ids = (list: readonly { rank: string; suit: string }[]) =>
  list.map((c) => cardId(c as never)).join(" ");

describe("dealRound", () => {
  it("is reproducible from its seed (ADR-0004)", () => {
    const a = dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(42));
    const b = dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(42));
    expect(ids(a.dealt)).toBe(ids(b.dealt));
    expect(ids(a.stub)).toBe(ids(b.stub));
    const c = dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(43));
    expect(ids(c.dealt)).not.toBe(ids(a.dealt));
  });

  it("deals five from one full 52-card deck, nothing held", () => {
    const round = dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(1));
    expect(round.phase).toBe("dealt");
    expect(round.dealt).toHaveLength(5);
    expect(round.stub).toHaveLength(47);
    expect(new Set([...round.dealt, ...round.stub].map(cardId)).size).toBe(52);
    expect(round.held).toEqual([false, false, false, false, false]);
  });

  it("deals every card about equally often over many seeded hands", () => {
    const seen = new Map<string, number>();
    const rng = createRng(99);
    const hands = 5200;
    for (let i = 0; i < hands; i++) {
      for (const card of dealRound(DEFAULT_VIDEO_POKER_SETTINGS, rng).dealt) {
        seen.set(cardId(card), (seen.get(cardId(card)) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(52);
    // Expected 500 each; ±5 standard deviations is ~±108.
    for (const count of seen.values()) expect(Math.abs(count - 500)).toBeLessThan(110);
  });
});

describe("holding and drawing", () => {
  it("replaces only the cards not held, in stub order, keeping screen positions", () => {
    let round = dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(5));
    round = toggleHold(round, 1);
    round = toggleHold(round, 3);
    round = toggleHold(round, 3);
    round = toggleHold(round, 4);
    expect(round.held).toEqual([false, true, false, false, true]);
    const drawn = drawRound(round);
    expect(drawn.phase).toBe("drawn");
    expect(drawn.final[1]).toEqual(round.dealt[1]);
    expect(drawn.final[4]).toEqual(round.dealt[4]);
    expect([drawn.final[0], drawn.final[2], drawn.final[3]]).toEqual(round.stub.slice(0, 3));
  });

  it("keeps all five when all are held", () => {
    const round = setHolds(dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(5)), [
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(drawRound(round).final).toEqual(round.dealt);
  });

  it("does not mutate the round it was given", () => {
    const round = dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(5));
    toggleHold(round, 0);
    expect(round.held[0]).toBe(false);
  });

  it("rejects bad positions and flag arrays", () => {
    const round = dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(5));
    expect(() => toggleHold(round, 5)).toThrow(RangeError);
    expect(() => toggleHold(round, -1)).toThrow(RangeError);
    expect(() => setHolds(round, [true])).toThrow(RangeError);
  });

  it("settles the draw against the pay table", () => {
    const drawn = drawRound(dealRound(DEFAULT_VIDEO_POKER_SETTINGS, createRng(5)));
    const table = getPayTable("job-9-6");
    expect(settleHand(table, drawn.final, DEFAULT_VIDEO_POKER_SETTINGS).result).toBe(drawn.result);
    expect(drawn.netCents).toBe(drawn.winCents - 500);
  });
});

describe("settleHand", () => {
  const table = getPayTable("job-9-6");
  const dollar = { coins: 5, denominationCents: 100 };

  it("pays the royal jackpot at five coins", () => {
    expect(settleHand(table, cards("Ah Kh Qh Jh Th"), dollar)).toEqual({
      result: "royal-flush",
      coinsWon: 4000,
      winCents: 400_000,
      netCents: 399_500,
    });
  });

  it("pays a high pair even money (your bet back)", () => {
    expect(settleHand(table, cards("Jc Jd 5h 3s 2c"), dollar)).toMatchObject({
      coinsWon: 5,
      netCents: 0,
    });
  });

  it("loses the stake on nothing", () => {
    expect(settleHand(table, cards("5h 5s 9h Qh 2h"), dollar)).toMatchObject({
      result: "nothing",
      coinsWon: 0,
      netCents: -500,
    });
  });

  it("scales by denomination", () => {
    expect(settleHand(table, cards("2h 7h 9h Jh Kh"), { coins: 3, denominationCents: 25 })).toEqual(
      { result: "flush", coinsWon: 18, winCents: 450, netCents: 375 },
    );
  });

  it("evaluates Deuces Wild with wild deuces", () => {
    const deuces = getPayTable("deuces-wild-full-pay");
    expect(settleHand(deuces, cards("2h 2c 9d 9s Kh"), dollar)).toMatchObject({
      result: "four-of-a-kind",
      coinsWon: 25,
    });
  });
});

describe("settings", () => {
  it("defaults to the design's machine: 9/6 Jacks or Better, 5 coins × $1", () => {
    expect(DEFAULT_VIDEO_POKER_SETTINGS).toEqual({
      payTableId: "job-9-6",
      coins: 5,
      denominationCents: 100,
    });
    expect(betCents(DEFAULT_VIDEO_POKER_SETTINGS)).toBe(500);
  });

  it.each<[string, Partial<VideoPokerSettings>]>([
    ["zero coins", { coins: 0 }],
    ["six coins", { coins: 6 }],
    ["fractional denomination", { denominationCents: 2.5 }],
    ["zero denomination", { denominationCents: 0 }],
  ])("rejects %s", (_, patch) => {
    expect(() => assertValidSettings({ ...DEFAULT_VIDEO_POKER_SETTINGS, ...patch })).toThrow(
      RangeError,
    );
    expect(() => dealRound({ ...DEFAULT_VIDEO_POKER_SETTINGS, ...patch }, createRng(1))).toThrow(
      RangeError,
    );
  });
});
