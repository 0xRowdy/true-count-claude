import { describe, expect, it } from "vitest";
import { GAMES } from "@/state/profile";
import { DECISION_CATEGORIES } from "@/state/progress";
import {
  GAME_ROUTE,
  TRAINER_ROUTE,
  dailyDrill,
  gameList,
  greeting,
  percent,
  signedMoney,
  upNext,
} from "./copy";

describe("lobby copy", () => {
  it("greets by time of day, with or without a name", () => {
    expect(greeting(8, "Carol")).toBe("Good morning, Carol");
    expect(greeting(13, null)).toBe("Good afternoon");
    expect(greeting(19, "Carol")).toBe("Good evening, Carol");
    expect(greeting(2, null)).toBe("Good evening");
  });

  it("lists games and formats numbers", () => {
    expect(gameList(["blackjack"])).toBe("blackjack");
    expect(gameList(["blackjack", "craps"])).toBe("blackjack and craps");
    expect(gameList(["blackjack", "craps", "video-poker"])).toBe(
      "blackjack, craps and video poker",
    );
    expect(percent(null)).toBe("—");
    expect(percent(0.942, 1)).toBe("94.2%");
    expect(signedMoney(150)).toBe("+$150");
    expect(signedMoney(-1035)).toBe("−$1,035");
    expect(signedMoney(0)).toBe("$0");
  });

  it("routes every game per the route map", () => {
    expect(GAME_ROUTE.blackjack).toBe("/play");
    expect(TRAINER_ROUTE.blackjack).toBe("/drills/basic-strategy");
    for (const g of GAMES.filter((x) => x !== "blackjack"))
      expect(GAME_ROUTE[g]).toBe(`/games/${g}`);
  });

  it("builds the Up next hero from a weak spot", () => {
    const u = upNext(
      {
        game: "blackjack",
        category: "soft",
        label: "Soft totals",
        rate: 0.86,
        total: 40,
        mistakesLastSession: 3,
      },
      "blackjack",
      true,
    );
    expect(u).toMatchObject({
      eyebrow: "UP NEXT · BLACKJACK TRAINER",
      title: "Soft totals: when an Ace means double",
      why: "Soft totals tripped you up 3 times last session. Today's drill is 20 hands built around it.",
      primaryHref: "/drills/basic-strategy",
      secondaryHref: "/play",
    });
    expect(u.hand?.caption).toContain("Soft 18 vs 9");
    const c = upNext(
      {
        game: "craps",
        category: "odds",
        label: "Odds",
        rate: 0.7,
        total: 12,
        mistakesLastSession: 0,
      },
      "blackjack",
      true,
    );
    expect(c.eyebrow).toBe("UP NEXT · CRAPS TABLE");
    expect(c.why).toBe(
      "Odds is your weakest spot at 70%. Today's drill is 20 rolls built around it.",
    );
    expect(c.primaryHref).toBe("/games/craps");
  });

  it("has a lesson for every category, and a start-here hero for new players", () => {
    for (const g of GAMES) {
      for (const cat of DECISION_CATEGORIES[g]) {
        const u = upNext(
          {
            game: g,
            category: cat.id,
            label: cat.label,
            rate: 0.5,
            total: 10,
            mistakesLastSession: 1,
          },
          g,
          true,
        );
        expect(u.title).not.toBe(cat.label);
      }
    }
    const fresh = upNext(null, "roulette", false);
    expect(fresh.eyebrow).toBe("START HERE · ROULETTE TABLE");
    expect(fresh.primaryLabel).toBe("Start training");
  });

  it("rotates today's drill through the player's games by weekday", () => {
    expect(dailyDrill(["blackjack", "craps"], "2026-10-12").game).toBe("blackjack"); // Monday
    expect(dailyDrill(["blackjack", "craps"], "2026-10-13").game).toBe("craps");
    expect(dailyDrill([], "2026-10-13")).toMatchObject({
      game: "blackjack",
      href: "/drills/basic-strategy",
    });
  });
});
