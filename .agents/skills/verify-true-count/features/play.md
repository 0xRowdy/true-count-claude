# Play — the Tableside blackjack table

Unscored simulated table play on the felt (design frames CcmBm 04a Betting, N6Lcl 04b Dealing · mistake caught, WSAfm 04c Result, w7wLdL 04d Payout): bet, deal, act, settle, collect. A phone-width column, centred on desktop.

## Sub-features

- **Top bar**: back, "Blackjack", rules subtitle from the configured Rule Set ("6 deck · H17 · 3:2 · $10–$1,000"), PRACTICE bankroll (green while a win is paid out), book icon (opens the panel).
- **Phase stepper**: 1 Bet / 2 Deal / 3 Result / 4 Payout, following the round (`progressbar` named "Step n of 4: <phase>").
- **Felt**: "BLACKJACK PAYS 3 TO 2 / 6 TO 5" and "DEALER STANDS ON ALL 17s / HITS SOFT 17" printed from the Rule Set; dealer hand, "Your cards" placeholder, hand-total pills ("Soft 17", "21 · doubled", "Bust · 24"), the "You: Stand" action tag, SHOE (opens the count panel), bankroll TIP.
- **Betting**: Chip rack (radios "$25 chip"; only chips the table and bankroll allow); the bet spot (button "Bet spot, $50"): tap adds the selected chip, long-press removes one (also an accessibility action; Clear is the button path). Clear / Rebet / Deal (Deal is disabled below the table minimum, with a note).
- **LAST strip**: the Session's last five rounds, newest first ("BJ +75", "W +50", "L −25", "P 0").
- **Dealing**: Hit / Stand / Double / Split / Surrender — exactly the legal actions. Insurance prompt on a dealer ace.
- **Early surrender**: surrender stays available before a dealer blackjack can settle. Another chosen action authorizes the peek and executes only if the dealer has no natural. The table explains this timing above its buttons.
- **European no hole card**: the dealer draws its second card after the player finishes. Dealer blackjack collects all split and double wagers; early surrender still returns half.
- **Safety shuffle**: penetration is a maximum target. Between rounds, the trainer may reshuffle earlier when the remaining card values cannot guarantee enough cards for every legal split and draw. The Session records each replacement shoe and its seed.
- **Coach** (profile `coach`, set in onboarding): `mistakes` (default) and `every` catch a wrong play _before_ it reaches the cards: the hand pauses on a mistake Coach Note ("Hold on: soft 17 (A,6) vs 5 is a double." + the EV cost and dealer bust odds) with "Take it back & double" (plays the right move; the Decision is still recorded and scored as the miss, with `playedInstead`) and "Keep my stand". `every` also shows a hint note before each decision; `asked` shows a Hint button instead and never interrupts.
- **The coach pause is intentional** (not a disabled action, invariant 7): while a mistake note is up, the action bar is replaced by the note's two choices — "Take it back & <right play>" and "Keep my <your play>" — because the caught play has not reached the cards yet and the hand is waiting on exactly that decision. Either choice applies a play and the full action bar returns for the next decision. The take-back is recorded as the miss it was (`Decision.actionTaken` = your play, `playedInstead` = the play that reached the cards; the bug report carries both).
- **Result**: headline ("You win $100"), subline ("Dealer drew to 24 and busted. Doubled bet pays 1 to 1."), DECISIONS THIS HAND (each row a "Why: …" button opening its Explanation; taken-back plays read "stood, replayed as double · Counts as a miss."; bet sizing vs the bankroll), Replay hand (steps through the decisions' Explanations), Collect $X / Continue.
- **Payout**: bet stack, win stack with "+$100 / paid 1:1", "$200 moving to your rack", Clear / Rebet $X (back to betting) / Next hand (deals straight away). Both repeat the wager the engine actually dealt (clamped to the bankroll and the table max), not the amount asked for.
- **Panel** (book icon / SHOE): tabs Why (DecisionFeedback + chart) · Count & shoe (Show/Hide counts, RC/TC, system picker, shoe seed, Shuffle now) · Table (Report a bug, Rule Set + Change your table, pending table, Session control + Statistics, Bankroll incl. Rounds played, session stats). Close button "Close".
- **Out of chips**: below the minimum, Deal is replaced by "Reset to $500" (and "End session instead" while recording).

## How to get to it (user POV)

Home → "Play blackjack", or go to `/play`. A Session starts recording on the first deal.

## Driving it with Playwright

- `flows/play-round.mjs`: checks the printed rules → Clear, $5 chip, tap the spot twice → Deal → decline insurance → Stand (Keep my stand if caught) until Result → Why for the stand → Collect → Payout, LAST strip grew → Rebet → Bet.
- `flows/blackjack-coach.mjs`: seeds `localStorage["tableside/profile/v1"]` with a coach level and reloads. `mistakes`: stands until the coach catches one (a few rounds at most), checks the note, Take it back, the "replayed as …" row and its Explanation. `every`: a hint note precedes the decision. `asked`: no hint until Hint is pressed.
- `flows/early-surrender.mjs`: selects Early in Rules, then deals a seeded dealer blackjack at mobile and desktop sizes. Surrender loses half; choosing Double loses only the original bet because the peek occurs before the double executes. Both reveal the dealer natural without drawing another card.
- `flows/no-hole-card.mjs`: selects No hole card in Rules and verifies a three-card opening deal. The player doubles to 21 using the fourth card; the dealer draws an ace fifth and collects both wagers with blackjack.

## Gotchas

- Name matching is substring by default: use `exact: true` for "Stand", "Hit" and "Close" ("Take it back & hit", "Dismiss the panel" contain them). The top bar's title is a heading named "Blackjack"; the result headline is "Blackjack! You win …".
- A natural settles with no player decision; the review says "No decisions this hand".
- The profile and the Session are read after mount: wait ~500 ms after load before relying on the coach level.
- Hidden duplicate views exist: filter to visible.

## Recovery and bug-report proof

`flows/recovery-report.mjs` plays a seeded hand and hits once, opens Report a bug through the book panel, checks the exact cards/seed/action and successful replay flags, adds a note, and downloads the exact preview text. It waits for the report modal's fade before taking a screenshot and targets the topmost Close button when two sheets are open.

The same flow changes only the saved current bankroll to zero, reloads Play, taps Reset to $500 once, verifies that the session id, completed hands and decision log survive, and deals again. It also covers zero-bankroll recovery for the other four games. All starting browser storage is restored on exit.
