# Strategies: library and blackjack builder

The "Strategies" nav item. `/strategies` lists the player's drafts ("My strategies", including the design's three example drafts until they are edited), the curated strategies and the community ranking, filterable by game. Curated and community entries are deterministic fixture data (no backend, ADR-0003) and the page says so. `/strategies/blackjack` is the blackjack builder (design frame RYP9O): the chart editor (Totals / Pairs / Surrender, legend, changed cells dotted, losing cells flagged), the selected-decision inspector (original vs yours, the move picker, the EV-engine rules check for the draft's Rule Set, a 160-character coach note with a preview, Change n of m), and the four steps (Game & rules, Decisions, Explain your changes, Test & submit).

## Sub-features

- Library: filter by game (tabs), Open (fixtures open read-only with `?view=<id>`, drafts with `?id=<id>`), Fork (a local draft credited to the author, "Compare (0 changes)"), New strategy per game, Delete / Reset example
- Builder head: rename (tap the title), "Draft · autosaved h:mm", "Forked from … · Credit is shown on every copy · Compare (n changes)" (opens the change list), Share draft (JSON export, copy to clipboard), Test in trainer (`/play?strategy=<id>`), Submit to community (runs the rules check, then an honest "nothing was sent" notice)
- Rules check: the base chart is `strategyChart(rules)`; cells that differ from Basic Strategy for the draft's rules are priced with `actionEvs` over every two-card hand making the row, and flagged when they lose EV
- Bet sizing tab: units by true count (≤ 0, +1 … +5 or more), the unit in dollars, the spread ("1–8 spread"), a rules check against the table min/max that warns on an aggressive spread for the shoe, and a coach note; saved in the draft as `ramp`
- Step 1: decks, S17/H17, DAS, surrender; "Use basic strategy for …" re-makes the chart for the rules
- Step 3: every change with its coach note; Step 4: whole-chart check, the flagged cells, and 50 seeded hands beside Basic Strategy on the same cards
- Drafts persist in AsyncStorage (`tableside/strategies/v1`) via `src/state/strategies.ts` + `src/ui/strategies/draftStore.ts`

## How to get to it (user POV)

App header → Strategies. From a strategy card: Open or Fork. `/strategies/blackjack` with no query opens the design's example draft ("Basic Strategy for H17 tables").

## Driving it with Playwright

`flows/strategies.mjs`: library sections and the examples notice → Craps filter hides blackjack → Fork "Basic Strategy · 6 deck, S17" → builder at `?id=fork-curated-bj-6d-s17`, Compare (0 changes) → cell `16 vs 7: Hit` → radio Stand → Compare (1 change), "Costs …% of the bet under S17, 6 decks", cell labelled "changed, loses money" → Bet sizing: 1–8 spread, rules-checked → +5 or more to 16 units → "Aggressive for a 6-deck shoe", persisted across reload → Hit restores "Rules-checked" → Stand again, coach note (counter, preview) → reload: change and note persisted → steps 3 and 4 (notes count, 50 hands, honest submit) → Share export carries the credit → the example: Compare (6 changes), A,8 vs 6 rules-checked for H17, Change 5 of 6 → the header shows the practice-chip balance → at 390: no sideways page scroll and chart cells are 44pt targets.

## Gotchas

- Everything here renders after mount (query params and storage), so the prerendered page is a "Loading strategy…" placeholder; that is what keeps `no-hydration-errors` clean.
- Chart cells are buttons named `<row> vs <upcard>: <play>[, changed][, loses money under these rules]`; moves are radios.
