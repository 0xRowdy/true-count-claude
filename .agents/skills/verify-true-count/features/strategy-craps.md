# Craps strategy builder

`/strategies/craps` (design frame GYRRl), built on the craps engine's bet plans (`src/games/craps/plan.ts`). The example draft is "Pass, Odds & Press the 6/8", forked from @rail_rita's "Low-Edge Place 6 & 8" (3 changes).

## Sub-features

- The mini layout preview ("Preview: Point is 6, after 2 hits", picker for point and hits): puck, place chips, PRESSED tag, pass line flat + odds label
- Rules by phase (come-out, point is set, when a place bet wins, money rules) with edges and "Changed" tags; Add rule per phase (templates); Move up / Move down / Remove in the inspector
- Inspector per rule kind: hit rules (When, 1st/2nd/3rd+, Then Collect/Press/Regress/Take down, amount stepper in exact-payout steps, take-down count), line side, odds multiple, place numbers and skip-point, come count, amounts, stop-loss / stop-win; `checkPlan` rules check and the press note; coach note; Change n of m
- Stat cards: On the table, Worst single roll, Blended house edge (`previewPlan`, `worstSingleRoll`, `planBlendedEdge`): the example reproduces $78, −$78, ≈ 0.6%
- Steps: Game & rules (odds presets), Explain your changes, Test & submit (10 seeded shooters via `simulatePlan`)

## How to get to it (user POV)

Strategies → My strategies → "Pass, Odds & Press the 6/8", or Fork / New craps strategy.

## Driving it with Playwright

`flows/strategy-craps.mjs`: the three stat cards by accessible name ($78 / −$78 / ≈ 0.6%) and the pressed 8 → rule 3.2 → rules-checked, press note, step help, Change 2 of 3 → More: Press amount → $24 each, $84 on the table, −$84 worst roll, new press note → preview point 5 / 0 hits → $74 → Add rule "Field every roll" → $84.
