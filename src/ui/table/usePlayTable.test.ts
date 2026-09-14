/**
 * The Play table's transitions, with the hook left out of it.
 *
 * Every transition in `usePlayTable.ts` is a pure function of the previous `PlayTable`, which
 * is what lets the whole of #19's behaviour — where the configured Rule Set is allowed to take
 * effect, and where it is not — be asserted here rather than in a rendered screen.
 *
 * The three holds are the point. Each one exists because letting a rules change through it
 * would break a promise the app makes to the user's face: a settled hand paid under rules it
 * was not dealt under, a Session whose Shoes no longer replay, or a True Count divided by a
 * deck count that changed mid-count.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";
import { deriveShoeSeed } from "@/state";
import { RULE_PRESETS, sameRules } from "@/ui/rules/presets";
import {
  type PlayTable,
  configureRules,
  createPlayTable,
  dealRound,
  nextRound,
  playAction,
  restorePlayTable,
  rulesHold,
  shuffleShoe,
  takeUpRules,
} from "./usePlayTable";
import { getCountingSystem } from "@/engine/counting";
import { createShoe } from "@/engine/shoe";

const SESSION_SEED = 20260919;

function preset(id: string): RuleSet {
  const found = RULE_PRESETS.find((entry) => entry.id === id);
  if (!found) throw new Error(`No such preset: ${id}`);
  return found.rules;
}

/** Single deck, 6:5, $10–$500 — differs from the default in decks, payout, limits and pen. */
const SINGLE_DECK = preset("single-deck-6-5");

/** Plays a round to its settlement so a table can be put into a mid-shoe state. */
function playOneRound(table: PlayTable): PlayTable {
  let next = dealRound(table);
  let guard = 0;
  while (next.round && next.round.phase !== "settled") {
    if (next.round.phase === "insurance") next = playAction(next, "stand");
    else next = playAction(next, "stand");
    if (++guard > 40) throw new Error("round did not settle");
  }
  return next;
}

describe("the Shoe's seed", () => {
  it("comes from `deriveShoeSeed` and nowhere else", () => {
    const table = createPlayTable(DEFAULT_RULES, SESSION_SEED);
    expect(table.shoe.seed).toBe(deriveShoeSeed(SESSION_SEED, 0));
  });

  it("follows the same derivation into the next Shoe", () => {
    const table = createPlayTable(DEFAULT_RULES, SESSION_SEED);
    const shuffled = shuffleShoe(table);
    expect(shuffled.shoeIndex).toBe(1);
    expect(shuffled.shoe.seed).toBe(deriveShoeSeed(SESSION_SEED, 1));
  });
});

describe("the table a round is dealt at", () => {
  it("is the Rule Set it was built with, not the default", () => {
    const table = createPlayTable(SINGLE_DECK, SESSION_SEED);
    expect(table.rules.decks).toBe(1);
    expect(table.shoe.cards).toHaveLength(52);
    expect(table.shoe.cutIndex).toBe(Math.floor(52 * SINGLE_DECK.penetration));
    expect(table.bet).toBe(SINGLE_DECK.minBet);
  });

  it("opens with nothing pending", () => {
    expect(createPlayTable(SINGLE_DECK, SESSION_SEED).pendingRules).toBeNull();
    expect(
      restorePlayTable({
        rules: SINGLE_DECK,
        system: getCountingSystem("hi-lo"),
        sessionSeed: SESSION_SEED,
        shoeIndex: 0,
        shoe: createShoe(SINGLE_DECK, deriveShoeSeed(SESSION_SEED, 0)),
        bankroll: 500,
        handsPlayed: 0,
        sessionNet: 0,
      }).pendingRules,
    ).toBeNull();
  });
});

describe("configureRules", () => {
  it("notes a different table without dealing it", () => {
    const table = createPlayTable(DEFAULT_RULES, SESSION_SEED);
    const configured = configureRules(table, SINGLE_DECK);

    expect(configured.pendingRules).toEqual(SINGLE_DECK);
    // The table itself has not moved: same rules, same Shoe object, same cards.
    expect(configured.rules).toBe(table.rules);
    expect(configured.shoe).toBe(table.shoe);
  });

  it("is a no-op when the configured table is the one being dealt", () => {
    const table = createPlayTable(SINGLE_DECK, SESSION_SEED);
    expect(configureRules(table, { ...SINGLE_DECK })).toBe(table);
  });

  it("clears a pending change that has been configured back to the live table", () => {
    const table = configureRules(createPlayTable(DEFAULT_RULES, SESSION_SEED), SINGLE_DECK);
    expect(configureRules(table, DEFAULT_RULES).pendingRules).toBeNull();
  });

  it("does not churn when the same pending table is configured twice", () => {
    const table = configureRules(createPlayTable(DEFAULT_RULES, SESSION_SEED), SINGLE_DECK);
    expect(configureRules(table, { ...SINGLE_DECK })).toBe(table);
  });
});

describe("rulesHold", () => {
  const fresh = configureRules(createPlayTable(DEFAULT_RULES, SESSION_SEED), SINGLE_DECK);

  it("holds nothing back when nothing is pending", () => {
    expect(rulesHold(createPlayTable(DEFAULT_RULES, SESSION_SEED), true)).toBeNull();
  });

  it("lets a change through on an undealt Shoe with no Session recording", () => {
    expect(rulesHold(fresh, false)).toBeNull();
  });

  it("holds a change while a hand is on the table", () => {
    expect(rulesHold(dealRound(fresh), false)).toBe("round");
  });

  it("holds a change while a Session is recording", () => {
    expect(rulesHold(fresh, true)).toBe("session");
  });

  it("holds a change once cards are off the Shoe", () => {
    const midShoe = nextRound(playOneRound(fresh));
    expect(midShoe.round).toBeNull();
    expect(midShoe.shoe.dealtCount).toBeGreaterThan(0);
    expect(rulesHold(midShoe, false)).toBe("shoe");
  });

  it("names the Session first, because ending it is what the user has to do", () => {
    const midShoe = nextRound(playOneRound(fresh));
    expect(rulesHold(midShoe, true)).toBe("session");
  });
});

describe("takeUpRules", () => {
  const pending = configureRules(createPlayTable(DEFAULT_RULES, SESSION_SEED), SINGLE_DECK);

  it("deals the configured game from then on", () => {
    const switched = takeUpRules(pending);

    expect(sameRules(switched.rules, SINGLE_DECK)).toBe(true);
    expect(switched.pendingRules).toBeNull();
    expect(switched.shoe.cards).toHaveLength(52);
    expect(switched.shoe.cutIndex).toBe(Math.floor(52 * SINGLE_DECK.penetration));
  });

  it("rebuilds the Shoe in place rather than moving on to a new one", () => {
    // No card has come off it, so this is the same Shoe built from different decks — not a
    // successor. Its number and seed are unchanged, which is what the Shoe panel shows.
    const switched = takeUpRules(pending);
    expect(switched.shoeIndex).toBe(pending.shoeIndex);
    expect(switched.shoe.seed).toBe(deriveShoeSeed(SESSION_SEED, 0));
  });

  it("brings the wager inside the new table's limits", () => {
    const bigTable: RuleSet = { ...DEFAULT_RULES, minBet: 100, maxBet: 5000 };
    const table = configureRules(createPlayTable(bigTable, SESSION_SEED), SINGLE_DECK);
    expect(table.bet).toBe(100);
    expect(takeUpRules(table).bet).toBe(SINGLE_DECK.minBet);
  });

  it("refuses to change the rules out from under a live hand", () => {
    const live = dealRound(pending);
    expect(takeUpRules(live)).toBe(live);
  });

  it("does nothing when nothing is pending", () => {
    const table = createPlayTable(DEFAULT_RULES, SESSION_SEED);
    expect(takeUpRules(table)).toBe(table);
  });
});

describe("the table's own transitions", () => {
  it("never take up a pending Rule Set by themselves", () => {
    // Only `takeUpRules` changes the game, and only its caller knows whether a Session is
    // recording. A shuffle that quietly swapped the decks would do it behind that check.
    const pending = configureRules(createPlayTable(DEFAULT_RULES, SESSION_SEED), SINGLE_DECK);

    const shuffled = shuffleShoe(pending);
    expect(shuffled.rules.decks).toBe(DEFAULT_RULES.decks);
    expect(shuffled.pendingRules).toEqual(SINGLE_DECK);

    const banked = nextRound(playOneRound(pending));
    expect(banked.rules.decks).toBe(DEFAULT_RULES.decks);
    expect(banked.pendingRules).toEqual(SINGLE_DECK);
  });
});
