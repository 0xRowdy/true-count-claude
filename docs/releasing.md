# Releasing True Count

Three targets, one codebase (ADR-0001). The build machine has **no Xcode, no Android SDK, and
no Java**, so all native builds happen in Expo's cloud via EAS.

## Web

```sh
pnpm build:web      # static export into dist/
```

Output is a static site — deploy it anywhere. Current bundle is ~1.1 MB, against the
incumbent's 160 MB Unity build. Keep it that way: check the bundle size when adding a
dependency.

## Device testing — no accounts needed

The fastest loop, and the one to use daily:

```sh
pnpm start          # scan the QR code with Expo Go on iOS or Android
```

This requires no Expo account, no Apple Developer account, and no Google Play account.

## Native builds — needs an Expo account

One-time setup, performed by a human:

1. Create a free account at <https://expo.dev/signup>.
2. `npm install -g eas-cli`
3. `eas login`
4. `eas init` — links this repo to an EAS project and writes the project ID into `app.json`.

Then:

```sh
eas build --profile preview --platform android   # installable APK
eas build --profile preview --platform ios       # needs an Apple Developer account
eas build --profile production --platform all
```

`eas.json` is already committed with development, preview, and production profiles.

## Store submission — needs paid accounts

Deferred until after the MVP, by decision on 2026-09-14.

- **Apple Developer Program** — $99/yr. Required for any build on a physical iPhone outside
  Expo Go, and for TestFlight.
- **Google Play Developer** — $25 one-time. Required for Play internal testing and release.

Once both exist: `eas submit --platform android` / `eas submit --platform ios`.

## A note on cadence

The incumbent's iOS build runs a full major version behind their web build because every
change ships as a 257 MB Unity binary through Apple review. Our advantage is that web updates
land the moment we push, and native updates can go out over the air via EAS Update without a
store round trip. Prefer shipping small and often.
