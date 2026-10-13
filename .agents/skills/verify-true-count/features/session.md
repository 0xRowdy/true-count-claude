# Session / Statistics

Every recorded Session on this device: the Play Session in progress, the expectation band, the
latest drill Session, lifetime totals and the history.

## Sub-features

- Page head (Report a bug, Back to the table) · Session control bar (Recording/Session ended/Not
  started, End session, Start a new session) · Stat Cards (Basic Strategy accuracy, Counting
  accuracy, Hands played, Net result — every session) · This Play session · Latest drill session ·
  Every session on this device · How the band reads your play + Your results vs. expectation ·
  History (a table on wide screens, stacked rows on phones)

## How to get to it (user POV)

Drill → Statistics, Drills hub → "Statistics — …", or `/session`.

## Driving it with Playwright

`flows/rules-integrity.mjs` ends here: heading "Statistics", "Every session on this device", Report a bug.

## Gotchas

- History and lifetime totals load from storage after mount; an empty device reads "No Sessions recorded yet."
