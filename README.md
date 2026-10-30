# Tableside

A casino-game trainer built on an auditable blackjack engine: card counting and basic
strategy, plus roulette, craps, video poker and baccarat. Web, iOS, and Android from one
codebase. (The repository, package and bundle ids keep the project's original name, True Count.)

**Not a gambling app.** No real money, no tokens, no wagering, no ads.

> Every other trainer tells you that you were wrong.
> Tableside shows you _why_, and proves its own math.

## Why

Competitive research (`docs/research/competitive-landscape.md`) found three gaps worth
attacking:

- The category leader ships **no named counting systems at all** — no Hi-Lo, KO, Omega II,
  Wong Halves, Zen, or Red 7, and no index play. Counting depth is our wedge.
- **"It doesn't actually teach" is the #1 product complaint** in the category (22% of low-star
  reviews). Apps give a verdict without a reason.
- **"Wrong math" and "rigged RNG" together account for 40%** of low-star reviews. We answer
  with an auditable strategy engine and a shoe the user can verify themselves.

## What's in it

| Route             | What it does                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/play`           | A full blackjack table at your configured rules. Running and true count, six counting systems, every legal action and none greyed out.                      |
| `/drills`         | Four scored drills — Basic Strategy (with a per-chart-cell weakness breakdown), Counting, True Count conversion, and Deviations (Illustrious 18 and Fab 4). |
| `/rules`          | Configure the table: decks, S17/H17, payout, DAS, surrender, penetration, presets. Shows the house edge and the strategy chart reacting live.               |
| `/shoe-integrity` | Proof the shoe is fair: live composition, the running count landing on zero, the seed, the full dealt history.                                              |
| `/session`        | Statistics and session history, with an explicit end-session control.                                                                                       |

Every graded decision opens an **Explanation**: the expected value of each legal action for
the exact shoe, the governing chart cell, and how the count moved the play. A **Report a bug**
button on every screen produces a report that proves it can rebuild the shoe from its seed and
replay the round.

Everything runs offline, stored on the device. No account needed and no ads; an optional
account (Google or Apple) carries a paid plan across web, iPhone and Android (ADR-0007).

## Numbers

- **~1,800 tests.** Basic strategy is asserted cell by cell against published tables across
  1,152 rule permutations; EVs match Wizard of Odds figures; all 22 deviation indices are
  cross-checked against the EV engine.
- **Web bundle ~1.2 MB; native JS bundles ~3 MB** — against the incumbent's 160 MB web build
  and 257 MB iOS binary.

## Getting started

```sh
pnpm install
pnpm test        # full test suite
pnpm typecheck
pnpm web         # run in a browser
pnpm start       # run on a device via Expo Go
```

## Layout

```
src/engine/   Pure TypeScript. No React, no React Native, no I/O. Fully unit-tested.
src/drills/   The four drills: question generation, scoring, Explanations. UI-free.
src/ui/       React Native components, shared across all three platforms.
src/state/    Session and persistence.
app/          Expo Router routes.
convex/       Optional backend: accounts, plans, Stripe and RevenueCat webhooks.
```

Accounts and billing need a Convex deployment and provider credentials:
`docs/accounts-and-billing.md`. Without them the app builds and runs exactly as before.

## Read before contributing

- **`CONTEXT.md`** — the domain glossary and the ten non-negotiable product invariants.
  Every invariant traces to a specific, verified competitor failure.
- **`docs/adr/`** — the architectural decisions and the evidence behind them.
- **`AGENTS.md`** — issue tracking and triage conventions.
