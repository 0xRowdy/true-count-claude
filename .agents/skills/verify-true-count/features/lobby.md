# Lobby

The app's home after onboarding (design frame `ZDK1x`): a time-of-day greeting with the player's name, the trip countdown and how table-ready they are, the practice streak, an "Up next" hero that picks the weakest decision category, "Your games" (accuracy, level, progress and next step per game), and the rail: live tables, today's drill with this week's practice ticks, and the community feed. Followed strategies sit under the games.

## Sub-features

- Greeting (time of day after mount, profile name when set) · trip line (`daysUntilTrip`, table-readiness for the profile's games) · practice streak badge
- Up next: weakest category (≥10 decisions) in the player's games → lesson, why ("tripped you up N times last session"), Resume training → trainer, Free play → table. New player: "Start here" + a labelled **Load sample data** link
- Your games: one card per game → its route (`/play`, `/games/<game>`); "Not started" when empty
- Live tables (simulated, labelled) → `/live/craps`, `/live` · Today's drill rotates through the player's games; M–S ticks from practice days · From the community (simulated) · Strategies you're following → `/strategies/...`
- Header chip balance = the practice-chip bankroll across games (progress store)

## How to get to it (user POV)

`/lobby`, or the Tableside logo / "Lobby" in the App Header. `/lobby?demo=1` shows the sample history (nothing is saved).

## Driving it with Playwright

`flows/lobby.mjs`: empty lobby (no streak, start-here hero, five "Not started" cards, 10,000 chips, link hrefs) → Load sample data → 4-day streak, blackjack weak-spot hero, card aria-labels carry level/accuracy/next step, weekday ticks → Exit sample → nothing written to storage → 390 wide without sideways scroll.

## Gotchas

- Everything personal is rendered after mount (hydration): the prerendered page says "Welcome".
- Game cards are links whose accessible name is the whole card ("Blackjack: Level 7 · Table-ready, 92% accuracy. Next: soft totals").
