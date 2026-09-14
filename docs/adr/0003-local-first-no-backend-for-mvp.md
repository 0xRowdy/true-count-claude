# ADR-0003: Local-first, no backend for the MVP

**Status:** Accepted · 2026-09-14

## Context

The single most severe verified complaint against CQ Nexus is **entitlement and session sync
failure**. A paying customer, in a 2-star iOS review, reported that a purchase made on one
platform did not appear in "My Stuff" on another, and that game sessions did not close
reliably across surfaces. A second paying customer left 1 star because their in-game bankroll
hit zero and the top-up feature lived on a *separate website* they never found — the
developer's own reply confirms both the feature and the discoverability failure.

Every one of those failures is a consequence of server-authoritative state serving a product
that does not need it. Meanwhile our invariant 8 requires that nothing core sits behind an
account, and the MVP has no multiplayer, no leaderboard, and nothing to sync.

## Decision

The MVP ships with **no backend**. All state — sessions, decision logs, settings, bankroll,
progress — persists locally on device. No login, no account, no network call is required to
use any part of the product.

Cloud sync is deferred until there is a feature that genuinely requires it. When it arrives,
it arrives as an *optional* layer over local state, never as a precondition for training.

## Consequences

**Good**

- Removes the incumbent's worst failure mode by construction: there is no cross-device
  entitlement state, so it cannot desynchronize.
- Removes an entire week of work — auth, accounts, API, hosting, migrations — from a
  seven-day budget, and spends it on the trainer instead.
- Delivers invariant 8 (offline-first) for free. The app works on a plane, in a basement,
  and in a casino with no signal.
- No user data leaves the device, so there is no privacy surface to defend. Competitor
  reviews include accusations of spyware and one report of another user's name appearing in
  a session — both are trust-destroying and both are impossible here.
- Nothing to operate, nothing to page anyone about, no hosting bill.

**Bad / accepted risks**

- Clearing app data loses progress. Mitigated by an export/import of session history, which
  we want regardless for the Shoe Integrity Panel.
- No cross-device continuity in v1. Acceptable: single-device practice is the actual use case.
- We will need a migration path when sync lands. Mitigated by versioning the persisted schema
  from the first commit.
