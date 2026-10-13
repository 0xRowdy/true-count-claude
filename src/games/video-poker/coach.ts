/**
 * The dealer-coach's words for video poker.
 *
 * Invariant 2 (CONTEXT.md): every wrong verdict carries an Explanation. Here the Explanation
 * is the two numbers that decide a hold — what the player's hold returns on average and what
 * the best hold returns — said in plain language, in dollars of *this* bet:
 *
 *   "Keep the four hearts. Let the pair of 5s go."
 *   "On average a low pair returns about $4.10 of your $5 bet. Four to a flush returns
 *    about $6.10."
 *
 * Everything is derived from the exact EVs in `holds.ts`; this module only names things.
 * No locale APIs are used (the web build is prerendered, and locale formatting is a
 * hydration hazard), so money is formatted by hand.
 */

import type { Card, Rank, Suit } from "../../engine/cards";
import { DEUCE, JACK, encodeCard, encodeHand, popcount } from "./cards";
import { HR, evaluateCodes, fitsStraight, handRankFromCode, type VideoPokerGame } from "./evaluate";
import { optionForMask, sameEv, type HoldAnalysis, type HoldOption } from "./holds";
import { paysPerCoin, type PayTable } from "./paytables";

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five"] as const;

const RANK_NAMES: Record<Rank, string> = {
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  "10": "10",
  "9": "9",
  "8": "8",
  "7": "7",
  "6": "6",
  "5": "5",
  "4": "4",
  "3": "3",
  "2": "2",
};

const SUIT_NAMES: Record<Suit, string> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };

function word(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Queen", "10", "deuce" (in Deuces Wild). */
export function rankName(rank: Rank, game: VideoPokerGame): string {
  return game === "deuces-wild" && rank === "2" ? "deuce" : RANK_NAMES[rank];
}

/** "Queens", "10s", "5s", "deuces" (in Deuces Wild). */
export function rankPlural(rank: Rank, game: VideoPokerGame): string {
  if (game === "deuces-wild" && rank === "2") return "deuces";
  return `${RANK_NAMES[rank]}s`;
}

export function suitName(suit: Suit): string {
  return SUIT_NAMES[suit];
}

/** "the Queen", "the Queen and Jack", "the King, Queen and Jack". */
function listRanks(cards: readonly Card[], game: VideoPokerGame): string {
  const names = cards.map((c) => rankName(c.rank, game));
  if (names.length <= 2) return `the ${names.join(" and ")}`;
  return `the ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Cards sorted high to low (poker order), for stable wording. */
function byRankDescending(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => encodeCard(b) - encodeCard(a));
}

interface Shape {
  /** Count per poker rank index. */
  counts: number[];
  /** Ranks of the natural (non-wild) cards, as a bit mask. */
  mask: number;
  naturals: Card[];
  wilds: number;
  /** All naturals share a suit (vacuously true with none). */
  suited: boolean;
  /** Natural ranks are all different. */
  distinct: boolean;
  /** Ranks held two or more times, high to low. */
  groups: { rank: Rank; count: number }[];
}

function shapeOf(cards: readonly Card[], game: VideoPokerGame): Shape {
  const counts = new Array<number>(13).fill(0);
  const naturals: Card[] = [];
  let wilds = 0;
  let mask = 0;
  for (const card of cards) {
    const rank = encodeCard(card) >> 2;
    counts[rank] = (counts[rank] as number) + 1;
    if (game === "deuces-wild" && rank === DEUCE) {
      wilds++;
      continue;
    }
    naturals.push(card);
    mask |= 1 << rank;
  }
  const suited = naturals.every((c) => c.suit === naturals[0]?.suit);
  const groups = byRankDescending(naturals)
    .filter((c, i, all) => all.findIndex((d) => d.rank === c.rank) === i)
    .map((c) => ({ rank: c.rank, count: counts[encodeCard(c) >> 2] as number }))
    .filter((g) => g.count >= 2);
  return {
    counts,
    mask,
    naturals,
    wilds,
    suited,
    distinct: popcount(mask) === naturals.length,
    groups,
  };
}

const ROYAL_RANKS = 0b1111100000000;

/** Rank mask of four consecutive ranks open at both ends (not A-2-3-4 or J-Q-K-A). */
function isOutsideFour(mask: number): boolean {
  for (let low = 0; low <= 8; low++) {
    if (mask === 0b1111 << low) return low >= 1 && low <= 7;
  }
  return false;
}

/** How a final hand reads in a sentence: "a flush", "two pair", "four Aces". */
const HAND_NOUNS: Record<string, string> = {
  "royal-flush": "a royal flush",
  "four-deuces": "four deuces",
  "wild-royal-flush": "a wild royal flush",
  "five-of-a-kind": "five of a kind",
  "four-aces-with-kicker": "four Aces with a kicker",
  "four-2-4-with-kicker": "four of a kind with a kicker",
  "four-aces": "four Aces",
  "four-2-4": "four of a kind",
  "four-5-k": "four of a kind",
  "straight-flush": "a straight flush",
  "four-of-a-kind": "four of a kind",
  "full-house": "a full house",
  flush: "a flush",
  straight: "a straight",
  "three-of-a-kind": "three of a kind",
  "two-pair": "two pair",
  "jacks-or-better": "a high pair",
  nothing: "nothing",
};

/** A hand that needs no draw: a straight or better (every quad, full house, flush…). */
function isPat(made: number): boolean {
  return made <= HR.flush || made === HR.straight;
}

export interface HoldDescription {
  /** The strategy idea behind the hold, as a noun phrase: "four to a flush", "a low pair". */
  readonly concept: string;
  /** The cards themselves, as the coach points at them: "the four hearts", "the pair of 5s". */
  readonly phrase: string;
  /** Whether `concept` takes a plural verb ("two high cards return…"). */
  readonly plural: boolean;
}

/** Concepts that read as plural nouns: "two deuces", "three high cards", "two unmatched cards". */
function isPluralConcept(concept: string): boolean {
  return /^(two|three|four|five|all five) (deuces|high cards|unmatched cards|cards)$/.test(concept);
}

/** Name a hold the way a strategy chart and a dealer would. */
export function describeHold(held: readonly Card[], table: PayTable): HoldDescription {
  const k = held.length;
  let concept: string;
  let phrase: string;
  if (k === 0) {
    concept = "a full redraw";
    phrase = "nothing";
  } else if (k === 5) {
    const made = evaluateCodes(table.game, encodeHand(held));
    const pays = paysPerCoin(table, handRankFromCode(made), 1) > 0;
    concept =
      pays && isPat(made)
        ? (HAND_NOUNS[handRankFromCode(made)] as string)
        : describeShape(held, table.game).concept;
    phrase = "all five cards";
  } else {
    ({ concept, phrase } = describeShape(held, table.game));
  }
  return { concept, phrase, plural: isPluralConcept(concept) };
}

/** The part of `describeHold` that reads the cards' shape (not a pat hand, not empty). */
function describeShape(
  held: readonly Card[],
  game: VideoPokerGame,
): { concept: string; phrase: string } {
  const k = held.length;
  const s = shapeOf(held, game);
  const naturals = byRankDescending(s.naturals);
  const n = naturals.length;
  const suitWord = naturals[0] ? suitName(naturals[0].suit) : "";

  if (s.wilds > 0) {
    const deuces = s.wilds === 1 ? "the deuce" : `the ${word(s.wilds)} deuces`;
    if (n === 0) {
      return {
        concept: s.wilds === 1 ? "a lone deuce" : `${word(s.wilds)} deuces`,
        phrase: deuces,
      };
    }
    const sameRank = s.groups.length === 1 && s.groups[0]!.count === n;
    const plural = sameRank ? rankPlural(s.groups[0]!.rank, game) : "";
    const rest =
      n === 1
        ? `the ${rankName(naturals[0]!.rank, game)}`
        : sameRank
          ? n === 2
            ? `the pair of ${plural}`
            : `the ${word(n)} ${plural}`
          : s.suited && s.distinct
            ? `${listRanks(naturals, game)} of ${suitWord}`
            : listRanks(naturals, game);
    const phrase = `${deuces} and ${rest}`;
    if (sameRank) {
      return { concept: `${word(n + s.wilds)} of a kind`, phrase };
    }
    if (s.suited && s.distinct && (s.mask & ~ROYAL_RANKS) === 0 && k >= 3) {
      return { concept: `${word(k)} to a wild royal flush`, phrase };
    }
    if (s.suited && s.distinct && fitsStraight(s.mask) && k >= 3) {
      return { concept: `${word(k)} to a straight flush`, phrase };
    }
    if (s.distinct && fitsStraight(s.mask) && k === 4) {
      return { concept: "four to a straight", phrase };
    }
    return {
      concept: `${s.wilds === 1 ? "a deuce" : `${word(s.wilds)} deuces`} and ${word(n)} other card${n === 1 ? "" : "s"}`,
      phrase,
    };
  }

  // No wild cards held.
  const highCards =
    game === "deuces-wild" ? 0 : naturals.filter((c) => encodeCard(c) >> 2 >= JACK).length;
  const group = s.groups[0];

  if (group) {
    const plural = rankPlural(group.rank, game);
    const kickers = k - s.groups.reduce((sum, g) => sum + g.count, 0);
    if (s.groups.length === 2) {
      return {
        concept: kickers === 1 ? "two pair and a kicker" : "two pair",
        phrase: `the ${rankPlural(group.rank, game)} and ${rankPlural(s.groups[1]!.rank, game)}`,
      };
    }
    let core: string;
    let phrase: string;
    if (group.count === 4) {
      core = "four of a kind";
      phrase = `the four ${plural}`;
    } else if (group.count === 3) {
      core = "three of a kind";
      phrase = `the three ${plural}`;
    } else {
      const rankIndex = encodeCard({ rank: group.rank, suit: "s" }) >> 2;
      core = game === "deuces-wild" ? "a pair" : rankIndex >= JACK ? "a high pair" : "a low pair";
      phrase = `the pair of ${plural}`;
    }
    if (kickers === 0) return { concept: core, phrase };
    const extra = naturals.filter((c) => c.rank !== group.rank);
    return {
      concept: `${core} and ${kickers === 1 ? "a kicker" : `${word(kickers)} kickers`}`,
      phrase: `${phrase} and ${listRanks(extra, game)}`,
    };
  }

  // All different ranks.
  if (s.suited && k >= 2) {
    const phrase =
      k >= 3 ? `the ${word(k)} ${suitWord}` : `${listRanks(naturals, game)} of ${suitWord}`;
    if ((s.mask & ~ROYAL_RANKS) === 0) return { concept: `${word(k)} to a royal flush`, phrase };
    if (k >= 3 && fitsStraight(s.mask)) {
      return { concept: `${word(k)} to a straight flush`, phrase };
    }
    if (k >= 3) return { concept: `${word(k)} to a flush`, phrase };
  }
  if (k >= 3 && fitsStraight(s.mask)) {
    const phrase = listRanks(naturals, game);
    if (k === 4) {
      return {
        concept: isOutsideFour(s.mask)
          ? "four to an outside straight"
          : "four to an inside straight",
        phrase,
      };
    }
    return { concept: "three to a straight", phrase };
  }
  const phrase = listRanks(naturals, game);
  if (highCards === k) {
    return { concept: k === 1 ? "a single high card" : `${word(k)} high cards`, phrase };
  }
  return { concept: k === 1 ? "a single low card" : `${word(k)} unmatched cards`, phrase };
}

/**
 * What the player was dealt, in a few words: "pair of 5s, four hearts". The UI prefixes
 * "Dealt: ".
 */
export function describeHand(cards: readonly Card[], game: VideoPokerGame): string {
  const codes = encodeHand(cards);
  const made = evaluateCodes(game, codes);
  const s = shapeOf(cards, game);
  const features: string[] = [];

  if (s.wilds > 0) features.push(s.wilds === 1 ? "one deuce" : `${word(s.wilds)} deuces`);

  // A pat hand needs no draw description.
  const pat = isPat(made);
  if (pat) {
    if (s.wilds > 0 && made === HR.fourDeuces) return features.join(", ");
    features.push(HAND_NOUNS[handRankFromCode(made)] as string);
    return features.join(", ");
  }

  {
    // With wild deuces, the deuces feature above already says what they add.
    for (const group of s.groups) {
      const plural = rankPlural(group.rank, game);
      if (group.count === 3) features.push(`three ${plural}`);
      else if (group.count === 2) features.push(`pair of ${plural}`);
    }
    if (s.groups.length === 2) {
      features.splice(
        features.length - 2,
        2,
        `two pair, ${rankPlural(s.groups[0]!.rank, game)} and ${rankPlural(s.groups[1]!.rank, game)}`,
      );
    }
  }

  // Draws, from the natural cards.
  const bySuit = new Map<Suit, Card[]>();
  for (const card of s.naturals) bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card]);
  let flushDraw = false;
  for (const [suit, suited] of bySuit) {
    const mask = suited.reduce((m, c) => m | (1 << (encodeCard(c) >> 2)), 0);
    const count = suited.length + s.wilds;
    if (count >= 4) {
      flushDraw = true;
      if ((mask & ~ROYAL_RANKS) === 0) features.push("four to a royal");
      else if (fitsStraight(mask)) features.push("four to a straight flush");
      else features.push(s.wilds > 0 ? "four to a flush" : `four ${suitName(suit)}`);
    } else if (suited.length === 3 && s.wilds === 0 && (mask & ~ROYAL_RANKS) === 0) {
      flushDraw = true;
      features.push("three to a royal");
    }
  }
  if (!flushDraw) {
    // Any four distinct natural ranks that fit a straight window.
    const ranks = [...new Set(s.naturals.map((c) => encodeCard(c) >> 2))];
    const fourWay = ranks.length >= 4 - s.wilds;
    if (fourWay) {
      const subsets =
        ranks.length <= 4 ? [ranks] : ranks.map((_, skip) => ranks.filter((__, i) => i !== skip));
      const draw = subsets.some((sub) => fitsStraight(sub.reduce((m, r) => m | (1 << r), 0)));
      if (draw) features.push("four to a straight");
    }
  }

  if (features.length === 0) {
    const high =
      game === "deuces-wild" ? 0 : s.naturals.filter((c) => encodeCard(c) >> 2 >= JACK).length;
    return high > 0 ? `no pair, ${word(high)} high card${high === 1 ? "" : "s"}` : "no pair";
  }
  return features.join(", ");
}

/** "Dealt: pair of 5s, four hearts" — the status line under the cards. */
export function dealtLine(cards: readonly Card[], game: VideoPokerGame): string {
  return `Dealt: ${describeHand(cards, game)}`;
}

/** "$5", "$1.25", "$4,000". Whole-dollar amounts drop the cents. */
export function formatMoney(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
}

/**
 * An average, said the way a dealer would: rounded to the dime on bets of a dollar or more
 * ("about $6.10"), to the cent below that. Always shows cents, since it is an average.
 */
export function formatAverage(cents: number, betCents: number): string {
  const step = betCents >= 100 ? 10 : 1;
  const rounded = Math.round(cents / step) * step;
  const text = formatMoney(rounded);
  return text.includes(".") ? text : `${text}.00`;
}

/** Expected return of a hold in cents, for a bet. */
export function evCents(option: HoldOption, coins: number, denominationCents: number): number {
  return option.ev * coins * denominationCents;
}

/** The coach's button label for the best hold: "Hold these 4", "Hold all 5", "Draw five new". */
export function holdButtonLabel(option: HoldOption): string {
  const k = option.indices.length;
  if (k === 0) return "Draw five new";
  if (k === 5) return "Hold all 5";
  return k === 1 ? "Hold this 1" : `Hold these ${k}`;
}

export interface CoachAdvice {
  readonly verdict: "hint" | "correct" | "mistake";
  /** "HINT · 9/6 JACKS OR BETTER" */
  readonly tag: string;
  /** "Keep the four hearts. Let the pair of 5s go." */
  readonly title: string;
  /** "On average a low pair returns about $4.10 of your $5 bet. Four to a flush returns about $6.10." */
  readonly body: string;
  readonly best: HoldOption;
  /** The hold the advice compares against: the player's choice, or the tempting alternative. */
  readonly compared: HoldOption | null;
  /** Average cents given up per hand by the compared hold (0 when it is optimal). */
  readonly costCents: number;
  /** "Hold these 4" */
  readonly holdLabel: string;
}

/** The first hold worth strictly less than the best: what "the next best play" means. */
function runnerUp(analysis: HoldAnalysis): HoldOption | null {
  return analysis.options.find((o) => !sameEv(o.ev, analysis.best.ev)) ?? null;
}

/**
 * The hold a player's instinct reaches for: keep whatever is already made or paired (and
 * every deuce in Deuces Wild). The hint argues against it when it is wrong.
 */
export function instinctiveHold(hand: readonly Card[], game: VideoPokerGame): number {
  const codes = encodeHand(hand);
  const made = evaluateCodes(game, codes);
  const pat = isPat(made);
  if (pat) return 31;
  const counts = new Array<number>(13).fill(0);
  for (const code of codes) counts[code >> 2] = (counts[code >> 2] as number) + 1;
  return codes.reduce((mask, code, i) => {
    const rank = code >> 2;
    const keep = (counts[rank] as number) >= 2 || (game === "deuces-wild" && rank === DEUCE);
    return keep ? mask | (1 << i) : mask;
  }, 0);
}

/**
 * " Let the pair of 5s go." — what the other hold keeps that the best one throws away. A
 * pair (or trips) the best hold breaks up is named whole, the way a dealer would say it,
 * even if one of its cards survives in the best hold.
 */
function letGoPhrase(analysis: HoldAnalysis, best: HoldOption, other: HoldOption): string {
  const game = analysis.table.game;
  const dropped = other.indices.filter((i) => !(best.mask & (1 << i)));
  if (dropped.length === 0) return "";
  const otherCards = other.indices.map((i) => analysis.hand[i] as Card);
  const groups = new Set(shapeOf(otherCards, game).groups.map((g) => g.rank));
  const broken = dropped.some((i) => groups.has((analysis.hand[i] as Card).rank));
  const named = broken
    ? otherCards.filter((c) => groups.has(c.rank))
    : dropped.map((i) => analysis.hand[i] as Card);
  return ` Let ${describeHold(named, analysis.table).phrase} go.`;
}

function comparison(
  analysis: HoldAnalysis,
  best: HoldOption,
  other: HoldOption,
  denominationCents: number,
): { title: string; body: string } {
  const table = analysis.table;
  const bet = analysis.coins * denominationCents;
  const bestText = describeHold(best.held, table);
  const otherText = describeHold(other.held, table);

  const keep = best.indices.length === 0 ? "Throw all five back." : `Keep ${bestText.phrase}.`;
  const letGo = best.indices.length === 0 ? "" : letGoPhrase(analysis, best, other);

  const sameConcept = bestText.concept === otherText.concept;
  const otherName = sameConcept ? `holding ${otherText.phrase}` : otherText.concept;
  const bestName = sameConcept ? `holding ${bestText.phrase}` : bestText.concept;
  const verb = (text: HoldDescription) => (text.plural && !sameConcept ? "return" : "returns");
  // Two different holds should never read as the same amount: drop to cents if dimes tie.
  const otherCents = evCents(other, analysis.coins, denominationCents);
  const bestCents = evCents(best, analysis.coins, denominationCents);
  const roundingBet = formatAverage(otherCents, bet) === formatAverage(bestCents, bet) ? 0 : bet;
  const body =
    `On average ${otherName} ${verb(otherText)} about ` +
    `${formatAverage(otherCents, roundingBet)} of your ${formatMoney(bet)} bet. ` +
    `${capitalize(bestName)} ${verb(bestText)} about ${formatAverage(bestCents, roundingBet)}.`;
  return { title: `${keep}${letGo}`, body };
}

function tagFor(table: PayTable, verdict: CoachAdvice["verdict"]): string {
  const label = verdict === "hint" ? "HINT" : verdict === "correct" ? "NICE HOLD" : "BETTER HOLD";
  return `${label} · ${table.name.toUpperCase()}`;
}

/**
 * The hint shown before the player draws. It argues for the best hold against the hold the
 * player is most likely to reach for (keeping what is already paired or made), or against
 * the runner-up when instinct already agrees with the math.
 */
export function coachHint(analysis: HoldAnalysis, denominationCents: number): CoachAdvice {
  const best = analysis.best;
  const instinct = optionForMask(analysis, instinctiveHold(analysis.hand, analysis.table.game));
  const other = !sameEv(instinct.ev, best.ev) ? instinct : runnerUp(analysis);
  const bet = analysis.coins * denominationCents;
  let title: string;
  let body: string;
  if (other) {
    ({ title, body } = comparison(analysis, best, other, denominationCents));
  } else {
    title =
      best.indices.length === 0
        ? "Throw all five back."
        : `Keep ${describeHold(best.held, analysis.table).phrase}.`;
    body = `Every hold returns about ${formatAverage(evCents(best, analysis.coins, denominationCents), bet)} of your ${formatMoney(bet)} bet here.`;
  }
  return {
    verdict: "hint",
    tag: tagFor(analysis.table, "hint"),
    title,
    body,
    best,
    compared: other,
    costCents: other
      ? evCents(best, analysis.coins, denominationCents) -
        evCents(other, analysis.coins, denominationCents)
      : 0,
    holdLabel: holdButtonLabel(best),
  };
}

/**
 * The verdict after the player holds. A mistake is explained against the best hold in the
 * player's own dollars; a correct hold (any hold tied with the best) is confirmed against
 * the next best play.
 */
export function judgeHold(
  analysis: HoldAnalysis,
  chosenMask: number,
  denominationCents: number,
): CoachAdvice {
  const chosen = optionForMask(analysis, chosenMask);
  const bet = analysis.coins * denominationCents;
  const table = analysis.table;
  if (sameEv(chosen.ev, analysis.best.ev)) {
    const next = runnerUp(analysis);
    const chosenText = describeHold(chosen.held, table);
    const avg = formatAverage(evCents(chosen, analysis.coins, denominationCents), bet);
    const body = next
      ? `${capitalize(chosenText.concept)} ${chosenText.plural ? "return" : "returns"} about ${avg} of your ${formatMoney(bet)} bet on average. The next best play, ${describeHold(next.held, table).concept}, returns about ${formatAverage(evCents(next, analysis.coins, denominationCents), bet)}.`
      : `It returns about ${avg} of your ${formatMoney(bet)} bet on average.`;
    return {
      verdict: "correct",
      tag: tagFor(table, "correct"),
      title: `Right hold. ${capitalize(chosenText.concept)} ${chosenText.plural ? "are" : "is"} the best play here.`,
      body,
      best: chosen,
      compared: next,
      costCents: 0,
      holdLabel: holdButtonLabel(chosen),
    };
  }
  const { title, body } = comparison(analysis, analysis.best, chosen, denominationCents);
  return {
    verdict: "mistake",
    tag: tagFor(table, "mistake"),
    title,
    body,
    best: analysis.best,
    compared: chosen,
    costCents:
      evCents(analysis.best, analysis.coins, denominationCents) -
      evCents(chosen, analysis.coins, denominationCents),
    holdLabel: holdButtonLabel(analysis.best),
  };
}
