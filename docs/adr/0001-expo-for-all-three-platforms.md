# ADR-0001: Expo + React Native Web for web, iOS, and Android

**Status:** Accepted · 2026-09-14

## Context

The MVP must ship on web, iOS, and Android within one week. Two hard constraints shape this:

1. **The build machine has no native toolchain.** No Xcode (Command Line Tools only, no
   `xcodebuild`), no Android SDK, no `ANDROID_HOME`, no Java runtime, no CocoaPods, no
   watchman. Installing and configuring all of it is a multi-hour task with a real chance of
   consuming a day of a seven-day budget.
2. **One team, three platforms, one week.** Three codebases is not reachable.

The incumbent, CQ Nexus, is built on **Unity WebGL**. Measured directly: ~30 seconds from
navigation to first paint on `games.cqnexus.com`, ~50 seconds to a playable table, a 160 MB
web build, a 257 MB iOS binary, and the game is letterboxed to 16:9 rather than responsive.
Their iOS build is a full major version behind web (3.5.10 vs 5.0.3) because every change has
to clear Apple review on a heavyweight binary.

## Decision

Build a single **Expo (React Native + React Native Web)** application in TypeScript, using
Expo Router for navigation. Produce iOS and Android binaries with **EAS Build** (cloud), and
the web target as a static export.

## Consequences

**Good**

- No local Xcode or Android SDK required — EAS builds in the cloud. This is what makes the
  one-week target feasible at all.
- Expo Go gives device testing on real iOS/Android hardware today, with no developer account
  and no build step.
- One codebase, one set of tests, one release.
- The web build is a fast, ordinary web app. Against a 160 MB Unity build with a 30-second
  cold start, near-instant load is a genuine competitive advantage, not a compromise.
- Web updates ship the moment we push, sidestepping the iOS review latency that keeps the
  incumbent a major version behind on mobile.

**Bad / accepted risks**

- We cannot render a photorealistic 3D felt. We are not trying to; see ADR-0005.
- EAS Build has a free-tier queue. Store submission needs an Apple Developer account
  ($99/yr) and a Google Play account ($25 one-time) — flagged to the user as a setup item.
- React Native Web has some styling divergence from the native targets. Mitigated by keeping
  the UI deliberately simple and testing all three targets from day one.

## Alternatives considered

- **Flutter** — comparable cross-platform story, but it is a second language and ecosystem
  for no gain here, and its web output is heavier.
- **Native × 3** — best fidelity, impossible in the time budget, and blocked outright by the
  missing local toolchain.
- **Unity** (what the incumbent chose) — we would inherit exactly the weaknesses we intend
  to attack: binary size, cold start, and slow iOS shipping.
- **Web-only PWA first** — fastest to ship, but the brief explicitly requires iOS and Android.
