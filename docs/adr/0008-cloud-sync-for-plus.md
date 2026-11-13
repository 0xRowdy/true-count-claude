# ADR-0008: Cloud Sync for Plus, on TanStack DB over Convex

**Status:** Accepted · 2026-11-10 · Builds on ADR-0003 (sync arrives as an optional layer over
local state) and ADR-0007 (the Account and the Plan that unlock it) · Decided in #72

## Context

Plus is Sync plus new games and variants, and it isn't sold until Sync exists (#57,
`PRODUCT.md`). Sync is also what makes the subscription pass App Store guideline 3.1.2 on day
one (#71). ADR-0003 deferred sync until a feature needed it and required it to arrive as "an
_optional_ layer over local state, never as a precondition for training". Invariant 8 still
holds: Free players have no Account and must lose nothing.

Three facts shaped the design:

1. **Convex has no offline sync of its own.** Its client queues mutations in memory only, and
   its alpha offline engine was archived in September 2026 (#68).
2. **Almost nothing Tableside stores is edited in place.** Ended Sessions never change, and
   progress is only ever added to. Only strategy drafts, the profile and the Rule Set are
   edited. Conflicts are therefore rare, and merging by id covers the rest.
3. **TanStack DB's Convex adapter has two sharp edges** (checked at 1.0.0-rc.1.4):
   - A synced collection replaces its stored rows with the server's first result, even an
     empty one.
   - It subscribes to whole query results, 100 rows a page and 10k rows by default, with no
     "changes since" pull.

   Its Expo storage package also declares `expo-sqlite ^55 || ^57`, although it uses only
   four `expo-sqlite` methods that SDK 58 still has.

## Decision

**Who and what.**

- Plus and Lifetime get Sync. It runs on its own whenever the player is signed in, with a
  status line on Account and no switch.
- Synced: finished Sessions, progress, strategy drafts, the profile and the Rule Set.
- Bankrolls stay calculated from hands. The amount folded in when old hands are trimmed becomes
  a synced record of its own, so no device counts it twice.
- An open Session never syncs: another device never resumes a run in progress.
- Free keeps Session backup and restore, unchanged.

**Conflicts.**

| Record                          | Rule                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Session, progress, trim records | Insert if absent; merge by id. Nothing is lost                                                                                           |
| Profile, Rule Set               | The last write wins per field, in the order the server received it. Device clocks don't count                                            |
| Strategy draft                  | The last write wins. An edit based on a stale version keeps the losing one as a **Conflicted copy**                                      |
| Delete, Reset progress          | A record that it was deleted, which beats any later update. A delete applies on every device, and Reset progress says so when confirming |

Ids must be unique across devices. Progress decisions and hands gain ids, which existing
records get deterministically. Session ids become UUIDs.

**Client: TanStack DB, on SDK 58.**

- Every player's data lives in TanStack DB collections: local-only on Free devices, and synced
  with Convex on Plus devices. The screens read from one place.
- On iOS and Android, the collections are stored with `@tanstack/expo-db-sqlite-persistence`.
  A pnpm `peerDependencyRules.allowedVersions` override allows `expo-sqlite@58`.
- The first build step is a spike that passes on iOS, Android and the web. It comes with an
  upstream PR widening the range to `^58`, and the override goes once 1.0 includes it. If the
  spike fails, we write a small `expo-sqlite` 58 driver on `@tanstack/db-sqlite-persistence-core`.
  We don't downgrade the SDK.
- On the web, the collections are stored with `@tanstack/browser-db-sqlite-persistence`, which
  is SQLite in WebAssembly, saved in OPFS. A browser window without OPFS keeps data in memory
  and shows a banner that points to Session backup.
- Moving data out of today's storage happens once:
  - On the first launch after the update, the app reads AsyncStorage through the existing
    decoders and schema migrations and writes the result into the local collections.
  - It checks that the counts match, then marks the move as done.
  - If the move fails, the app keeps using today's storage and tries again on the next launch.
  - Today's storage stays as a fallback for one release, then is deleted.
- `src/engine` and `src/drills` remain unaware of any of this. The decoders and merge rules stay
  pure and are tested in Node.

**Server: Convex, shaped for whole-query subscriptions.**

- Progress is stored as one row per game per day, merged on the server by id.
- Each Session has a synced summary row, used by the list, stats and bankroll. Its full log of
  decisions loads when the Session is opened for replay, and goes to file storage if it's too
  large for one document.
- Drafts, the profile and the Rule Set are one row each.
- Pushes carry an idempotency key, and a receipts table means a resent push applies once.
- The sync queries **throw** when the player is signed out or not entitled. They never return
  an empty list, which would wipe the device.
- The expected cost is about \$44 a month at 10k signed-in players.

**Turning sync on and off.**

- **Starting** (Plus, signed in): the device uploads every local row with the idempotent
  pushes, merging by id with no prompt. Only then does it switch to synced collections.
- **Stopping** (Plus lapses, or the player signs out on purpose): the device copies its synced
  rows into local-only collections first. Nothing is lost, and it carries on exactly as on
  Free.
- **A push never fails because the Plan has ended.** The server stores the write and replies
  that sync has ended, and the device keeps the write and switches to local. A lapse can never
  roll back what the player did, because TanStack rolls back a rejected mutation.
- **An expired login while offline** leaves the device synced, showing its stored rows and
  holding writes in the queue until the login comes back (ADR-0007).
- **The server copy** stays until the Account is deleted. Deleting the Account deletes it in
  the same transaction, as with Entitlements. Resubscribing resumes where Sync left off.
- **A device remembers the Account it synced with.** Signing in as a different Account asks
  before adding this device's history to it. Signing out never deletes local data.

## Considered options

- **Our own per-record client** over AsyncStorage, with a cursor pull (#68's recommendation).
  It is cheaper to run, about \$5 a month at 10k players, and leaves Free's storage untouched.
  We chose TanStack DB instead because the project is new enough to adopt the client the
  ecosystem is converging on. The server rules above are the same either way, so this choice
  can be reversed on the client alone.
- **CRDT libraries** (Automerge, Yjs, TinyBase). Their generic merge can't know that an ended
  Session never changes, and Automerge needs WebAssembly on Hermes, which isn't ready.
- **RxDB.** Its Expo storage is a paid add-on, it has no Convex plugin, and the push and pull
  would still be ours to write.
- **Downgrading to SDK 57** to satisfy the version range. That would mean downgrading React
  Native 0.88 and every native module to fix a declared range, not a real incompatibility.

## Consequences

- **Every player's storage moves, not just Plus players'.** The one-time move is the riskiest
  step in the build for Free players. That's why it checks counts, retries, and keeps the old
  storage for a release.
- **Data now leaves the device for Plus players.** The App Store privacy labels, the Google
  Play data safety form and the privacy policy change before Plus is sold.
- **TanStack DB is a pre-release dependency.** 1.0 RC1 shipped 2026-10-29 with no stable date
  announced, and several React Native offline bugs were fixed only in Sept–Nov 2026. Open bug
  TanStack/db#2344 keeps the contents of deleted rows in the SQLite file until it's fixed.
- **Cost grows with whole-query subscriptions**, not with changes. Keep the synced queries
  narrow, and check the bill against the \$44 estimate in the first month of sales.

Research: `docs/research/sync-options.md` on `research/sync-options` (#68). The TanStack DB
findings are in #72.
