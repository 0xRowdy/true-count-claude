# Roulette strategy builder

`/strategies/roulette` (design frame D0h320), built on the roulette engine (`analyzeBets`, `describeSpot`, `validateBets`, progressions). The example draft is "High Side + Six Line + Zero", forked from @wheelwatcher's "Classic Bond Spread" at half size with a tighter stop-loss (2 changes).

## Sub-features

- Interactive betting layout: tap a number, zero, column, dozen or even-money spot to add one unit there (or select the bet already there); multi-number inside bets draw as a bracket with a tappable chip; uncovered numbers dim
- "Covers n of 37 numbers", legend, the outcome bar and "What happens on each spin" table (exact enumeration), average result per spin
- "After each spin": Flat / Martingale / D'Alembert; Custom shows an honest "coming soon"; the Martingale warning from the engine
- Session rules (stop when up / down, max spins) with steppers
- Inspector: covers, pays, wins, if it hits, amount stepper, Half / 1 unit / Double / Match original %, change the bet type (split, street, corner, six line around the number), remove, rules check (limits + share of the spin vs the original), coach note, Bet n of m
- Steps: Game & rules (European / French / American), Explain your changes, Test & submit (50 seeded spins + 200 sessions)

## How to get to it (user POV)

Strategies → My strategies → "High Side + Six Line + Zero", or Fork / New roulette strategy.

## Driving it with Playwright

`flows/strategy-roulette.mjs`: Covers 25 of 37, the four outcome rows by accessible name, −$2.70, the Martingale warning, the selected six line ($25 of $100, same 25% share) → More: Amount → $105 per spin, 0 and 13–18 both +$75, share check follows → Match original % → $100 → tap 7 → Covers 26, Straight 7 selected → Custom "coming soon" → Martingale → stop-when-down steps to −$350.
