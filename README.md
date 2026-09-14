# True Count

A card-counting and advantage-play trainer for blackjack. Web, iOS, and Android from one
codebase.

**Not a gambling app.** No real money, no tokens, no wagering, no ads.

> Every other trainer tells you that you were wrong.
> True Count shows you *why*, and proves its own math.

## Why

Competitive research (`docs/research/competitive-landscape.md`) found three gaps worth
attacking:

- The category leader ships **no named counting systems at all** — no Hi-Lo, KO, Omega II,
  Wong Halves, Zen, or Red 7, and no index play. Counting depth is our wedge.
- **"It doesn't actually teach" is the #1 product complaint** in the category (22% of low-star
  reviews). Apps give a verdict without a reason.
- **"Wrong math" and "rigged RNG" together account for 40%** of low-star reviews. We answer
  with an auditable strategy engine and a shoe the user can verify themselves.

## Getting started

```sh
pnpm install
pnpm test        # engine test suite
pnpm typecheck
pnpm web         # run in a browser
pnpm start       # run on a device via Expo Go
```

## Layout

```
src/engine/   Pure TypeScript. No React, no React Native, no I/O. Fully unit-tested.
src/drills/   Drill definitions and scoring.
src/ui/       React Native components, shared across all three platforms.
src/state/    Session and persistence.
app/          Expo Router routes.
```

## Read before contributing

- **`CONTEXT.md`** — the domain glossary and the ten non-negotiable product invariants.
  Every invariant traces to a specific, verified competitor failure.
- **`docs/adr/`** — the architectural decisions and the evidence behind them.
- **`AGENTS.md`** — issue tracking and triage conventions.
