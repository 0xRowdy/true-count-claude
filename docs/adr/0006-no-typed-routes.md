# ADR-0006: Expo Router typed routes are off

**Status:** Accepted · 2026-09-14

## Context

The project was scaffolded with `experiments.typedRoutes: true`, which makes Expo Router
generate `.expo/types/router.d.ts` and narrow `Link href` to the set of routes that exist.

In principle that catches a typo'd href. In practice, on this project, it did not — and it
cost real time twice in one afternoon.

Two facts combine badly:

1. **The generated file is produced by the dev server**, not by `expo export` or `tsc`. So it
   goes stale the moment a route is added and stays stale until someone runs `expo start`.
2. **`.expo/` is gitignored**, so CI never has the file at all. Without it the `href` type
   falls back to a permissive form and every route typechecks.

Together those mean typed routes provide **zero protection in CI** — the only place that
gates a merge — while breaking `pnpm typecheck` locally for whoever merges a branch that
added a route. With several agents working in parallel worktrees and each adding routes, that
is a recurring tax for no benefit.

Committing the generated file would fix the CI half, but checking in a build artifact that
changes whenever `app/` changes trades one merge conflict for another.

## Decision

Turn typed routes off. `Link href` takes a string.

## Consequences

**Good**

- `pnpm typecheck` depends only on committed source, so it means the same thing locally and
  in CI. An agent's green run stays green after the merge.
- One fewer generated artifact to reason about.

**Bad / accepted risks**

- A typo'd `href` is no longer a type error. It surfaces as a 404 at runtime instead. The
  route surface is small and every route is linked from the home screen, so a broken link is
  immediately visible.
- If the route table grows large enough that this stops being true, revisit — but revisit by
  adding a *test* that asserts every `href` in the codebase resolves to a file in `app/`,
  which would work in CI, rather than by re-enabling an editor-only check.
