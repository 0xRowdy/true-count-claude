# ADR-0002: The game engine is pure TypeScript with zero framework dependencies

**Status:** Accepted · 2026-09-14

## Context

Two of our ten product invariants are claims about correctness that we make *to users*:
the strategy engine is auditable (invariant 4) and the shoe is provable (invariant 5). These
are marketing promises only if we cannot enforce them mechanically.

Category research is unambiguous about the stakes. "Wrong math" accounts for 21% of low-star
reviews across competitor apps, and the damage is not contained to the cell that is wrong.
The representative review: *"Makes me wonder if other plays are wrong in this training app as
well."* One bad chart cell discredits the entire product. Competitors have shipped, in
production, strategy engines that advise standing on a pair of 9s in all cases, that describe
a hard 22 as a target, and that report a running count which does not return to zero at the
end of a balanced shoe.

## Decision

All game logic — shoe, dealing, hand evaluation, rule sets, basic strategy generation,
counting systems, deviations, and expected-value computation — lives in `src/engine` as pure,
synchronous TypeScript.

`src/engine` may not import React, React Native, Expo, any storage or network API, or
anything from `src/ui` or `src/state`. It performs no I/O and reads no clocks. Randomness
enters only through an explicitly injected seeded generator (ADR-0004).

This boundary is enforced by lint rule and asserted in CI.

## Consequences

**Good**

- The engine is testable with a plain Node test runner at full speed, with no simulator,
  no renderer, and no mocking. Basic strategy can be asserted cell-by-cell against reference
  tables for every rule permutation, on every commit. This is what makes invariant 4 real.
- Determinism makes million-hand Monte Carlo verification cheap, so we can assert that
  simulated results sit inside the theoretical band — the evidence behind invariant 5.
- The engine is portable. Web, iOS, and Android run byte-identical logic, so a verdict can
  never differ by platform.
- It is the one part of the codebase that outlives any UI rewrite.

**Bad / accepted risks**

- Some ceremony passing the RNG and rule set explicitly rather than reaching for a global.
  This is the cost of determinism and it is worth paying.
- EV computation for Explanations is the expensive path. If profiling shows it is too slow
  for real-time hints, we memoize per (rule set, hand, upcard, count bucket) — still inside
  the engine, still pure.
