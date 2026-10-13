import { describe, expect, it } from "vitest";
import { RANKS, SUITS } from "@/engine/cards";
import {
  CHIP_VALUES,
  cardLabel,
  chipSpotPaths,
  diePips,
  ringSegmentPath,
  chipColors,
  chipLabel,
  clampProgress,
  formatMoney,
  formatThousands,
  initials,
  suitColor,
  suitGlyph,
} from "./format";
import { colors, penVariables } from "./tokens";

describe("chips", () => {
  it("labels every denomination as the design does", () => {
    expect(CHIP_VALUES.map(chipLabel)).toEqual(["1", "5", "25", "100", "500", "1K"]);
  });

  it("collapses only whole thousands", () => {
    expect(chipLabel(5000)).toBe("5K");
    expect(chipLabel(2500)).toBe("2500");
  });

  it("uses dark ink on the light chips only", () => {
    expect(chipColors(1)).toEqual({ fill: colors.chip1, ink: "#1E1A14" });
    expect(chipColors(1000).ink).toBe("#1E1A14");
    for (const value of [5, 25, 100, 500] as const) expect(chipColors(value).ink).toBe("#FFFFFF");
  });
});

describe("numbers", () => {
  it("groups thousands without locale APIs", () => {
    expect(formatThousands(12450)).toBe("12,450");
    expect(formatThousands(999)).toBe("999");
    expect(formatThousands(1234567.5)).toBe("1,234,567.5");
    expect(formatThousands(-2000)).toBe("-2,000");
  });

  it("formats money", () => {
    expect(formatMoney(2450)).toBe("$2,450");
    expect(formatMoney(-75)).toBe("-$75");
    expect(formatMoney(2591.5)).toBe("$2,591.50");
    expect(formatMoney(0.1 + 0.2)).toBe("$0.30");
    expect(formatMoney(-0.001)).toBe("$0");
  });

  it("clamps progress", () => {
    expect(clampProgress(1.4)).toBe(1);
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(0.86)).toBe(0.86);
  });
});

describe("cards", () => {
  it("names every card", () => {
    expect(cardLabel("A", "s")).toBe("Ace of spades");
    expect(cardLabel("K", "h")).toBe("King of hearts");
    expect(cardLabel("10", "d")).toBe("10 of diamonds");
    expect(cardLabel("7", "c")).toBe("7 of clubs");
    for (const r of RANKS) for (const s of SUITS) expect(cardLabel(r, s)).toMatch(/ of /);
  });

  it("gives each suit its own colour (4-colour deck) and a text-presentation glyph", () => {
    const tints = SUITS.map(suitColor);
    expect(new Set(tints).size).toBe(4);
    for (const s of SUITS) expect(suitGlyph(s).endsWith("︎")).toBe(true);
  });
});

describe("initials", () => {
  it("takes up to two", () => {
    expect(initials("Marcus")).toBe("M");
    expect(initials("@shoe_reader")).toBe("SR");
    expect(initials("Ana Maria Lopez")).toBe("AM");
    expect(initials("  ")).toBe("");
  });
});

describe("tokens", () => {
  it("mirror every colour variable of the design 1:1, by name", () => {
    const camel = (name: string) =>
      name.slice(2).replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
    const byName = colors as Record<string, string>;
    for (const [name, value] of Object.entries(penVariables)) {
      if (typeof value === "string" && value.startsWith("#")) {
        expect(byName[camel(name)], name).toBe(value);
      }
    }
  });
});

describe("geometry", () => {
  it("draws six chip spots, the first starting at 12 o'clock on the rim", () => {
    const paths = chipSpotPaths(52);
    expect(paths).toHaveLength(6);
    expect(paths[0]!.startsWith("M 26 0 ")).toBe(true);
  });

  it("closes a ring segment between the two radii", () => {
    expect(ringSegmentPath(100, 40, 50, 0, 90)).toBe(
      "M 50 0 A 50 50 0 0 1 100 50 L 90 50 A 40 40 0 0 0 50 10 Z",
    );
  });

  it("lays out die pips like a real die", () => {
    for (const v of [1, 2, 3, 4, 5, 6] as const) expect(diePips(v)).toHaveLength(v);
    // the design's 46pt die: pips at 9/20/31 + 3.5 radius → 0.27 / 0.5 / 0.73
    expect(diePips(3).map(([x]) => Math.round(x * 46))).toEqual([12, 23, 34]);
  });
});
