# Live tables

Routes: `/live` (table list) and `/live/craps` (simulated multiplayer craps, design frame QEqUW).
Flow: `flows/live-craps.mjs`.

There is no backend (ADR-0003). The craps table is a local, seeded simulation built on
`src/games/craps` (bots, shooter rotation, chat, leaderboards) and says so in the UI
("Practice table · simulated players"). Blackjack and roulette rows show "Opens soon" with
links to the solo tables.

## What the flow proves

- Join from `/live`; the table renders the design's opening hand (fixture seed on first render).
- `?seed=<n>` makes rolls deterministic; `?pace=manual` keeps betting open until Confirm bets.
- Pass line with the chip rack → Confirm → the dice and call change and the bankroll updates.
- Add odds appears only when a bet can take odds; chat and quick replies post locally.
- Leaderboard tabs switch; the bet countdown pauses while the tab is hidden and resumes.

## Gotchas

- Seeds and the countdown start after mount (hydration).
- Chips on the layout are the bots' real engine bets, so they differ slightly from the static frame.
