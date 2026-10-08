# Rules / your table

Configure the table the player practices on; shows house edge and a strategy chart for those rules.

## Sub-features
- Common tables presets (YOUR TABLE badge) · Rule fields: Decks, Dealer on soft 17, Dealer peek, Blackjack pays, Double on, Double after split, Split up to, Resplit aces, Cards to split aces, Surrender, Penetration, Table limits (Minimum/Maximum)
- House edge panel (or NO PUBLISHED FIGURE) · Strategy chart (cells named "<hand> versus <upcard>: …")

## How to get to it (user POV)
Home → Table → `/rules`, or Play → "Change your table".

## Driving it with Playwright
No flow yet. Suggested: pick a preset → check House edge text changes → go to `/play` and check the Table panel names the preset.

## Gotchas
- Preset buttons are named "<preset name>, <where>".
