import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, type PlayerProfile } from "@/state/profile";
import { addDays, minutesPerDay, shortDate, startingStops, tripLine } from "./startingPoint";

const p = (change: Partial<PlayerProfile>): PlayerProfile => ({ ...DEFAULT_PROFILE, ...change });

describe("startingStops", () => {
  it("matches the design for a trip, blackjack + craps, a few times, full guidance", () => {
    const stops = startingStops(
      p({ goal: "trip", skill: "few-times", games: ["blackjack", "craps"], coach: "every" }),
    );
    expect(stops).toEqual([
      {
        title: "Blackjack · How a hand plays",
        desc: "8 min · hand signals, when to touch chips",
        icon: "hand",
      },
      {
        title: "Blackjack · Basic strategy, hard totals",
        desc: "Coach on full guidance · eases off at 90%",
        icon: "cap",
      },
      {
        title: "Craps · Pass line & odds",
        desc: "The two bets that carry the lowest house edge",
        icon: "dice",
      },
    ]);
  });

  it("skips the basics for a regular player and goes deeper for mastery", () => {
    const stops = startingStops(p({ skill: "regular", goal: "master", games: ["blackjack"] }));
    expect(stops.map((s) => s.title)).toEqual([
      "Blackjack · Basic strategy, hard totals",
      "Blackjack · Hi-Lo counting",
      "Mixed drills",
    ]);
  });

  it("follows the first chosen game and the coach level", () => {
    const stops = startingStops(p({ games: ["baccarat"], coach: "asked" }));
    expect(stops[0]?.title).toBe("Baccarat · How a coup plays");
    expect(stops[1]?.desc).toBe("Coach stays quiet · ask for a hint any time");
    expect(stops).toHaveLength(3);
  });
});

describe("tripLine", () => {
  it("counts the days and paces the plan (design: Nov 14, 34 days, 10 minutes)", () => {
    expect(tripLine(p({ tripDate: "2026-11-14" }), "2026-10-11")).toEqual({
      title: "Trip on Nov 14 · 34 days away",
      detail: "About 10 minutes a day gets you there.",
    });
  });

  it("asks for a date only when the goal is a trip", () => {
    expect(tripLine(p({ goal: "trip", tripDate: null }), "2026-10-11")?.title).toBe(
      "No trip date yet",
    );
    expect(tripLine(p({ goal: "fun", tripDate: null }), "2026-10-11")).toBeNull();
  });

  it("does not count without today (prerender) and handles today and the past", () => {
    expect(tripLine(p({ tripDate: "2026-11-14" }), null)?.title).toBe("Trip on Nov 14");
    expect(tripLine(p({ tripDate: "2026-10-11" }), "2026-10-11")?.title).toBe(
      "Trip on Oct 11 · today",
    );
    expect(tripLine(p({ tripDate: "2026-10-01" }), "2026-10-11")?.title).toBe("Trip was on Oct 1");
    expect(tripLine(p({ tripDate: "2026-10-12" }), "2026-10-11")?.title).toBe(
      "Trip on Oct 12 · 1 day away",
    );
  });
});

describe("helpers", () => {
  it("formats dates without a locale and adds days across months and years", () => {
    expect(shortDate("2026-01-05")).toBe("Jan 5");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });

  it("keeps minutes a day between 5 and 30", () => {
    expect(minutesPerDay(1)).toBe(30);
    expect(minutesPerDay(34)).toBe(10);
    expect(minutesPerDay(365)).toBe(5);
  });
});
