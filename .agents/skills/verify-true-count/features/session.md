# Session / Statistics

Every recorded Session on this device: the Play Session in progress, the expectation band, the
latest drill Session, lifetime totals and the history.

## Sub-features

- Page head (Report a bug, Back to the table) · Session control bar (Recording/Session ended/Not
  started, End session, Start a new session) · Stat Cards (Basic Strategy accuracy, Counting
  accuracy, Hands played, Net result — every session) · This Play session · Latest drill session ·
  Every session on this device · How the band reads your play + Your results vs. expectation ·
  History (a table on wide screens, stacked rows on phones) · Back up session history (create,
  download/share, selectable JSON, restore by pasting JSON)

## How to get to it (user POV)

Drill → Statistics, Drills hub → "Statistics — …", or `/session`.

## Driving it with Playwright

`flows/rules-integrity.mjs` ends here: heading "Statistics", "Every session on this device", Report a bug.

`flows/trainer-layout.mjs` checks all eight shared trainer headers at phone, tablet and
desktop widths. Titles must have readable width and header controls must fit in the
first viewport. Native Yoga layout needs the separate `.maestro/native-layout.yml`
check: the browser did not reproduce the native squeezed-column regression.

`flows/session-backup.mjs` records a True Count drill answer, ends the session, creates and
downloads a backup, then clears browser storage to simulate a new device. It pastes the backup
into Restore backup → Import sessions, reloads, and compares the complete restored Session to
the original. Reimporting skips existing records; malformed JSON shows an error, preserves the
input, and leaves the persisted history unchanged. Captures phone and desktop layouts.
The flow also simulates a temporary storage read failure and uses Reload history to recover
without discarding the displayed sessions.

## Gotchas

- History and lifetime totals load from storage after mount; an empty device reads "No Sessions recorded yet."
- Backups contain Play and Drill Sessions, not settings or other game progress. Native uses the
  share sheet; web downloads JSON. Select-and-copy plus paste restore works on every platform.
- Restore merges missing IDs, keeps existing sessions, and does not replace the active Play
  session. Unreadable entries are reported; readable entries from a partial archive still import.
- Backup waits for pending Play and Drill writes. Unreadable stored records remain on device
  and produce an incomplete-backup warning.
