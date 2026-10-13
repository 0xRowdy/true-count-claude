# Video Poker

The video poker machine (design frame `xfJEh`, route `/games/video-poker`): a two-column pay table with the coach's target line lit, five cards with HOLD buttons and KEEP tags, the dealt-hand line and BET, Marcus's hint or mistake note, Speed and Draw. Phases Bet → Hold & draw → Result → Payout.

## Sub-features

- Bet: coins 1–5 and coin value (5¢, 25¢, $1, $5); a bet over the bankroll is refused in place; below 5¢ a one-tap bankroll reset
- Hold & draw: HOLD toggles (`aria-pressed`), Draw. Coach by profile: "every" shows the hint at each deal; "mistakes" stops a worse hold with a mistake note _before_ the draw ("Hold the better cards" / "Keep my hold"); "asked" only via "Ask Marcus for a hint". Hint: "Hold these N" applies the best holds; "Show the math" ranks holds by exact average return (`analyzeHolds`)
- Result: hand name and pay, "Decisions this hand" (best play / miss, taken back) · Payout: LAST strip, practice bankroll · Speed toggles the deal animation
- Rules sheet (book icon): how it plays, 9/6 and 8/5 Jacks or Better, Full Pay Deuces Wild, 9/6 Double Double Bonus with pay tables, return and house edge; switching machines only between hands
- Each hold is recorded as a video poker decision (made hands / pairs / flush draws / straight draws / high cards) and each hand's net into progress; the header bankroll is the game's practice bankroll

## How to get to it (user POV)

Lobby → Video Poker card, or `/games/video-poker`. `?seed=<n>` replays the deals (seed 1981 opens on 3♥ 9♠ A♥ 9♥ 5♥: a pair of 9s against four hearts).

## Driving it with Playwright

`flows/game-video-poker.mjs`: coach "mistakes" via the stored profile → Deal → hold the pair of 9s → Draw → mistake note with 4 KEEP tags while the dealt cards are still up → Hold the better cards → Result (miss, taken back) → Speed → Collect/Continue → Payout (LAST, bankroll) → Deal again → hint → Show the math → Hold these N → Draw → best play → Payout (two LAST entries, bankroll) → progress has both decisions and hands → rules sheet → Deuces Wild → 1 coin × 25¢ → no sideways scroll, no console errors.

## Gotchas

- At normal speed the cards turn over one by one after "Dealt: …" appears: wait for a card `img` before pressing HOLD.
- Text like "KEEP" also matches "Keep my hold" unless `exact: true`.
- The bankroll shows the stake taken while a hand is in play.
