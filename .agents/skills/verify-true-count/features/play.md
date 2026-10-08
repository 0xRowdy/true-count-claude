# Play

Unscored simulated table play: bet, deal, act, settle, with a live count and a "why" verdict per decision.

## Sub-features
- Betting chips ($10…$500, Max) and Deal · Insurance prompt on dealer ace · Hit/Stand/Double/Split/Surrender
- Round settled panel ("This round", Next hand) · Why panel ("You stood — correct.", Show why / Fold to the verdict)
- Count panel (Show/Hide counts, running/true count, decks remaining) · Counting system picker (Hi-Lo, KO, Omega II, Wong Halves, Zen, Red 7)
- Bankroll (Available, Rounds played, Session) · Shoe (seed, Shuffle now, cut card) · Out of chips reset

## How to get to it (user POV)
Home → "Play blackjack", or go to `/play`. A Session starts recording on the first deal.

## Driving it with Playwright
`flows/play-round.mjs`: Deal → decline insurance if offered → Stand until "Round settled" → check result + decision feedback → Next hand → Rounds played advanced.
Buttons by role+name (`Deal`, `Stand`, `No insurance`, `Next hand`); cards are `img` named "<rank> of <suit>".

## Gotchas
- "Rounds played" advances on **Next hand**, not at settlement.
- A dealt natural can settle the round with no player action; the flow handles it.
- Hidden duplicate views exist: filter to visible.
