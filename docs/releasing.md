# Releasing True Count

Three targets, one codebase (ADR-0001). This Linux machine has no Xcode. EAS builds
native artifacts in the cloud. Task-local Java, Android SDK, emulator and Maestro
tooling are available under `~/.local/share/true-count-native`, with Java managed by mise.

## Web

```sh
pnpm build:web      # static export into dist/
```

Output is a static site. The build prints the JavaScript bundle size; check it when adding
a dependency. The current export includes about 2.3 MB of JavaScript.

The build also generates `dist/sw.js`, which caches the exported app for offline training.
Serve the whole `dist/` directory over HTTPS, with clean URL resolution such as
`/play` to `play.html` and `/drills` to `drills/index.html`. Serve `sw.js` with
`Cache-Control: no-cache` so browsers check for new versions. One completed online visit
downloads all routes and assets; subsequent visits and reloads work offline. New versions
activate after existing tabs close, so updates do not interrupt a hand. Progress stays in
local storage when the app cache updates.

## Device testing — no accounts needed

The fastest loop, and the one to use daily:

```sh
pnpm exec expo start --go    # scan the QR code with Expo Go on iOS or Android
```

This requires no Expo account, no Apple Developer account, and no Google Play account.
The phone and computer must share a reachable network for a LAN connection. Development
client builds are also supported; use `pnpm start` with an installed development build.

## Native builds — needs an Expo account

One-time setup, performed by a human:

1. Create a free account at <https://expo.dev/signup>.
2. `npm install -g eas-cli`
3. `eas login`
4. This repo is already linked to the project in `app.json`. Use that project after login;
   run `eas init` only if intentionally creating a different project.

Then:

```sh
eas build --profile preview --platform android   # installable APK
eas build --profile preview --platform ios       # needs an Apple Developer account
eas build --profile preview-simulator --platform ios # simulator .app, no Apple signing
eas build --profile production --platform all
```

`eas.json` defines development, preview, preview-simulator and production profiles.

## Automated native smoke test

`.maestro/native-smoke.yml` drives launch, a True Count answer, session ending,
backup and persistence after relaunch. `.maestro/native-play.yml` exercises a
blackjack round and its settlement. `.maestro/native-onboarding.yml` checks profile
creation and persistence; `.maestro/native-games.yml` checks roulette, baccarat,
video poker and craps, including a reproducible seeded video poker deal.
`.maestro/native-layout.yml` checks eight trainer headers without scrolling past
their controls. `.maestro/native-card-layout.yml` checks wrapping on the Lobby
and Progress pages and captures the weekly chart. `.maestro/native-notices.yml`
requires footer notices to appear immediately after tapping and verifies that
pricing timelines describe hypothetical examples. These seven flows include
visual regressions that the previous behavior-only smoke test missed.
`.eas/workflows/native-smoke.yml` builds an iOS artifact and runs all seven flows
on a macOS worker with Apple's simulator, so the
local host can be Linux. Android uses the APK with a local emulator. Run and inspect
the iOS workflow with the EAS CLI:

```sh
npx --yes eas-cli@latest workflow:run .eas/workflows/native-smoke.yml --non-interactive
```

The flows accept iOS's system confirmation when opening a deep link.
The workflow uploads Maestro reports and screenshots. A successful JavaScript export
does not replace these runtime checks. Interactive Expo Simulators access is separate
from EAS Workflows and is not enabled for the current account. The workflow uses a
custom job because this account cannot run the paid built-in Maestro job.

For JavaScript-only changes with an unchanged native dependency fingerprint,
`.eas/workflows/native-repack.yml` embeds the current bundle and assets into an
existing preview build, preserving its native runtime and Android signing key.
It runs the iOS suite after repacking:

```sh
npx --yes eas-cli@latest workflow:run .eas/workflows/native-repack.yml \
  -F platform=ios -F build_id=EXISTING_SIMULATOR_BUILD_ID --non-interactive
# Android: use platform=android and an existing preview APK build ID.
```

A simulator `.app` cannot be installed on a physical iPhone. Use Expo Go for the
physical-device check until Apple signing is available. Android preview APKs can
be installed directly; run the same `.maestro` directory against that installed
artifact. Disable emulator Wi-Fi and mobile data to verify the bundled app,
assets and persisted history independently of Metro.

## Internal artifacts verified on 2026-10-22

- [Android preview APK](https://expo.dev/accounts/mmgjlegacy/projects/true-count/builds/f9c771f5-7ecb-4e85-8dd9-7671094a561c):
  EAS signing certificate, APK v2 and v3 signature verified. All seven native flows
  passed on this exact APK with emulator Wi-Fi and mobile data disabled.
- [iOS simulator app](https://expo.dev/accounts/mmgjlegacy/projects/true-count/builds/a44d17be-353e-4846-a25e-286726306488):
  all seven native flows passed in
  [the simulator workflow](https://expo.dev/accounts/mmgjlegacy/projects/true-count/workflows/01a163e5-da63-7750-9761-95dc7cd8c77a).

These artifacts include the final bundled JavaScript and assets. Expo lists their
expiration as November 5, 2026; local copies are already retained.
These builds include the native header, card and chart-label layout fixes, plus
the replay, backup recovery, footer notice and pricing review fixes.
The submitted source and test snapshot is `.verify/native/review-source-manifest.json`;
artifact hashes and URLs are in `.verify/native/review-artifacts.json`. These builds were
submitted before the changes were committed, so the Git commit displayed by EAS alone does
not identify the bundled source. All 399 files in the source manifest match commit `1cf316d`;
`.verify/native/review-commit-source-check.json` records the comparison.
See [the MVP verification record](mvp-verification.md) for runtime evidence and
remaining physical-device checks.

## Store submission — needs paid accounts

Deferred until after the MVP, by decision on 2026-09-14.

- **Apple Developer Program** — $99/yr. Required for EAS internal distribution to
  physical iPhones and for TestFlight.
- **Google Play Developer** — $25 one-time. Required for Play internal testing and release.

Once both exist: `eas submit --platform android` / `eas submit --platform ios`.

Web releases replace the static export. Native releases require a new binary; EAS Update
is not configured in this MVP. Store publication remains a separate action from internal builds.
