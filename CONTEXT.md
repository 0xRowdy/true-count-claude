# CONTEXT — True Count

## What this is

**True Count** is a card-counting and advantage-play trainer for blackjack. It is a
_training tool_, not a gambling product: no real money, no tokens, no wagering, no ads.

The product thesis: **True Count shows why a decision is wrong and makes its math inspectable.**

## Why we are building it

The September category research and the October live CQ Nexus review (see
`docs/research/`) guide three priorities:

1. **Named Counting Systems and index practice.** True Count supports Hi-Lo, KO, Omega II,
   Wong Halves, Zen and Red 7. The October CQ Nexus review found counting training but did
   not establish named-system selection or scored deviation drills across its paid surfaces.
2. **"Doesn't teach" is the #1 product complaint in the category** (22% of low-star reviews
   across ~1,100 competitor reviews in the September sample). The October review observed
   contextual blackjack hints and a chart link in CQ Nexus. Our target is deeper, auditable
   Explanations, rather than a claim that competitors never explain a move.
3. **Trust failures dominate the rest.** "Wrong math" (21%) and "rigged RNG" (19%) together
   are 40% of low-star reviews. One wrong strategy cell poisons trust in the whole app. We
   answer this with auditable math and a verifiable shoe.

Store counts and binary sizes in the September report are historical measurements. Use
`docs/research/cqnexus-functionality.md` for current observed capabilities and access limits.

## Glossary

Use these terms exactly. Do not drift to synonyms.

| Term                       | Definition                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shoe**                   | The set of decks in play, plus the cut card position. Owns all randomness.                                                                                           |
| **Penetration**            | Fraction of the shoe dealt before the cut card. Expressed 0–1.                                                                                                       |
| **Running Count (RC)**     | Sum of card tags seen so far, per the active Counting System.                                                                                                        |
| **True Count (TC)**        | RC divided by estimated decks remaining. The product's namesake.                                                                                                     |
| **Counting System**        | A named tag assignment (Hi-Lo, KO, Omega II, Wong Halves, Zen, Red 7). Carries a tag table, a balanced/unbalanced flag, and an index set.                            |
| **Balanced system**        | A system whose tags sum to zero over a full shoe. Hi-Lo, Omega II, Wong Halves, Zen are balanced; KO and Red 7 are not.                                              |
| **Basic Strategy (BS)**    | The count-independent optimal play for a given Rule Set.                                                                                                             |
| **Deviation / Index Play** | A departure from Basic Strategy triggered when TC crosses an index number. The Illustrious 18 and Fab 4 are the canonical sets.                                      |
| **Rule Set**               | The table configuration: deck count, S17/H17, 3:2 vs 6:5, DAS, surrender, resplit aces, dealer peek, penetration, min/max. Strategy is a _function of_ the Rule Set. |
| **Drill**                  | A focused training exercise with scored, per-decision feedback. Distinct from free Play.                                                                             |
| **Play**                   | Unscored simulated table play.                                                                                                                                       |
| **Decision**               | One player action (hit/stand/double/split/surrender/insurance) with the hand state that produced it. The unit of scoring and of explanation.                         |
| **Explanation**            | The _why_ behind a Decision verdict: per-action EV, the governing chart cell, and the count's effect. Never omitted.                                                 |
| **Session**                | A bounded run of Play or Drill, with its own stats and a replayable Decision log.                                                                                    |
| **Shoe Integrity Panel**   | The user-facing proof that the shoe is fair: remaining composition, RC returning to zero after the full Shoe, exportable history.                                    |

## Non-negotiable product invariants

These exist because each maps to a specific, verified competitor failure. Violating one is a
bug, not a design choice.

1. **No second paywall.** Gate breadth (more games/variants), never depth of training. A drill
   type is never a separate purchase. (36% of category low-star reviews are paywall friction.)
2. **Every wrong verdict carries an Explanation.** Right/wrong without why is not shippable.
3. **Feedback arrives while the cards are still visible.** Never sweep the hand and then grade it.
4. **The strategy engine is auditable.** The user can see the chart cell behind any verdict,
   and CI asserts the whole chart against reference tables for every Rule Set permutation.
5. **The shoe is provable.** RC must return to zero after every card in the Shoe is exposed
   for balanced systems, and the user can verify this themselves. A cut card can leave unseen
   cards, so its Running Count need not be zero. Seeded shoes are reproducible.
6. **Never a dead end.** A bankroll at zero always offers a one-tap reset in place.
7. **Buttons, not gestures, and never a disabled legal action.** Greying out a legal action
   corrupts the user's accuracy statistics.
8. **Offline-first.** No login required to train. Nothing core is behind an account.
9. **Zero ads. Ever.**
10. **In-app bug reporting that captures hand state.**

## Architecture at a glance

One Expo/TypeScript codebase targets web, iOS, and Android.

```
src/
├── engine/        # Pure TypeScript. Zero React, zero React Native, zero I/O.
│   ├── shoe        — deck construction, seeded RNG, dealing, penetration
│   ├── rules       — Rule Set types and defaults
│   ├── hand        — hand evaluation, legal actions
│   ├── strategy    — basic strategy chart generation per Rule Set
│   ├── counting    — counting systems, RC/TC
│   ├── deviations  — index plays
│   └── ev          — per-action expected value (powers Explanations)
├── drills/        # Drill definitions and scoring, built on engine
├── ui/            # React Native components, shared across all three platforms
├── state/         # Session/persistence
└── app/           # Expo Router routes
```

`src/engine` is the deep module at the core. It is pure, synchronous, and fully unit-tested,
which is what makes invariants 4 and 5 enforceable in CI. Nothing in `engine` may import from
`ui`, `state`, or any React/React Native/Expo package.
