# Tableside

A casino-game trainer built on an auditable blackjack engine: card counting and basic
strategy, plus roulette, craps, video poker and baccarat. Web, iOS, and Android from one
codebase. (The repository, package and bundle ids keep the project's original name, True Count.)

**Not a gambling app.** No real money, no tokens, no wagering, no ads.

> Tableside explains your decisions and lets you inspect the math.

## Why

The September [category research](docs/research/competitive-landscape.md) and October
[CQ Nexus review](docs/research/cqnexus-functionality.md) guide three priorities:

- **Counting depth:** Hi-Lo, KO, Omega II, Wong Halves, Zen, Red 7, and index practice.
  The live competitor review found counting training; it did not establish equivalent
  named-system selection or scored deviation training across all paid surfaces.
- **"It doesn't actually teach" is the #1 product complaint** in the category (22% of low-star
  reviews in that sample). CQ Nexus now visibly supplies contextual hints; our focus is
  explanation depth and auditability.
- **"Wrong math" and "rigged RNG" together account for 40%** of low-star reviews. We answer
  with an auditable strategy engine and a shoe the user can verify themselves.

## What's in it

| Route             | What it does                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/play`           | A full blackjack table at your configured rules. Running and true count, six counting systems, every legal action and none greyed out.                      |
| `/drills`         | Four scored drills — Basic Strategy (with a per-chart-cell weakness breakdown), Counting, True Count conversion, and Deviations (Illustrious 18 and Fab 4). |
| `/rules`          | Configure the table: decks, S17/H17, payout, DAS, surrender, penetration, presets. Shows the house edge and the strategy chart reacting live.               |
| `/shoe-integrity` | Proof the shoe is fair: live composition, the running count landing on zero, the seed, the full dealt history.                                              |
| `/session`        | Statistics, session history, explicit end-session control, and JSON backup/restore.                                                                         |
| `/games/*`        | Roulette, craps, baccarat, and video poker, with rules, explanations, and saved practice bankrolls.                                                         |
| `/strategies/*`   | Local blackjack, craps, and roulette strategy builders with test runs and example strategies to fork.                                                       |
| `/progress`       | Recorded practice, accuracy, mastery, achievements, and bankroll history.                                                                                   |
| `/live/craps`     | A simulated table with bot players and local chat.                                                                                                          |

Every graded decision opens an **Explanation**: expected-value estimates using the shoe's
composition, the governing chart cell, and how the count moved the play. The panel describes
the solver's approximations. **Report a bug** captures the current screen's state.
Blackjack Play reports include the shoe seed and round actions, with reconstruction
and replay checks.

Training and history stay on the device. The production web build caches all routes after
one completed online visit, then supports offline navigation and reloads. Native builds
bundle the app directly. No account or ads. Community content and multiplayer are labelled
examples/simulations; pricing is a preview and no payment is processed.

## Numbers

- **Over 3,000 tests.** Reference charts are checked cell by cell, and legal actions are
  checked across 1,152 rule permutations. EV tests compare published reference figures;
  all 22 deviation indices are cross-checked against the EV engine.
- **Web JavaScript bundle about 2.3 MB.** `pnpm build:web` reports the current size and
  generates the offline cache from the exported files.

The [MVP verification record](docs/mvp-verification.md) maps the design and product
requirements to evidence, including current native and physical-device checks.

## Getting started

```sh
pnpm install
pnpm test        # full test suite
pnpm typecheck
pnpm web         # run in a browser
pnpm exec expo start --go  # run on a device via Expo Go
```

## Layout

```
src/engine/   Pure TypeScript. No React, no React Native, no I/O. Fully unit-tested.
src/drills/   The four drills: question generation, scoring, Explanations. UI-free.
src/ui/       React Native components, shared across all three platforms.
src/state/    Session and persistence.
app/          Expo Router routes.
```

## Read before contributing

- **`CONTEXT.md`** — the domain glossary and the ten non-negotiable product invariants.
  Every invariant traces to a specific, verified competitor failure.
- **`docs/adr/`** — the architectural decisions and the evidence behind them.
- **`AGENTS.md`** — issue tracking and triage conventions.
