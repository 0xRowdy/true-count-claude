# Live tables

Routes: `/live` (list) and `/live/craps` (design 11, frame `QEqUW`). Flow:
`.agents/skills/verify-true-count/flows/live-craps.mjs`.

## What it is

A craps table with a full rail that is **simulated on the device**. There is no backend
(ADR-0003): the five other players are the craps engine's seeded bots
(`src/games/craps/live.ts`), each betting a named style (Pass + odds, Pass + 2 Come, Don't
pass, Iron Cross, Come + field). The header says "Practice table · simulated players" next to
the "Live · 6 of 8 at the rail" badge, and every chip is a practice chip.

## `/live`

The lobby's "Live tables" panel, full page. Craps · Downtown rules shows its seats (6/8, from
the engine) and **Join** goes to `/live/craps`. Blackjack and roulette have no simulated table
yet, so they say "Opens soon" and link to the single-player tables (`/play`,
`/games/roulette`) instead of showing seat counts nobody is sitting in.

## `/live/craps`

- **Opening state**: the design's moment, played for real on the engine: your $25 pass line
  with 3x odds, point 8, Dee shooting, "Six, easy six. Point is still 8." and the bots' bets
  down. Starting bankrolls and records are set so the seats read the design's numbers.
- **Betting**: pick a chip (5 / 25 / 100 / 500), tap any spot: box numbers (place bets), come,
  field, don't come, pass line, don't pass bar, hardways, any seven, any craps, yo, aces,
  twelve. Each bet is graded by the coach as it goes down (good / fair / costly) and counts
  toward your accuracy on the leaderboard. Illegal bets (a pass line with the point on) show
  the engine's reason instead. **Add odds** adds one chip of odds behind your line (or come)
  bet up to the 3-4-5x limit; it only appears when there is a bet that can take odds.
- **Rolling**: bets close when you press **Confirm bets** or the 15-second timer runs out.
  The seeded dice roll, every seat settles, the bots run their press/take-down rules and put
  their next bets down, the dealer calls the roll, and your bankroll updates. The shooter
  passes on a seven-out.
- **Coach**: the line under the chip rack shows your last bet's or roll's feedback, else the
  max-odds nudge ("Point is 8: odds go up to 5x ($125)…"), else what to do next.
- **Leaderboard**: Best decisions (accuracy, not chips won) / Longest roll.
- **Chat**: dealer and system lines as pills, players with avatars. Quick replies and the
  composer post your message locally; a seeded bot may answer. Mute hides the other players;
  the flag explains there is no one to report.
- **Invite** (header or the open seat) copies the table link; **Table rules** opens the rules
  sheet; **Leave table** returns to `/live`.

## Determinism and hydration

The first render is the opening table on a fixed fixture seed, identical to the prerendered
HTML. After mount the real seed is chosen (`?seed=<n>` or a fresh draw) and the timer starts.
`?pace=manual` keeps bets open until Confirm (the e2e flow uses `?seed=7&pace=manual`; `/live`
forwards both params to Join). The view model is `src/ui/live/session.ts`, unit-tested in
`session.test.ts`.
