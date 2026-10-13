import { describe, expect, it } from "vitest";
import {
  COACH_NOTE_TITLE,
  bankerEdgeTip,
  coachNote,
  commissionTip,
  explainCoup,
  sideBetTip,
  tieTip,
} from "./coach";
import { EZ_BACCARAT, PUNTO_BANCO } from "./rules";
import { dealt } from "./test-helpers";

describe("coach", () => {
  it("says exactly what the design's coach note says", () => {
    expect(coachNote(PUNTO_BANCO, { player: 50 })).toEqual({
      title: "Good to know before your trip",
      body: "Banker carries the lower house edge (1.06% vs 1.24%), even after the 5% commission. Streaks on the road don't change the next hand.",
    });
    expect(COACH_NOTE_TITLE).toBe("Good to know before your trip");
  });

  it("teaches the EZ Baccarat version with the Dragon 7 push", () => {
    expect(bankerEdgeTip(EZ_BACCARAT)).toBe(
      "Banker carries the lower house edge (1.02% vs 1.24%) with no commission — the house takes its share by pushing a Banker win on a three-card 7. Streaks on the road don't change the next hand.",
    );
  });

  it("spells out the Tie's cost, at 8:1 and 9:1", () => {
    expect(tieTip(PUNTO_BANCO)).toBe(
      "Tie pays 8:1, but it lands about 1 coup in 11 (9.52%) — a 14.36% house edge, the worst of the three main bets.",
    );
    expect(tieTip({ ...PUNTO_BANCO, tiePays: 9 })).toContain("a 4.84% house edge");
  });

  it("gives side-bet odds", () => {
    expect(sideBetTip(EZ_BACCARAT, "dragon7")).toBe(
      "Dragon 7 pays 40:1, but it lands about 1 coup in 44 (2.25%) — a 7.61% house edge.",
    );
    expect(sideBetTip(EZ_BACCARAT, "panda8")).toBe(
      "Panda 8 pays 25:1, but it lands about 1 coup in 29 (3.45%) — a 10.19% house edge.",
    );
    expect(sideBetTip(PUNTO_BANCO, "playerPair")).toBe(
      "Player Pair pays 11:1, but it lands about 1 coup in 13 (7.47%) — a 10.36% house edge.",
    );
  });

  it("explains why Banker wins more often", () => {
    expect(commissionTip(PUNTO_BANCO)).toBe(
      "Banker wins 45.86% of coups to Player's 44.62%, because Banker draws knowing the Player's third card. The commission is what keeps that bet from favouring you.",
    );
  });

  it("picks the lesson for what was on the layout", () => {
    expect(coachNote(PUNTO_BANCO, { banker: 10, tie: 5 }).body).toBe(tieTip(PUNTO_BANCO));
    expect(coachNote(EZ_BACCARAT, { banker: 10, panda8: 5 }).body).toBe(
      sideBetTip(EZ_BACCARAT, "panda8"),
    );
    expect(coachNote(EZ_BACCARAT).body).toBe(bankerEdgeTip(EZ_BACCARAT));
  });

  it("explains a coup: the result, then the draws", () => {
    expect(explainCoup(dealt("4c Ks 5d 7h").coup)).toEqual([
      "Player wins 9 over 7.",
      "Player has a natural 9, so neither side draws.",
    ]);
  });
});
