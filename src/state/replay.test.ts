import { describe, expect, it } from "vitest";
import { cardId, remainingComposition } from "@/engine";
import { buildSession } from "./fixtures";
import { rebuildShoe, replaySession, verifyReplay } from "./replay";
import type { Session } from "./types";

/** A Session as it comes back off disk: through JSON, with no live objects surviving. */
function roundTrip(session: Session): Session {
  return JSON.parse(JSON.stringify(session)) as Session;
}

describe("replaying a Session from its seed plus its Decision log", () => {
  it("produces one frame per Decision, positioned exactly where it was taken", () => {
    const session = buildSession({ rounds: 6, seed: 2024 });
    const frames = replaySession(session);

    expect(frames).toHaveLength(6);
    frames.forEach((frame, i) => {
      expect(frame.decision.index).toBe(i);
      expect(frame.shoe.dealtCount).toBe(frame.decision.shoeDealtCount);
      expect(frame.dealt).toHaveLength(frame.decision.shoeDealtCount);
    });
  });

  it("deals back the same cards the log recorded", () => {
    const session = buildSession({ rounds: 3, seed: 91 });
    const [first] = replaySession(session);

    // The fixture deals player, dealer, player, dealer.
    const player = first!.decision.hand.playerCards;
    expect(cardId(first!.dealt[0]!)).toBe(cardId(player[0]!));
    expect(cardId(first!.dealt[2]!)).toBe(cardId(player[1]!));
    expect(cardId(first!.dealt[1]!)).toBe(cardId(first!.decision.hand.dealerUpcard));
  });

  it("survives a round trip through storage — only the seed is needed", () => {
    const session = buildSession({ rounds: 5, seed: 8 });
    const restored = roundTrip(session);

    const before = replaySession(session).map((frame) => frame.dealt.map(cardId).join(","));
    const after = replaySession(restored).map((frame) => frame.dealt.map(cardId).join(","));

    expect(after).toEqual(before);
  });

  it("rebuilds a Shoe's remaining composition after a restart (Shoe Integrity Panel)", () => {
    const session = roundTrip(buildSession({ rounds: 8, seed: 5150 }));
    const shoe = rebuildShoe(session, 0);

    expect(shoe.dealtCount).toBe(session.shoes[0]!.dealtCount);
    const remaining = remainingComposition(shoe);
    const total = Object.values(remaining).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(shoe.cards.length - shoe.dealtCount);
  });

  it("throws a diagnosable error for a Shoe the Session never opened", () => {
    const session = buildSession({ rounds: 2 });
    expect(() => rebuildShoe(session, 3)).toThrow(/has no Shoe 3/);
  });
});

describe("verifyReplay", () => {
  it("passes a log that agrees with its seed", () => {
    const verification = verifyReplay(buildSession({ rounds: 10, seed: 314 }));

    expect(verification.problems).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it("catches a log whose Shoe seed no longer produces its cards", () => {
    const session = buildSession({ rounds: 6, seed: 314 });
    const tampered: Session = {
      ...session,
      shoes: [{ ...session.shoes[0]!, seed: session.shoes[0]!.seed + 1 }],
    };

    const verification = verifyReplay(tampered);

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(/holds only/);
  });

  it("catches a round whose stored net disagrees with its hands", () => {
    const session = buildSession({ rounds: 3 });
    const rounds = session.rounds.slice();
    rounds[0] = { ...rounds[0]!, net: rounds[0]!.net + 500 };

    const verification = verifyReplay({ ...session, rounds });

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(/stores net .* but its hands sum to/);
  });

  it("catches a Decision log that has been reordered", () => {
    const session = buildSession({ rounds: 4 });
    const decisions = session.decisions.slice();
    const [a, b] = [decisions[1]!, decisions[2]!];
    decisions[1] = b;
    decisions[2] = a;

    const verification = verifyReplay({ ...session, decisions });

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(/carries index|rewinds Shoe/);
  });
});
