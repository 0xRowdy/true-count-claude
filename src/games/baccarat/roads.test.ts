import { describe, expect, it } from "vitest";
import { createBaccaratShoe, dealWholeShoe } from "./shoe";
import { PUNTO_BANCO } from "./rules";
import { beadRoad, bigRoad, currentStreak, roadCounts, roadLegend } from "./roads";
import { dealt, winnerCoup } from "./test-helpers";

const seq = (letters: string) =>
  letters
    .replace(/\s/g, "")
    .split("")
    .map((l) => winnerCoup(l as "P" | "B" | "T"));

/** The design's bead road (frame gu3Mf, "BEAD ROAD · THIS SHOE"), column by column. */
const DESIGN_ROAD = "BBPBTP PBBBPB PPBTBB PBPBBP PBPBTB BPPBP";

describe("bead road", () => {
  it("reproduces the design's road and legend: Player 14, Banker 18, Tie 3", () => {
    const road = beadRoad(seq(DESIGN_ROAD));
    expect(road.counts).toEqual({ player: 14, banker: 18, tie: 3, total: 35 });
    expect(roadLegend(road.counts)).toEqual({
      player: "Player 14",
      banker: "Banker 18",
      tie: "Tie 3",
    });
    expect(road.rows).toBe(6);
    expect(road.columns).toBe(6);
    expect(road.cells.map((c) => c.letter).join("")).toBe(DESIGN_ROAD.replace(/\s/g, ""));
  });

  it("fills down six rows, then across", () => {
    const road = beadRoad(seq("PPPPPPB"));
    expect(road.cells.map((c) => [c.column, c.row])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 0],
    ]);
    expect(road.columns).toBe(2);
  });

  it("an empty shoe still draws one column", () => {
    expect(beadRoad([])).toMatchObject({ columns: 1, cells: [], counts: { total: 0 } });
  });

  it("marks naturals and pairs on the bead", () => {
    const [cell] = beadRoad([dealt("8c 3d 8h 3s").coup]).cells;
    expect(cell).toMatchObject({
      winner: "tie",
      natural: false,
      playerPair: true,
      bankerPair: true,
    });
    expect(beadRoad([dealt("4c Ks 5d 7h").coup]).cells[0]?.natural).toBe(true);
  });

  it("counts a whole dealt shoe", () => {
    const shoe = dealWholeShoe(createBaccaratShoe(PUNTO_BANCO, 42));
    const counts = roadCounts(shoe.coups);
    expect(counts.player + counts.banker + counts.tie).toBe(shoe.coups.length);
    expect(beadRoad(shoe.coups).cells).toHaveLength(shoe.coups.length);
  });
});

describe("big road", () => {
  const at = (letters: string) =>
    bigRoad(seq(letters)).cells.map((c) => `${c.winner[0]}${c.column},${c.row}`);

  it("starts a new column on every change of winner", () => {
    expect(at("BBPPPB")).toEqual(["b0,0", "b0,1", "p1,0", "p1,1", "p1,2", "b2,0"]);
  });

  it("puts ties on the previous bead instead of a cell", () => {
    const road = bigRoad(seq("BTTPTB"));
    expect(road.cells.map((c) => [c.winner, c.ties])).toEqual([
      ["banker", 2],
      ["player", 1],
      ["banker", 0],
    ]);
    expect(road.counts.tie).toBe(3);
  });

  it("carries ties before the first win onto the first bead", () => {
    const road = bigRoad(seq("TTP"));
    expect(road.leadingTies).toBe(2);
    expect(road.cells[0]).toMatchObject({ winner: "player", ties: 2, column: 0, row: 0 });
    expect(bigRoad(seq("TT"))).toMatchObject({ leadingTies: 2, cells: [], columns: 1 });
  });

  it("turns a streak longer than six into a dragon tail along the bottom row", () => {
    expect(at("BBBBBBBB")).toEqual([
      "b0,0",
      "b0,1",
      "b0,2",
      "b0,3",
      "b0,4",
      "b0,5",
      "b1,5",
      "b2,5",
    ]);
  });

  it("the next streak starts beside the last one, and turns early to avoid a tail", () => {
    // Banker tail occupies (1,5) and (2,5). Player's streak starts at column 1 and must
    // turn right at row 4 because (1,5) is taken.
    expect(at("BBBBBBBB PPPPPPP")).toEqual([
      "b0,0",
      "b0,1",
      "b0,2",
      "b0,3",
      "b0,4",
      "b0,5",
      "b1,5",
      "b2,5",
      "p1,0",
      "p1,1",
      "p1,2",
      "p1,3",
      "p1,4",
      "p2,4",
      "p3,4",
    ]);
    expect(bigRoad(seq("BBBBBBBB PPPPPPP")).columns).toBe(4);
  });

  it("a streak that turned early keeps moving right and never drops back down", () => {
    // Banker's tail fills (1,5) and (2,5). Player takes (1,0). The second Banker streak
    // starts at (2,0), turns at row 4 because (2,5) is taken, and then stays on row 4
    // even though (3,5) is free.
    expect(at("BBBBBBBB P BBBBBBB")).toEqual([
      "b0,0",
      "b0,1",
      "b0,2",
      "b0,3",
      "b0,4",
      "b0,5",
      "b1,5",
      "b2,5",
      "p1,0",
      "b2,0",
      "b2,1",
      "b2,2",
      "b2,3",
      "b2,4",
      "b3,4",
      "b4,4",
    ]);
  });

  it("numbers streaks", () => {
    expect(bigRoad(seq("BBPB")).cells.map((c) => c.streak)).toEqual([0, 0, 1, 2]);
  });
});

describe("currentStreak", () => {
  it("is the run of the latest winner, skipping ties", () => {
    expect(currentStreak(seq("PBBTB"))).toEqual({ winner: "banker", length: 3 });
    expect(currentStreak(seq("BP"))).toEqual({ winner: "player", length: 1 });
    expect(currentStreak(seq("TT"))).toBeNull();
    expect(currentStreak([])).toBeNull();
  });
});
