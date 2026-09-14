# ADR-0004: The shoe is seeded, reproducible, and user-verifiable

**Status:** Accepted · 2026-09-14

## Context

"Rigged RNG" accounts for **19% of low-star reviews** across competitor trainers — the
fourth-largest complaint category, and one that is mostly *perception* rather than defect.
Representative: *"every time I bet higher, the dealer magically gets a blackjack or 20... it
appears rigged."* Craps and blackjack simulators attract this at a high rate because users
cannot distinguish an ordinary downswing from a dishonest shoe.

But not all of it is perception. Users have caught real defects: a double-deck game dealing
more than twelve 2s, and — most damningly — *"the count does not end on 0 when the shoe is
finished like it should."* That last one is a complete, testable proof of a broken shoe, and
a user found it before the developer did.

We cannot argue a user out of believing the shoe is rigged. We can let them check.

## Decision

The shoe is driven by an explicitly seeded PRNG, injected into the engine. Every Session
records its seed, which makes any shoe reproducible and any reported bug replayable.

We ship a **Shoe Integrity Panel** as a first-class, always-available feature:

- remaining composition by rank, live
- the running count, with the assertion that a balanced system returns to exactly zero at
  the end of the shoe, shown as a verifiable check rather than a claim
- the full dealt-card history, exportable
- the user's actual results plotted against the theoretical expectation band, so a normal
  losing streak reads as normal

CI asserts shoe integrity directly: composition conservation, RC returning to zero for every
balanced system over full shoes, and Monte Carlo results falling inside the theoretical band.

## Consequences

**Good**

- Converts the category's fourth-largest complaint into a differentiating trust feature, at
  low engineering cost. This is the cheapest credibility we can buy.
- Seeded shoes make bug reports reproducible — a seed plus a decision index is a complete
  repro, which makes invariant 10 (in-app bug reporting) genuinely actionable.
- Reproducible shoes unlock later features for free: shared challenge hands, daily drills,
  and replaying a shoe to re-drill the decisions you lost.
- Determinism is what makes the engine's test suite meaningful (ADR-0002).

**Bad / accepted risks**

- A determined user could in principle predict a shoe from its seed. In a training app with
  no money at stake this is a non-issue, and reproducibility is worth far more than opacity.
- We must not use `Math.random()` anywhere in the engine. Enforced by lint.
