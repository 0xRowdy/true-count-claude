# Sync options for a local-first Expo app on Convex

Gathered 2026-11-10 for issue #68. The question: how Tableside can sync its on-device state
(Sessions, progress, strategies, bankrolls) through Convex across web, iOS and Android while
staying offline-first (invariant 8, `CONTEXT.md`: "Offline-first. No login required to train.
Nothing core is behind an account").

Primary sources: Convex docs and pricing (`docs.convex.dev`, `convex.dev`), the Convex JS
client source (`convex` 1.49.0 in `node_modules`), Convex's GitHub repos (`convex/automerge-sync`,
`convex/curvilinear`, `get-convex/prosemirror-sync`), the npm registry (versions and publish
dates, queried 2026-11-10), and each library's own docs or repo: TanStack DB, Automerge, Yjs,
TinyBase, Legend State, Replicache, PowerSync, RxDB. Two non-vendor sources are marked
**[secondary]**. Sizes marked **[measured]** come from serializing this repo's own fixtures.
Anything marked **[estimate]** is arithmetic on stated assumptions, not a measurement.

## Bottom line for Tableside

**Hand-roll a per-record sync on Convex.** Keep AsyncStorage as the source of truth and put a
durable outbox and a cursor-based pull beside it. Choose the conflict rule per record type:
nearly everything Tableside stores is append-only or write-once, so it merges by union on id
with no conflicts at all. Only strategy drafts, the profile and the Rule Set are edited in
place, and per-record last-write-wins is enough for them. Don't adopt a CRDT library or a
third-party sync service.

Why:

- **Convex has no offline sync of its own.** Its sync page says "Convex doesn't currently
  provide a full offline sync mechanism, but some customers have used tools like Replicache"
  ([Convex](https://www.convex.dev/sync)). The client keeps queued mutations in an in-memory
  `Map`, so anything pending is lost when the app is killed or the tab reloads
  (`RequestManager.inflightRequests`,
  [`src/browser/sync/request_manager.ts`](https://github.com/get-convex/convex-js/blob/main/src/browser/sync/request_manager.ts)).
  Convex's alpha offline engine, `curvilinear`, was archived on 2026-09-24
  ([GitHub](https://github.com/convex/curvilinear)).
- **Tableside's data barely conflicts.** An ended Session never changes again. Progress
  decisions, hands and sessions are append-only. Bankrolls are derived from hands and never
  stored (`src/state/progress.ts`, "Bankroll"). A CRDT solves concurrent edits to shared
  documents, which is a problem this app mostly doesn't have, and it would cost a new data
  model, a WASM runtime or metadata on every record.
- **The credible off-the-shelf options are young, unfit or expensive here.** TanStack DB's
  Convex collection does exactly the outbox-plus-idempotency pattern, but it was first
  published on 2026-10-29 and is a release candidate. Automerge on React Native needs
  WebAssembly in Hermes, which the Hermes lead calls "not yet ready for production use".
  PowerSync's Convex source is "Experimental" and needs Convex's Pro plan plus a paid
  PowerSync plan. Details under each option below.
- **It fits the ADRs unchanged.** ADR-0003 says sync "arrives as an _optional_ layer over
  local state, never as a precondition for training". ADR-0007 keeps training account-free.
  A sync layer that only reads and writes local records, and pushes when a signed-in Plus
  player is online, honours both. No ADR is contradicted.
- **It's cheap at the plan's scale** (see "Cost at the plus-tiers scale"): a few dollars a
  month at 10k signed-in players, provided pulls read by cursor rather than re-reading
  everything.

If TanStack DB 1.0 ships and its Convex collection matures, it is the one library worth
re-evaluating, because it implements the same server-authoritative design described here.

## What there is to sync (from `src/state`)

Everything goes through one four-method `KeyValueStore` (`src/state/store.ts`). AsyncStorage
backs it on all three platforms (`src/state/asyncStorage.ts`). The records:

| Store                            | Key(s)                                                     | Shape                                                                                                                      | Size                                                                                                                                        | How it changes                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessions (`repository.ts`)       | `truecount/v1/session/<id>`, one per Session, plus `truecount/v1/active` | `PersistedRecord<Session>`, schema version 4, with migrations (`schema.ts`)                                                | **[measured]** about 780 bytes of JSON per Play round (decision ≈ 460 B, round ≈ 270 B, plus count checks): 40 rounds = 31 KB                    | Appended while open, **immutable once ended** (`endedAt` set only by `endSession`). The active pointer is per device by design: an import "must not resume it on this device" |
| Progress (`progress.ts`)         | `tableside/progress/v1`, **one key for everything**        | `ProgressState`: `decisions[]`, `hands[]`, `sessions[]`, `bankrollBase`                                                    | **[measured]** about 133 B per decision or hand. The sample state (3,582 decisions, 2,697 hands, 73 sessions) is 848 KB. At `PROGRESS_LIMITS` (20k + 20k + 1k) ≈ 5.3 MB **[estimate]** | Append-only, then trimmed to the limits. Trimmed hands fold their net into `bankrollBase`                                                                                    |
| Strategy drafts (`strategies.ts`) | `tableside/strategies/v1`, one key holding `{ drafts }`    | Blackjack chart overrides, craps `BetPlan`, roulette layout, notes, `savedAt` ISO string                                   | Small (KB)                                                                                                                                  | **Edited in place**: the one place where real conflicts can happen                                                                                                          |
| Profile (`profile.ts`)           | `tableside/profile/v1`                                     | `PlayerProfile`                                                                                                            | Tiny                                                                                                                                        | Edited in place, rarely                                                                                                                                                    |
| Rule Set (`src/ui/rules/storage.ts`) | `truecount/v1/rules`                                   | Versioned `RuleSet`                                                                                                        | Tiny                                                                                                                                        | Edited in place, rarely                                                                                                                                                    |
| Bankrolls                        | none                                                       | Derived: `PRACTICE_BANKROLL_START` plus the net of every hand, plus `bankrollBase`                                         | n/a                                                                                                                                         | Synced for free if hands sync, except for `bankrollBase` (below)                                                                                                             |

Four facts in this code decide the design:

1. **Progress records have no id.** `ProgressDecision` and `ProgressHand` carry
   `game, category/net, at, day, sessionId` but no identifier
   (`src/state/progress.ts:133-151`). They can't be de-duplicated across devices as they are.
2. **`bankrollBase` is device-local arithmetic.** `trim()` folds the net of dropped hands into
   it (`progress.ts:306-312`), and `mergeProgress` adds bases together. If two devices trim
   different hands, or a device trims hands that sync later brings back, the bankroll is
   counted twice.
3. **Session ids are only unique per device.** `newSessionId` is a base-36 timestamp plus 24
   random bits, with the comment "unique enough for one device — there is no server to collide
   with" (`src/ui/session/usePlaySession.ts:467-470`; the drill variant is in
   `useRecordedDrill.ts:273`).
4. **Progress is one value.** Synced as a single value, last-write-wins would drop one
   device's history. It is also too big for one Convex document (next section).

## Convex constraints that shape any design

From [Convex limits](https://docs.convex.dev/production/state/limits):

- Document size **1 MiB**; arrays **8,192 elements**; documents nest 16 deep.
- Per query or mutation: 16 MiB read, 16 MiB written, 16,000 documents written, 32,000
  scanned, 16 MiB of arguments.
- 1 second of user code per query or mutation.

So the progress blob (848 KB at the sample, ~5.3 MB at the caps) can't be one document, and
neither can an array of 20,000 decisions. A Session crosses 1 MiB at roughly 1,300 Play
rounds **[estimate]** from the measured 780 B per round. Its `decisions` array also hits 8,192
elements in a very long Session if stored as a native Convex array. Storing a Session's
payload as a JSON string avoids the array limit but not the 1 MiB one.

Client behaviour ([Convex React](https://docs.convex.dev/client/react)): "Convex React
automatically retries mutations until they are confirmed to have been written to the database.
The Convex backend ensures that despite multiple retries, every mutation call only executes
once." "If the internet connection drops, the client will handle reconnecting." That covers a
network blip in a running app, not a restart: the queue is in memory (above), and the query
cache isn't persisted either. Optimistic updates are "rolled back when a mutation completes"
([docs](https://docs.convex.dev/client/react/optimistic-updates)), and they live in the same
in-memory client.

## Option 1: Convex's own sync support and components

| Piece                                                                                      | What it is                                                                                                                                                                                      | Status (2026-11-10)                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built-in client                                                                            | Reactive queries over a WebSocket, retried exactly-once mutations, optimistic updates                                                                                                          | GA. No persisted queue, no offline read cache. "The team is actively exploring this space" ([Convex](https://www.convex.dev/sync))                                                                                                                       |
| Object sync engine ([Stack post](https://stack.convex.dev/object-sync-engine)), `curvilinear` and `local-store` ([repo](https://github.com/convex/curvilinear)) | Local tables in IndexedDB (`defineLocalTable`, `useLocalQuery`, `ctx.localDb`). The server is authoritative: "Server Reconciliation for applying optimistic updates"                            | README: "an alpha of the offline sync engine for Convex". It lists correctness ("haven't … wrung out all the bugs yet") and scale as known issues. **Archived 2026-09-24.** Web only (IndexedDB)                                                          |
| `@convex-dev/automerge-sync` ([repo](https://github.com/convex/automerge-sync))            | Component that stores Automerge changes and snapshots as `v.bytes()` rows keyed by document and heads (`src/component/schema.ts`)                                                              | Version 0.2.2 in `package.json`, **not on the npm registry** (404 on 2026-11-10). 8 stars. The README still has template placeholders ("Why should you use this component?"). Commits since June are tooling and dependency updates                   |
| `@convex-dev/prosemirror-sync` ([repo](https://github.com/get-convex/prosemirror-sync))    | Collaborative rich-text editing over operational transform, for Tiptap and BlockNote                                                                                                           | 0.2.7 on npm (2026-10-02). Text documents only; fuller offline editing is listed as possible future work. Not applicable                                                                                                                               |

- **Conflicts:** the plain client is server-authoritative: whatever your mutation does wins.
- **Cost:** Convex usage only.
- **Maturity:** the client is solid, but offline is not covered. Nothing official is both
  current and offline-capable.
- **Ask of `src/state`:** using the plain client means building everything in Option 3
  yourself anyway.

### Option 1b: TanStack DB with `@tanstack/convex-db-collection`

This is the newest and most Convex-native candidate. It's maintained by TanStack, not Convex
(TanStack's partner page lists Convex as a *previous* partner, May 2024 to Mar 2026
[secondary]).

- **What it does** ([guide](https://github.com/TanStack/db/blob/main/docs/collections/convex-collection.md)):
  it subscribes to a Convex query into a client-side collection, applies optimistic writes
  through your own Convex mutation handlers, and adds "durable offline writes through
  TanStack's outbox" (`@tanstack/offline-transactions`). The outbox "records the transaction
  before sending it", replays after a restart, and sends a stable `idempotencyKey`. Your
  mutation must store receipts so a replayed write is applied once.
- **Conflicts:** server-authoritative. "Each result replaces the subscribed query's rows," and
  a rejected handler rolls back its optimistic writes. The merge rule is whatever your Convex
  mutation implements.
- **React Native and Expo:** supported, but the AsyncStorage outbox adapter is example code to
  copy, not something the package exports, and "Its API client does not yet send an idempotency
  key" ([offline guide](https://github.com/TanStack/db/blob/main/docs/guides/offline-transactions.md)).
  A read cache that survives a restart offline needs a separate persistence package
  (`@tanstack/expo-db-sqlite-persistence` on `expo-sqlite`,
  [docs](https://github.com/TanStack/db/blob/main/docs/guides/sqlite-persistence.md)): "The
  outbox stores pending writes, not a full offline read cache."
- **Maturity:** `@tanstack/db` 1.0.0-rc.1.4 (2026-11-06). `@tanstack/convex-db-collection` was
  first published 2026-10-29, the day TanStack DB 1.0 RC1 was announced (npm registry). It is
  "tested with Convex 1.47.0" against a real local backend.
- **Ask of `src/state`:** large. TanStack DB collections become the store the UI reads, in
  place of `progressStore`, `draftStore` and `sessionStore` over `KeyValueStore`, and a second
  local database (SQLite) appears beside AsyncStorage. It also subscribes to whole query
  results, so the Convex query has to be shaped to avoid re-reading everything (see cost).

## Option 2: a CRDT or replicated store on top of Convex

| Library                                                                                                       | Conflict model                                                                                                                                                                                                                                                         | Convex integration                                                                                                                                                          | React Native / Expo                                                                                                                                                                                                                              | Maturity (npm, 2026-11-10)                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Automerge**                                                                                                 | JSON CRDT with full change history; merges automatically                                                                                                                                                                                                               | The unpublished component above, or the 2024 pattern of `submitChange`/`pullChanges` mutations ([Stack](https://stack.convex.dev/automerge-and-convex))                     | The core is Rust compiled to WASM. Its docs cover Metro package exports and a manual "slim" base64 WASM init ([docs](https://automerge.org/docs/reference/library-initialization/)) but don't mention Hermes. The Hermes lead says Hermes "Wasm support is not yet ready for production use" ([X, 2026](https://x.com/tmikov/status/2023821160241393839)) | `@automerge/automerge` 3.5.0 (2026-09-16); `automerge-repo` 2.6.0-alpha.3                                                                                                       |
| **Yjs**                                                                                                       | CRDT; updates are "commutative, associative, and idempotent", with state-vector diffs. Merging binary updates "doesn't garbage-collect deleted content" ([docs](https://docs.yjs.dev/api/document-updates))                                                          | None for Convex (ProseMirror sync is OT, not Yjs). You'd store updates as bytes yourself                                                                                    | Pure JS, so it runs on Hermes. `y-indexeddb` is browser-only, so native persistence is custom                                                                                                                                                  | `yjs` 13.6.33 (2026-09-23). Mature, but built for collaborative text and structures                                                                                           |
| **TinyBase** `MergeableStore`                                                                                 | Each update gets an HLC timestamp and a hash; "last write wins" per cell makes it a CRDT ([guide](https://tinybase.org/guides/synchronization/using-a-mergeablestore/)). Object and array cells since v8 ([releases](https://tinybase.org/guides/releases/)), each LWW as a whole | No Convex synchronizer or persister among the official ones. You'd write `createCustomSynchronizer` over Convex                                                                | `expo-sqlite` persister exists, but SQL persisters only store a MergeableStore in "JSON-serialization" mode                                                                                                                                      | `tinybase` 10.0.1 (2026-09-24). Active                                                                                                                                       |
| **Legend State** v3                                                                                           | Syncs diffs by `fieldUpdatedAt`, with "eventual consistency". Pending changes persist across restarts with `retrySync: true` ([docs](https://legendapp.com/open-source/state/v3/sync/persist-sync/)). The docs describe no conflict rule                              | None official: plugins are Keel, Supabase, TanStack Query and fetch. A community PR #590 is a *read-only* Convex plugin, not merged ([repo](https://github.com/LegendApp/legend-state/pulls)) | AsyncStorage, MMKV and `expo-sqlite/kv-store` persistence                                                                                                                                                                                       | v3 is **beta**: 3.0.0-beta.48 (2026-07-12); the `latest` tag is still 2.1.15 (2024-08-30)                                                                                     |
| **Replicache / Zero**                                                                                         | Server-authoritative: rewind to the server's state and replay pending mutators ([docs](https://doc.replicache.dev/concepts/how-it-works))                                                                                                                             | Convex says some customers used Replicache. You'd implement its push and pull endpoints                                                                                     | Web-focused ("persistently in the browser")                                                                                                                                                                                                      | Replicache 15.3.0 (2025-07-02): "now in maintenance mode … won't add new features … Existing users should migrate to Zero" ([replicache.dev](https://replicache.dev/)). Zero's zero-cache replicates from Postgres, not Convex |
| **PowerSync**                                                                                                 | Server-authoritative upload queue. A basic backend gives "per-field Last-Write-Wins" ([docs](https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts))                                                                                       | Convex source since 2026-06-10, **"Experimental"**: "Not production-ready" ([announcement](https://releases.powersync.com/announcements/announcing-convex-backend-support-experimental), [status](https://docs.powersync.com/resources/feature-status)). It reads Convex's Streaming Export API and uploads through your Convex mutations; client UUIDs must be mapped to Convex `_id`s | React Native SDK "GA"; React Native Web "Beta". Local SQLite                                                                                                                                                                                     | `@powersync/react-native` 1.35.11                                                                                                                                             |
| **RxDB**                                                                                                      | Your own conflict handler compares `assumedMasterState`                                                                                                                                                                                                                | No plugin. Its own article hand-writes pull/push with a `serverSeq` counter and warns that a single counter "becomes a hot document" and tombstones need cleanup ([RxDB](https://rxdb.info/articles/alternatives/convex-alternative.html)) | The recommended Expo storage is premium, and even the SQLite example imports from `rxdb-premium` ([RxDB](https://rxdb.info/react-native-database.html))                                                                                          | `rxdb` 17.6.0                                                                                                                                                                 |

**Conflicts.** The true CRDTs (Automerge, Yjs, TinyBase) never lose a write, but their merge
is generic. They can't know that an ended Session is immutable or that a bankroll is a ledger.
Automerge and Yjs keep history or tombstones that grow without bound. TinyBase is
LWW-per-cell, which is what Option 3 does with less machinery.

**Storage and bandwidth.** CRDT metadata is per value. TinyBase stores an HLC string and a hash
per cell; for a ~133 B progress record split into 6–7 cells that roughly doubles its size,
while one object cell per record keeps the overhead to one timestamp **[estimate]**. Automerge
keeps every change, so an append-only log costs at least the data itself plus per-operation
metadata. Neither is large at this scale. The real cost is engineering: a new data model and a
custom Convex transport for every library here except PowerSync.

**PowerSync's fixed cost.** Convex's streaming export "requires a Convex Pro plan"
([docs](https://docs.convex.dev/production/integrations/streaming-import-export)), which is
\$25 per developer a month ([pricing](https://www.convex.dev/pricing)). PowerSync Free projects
"are deactivated after 1 week of inactivity", so production needs Pro "From \$49/month"
([pricing](https://www.powersync.com/pricing)). That's at least \$74 a month before the first
Plus sale, against today's ≈ \$9 a month total (`docs/research/plus-tiers-and-ads.md`). It also
adds a third vendor in the data path, on an experimental integration.

**Ask of `src/state`.** Every option in this table replaces `KeyValueStore`/AsyncStorage as the
store of record with its own (an Automerge doc, a Y.Doc, a TinyBase store, Legend observables,
SQLite). The Session repository's per-record versioned envelope and migration chain
(`schema.ts`) would have to be re-expressed inside it. That chain is the mitigation ADR-0003
named for exactly this moment.

## Option 3: hand-rolled per-record sync (recommended)

### Conflict rule by record type

| Record                                     | Rule                                                                                                                                                                                                                                                       | Why it's safe                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Ended Session                              | Insert if absent; never update. Union by id                                                                                                                                                                                                                | `endedAt` is set once by an explicit call (ADR-0003). Nothing edits an ended Session                             |
| Open Session                               | Not synced. The `active` pointer stays per device                                                                                                                                                                                                          | Matches the import rule that another device's unfinished run is never resumed                                    |
| Progress decision, hand                    | Insert if absent (needs a new id). Union                                                                                                                                                                                                                   | Append-only                                                                                                      |
| Progress session                           | Union. `endedAt` merges as "the set value wins over null"                                                                                                                                                                                                  | Set once                                                                                                         |
| Bankroll                                   | Not stored. Derived from synced hands plus synced fold records (below)                                                                                                                                                                                    | A ledger is a sum of append-only facts                                                                           |
| Strategy draft                             | Per-draft LWW on a server-assigned version. On a concurrent edit (the base version is stale), keep the loser as a second draft, "(conflicted copy)"                                                                                                       | Drafts are small and personal. A visible copy loses nothing and needs no merge UI                                |
| Profile, Rule Set                          | Per-field LWW                                                                                                                                                                                                                                              | Tiny, rarely edited, and a wrong guess is visible and cheap                                                      |
| Deletes (a draft, a Session, Reset progress) | Tombstone row; a tombstone beats updates, as in PowerSync's recommended rules                                                                                                                                                                            | Prevents a stale device from resurrecting what was deleted                                                       |

Use the server's order (a per-user sequence number) rather than device clocks to decide "last".
`savedAt` and `at` are device wall-clock times and can be skewed. RxDB's guide warns against
using `Date.now()` for ordering for the same reason.

### Shape on Convex [design sketch]

- One table, `syncRecords`: `userId`, `kind`, `recordId`, `schemaVersion`, `payload` (a JSON
  string), `deleted`, `seq`. Indexes `by_user_seq [userId, seq]` and
  `by_user_kind_record [userId, kind, recordId]`.
- A per-user counter document assigns `seq` inside the push mutation. Convex mutations are
  serializable, so this is safe, and contention is one player's own devices, not the global
  hot spot RxDB warns about.
- **Push**: one mutation per batch, taking `idempotencyKey`, with a receipts table, as the
  TanStack guide prescribes ("A client can lose an acknowledgement after the server commits").
  Applying the per-kind rules above, batched by Session end or a debounce, stays well inside
  the 16,000-document limit.
- **Pull**: a paginated `changesSince(seq)` query, plus one tiny reactive `latestSeq`
  subscription to wake the device up. Don't subscribe to "all my records": every write would
  re-run it and re-read everything (cost below).
- **Large Sessions**: keep the payload a JSON string (no 8,192-element array). Past ~900 KB,
  store it in Convex file storage and keep a pointer (1 GB of files on the free tier).
- **Plus gating**: push and pull check the Plan through `resolvePlan`. When Plus lapses, the
  device keeps everything locally, because local stays the source of truth.

### What it asks of `src/state`

1. **Ids for progress records.** Add `id` to `ProgressDecision` and `ProgressHand`. Progress
   has no `schemaVersion` envelope today: `parseProgress` drops malformed entries instead. So
   add one, and give existing records deterministic ids (from `at`, game and position) so two
   devices backfilling the same imported history agree.
2. **Make `bankrollBase` sync-safe.** Replace the device-local fold with synced, append-only
   "fold" records (`{ id, game, net, throughAt }`), or trim only hands that the server has
   acknowledged and fold them deterministically by an `at` cutoff. As it stands, a trim on
   one device double-counts against hands pulled from another.
3. **Ids that are unique across devices.** Prefix `newSessionId` with a per-install device id,
   or switch to `Crypto.randomUUID()` (already used in `authClient.native.ts`).
4. **Split progress for transport.** It can stay one AsyncStorage key locally, but it must sync
   as rows: one Convex document per record, or per day.
5. **A sync module beside the repositories.** It holds an outbox key (pending changes, written
   in the same step as the local save), a `cursor` key (last `seq` pulled), and a
   `deviceId`. It applies pulled records through the existing decoders (`decodeSession`,
   `parseProgress`, `parseDrafts`), so migrations still run on everything that arrives.
   `KeyValueStore` is enough: four async string operations, with no new local database.
6. **Version skew.** A record pulled with a newer `schemaVersion` than the build knows must be
   kept and skipped (surfaced as `UnreadableRecord`, as today), never down-converted or
   overwritten.

Effort: a few hundred lines of pure, Node-testable TypeScript, about the size of
`repository.ts` plus `schema.ts` (≈ 720 lines) **[estimate]**. It follows the existing pattern:
pure logic in `src/state`, I/O injected.

## Cost at the plus-tiers scale

Assumptions from `docs/research/plus-tiers-and-ads.md`: 100k monthly actives, 10% signed in
(10k; sync is Plus-only, so this is an upper bound), 10 opens a month. Prices from
[Convex pricing](https://www.convex.dev/pricing): Starter includes 1M calls, 0.5 GB storage,
1 GB DB I/O; then \$2.20 per 1M calls and \$0.22 per GB.

**Storage per player [measured sizes, estimated mix].** The plus-tiers doc assumed ~200 KB.
The measured progress sample alone is 848 KB, so an engaged player is closer to **~1 MB**, and
a player at the progress caps ~5 MB plus Sessions. At 10k players × 1 MB = 10 GB:
≈ \$2.10 a month on Starter, or inside Professional's 50 GB.

**DB I/O depends on the pull design [estimate].**

| Pull design                                    | Per player per month                                                      | At 10k players                      |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| Cursor delta (`changesSince(seq)`)             | ~0.5 MB new data written (10 Sessions × 50 rounds × 780 B, plus progress), read back once per other device: ≈ 1 MB | ≈ 10 GB → ≈ \$2                     |
| Full-snapshot subscription                     | 1 MB re-read × 10 opens × 2 devices = 20 MB, plus a re-run on every write | ≈ 200 GB → ≈ \$44 (or Pro's 50 GB + ≈ \$30) |

**Function calls [estimate].** About 1–2 pulls per open plus one push per Session end or
debounce: 30–50 calls a player a month, so 0.3–0.5M at 10k players, on top of the 3M the plus
doc already projects at 100k actives. That's ≈ \$1.

**Total for sync with cursor pulls: ≈ \$5 a month at 10k signed-in players [estimate].** The
CRDT options cost about the same in Convex resources, plus the engineering. PowerSync adds
\$74 a month or more in fixed fees.

## Offline and accounts interplay

- An offline player with an expired Better Auth session appears signed out (ADR-0007). The
  sync module must keep the outbox and push once a session is restored, never discard it on
  sign-out of an expired session.
- Signing out on purpose, or deleting the Account, should not delete local data (invariant 8).
  Deletion must also remove `syncRecords`, receipts and the counter in the same transaction as
  the user, like Entitlements today.
- The first sign-in on a second device merges local and server history. With union-by-id
  rules that is just a push of everything, then a pull. No "which device wins?" prompt is
  needed, except for drafts, which get conflicted copies.

## Open questions

- Should `bankrollBase` become synced fold records, or should synced players stop trimming
  locally (5 MB is fine in AsyncStorage on iOS and web, but Android's SQLite-backed
  AsyncStorage dislikes multi-megabyte values, per `repository.ts`)?
- Should Rule Sets and the profile sync at all? They're cheap to sync, but a player may want a
  different table per device.
- Hermes WASM readiness, and TanStack DB 1.0 GA: re-check both when sync work starts.

## Sources

- Convex: [sync page](https://www.convex.dev/sync); [limits](https://docs.convex.dev/production/state/limits); [Convex React](https://docs.convex.dev/client/react); [optimistic updates](https://docs.convex.dev/client/react/optimistic-updates); [streaming export](https://docs.convex.dev/production/integrations/streaming-import-export); [pricing](https://www.convex.dev/pricing); [object sync engine](https://stack.convex.dev/object-sync-engine); [Automerge and Convex](https://stack.convex.dev/automerge-and-convex); [curvilinear](https://github.com/convex/curvilinear); [automerge-sync](https://github.com/convex/automerge-sync); [prosemirror-sync](https://github.com/get-convex/prosemirror-sync); client source `convex@1.49.0` `src/browser/sync/request_manager.ts`.
- TanStack DB: [Convex collection](https://github.com/TanStack/db/blob/main/docs/collections/convex-collection.md); [offline transactions](https://github.com/TanStack/db/blob/main/docs/guides/offline-transactions.md); [SQLite persistence](https://github.com/TanStack/db/blob/main/docs/guides/sqlite-persistence.md); [partner page](https://tanstack.com/partners/convex) [secondary].
- Automerge: [library initialization](https://automerge.org/docs/reference/library-initialization/). Hermes WASM: [Tzvetan Mikov on X](https://x.com/tmikov/status/2023821160241393839) [secondary: a post, though by the Hermes lead].
- Yjs: [document updates](https://docs.yjs.dev/api/document-updates).
- TinyBase: [using a MergeableStore](https://tinybase.org/guides/synchronization/using-a-mergeablestore/); [releases](https://tinybase.org/guides/releases/).
- Legend State: [persist and sync (v3 beta)](https://legendapp.com/open-source/state/v3/sync/persist-sync/); [pull requests](https://github.com/LegendApp/legend-state/pulls).
- Replicache: [home](https://replicache.dev/); [how it works](https://doc.replicache.dev/concepts/how-it-works).
- PowerSync: [Convex announcement](https://releases.powersync.com/announcements/announcing-convex-backend-support-experimental); [feature status](https://docs.powersync.com/resources/feature-status); [conflicts](https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts); [pricing](https://www.powersync.com/pricing).
- RxDB: [Convex article](https://rxdb.info/articles/alternatives/convex-alternative.html); [React Native](https://rxdb.info/react-native-database.html).
- npm registry (`registry.npmjs.org`), queried 2026-11-10, for every version and publish date above.
- This repo: `src/state/{store,asyncStorage,repository,schema,types,progress,strategies,profile}.ts`, `src/ui/rules/storage.ts`, `src/ui/session/usePlaySession.ts`, ADR-0003, ADR-0007, `docs/research/plus-tiers-and-ads.md`. Sizes measured by serializing `buildSession` (`src/state/fixtures.ts`) and `sampleProgress` (`src/state/progressSample.ts`) in a scratch test outside the repo.
