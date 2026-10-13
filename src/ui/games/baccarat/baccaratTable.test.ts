import { describe, expect, it } from "vitest";
import {
  EZ_BACCARAT,
  PUNTO_BANCO,
  STREAK_FALLACY,
  bankerEdgeTip,
  coachNote,
  scoreCoup,
} from "@/games/baccarat";
import { cards, fixed, winnerCoup } from "@/games/baccarat/test-helpers";
import {
  type BaccaratTable,
  beadRoadView,
  bigRoadView,
  chasingStreak,
  chipStack,
  clearBets,
  createBaccaratTable,
  deal,
  dealSequence,
  formatAmount,
  gradeBets,
  hintNote,
  mistakeNote,
  nextHand,
  payoutNote,
  placeChip,
  rebet,
  removeChip,
  revealNext,
  setRules,
  settle,
  takeBack,
  totalStaked,
  undoChip,
  visibleHands,
} from "./baccaratTable";

const fresh = (seed = 7) => createBaccaratTable(PUNTO_BANCO, seed);

function bet(table: BaccaratTable, ...chips: [Parameters<typeof placeChip>[1], number][]) {
  return chips.reduce((t, [b, v]) => placeChip(t, b, v, 2000), table);
}

function playThrough(table: BaccaratTable): BaccaratTable {
  let t = table;
  while (t.phase === "deal") t = revealNext(t);
  return t;
}

describe("betting", () => {
  it("stacks chips per spot and undoes in order", () => {
    let t = bet(fresh(), ["banker", 25], ["banker", 25], ["player", 5]);
    expect(t.bets).toEqual({ banker: 50, player: 5 });
    expect(totalStaked(t.bets)).toBe(55);
    t = undoChip(t);
    expect(t.bets).toEqual({ banker: 50 });
    t = removeChip(t, "banker");
    expect(t.bets).toEqual({ banker: 25 });
    expect(clearBets(t).bets).toEqual({});
  });

  it("never stakes more than the bankroll or the table max", () => {
    const poor = placeChip(fresh(), "banker", 100, 50);
    expect(poor.bets).toEqual({});
    expect(poor.error).toMatch(/Not enough practice chips/);
    let t = fresh();
    for (let i = 0; i < 5; i++) t = placeChip(t, "player", 1000, 100_000);
    expect(t.bets.player).toBe(5000);
    t = placeChip(t, "player", 1, 100_000);
    expect(t.bets.player).toBe(5000);
    expect(t.error).toMatch(/table max of \$5,000/);
  });

  it("refuses side bets the table does not offer", () => {
    const t = placeChip(fresh(), "dragon7", 25, 2000);
    expect(t.bets).toEqual({});
    expect(t.error).toBe("Dragon 7 is not offered at this table");
  });

  it("enforces the table minimum at the deal, in place", () => {
    const out = deal(bet(fresh(), ["banker", 5]), "mistakes", { available: 2000 });
    expect(out.table.phase).toBe("bet");
    expect(out.table.error).toBe("Banker must be between 10 and 5000");
    expect(out.decisions).toEqual([]);
    expect(deal(fresh(), "mistakes").table.error).toBe("Place a bet to deal");
  });
});

describe("the coup", () => {
  it("deals P B P B, then third cards per the tableau, and turns them one at a time", () => {
    const coup = fixed("2c 3d 4h", "5s Kd 9c");
    expect(dealSequence(coup).map((d) => `${d.side[0]}${d.card.rank}`)).toEqual([
      "p2",
      "b5",
      "p3",
      "bK",
      "p4",
      "b9",
    ]);
    const { table } = deal(bet(fresh(), ["banker", 50]), "mistakes");
    expect(table.phase).toBe("deal");
    expect(visibleHands(table)).toEqual({ player: [], banker: [] });
    const one = revealNext(table);
    expect(visibleHands(one).player).toHaveLength(1);
    expect(visibleHands(one).banker).toHaveLength(0);
    const done = playThrough(table);
    expect(done.phase).toBe("result");
    expect(visibleHands(done).player).toEqual(table.coup!.player);
  });

  it("settles with the engine and records the coup's net", () => {
    const { table } = deal(bet(fresh(), ["banker", 50]), "mistakes");
    const out = settle(playThrough(table))!;
    expect(out.table.phase).toBe("payout");
    const coup = table.coup!;
    const expected = coup.winner === "banker" ? 47.5 : coup.winner === "tie" ? 0 : -50;
    expect(out.net).toBe(expected);
  });

  it("is reproducible from the session seed", () => {
    const a = deal(bet(fresh(42), ["banker", 50]), "mistakes").table.coup;
    const b = deal(bet(fresh(42), ["banker", 50]), "mistakes").table.coup;
    expect(a).toEqual(b);
  });

  it("clears the felt for the next hand, and Rebet puts the bets back", () => {
    const { table } = deal(bet(fresh(), ["banker", 25], ["banker", 25]), "mistakes");
    const paid = settle(playThrough(table))!.table;
    const next = nextHand(paid);
    expect(next.phase).toBe("bet");
    expect(next.bets).toEqual({});
    expect(next.shoe.coups).toHaveLength(1);
    expect(nextHand(paid, true).bets).toEqual({ banker: 50 });
    expect(rebet(next).bets).toEqual({ banker: 50 });
  });

  it("starts a new shoe from the derived seed when the last one is finished", () => {
    let t = fresh(3);
    let shoes = 0;
    for (let i = 0; i < 200 && shoes === 0; i++) {
      const dealt = deal(bet(t, ["banker", 10]), "asked").table;
      if (dealt.freshShoe) shoes++;
      t = nextHand(settle(playThrough(dealt))!.table);
    }
    expect(shoes).toBe(1);
    expect(t.shoeIndex).toBe(1);
    expect(t.shoe.coups.length).toBeGreaterThan(0);
  });
});

describe("coach", () => {
  it("grades Banker as the right bet choice and Player or Tie as not", () => {
    expect(gradeBets(PUNTO_BANCO, { banker: 10 })).toEqual([
      { category: "bet-choice", correct: true },
    ]);
    expect(gradeBets(PUNTO_BANCO, { player: 10 })[0]!.correct).toBe(false);
    expect(gradeBets(PUNTO_BANCO, { banker: 10, tie: 10 })[0]!.correct).toBe(false);
    expect(gradeBets(EZ_BACCARAT, { banker: 10 })).toEqual([
      { category: "bet-choice", correct: true },
      { category: "side-bets", correct: true },
    ]);
    expect(gradeBets(EZ_BACCARAT, { banker: 10, dragon7: 5 })[1]!.correct).toBe(false);
  });

  it("catches a Tie bet before the deal, records it once as coached, and takes it back", () => {
    const t = bet(fresh(), ["banker", 25], ["tie", 10]);
    const out = deal(t, "mistakes", { available: 2000 });
    expect(out.table.phase).toBe("bet");
    expect(out.table.caught?.variant).toBe("mistake");
    expect(out.table.caught?.title).toBe("Tie carries a 14.36% house edge");
    expect(out.decisions).toEqual([{ category: "bet-choice", correct: false, coached: true }]);
    const back = takeBack(out.table);
    expect(back.bets).toEqual({ banker: 25 });
    expect(back.caught).toBeNull();
    const dealt = deal(back, "mistakes");
    expect(dealt.table.phase).toBe("deal");
    expect(dealt.decisions).toEqual([]); // already counted
  });

  it("lets the player deal anyway", () => {
    const t = bet(fresh(), ["tie", 10]);
    const caught = deal(t, "every").table;
    const out = deal(caught, "every", { force: true });
    expect(out.table.phase).toBe("deal");
    expect(out.table.bets).toEqual({ tie: 10 });
  });

  it("does not interrupt on 'asked', and only hints at a Player bet", () => {
    const tie = deal(bet(fresh(), ["tie", 10]), "asked");
    expect(tie.table.phase).toBe("deal");
    expect(tie.decisions).toEqual([{ category: "bet-choice", correct: false, coached: false }]);
    const player = deal(bet(fresh(), ["player", 10]), "mistakes");
    expect(player.table.phase).toBe("deal");
    expect(hintNote(bet(fresh(), ["player", 10])).title).toBe("Banker is the better bet");
    expect(hintNote(fresh()).body).toBe(bankerEdgeTip(PUNTO_BANCO));
  });

  it("explains side bets by their edge", () => {
    const note = mistakeNote(EZ_BACCARAT, { banker: 10, dragon7: 5 })!;
    expect(note.title).toMatch(/^Dragon 7 carries a \d+\.\d\d% house edge$/);
    expect(note.takeBack).toEqual(["dragon7"]);
    expect(mistakeNote(PUNTO_BANCO, { banker: 10 })).toBeNull();
  });

  it("flags switching sides to follow a streak, not backing the same side", () => {
    const road = [winnerCoup("P"), winnerCoup("B"), winnerCoup("B"), winnerCoup("B")];
    expect(chasingStreak(road, { banker: 10 }, { player: 10 })).toEqual({
      winner: "banker",
      length: 3,
    });
    expect(chasingStreak(road, { banker: 10 }, { banker: 10 })).toBeNull();
    expect(chasingStreak(road, { banker: 10 }, null)).toBeNull();
    expect(chasingStreak(road.slice(0, 3), { banker: 10 }, { player: 10 })).toBeNull();
  });

  it("uses the engine's payout note, or the streak note after a chase", () => {
    const { table } = deal(bet(fresh(), ["banker", 50]), "mistakes");
    const paid = settle(playThrough(table))!.table;
    expect(payoutNote(paid)).toMatchObject(coachNote(PUNTO_BANCO, { banker: 50 }));
    expect(payoutNote({ ...paid, chasedStreak: true }).body).toContain(STREAK_FALLACY);
  });

  it("drops bets the new rules no longer offer", () => {
    const ez = setRules(fresh(), EZ_BACCARAT);
    const t = bet(ez, ["banker", 25], ["panda8", 5]);
    expect(setRules(t, PUNTO_BANCO).bets).toEqual({ banker: 25 });
  });
});

describe("roads", () => {
  it("rings the latest bead and windows the newest 12 columns", () => {
    const coups = Array.from({ length: 80 }, (_, i) => winnerCoup(i % 7 === 0 ? "T" : "B"));
    const view = beadRoadView(coups);
    expect(view.cells.filter((c) => c.latest)).toHaveLength(1);
    const latest = view.cells.find((c) => c.latest)!;
    expect(latest).toMatchObject({ column: 11, row: 79 % 6 });
    expect(Math.min(...view.cells.map((c) => c.column))).toBe(0);
    expect(view.legend.tie).toBe(12);
  });

  it("puts ties on the big road's previous bead", () => {
    const view = bigRoadView([winnerCoup("P"), winnerCoup("T"), winnerCoup("B")]);
    expect(view.cells.map((c) => [c.letter, c.column, c.row, c.ties])).toEqual([
      ["P", 0, 0, 1],
      ["B", 1, 0, 0],
    ]);
    expect(view.cells[1]!.latest).toBe(true);
  });
});

describe("display helpers", () => {
  it("breaks a stake into rack chips", () => {
    expect(chipStack(50)).toEqual([25, 25]);
    expect(chipStack(135)).toEqual([100, 25, 5, 5]);
  });

  it("formats amounts without locale APIs", () => {
    expect(formatAmount(2047.5)).toBe("$2,047.50");
    expect(formatAmount(50, true)).toBe("+$50");
    expect(formatAmount(-25, true)).toBe("−$25");
  });

  it("scores a natural for the design's hand", () => {
    const coup = scoreCoup(cards("4c 5d"), cards("Ks 7h"));
    expect(coup.winner).toBe("player");
  });
});
