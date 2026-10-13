# Rules / your table

Configure the table the player practices on; shows house edge and a strategy chart for those rules.

## Sub-features

- Common tables presets ("Your table" badge) · Rule fields: Decks, Dealer on soft 17, Dealer peek, Blackjack pays, Double on, Double after split, Split up to, Resplit aces, Cards to split aces, Surrender, Penetration, Table limits (Minimum/Maximum)
- House edge panel (or "No published figure") · Strategy chart (cells named "<hand> versus <upcard>: …", ", changed" when the last rule change moved them) in the Strategy Builder's colours; section tabs Hard totals / Soft totals / Pairs · change report ("N cells move, in …") · Reset to the default table
- Fields are radios (DS Segmented Control for up to four short options, radio pills otherwise)

## How to get to it (user POV)

Any drill or the Drills hub → "Change your table", Play → "Change your table", or `/rules`.

## Driving it with Playwright

`flows/rules-integrity.mjs`: read "16 versus 10" (Surrender, else hit) → radio "None" (surrender) → the cell reads "Hit, changed" and the change report appears → Reset to the default table.

## Gotchas

- Preset buttons are named "<preset name>, <where>".
- Radio names repeat across fields ("Yes"/"No"); "None", "Late", "Early" are unique to Surrender.
- Reset the table at the end of a flow: the Rule Set persists and every other screen deals it.
