# Roulette table

The roulette table (design frame `dBsVJ`, "05 Roulette — Betting (bet loupe)") at `/games/roulette`: the LAST strip, the vertical layout (0 or 0/00 on top, 1–36 in three columns, dozens, columns and the even-money bets), chips on their spots (splits, corners, streets and six lines on the grid lines), the bet loupe, Total bet and summary, the house-edge pill, Clear / Undo (Rebet on an empty felt) / Spin, and the chip rack. A round runs Bet → Spin → Result → Payout.

## Sub-features

- Betting: tap a spot to add the selected chip; long-press an outside spot to remove one chip; long-press a number for the **bet loupe** ("Bets touching 17 · Tap to add $5 · hold to remove") listing the engine's `betsTouching` bets with payouts (inside first, then the outside bets touching the number). Without a pointer (invariant 7): on a focused number, **L** (or the context-menu key / Shift+F10; right-click with a mouse) opens its loupe in place; pressing a number also shows a **Bets touching N** button beside the total for that number; every option with chips has a **Remove $5 from …** button. Focus moves into the loupe when it opens and back to its opener when it closes; Escape closes it. Table max per spot and the practice bankroll are checked as chips land; the engine's `validateBets` (outside min, inside min) runs at Spin. Errors show in place.
- Spin → Result: the ball's pocket (status, accessible "Ball landed on 17 black. +$135"), winning spots highlighted, losing chips dimmed, each bet's result. Pay out → bankroll line ("Bankroll $2,000 → $2,135"). Next spin → Bet; Rebet restores the last layout.
- Bankroll: the roulette practice bankroll from the progress store; every spin is recorded as a hand, every bet on the felt at Spin as a graded decision (inside/outside). At under $5 a one-tap reset to $2,000 appears in place.
- Rules sheet (book icon): wheel European / American / French (La Partage), payout table with each bet's house edge, the coach's lowest-edge notes. The wheel can be changed between rounds.
- Coach (profile `coach`): the American top line (7.89%) is the one bet graded wrong; "mistakes" and "every" catch it with "Take it back" (also on Rebet). A caught top line is graded `correct: false, coached: true` at Spin whether it was kept or taken back (Take it back, Undo, Clear, remove). "every" adds a hint per new spot (house edge + coverage, La Partage, the wheel having no memory after a streak). Tapping the house-edge pill asks the dealer at any level.
- `?seed=<n>` makes spins deterministic; otherwise a random seed is drawn after mount.

## How to get to it (user POV)

Lobby → Roulette game card, or `/games/roulette`.

## Driving it with Playwright

`flows/game-roulette.mjs`: seed 7 at 390×988 → the design's $40 layout and summary → loupe on 17 (long-press = `click({ delay: 700 })`), add the 16 | 17 split → two full rounds (Spin, Result, Pay out, Next spin, then Rebet), checking the Phase Stepper, the bankroll arithmetic against the result's net and the LAST strip → rules sheet to American → top line from the loupe on 1 → coach note → Take it back → keyboard only (page.keyboard, no `.focus()`): Tab to 17, L, Tab/Enter on a split, Tab/Enter on its Remove button, Enter on Black, Escape back to 17, Shift+Tab/Enter on 16, Tab to "Bets touching 16" (unchanged after passing 17–36), Enter, Escape back to the button → reload keeps the bankroll.

## Gotchas

- React Native Web keeps hidden copies mounted: always `filter({ visible: true })`.
- Long-press is `delayLongPress={450}`. React Native Web ignores `accessibilityActions` and never long-presses from the keyboard, hence the L key and the Bets touching button. `picked` follows presses, not focus.

## Recovery proof

`flows/recovery-report.mjs` sets this game's saved bankroll ledger to zero while preserving its history, taps the reset once, verifies $2,000 and unchanged hand/decision logs, reloads to prove persistence, and starts another real round. It leaves the previous game before changing storage so its page-exit settlement cannot overwrite the test setup.
