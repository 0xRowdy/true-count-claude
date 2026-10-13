# Design system (Tableside)

The Tableside design system (`src/ui/ds`): tokens mirroring the design file's variables, Fraunces + Inter, the 17 reusable components of the design (frame `bi8Au`) and the shared primitives the screens build on. `/design-system` renders all of it on one page, laid out like the design sheet, and is the visual test bed.

## Sub-features

- Tokens: colour swatches for every `.pen` colour variable (App surface, Table, Coach & feedback, Suits, Chips, Supporting), type scale, spacing & radius
- Components: Button (Primary/Secondary/Ghost/Table, sm/md/lg), Badge, Chip (6 denominations, selectable), Playing Card (4-colour, sm/md/lg, face down), Card Back, Bet Spot, Coach Note (hint/mistake/good), Stat Card, App Header (route-aware nav), Strategy Card, phone Status Bar, Table Top Bar, Phase Stepper, Chip Rack
- Primitives: Avatar, ProgressBar, SegmentedControl, Tabs, SelectableCard, ToggleChip, Panel, ListRow, Die, AppShell

## How to get to it (user POV)

`/design-system` (not linked from the app; a developer page).

## Driving it with Playwright

`flows/design-system.mjs`: load → Fraunces/Inter faces `loaded` and applied (computed `font-family` of the title and a button) → every component by role/name (buttons, `img` "Ace of spades"…, "$25 chip"…, progressbar "Step 1 of 4: Bet") → App Header link hrefs follow the route map and Lobby is `aria-current=page` → pick the $100 chip (radio, `aria-checked`) and the rack caption follows → toggle a game chip (checkbox) → screenshots at 1440, 2180 (the design's width, compare with frame `bi8Au`) and 390 (no sideways scroll).

## Gotchas

- The sheet scrolls inside a React Native ScrollView, not the document: set a tall viewport before a screenshot.
- Selection state is exposed with `aria-checked` / `aria-selected` props (React Native Web ignores `accessibilityState` for these).
- Font faces are per weight (`Inter_600SemiBold`), so check the family name, not `font-weight`.
