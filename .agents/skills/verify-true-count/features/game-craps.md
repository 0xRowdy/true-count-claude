# Craps

The single-player craps table (design frame `lUiCl`, route `/games/craps`): the ROLLS history strip ("6 hard", "9", "6 point"), the dice and the stickman's call ("Six, the hard way" / "Point made · front line winner"), the phone layout (place 4 5 SIX 8 NINE 10 with payouts and the ON/OFF puck, COME, FIELD, DON'T COME · BAR 12, Center bets, PASS LINE with chips and the "ODDS 3x" tag, DON'T PASS BAR), the win tag ("+$46 · 10 + 36 odds"), Marcus's note, "Edit bets · $52" and "Come-out roll" / "Roll". Phases Bet → Roll → Result → Payout.

## Sub-features

- Bet: chip rack; tap a spot to bet the chip, long-press to take it off; a new line or come bet starts at the $10 table minimum, a new place bet at the lowest exact-paying amount at or above it ($12 on the 6 and 8, never graded as the player's mistake); bets are closed while the dice are out and the result shows ("No more bets until the payout."); with the point on, chips on your own line go behind it as odds (up to the 3-4-5x limit, engine message in place). Undo / Clear (this window) / Rebet (last window's bets that are legal now). A bet over the practice chips is refused in place; at zero, "Reset bankroll" in place
- Center bets sheet: hardways 6/8/4/10 and the one-roll bets with payout and house edge
- Edit bets sheet: every bet with Take $chip off (the keyboard / screen-reader alternative to the felt's long-press; not offered when it would leave the bet under the minimum, where the felt explains "Take it down instead"), Max odds / Remove odds, Call it off / on (place bets, hardways, come odds, one-roll), Take down where the rules allow (not contract bets)
- Coach by profile: "every" grades each bet as it goes down (good call / tip) and comments on each roll; "mistakes" catches a costly bet (center bets, place 4/10) with a lower-edge alternative and "Take it back" / "Keep it", and a place bet whose payout breaks just before the roll ("Make it $12" / "Roll anyway"); "asked" only via the lightbulb ("Ask the coach"), and bets made after asking count as coached
- Result: the call, win tags on the spots, the GOOD CALL · ODDS note ("Got it" / "How odds work" opens the rules); Payout: settled layout, ROLLS strip, bankroll
- Rules sheet (book icon): table rules, the odds rule and the house edge of every bet computed for the table
- Decisions recorded per betting window in the craps categories (line, odds, come, place — field and center bets count under "place"); a bet the coach caught counts as a coached mistake whether it was kept, taken back, fixed, undone or cleared; each roll with money in action is a hand with its net

## How to get to it (user POV)

Lobby → Craps card, or `/games/craps`. `?seed=<n>` replays the dice: seed 337 rolls 4-2 (point 6), 4-5, 3-3 (six the hard way, point made), the design's state.

## Driving it with Playwright

`flows/game-craps.mjs`: coach "every" via the stored profile → $10 pass line → Come-out roll (6 point, puck ON) → $5 + $25 odds (ODDS 3x) → a $1 chip starts place 8 at $12 → keyboard only: Enter on Place 8 ($13), Edit bets → "Place 8: take $1 off" → Center bets → Hard 6 → mistake note → Take it back → Edit bets with a $5 chip offers only Take down for the $12 place 8 → Roll (9; a tap on Field during the result is refused) → Roll (six the hard way: +$46 · 10 + 36 odds, GOOD CALL · ODDS) → Payout bankroll $2,024 → How odds work → progress has line/odds/place decisions and hands [0, 0, 46] → reload restores $2,046 → at $0 the bet is refused and Reset bankroll restores $2,000 and clears the message → no sideways scroll, no console errors.

## Gotchas

- The dice tumble for 650 ms and the Result shows for 1.4 s before the Payout: wait on the phase stepper (`progressbar` "Step 4 of 4: Payout").
- Spots are buttons whose names start with the spot ("Pass line, your bet $10"): match with a `^` regex.
- During Roll and Result the felt shows the layout as it was when the dice went out; the bankroll is held at its pre-roll value until the Payout.

## Recovery proof

`flows/recovery-report.mjs` sets this game's saved bankroll ledger to zero while preserving its history, taps the reset once, verifies $2,000 and unchanged hand/decision logs, reloads to prove persistence, and starts another real round. It leaves the previous game before changing storage so its page-exit settlement cannot overwrite the test setup.
