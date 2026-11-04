# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

People who want to practise and learn strategy for casino games before they play for real money
at a casino. Most have a favourite game and a specific strategy they want to rehearse until it
holds up at a real table. Experience ranges from "never played, or only watched" to regulars who
"know the basics but guess on the close calls" (onboarding).

They are the audience of strategy-education channels such as:

- Craps: [Color Up](https://www.youtube.com/@ColorUp/videos)
- Roulette: [CEG Dealer School](https://www.youtube.com/@CEGDealerSchool/videos)
- Blackjack: [Blackjack Apprenticeship](https://www.youtube.com/@Blackjackapprenticeship/videos)

These name who the users are, not a visual direction. CEG Dealer School operates the incumbent,
CQ Nexus (`docs/research/competitive-landscape.md`), so part of this audience already knows the
main competitor. Category reviews show this audience judges a trainer on two things: whether it
actually teaches, and whether its math is right.

Onboarding records three goals, and future work serves all three: straight to the tables;
table-ready for a trip (an optional trip date paces the plan); strategy drilled until automatic.

## Product Purpose

Tableside is a casino-game trainer built on an auditable blackjack engine. Players rehearse
strategy at simulated tables set to the rules they will face, and a coach explains each decision
with math they can inspect. Five games: blackjack (basic strategy, six Counting Systems, index
plays), roulette, craps, video poker and baccarat.

It is practice only. No real money, no wagering, no tokens, no ads; balances are virtual.

Success means the player sits down at a real table able to execute their chosen strategy without
guessing, and knows what each decision or bet earns or costs.

## Positioning

- **Explains why, and shows the math.** Every graded Decision carries an Explanation: per-action
  EV, the governing chart cell, and how the count moved the play (ADR-0005). The incumbent
  competes on casino-procedure authenticity and a 3D felt; Tableside competes on teaching and
  auditability, the gap behind the category's top complaint ("doesn't teach", 22% of low-star
  reviews).
- **Math the user can verify.** Strategy charts are asserted cell by cell against reference tables
  across rule permutations, and the shoe is seeded, reproducible and checkable in the Shoe
  Integrity Panel (ADR-0002, ADR-0004). This answers "wrong math" and "rigged RNG", together 40%
  of low-star reviews.
- **The table you'll actually sit at.** Rule sets match real casino configurations (6-deck S17
  3:2, single zero and La Partage, 3-4-5x to 100x craps odds, 9/6 Jacks or Better), with payouts to
  the penny.
- **Your strategy, tested.** Strategy builders let players edit their own strategy or fork an
  example, then test it at the table. The coach follows the draft and prices what it gives up
  against the engine's chart.
- **Light and immediate.** A fast 2D app that works offline, against an incumbent Unity build
  measured at ~30 s to first paint and 160 MB on web (ADR-0001).

## Operating Context

- Practice happens ahead of a casino trip. Most users are expected to be on mobile, so phone-sized
  screens come first. Tablets (portrait and landscape) and a web build on desktop and mobile
  browsers are also supported. Training must work with no signal (ADR-0003).
- Local-first: no account and no backend. Progress, settings and strategies stay on the device;
  Session backups leave it only when the user downloads or shares them.
- Onboarding asks for experience level, goal, game, how often the coach speaks up (every decision,
  mistakes only, or on request) and an optional trip date, then proposes a three-lesson starting
  point.
- When the user goes off-strategy the hand pauses. They see the right move, a one-sentence reason,
  and a Take it back button.
- Report a bug captures the current hand state (seed, cards, actions) so a report can be replayed.

## Capabilities and Constraints

- **Surfaces:** landing, onboarding, lobby, blackjack Play, four scored Drills (Basic Strategy,
  Counting, True Count conversion, Deviations), Rules, Shoe Integrity, Session, Progress, the four
  other game tables, strategy builders (blackjack, craps, roulette), simulated live craps, and
  pricing. The route table is in `README.md`.
- **Terminology:** use the glossary in `CONTEXT.md` exactly (Shoe, Running Count, True Count,
  Counting System, Rule Set, Drill vs Play, Decision, Explanation, Session, Shoe Integrity Panel).
- **Invariants:** the ten non-negotiables in `CONTEXT.md` bind all design work. The ones that most
  directly shape UI:
  - feedback arrives while the cards are still visible;
  - every wrong verdict carries an Explanation;
  - buttons, not gestures, and a legal action is never disabled;
  - a zero bankroll always offers a one-tap reset in place;
  - no login to train, zero ads, no second paywall.
- **Labelled, not real:** the live craps table is seeded bots on the device; community strategies
  (authors, votes, forks, accuracy) are seeded examples; pricing is a preview and processes no
  payment. Accounts, payments, community publishing and network multiplayer each need a separate
  product decision before they become real.
- **Identifiers:** the repository, package, bundle ids (`com.truecount.app`) and URL scheme
  (`truecount`) keep the original True Count name.
- **Undecided:**
  - The monetisation model. The preview shows a monthly price or $49 a year; invariant 1 limits
    any paid tier to breadth, never training depth.
  - Cloud sync, deferred until a feature needs it (ADR-0003).
  - Simulated live tables for blackjack and roulette ("Opens soon").

## Brand Commitments

- **Name:** Tableside. True Count is retired as a brand. It survives in identifiers and as the
  glossary term (TC = Running Count ÷ decks remaining).
- **Line:** "Tableside explains your decisions and lets you inspect the math." (`README.md`)
- **Coach voice, from shipped copy:**
  - It explains and never scolds ("No scolding, no lost progress").
  - It speaks in plain, specific, numeric sentences ("12 against a dealer 7 is a hit").
  - It is candid about cost ("Shows exactly what the house edge costs you per roll before you
    commit").
- **Required disclosures:**
  - Practice only: balances are virtual, have no cash value, and there is no real-money gambling.
  - Training and EV estimates do not guarantee casino results.
  - Previews, examples and simulations say so where they appear.
- **Zero ads. Ever.**

## Evidence on Hand

- **Research:**
  - `docs/research/competitive-landscape.md`: September category study of ~1,100 competitor
    reviews with complaint shares. Its store counts and binary sizes are historical.
  - `docs/research/cqnexus-functionality.md`: October live review of CQ Nexus, with evidence in
    `.verify/competitor/`.
- **Correctness:** over 3,000 tests. Reference charts are checked cell by cell, legal actions
  across 1,152 rule permutations, and all 22 deviation indices are cross-checked against the EV
  engine. Chart provenance is in `src/engine/fixtures/README.md`.
- **Verification:** `docs/mvp-verification.md` maps each design frame and invariant to evidence;
  screenshots are in `.verify/evidence/`.
- **Assets:**
  - game images: `assets/games/*.jpg`;
  - avatars: `assets/avatars/`;
  - app icons: `assets/`;
  - the 18-frame MVP design: `design/Truecount-claude.pen`;
  - generated comps: `design/mvp-assets/`.
- **Absent, do not fabricate:** real users, testimonials, ratings, press, partnerships, usage
  metrics, a real community, a confirmed price, and any accessibility certification.

## Product Principles

1. **Explain, then let them check.** Every verdict comes with its reason, and every number can be
   traced to a chart cell, an EV figure or the shoe.
2. **Practise the table they'll actually sit at.** Rules, payouts and options mirror real casino
   configurations the player chooses, not a generic house game.
3. **Price every strategy honestly.** Players can rehearse any strategy they bring, including
   systems with negative expectation. The coach shows what a system costs instead of endorsing or
   forbidding it.
4. **Never corrupt the practice.** Feedback arrives while the hand is visible, and every legal
   action stays available. A depleted bankroll never leaves the player stuck, and ads or paywalls
   never interrupt training.
5. **Trust is local and labelled.** No account, data stays on the device, and anything simulated,
   exemplary or previewed says so plainly.

## Accessibility & Inclusion

- Shipped commitments: web controls support keyboard navigation, and actions have accessible
  labels.
- Report a bug is the route for a control someone finds hard to use.
- Accessibility testing is ongoing and no certification is claimed.
- Buttons, not gestures, is a product invariant.
- A target standard (for example a WCAG level, or native text-scaling support) has not been set.
