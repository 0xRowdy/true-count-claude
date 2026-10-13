# Progress & Mastery

Real local training stats (design frame `LvXnf`), computed from the progress store (`src/state/progress.ts`, selectors in `progressSelectors.ts`). Blackjack is bridged from the Session log (Play and the drills); the other tables record through `recordDecision` / `recordHand`.

## Sub-features

- Game tabs (All games, each game) · range control (Last 7 / 30 / 90 days, All time)
- Level ring + eyebrow ("BLACKJACK · 72% TO LEVEL 8") + next level's criteria bars ("Soft totals 95%+ · 86% · 112 / 200 hands")
- Stat cards: decision accuracy (vs the window before), hands played + sessions, best streak, practice win rate (pushes left out) with the real-table expectation
- Accuracy over time (12 weekly bars) · By decision type (last 500; "By game" on All games) + weak-spot link to the drill
- Achievements (six, computed; locked ones show progress) · Practice bankroll line chart + disclaimer · Session stats · Recent sessions (View all)
- Empty states for a new player, and a labelled **Load sample data** link (`/progress?demo=1`, not saved)

## How to get to it (user POV)

"Progress" in the App Header, or `/progress`.

## Driving it with Playwright

`flows/progress.mjs`: empty page (level 0, "No decisions in this range", 0 of 6, no sessions, disclaimer) → Load sample data → stat cards are numbers, weekly bars, decision-type progressbars, weak spot → `/drills/basic-strategy`, bankroll chart, coach corrections → tabs (All games, Craps, Roulette) change the numbers → range menu (All time) → View all → 390 wide → one real round at `/play` then `/progress` shows blackjack level 1 and the Play session.

## Gotchas

- Stat cards are `group`s named "Label: value"; read numbers from the aria-label.
- The range control is a button ("Range: Last 30 days") opening a `menu` of `menuitemradio`s (current one `aria-checked`); Escape or an outside press closes it.
