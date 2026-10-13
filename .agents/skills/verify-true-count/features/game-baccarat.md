# Baccarat table

The baccarat table (design frame `gu3Mf`, "08 Baccarat — Payout"), on the pure engine in `src/games/baccarat`: an 8-deck seeded shoe with the burn and the cut card, the third-card tableau, settlement, the bead road and big road, exact house edges, and the coach's copy. Phone-first; centred in a 430-wide column on desktop.

## Sub-features

- **Phases** Bet → Deal → Result → Payout (Phase Stepper). Cards are turned one at a time in P B P B order, then any third cards per the tableau; tap the hands to turn them all.
- **Betting**: chip rack; tap a spot to add the selected chip; long-press, or the spot's **−** button ("Take a chip off Banker", reachable by keyboard and screen reader, since long-press never fires from a keyboard on web), takes one back; Undo / Clear / Rebet. Table limits ($10–$5,000 per bet) and the bankroll are checked by the engine, with the error shown in place. At zero (below the table minimum) a one-tap **Reset to $2,000** appears in place (invariant 6; `resetBankroll` moves only `bankrollBase`, so it is not a hand).
- **Hands**: PLAYER / BANKER panels with the cards, big total and caption ("Natural 9", "Stands on 7", "Draws to 5"); the winner is washed gold (both on a tie). Result line "✓ Player wins 9 over 7"; **Why these draws?** shows the engine's `explainDraws`.
- **Bet spots** PLAYER (1:1), TIE (8:1 or 9:1), BANKER (0.95:1, or 1:1 on EZ) with chip stacks and "+$50" / "−$25" / "Push" tags; side bets (Player/Banker Pair, Dragon 7, Panda 8 on EZ) as a second row when switched on.
- **Roads**: "BEAD ROAD · THIS SHOE" with the legend counts and the latest bead ringed; the ⇆ toggle shows the big road (ties as a count on the previous bead). The newest 12 columns are in view.
- **Rules & payouts** (book icon): variant Punto Banco / EZ Baccarat, tie pays 8 or 9 to 1, optional side bets (between coups only); every bet's pay and exact house edge; the tableau; this shoe's seed, cards left by rank, burn, cut card, the composition check and a link to Shoe Integrity.
- **Coach** (profile `coach`): Tie and side bets are mistakes by edge, caught on Deal with **Take it back** / **Deal anyway** ("mistakes" and "every"); Player over Banker is a hint (shown live with "every", on the **Hint** button with "asked"); switching sides to follow a 3+ streak gets the "streaks don't change the next hand" note. The payout note ("Good to know before your trip") is the engine's `coachNote`.
- **Progress**: one `bet-choice` decision per coup (Banker right; Player, Tie or both not) and a `side-bets` decision where side bets are offered; a caught mistake is recorded once as `coached`. Each coup's net is recorded as a hand; the PRACTICE bankroll is the progress store's baccarat bankroll.

## How to get to it (user POV)

Lobby → Baccarat card, or `/games/baccarat`. `?seed=<n>` deals a reproducible session.

## Driving it with Playwright

`flows/game-baccarat.mjs` (`?seed=7`, coach default "mistakes"): keyboard only — Enter on Banker twice, Tab to its remove button, Enter twice → spot empty → Tie on the layout → Deal → mistake note (14.36% edge) → Take it back → the Tie is still recorded as a coached mistake (`correct: false, coached: true` in storage) → $50 Banker → Deal → phases Deal / Result / Payout → result line, 4–6 cards, bankroll settled (Banker pays $47.50), payout note, bead road + ringed latest bead → Why these draws? → Rebet $50 (second coup) → bankroll and road (2 coups) → big road toggle → Next hand → rules sheet (1.06% / 1.24%, composition check, Shoe Integrity link) → no sideways scroll at 390 → reload keeps the bankroll. `no-hydration-errors` covers the route.

## Gotchas

- The seed is drawn (or read from `?seed=`) after mount; the prerendered table is seed 1 with nothing on the felt.
- Spots are buttons named "Banker, pays 0.95:1[, $50 bet][, +$47.50]"; the rules sheet's close button is named "Close".
