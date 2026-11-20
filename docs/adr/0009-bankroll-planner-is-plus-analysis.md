# ADR-0009: The Bankroll Planner is analysis, sold in Plus, on shipped simulation tables

**Status:** Accepted · 2026-11-19 · Builds on ADR-0007 (the Plan) and ADR-0008 (Sync, which
Plus launches with) · Decided in #74

## Context

The Plus launch bundle includes a calculator for blackjack trips: bet spread, risk of ruin, N0
and win rate per hour (#67). Invariant 1 says "Gate breadth, never depth of training", so a
paid calculator needs a line a future reader can apply without re-arguing it. App Store
guideline 5.3.4 bans apps that help count cards in a casino (#71). Every output is a short
formula on three numbers: win per round, SD per round and rounds per hour. A counter's win and
SD per round need simulations of 10⁸ rounds or more, and the engine plays about 68k rounds a
second on one core (#69).

## Decision

- **Where the line falls.** Training depth is anything that scores or explains a Decision, or
  trains a skill used at the table, and it stays free. Analysis is numbers about a strategy or
  a bankroll, worked out away from the table, and Plus may sell it. A Session's actual results
  report on its Decision log, so they are training depth and stay free.
- **The Bankroll Planner is analysis, so all of it is Plus.** That includes the manual mode
  and the bet-ramp solver. The free Strategy Builder keeps exactly what it has today: the bet
  ramp editor, the spread and the table-limits check. It gets one link to the Planner and no
  locked panels.
- **It plans a trip in advance and is never used in a casino.** It never takes a live count,
  cards or a shoe in play, and it has no at-the-table mode, quick-entry layout or timers.
  Store-facing copy says neither "card counter" nor "advantage play".
- **EV and SD come from tables simulated offline and shipped with the app.** They are not
  entered by the player by default, and not simulated on the device. The launch grid is Hi-Lo
  with basic strategy plus the Illustrious 18 and Fab 4, insurance at +3, one spot, play-all.
  It covers 1, 2, 6 and 8 decks, H17 or S17, and three penetration steps, with half-deck
  estimation and true counts rounded down. Other rules shift each count's edge by their
  off-the-top value, labelled as an approximation. Anything outside the grid uses the manual
  mode, where the player enters EV and SD.
- **The numbers are auditable.** Every result shows its formula and inputs, and the Planner
  says it uses a normal approximation. Every table cell ships with its standard error, and win
  rate is shown with that error. CI pins the tables against the Wizard of Odds' CVCX Hi-Lo
  table and a _Blackjack Attack_ chapter 10 row, as invariant 4 pins the chart.

## Considered options

- **Strategy numbers free, money numbers Plus.** Edge, N0 and SCORE would be free in the
  builder, and risk of ruin, hourly win and bankroll needed would be Plus. Rejected: it splits
  one tool across a paywall and makes the selling copy explain half a feature.
- **All free.** Rejected: Plus would launch as Sync alone plus the trip log and rules
  directory, and analysis is new breadth, not depth of training.
- **On-device simulation.** Rejected: about ±5% on win rate after minutes on a phone, and too
  loose for each count's edge or for comparing systems.

## Consequences

- The other five Counting Systems get tables only once they have index sets, or they would
  simulate too weak. Wonging and several spots need a new bet ramp shape and more tables. All
  three come after launch.
- Before launch the simulator needs a 64-bit random generator, and the formulas need checking
  against a copy of _Blackjack Attack_, especially the trip-ruin formula.
- Moving the Planner to free later is a pricing change for people who paid for Plus.
