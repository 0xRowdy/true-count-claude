import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS, PRACTICE_BANKROLL_START, recordHand } from "./progress";
import { resetBankroll } from "./progressReset";
import { bankroll } from "./progressSelectors";

const when = (at: number) => ({ at, day: "2026-10-01" });

describe("resetBankroll", () => {
  it("tops one game back up to the start without recording a hand", () => {
    let s = recordHand(EMPTY_PROGRESS, { game: "video-poker", net: -1995 }, when(1));
    s = recordHand(s, { game: "craps", net: 40 }, when(2));
    const reset = resetBankroll(s, "video-poker");
    expect(bankroll(reset, "video-poker")).toBe(PRACTICE_BANKROLL_START);
    expect(bankroll(reset, "craps")).toBe(PRACTICE_BANKROLL_START + 40);
    expect(reset.hands).toEqual(s.hands);
  });

  it("leaves a bankroll already at the start alone", () => {
    expect(resetBankroll(EMPTY_PROGRESS, "video-poker")).toBe(EMPTY_PROGRESS);
  });
});
