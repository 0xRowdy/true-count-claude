# CQ Nexus functionality review

Browser evidence captured October 20–21, 2026, Mountain time; report finalized October 21. Reviewed against https://play.cqnexus.com/ and the linked browser application at https://games.cqnexus.com/. The browser loaded game build **6.9.2**. This review updates the September 14 [competitive research](competitive-landscape.md); the older report is historical evidence, not a description of today's product.

## Method and limits

The review used real Chromium through Playwright, visited the marketing and help pages, entered the free Blackjack table and trial Card Counting Trainer, completed free rounds in Roulette, Craps, Video Poker, Baccarat and Pachinko, and signed into the user's existing account with its emailed verification code. The authorized seven-day Blackjack trial was activated without a purchase or payment method. No messages, support tickets, shared strategies, or public tables were published. Account identifiers and authentication codes are excluded from this document and saved evidence.

Evidence is under `.verify/competitor/`, which is ignored by Git. Public pages have matching `public-*.png` screenshots, `public-*.txt` rendered text, and `links-*.json` link inventories. Numbered artifacts record application states. Unity table controls render in a canvas; their text is visible in screenshots but absent from DOM text captures. A screenshot of an accessible control proves that the control exists, not that all its outcomes are correct.

The labels below distinguish evidence:

- **Exercised**: an action was performed and its visible result inspected.
- **Observed**: a screen or control was visible, without completing every operation it offers.
- **Advertised**: the first-party site describes the capability, but this review did not exercise it.
- **Planned/conflicting**: dated build notes mark it unfinished or conflict with another page.

This is an inventory of accessible functionality and first-party claims. It is not an exhaustive correctness audit, statistical RNG test, native-app test, or confirmation that every paid and multiplayer feature works.

## Routes and entry points

| Surface | Route | What it provides |
| --- | --- | --- |
| Marketing home | https://play.cqnexus.com/ | Games, pricing, news, live events, feature previews, downloads, support, roadmap |
| Browser application | https://games.cqnexus.com/ | Game selection, email-code sign-in, free games, per-game trial flow |
| Direct game links | `/blackjack`, `/roulette`, `/craps`, `/videopoker` on `games.cqnexus.com` | Links exposed by the site; independent deep-link behavior was not retested |
| Game feature pages | `/casino-games/blackjack/`, `/casino-games/roulette/`, `/casino-games/craps/`, `/casino-games/video-poker/` on `play.cqnexus.com` | Per-game inventory and access claims |
| Free model | https://play.cqnexus.com/free/ | Free/trial/owned/Pro comparison |
| Pricing | https://play.cqnexus.com/bundles/ | Single games, bundles, founder offerings |
| Pro | https://play.cqnexus.com/go-pro/ | Pro tools and prepaid passes |
| Help | https://play.cqnexus.com/library/ and `/library/getting-started/` | Videos, login, bank/wallet, trial, purchase and support walkthroughs |
| Builds and roadmap | https://play.cqnexus.com/build/ and `/roadmap/` | Dated shipped, QA, alpha, planned and known-bug lists |
| Downloads | https://play.cqnexus.com/downloads/ | Browser, Windows, Mac, iOS and Android links |
| Support | https://support.cqnexus.com/ | Linked help center, not submitted to during review |
| Account | `/my-account` on marketing, https://auth.cqnexus.com/login in footer | Account entry points; browser-game email login was exercised |
| Companion/community | `players.cqnexus.com` | Referenced in build notes for forthcoming community/hosting tools; not independently exercised |

Application navigation uses internal panels inside the Unity build and its HTML shell. A different game or settings panel need not produce a new browser URL.

## Access, onboarding and monetization

**Exercised:** The signed-out lobby offered Blackjack, Roulette, Craps, Video Poker, Pachinko and Baccarat, each marked Free. Navigation included Games, About, Events, Support, Choose a Game, Today's Challenges and Open Play. Email login asked for a one-time code. The existing account was recognized; no new account was created. After login the lobby added Profile and Log out. The Blackjack trial showed terms, required an explicit Start Trial action, and then displayed seven days remaining with a $1,000 wallet.

The trial terms state one trial per game, seven days beginning immediately, reversion to the free version afterward, and preservation of data for a later purchase. Trial activation is account state; it was not undone or reset.

| Access | Current first-party description | Verification |
| --- | --- | --- |
| Free | No account, $100 wallet, $1–$3 Blackjack/Roulette/Craps tables; Jacks or Better at one nickel/one coin | Blackjack table and wallet exercised; remaining limits advertised |
| Free wallet reset | Reset Wallet in the wallet panel; documentation says daily refresh and reset on leaving the game | Reset control exercised at the starting balance; leaving Blackjack returned wallet from $99 to $100; daily cooldown not tested |
| Per-game trial | All tables, training, custom tables and Pro for seven days; email sign-in, no card | Blackjack activated and inventory inspected |
| Owned offline | Full game on mobile/desktop without login; $10,000 resettable bankroll | Advertised, not native/offline-tested |
| Owned signed in | One managed bank account, one goal, five session logs, one trip planner; progress associated with purchase email | Advertised |
| Pro | Unlimited bank accounts, goals, session logs, strategy tools, multiplayer and community | Advertised; individual gates observed below |

Current public prices are $24.99 each for Blackjack, Roulette and Craps, and $9.99 for Video Poker. Pro is prepaid at $7.77/30 days, $19.99/90 days, $49/365 days or $98 lifetime, with no automatic renewal. Bundles shown are Trifecta $69 with three games and 90 days Pro; Core Player $95 with five games and 90 days Pro; Pro Gambler $199 with seven games, dealer add-ons and one year Pro; Operator $249 with lifetime Pro and future content. The site limits Operator to 200 spots. These are displayed offers, not verified checkout totals or confirmed availability of future games. Baccarat's home-page release price is $24.95, and older release-date copy remains on several pages.

Sources: [free model](https://play.cqnexus.com/free/), [Pro](https://play.cqnexus.com/go-pro/), [bundles](https://play.cqnexus.com/bundles/), [getting started](https://play.cqnexus.com/library/getting-started/). Application evidence: `04-lobby`, `05-blackjack-lobby`, `08-wallet`, `15-signed-in-blackjack`, `16-trial-activation`, `17-blackjack-trial-lobby`.

## Blackjack

### Directly inspected

The free Little Birds table is listed as six decks, 3:2, H17, $1 minimum and $3 maximum. The rendered felt says the dealer stands on 17, which conflicts with the H17 lobby label. This review did not isolate a dealer soft-17 hand to resolve the actual behavior.

**Exercised:** Entered Quick Play, placed a $1 center-seat bet, dealt a hand, opened Hints, inspected preferences and wallet, used Reset Wallet at the starting balance, and returned to the game lobby. A player 19 against dealer 6 produced the hint, "Stand with 19 when the dealer is weak (6)," alongside Open Chart while the cards remained visible. A settled hand payout was not verified in that flow.

**Observed table controls:** Three betting positions, chip denominations, Clear, Undo, Re-bet, Deal, Hit, Stand, Double, Split, Surrender, Hints, Open Chart, shoe/discard graphics, table min/max, hand totals, balance, session result, total bet and graph panel. Which actions were enabled depended on the hand. The header exposed achievements/rank/XP, Wallet, sound, music, turbo speed, Goals, Trackers, Bots, Settings and Help. Help explained each header control. Leaving opens a confirmation in the canvas.

**Observed preferences:** Standard or No Bust Basic Strategy mode, and Enabled/Disabled hints. Free help says hints stay on; the presence of a disabled option does not prove the free entitlement permits changing it.

The trial table selector showed:

| Table | Min/max | Rules label |
| --- | --- | --- |
| Little Birds | $1/$3 | Six decks, 3:2, H17 |
| Standard | $10/$1,000 | Six decks, 3:2, H17 |
| Las Vegas Strip | $25/$5,000 | Six decks, 3:2, H17 |
| High Limit 2 Deck | $100/$10,000 | Two decks, 3:2, S17 |

**Observed Practice:** Card Counting, described as one to three automatically dealt hands at variable speed, and Basic Strategy Trainer, described as guided drills. **Observed Challenges:** "No challenges yet," with daily challenges described as coming. The Basic Strategy Trainer was not launched, so its scoring and feedback remain unverified.

**Exercised Card Counting Trainer:** Opened its instruction overlay, selected the center hand, and started automatic dealing. The displayed Running Count and True Count updated as cards appeared. The screen exposed one to three hand positions, deck-count selection, speed level, Start/Stop, Reset, a show/hide eye control and dealt/remaining-deck indicators. The instructions say automatic hands follow Basic Strategy and that showing the count and penetration lets the player check accuracy. No typed answer, score submission, named Counting System or index selection was visible on this screen. Those observations apply to this screen, not every possible configuration. Evidence: `23-counting-drill.png` and `24-counting-running.png`.

**Observed custom tables:** Two permitted slots. The editor has name, brand, private/shared-with-followers visibility, minimum/maximum bets, two-hand/three-hand minimums, aggregate maximum, 3:2/6:5 payout, deck count, H17, continuous shuffle, surrender, maximum hands, double for less, DAS, split aces twice, and Lucky Ladies/Perfect Pairs side-bet controls with minimum/maximum settings. The form was cancelled without saving a custom table. Side-bet settlement was not tested.

Application evidence: `06-blackjack-table`, `07-blackjack-settings`, `08-wallet`, `09-blackjack-ready`, `10-blackjack-dealt`, `12-blackjack-hints`, `17-blackjack-trial-lobby`, `18-blackjack-practice`, `19-blackjack-challenges`, `20-blackjack-custom`, `21-blackjack-rules`, `22-blackjack-rule-fields`. `13-blackjack-result` is an intermediate hand screenshot despite its filename; it does not establish a completed payout.

### Full advertised inventory

The [Blackjack feature page](https://play.cqnexus.com/casino-games/blackjack/) lists 31 included capabilities:

- Prebuilt tables, custom tables, custom rules/limits, 3:2/6:5, one to three positions.
- Insurance, split aces, DAS, surrender, ten-up dealer peek, penetration/shuffle/cut-card mechanics, dealer order of operations, pay/take, dynamic chip stacks and visible shoe.
- Basic Strategy hints, surrender/count-based/No Bust variations, running and True Count, Card Counting Trainer and Basic Strategy Trainer.
- Bots with assigned strategies/bankrolls, per-hand win/loss, shoe/card tracking with replay, Basic Strategy accuracy, financial and streak analytics.
- Three speeds, audio/effects controls, keyboard shortcuts, mobile gestures and haptics, offline play and permanent ownership.

Session tracking/import/replay and Blackjack lobby chat are separately marked Pro. The page now says bots and both trainers come with the game. The Pro page also lists creating Blackjack bots as a Pro tool, so the exact creation/assignment entitlement remains ambiguous. No named counting-system selector or scored deviation drill was established by this review. That is an evidence limit, not proof of absence.

Daily challenges, themes, Teach Me 101 and branded felts are marked coming soon. The build page reports that the hint for 15 against dealer Ace is wrong and some table artwork mismatches variations. Those are vendor-reported bugs, not independently reproduced here.

## Roulette

**Observed lobby:** Little Birds Roulette, Double Zero, $1 minimum/$3 maximum, a $100 wallet, Quick Play and a separate seven-day trial entry. Sidebar controls included Preferences, Go Pro, Chat, Goals, Spin Trackers and Achievements. The Roulette trial was not activated. Evidence: `25-roulette-lobby.png` and its matching text capture.

**Exercised round:** Placed $1 on red and spun. Black 13 won, the balance settled at $99 and the session showed a $1 loss. The header awarded 2 XP and spin history recorded 13. Observed Clear, Undo, Re-bet, Spin, +1/-1/double adjustments, wheel coverage/payout view, graph/history rail and table limits. Preferences exposed Random, Manual Entry and Automatic (Timer) spin modes. Manual and timer modes were not run. Evidence: `27-roulette-ready`, `28-roulette-result`, `29-roulette-settings`, `30-roulette-leave`. The last screenshot has a subsequent unsent $1 bet, so its $98 balance includes that additional stake and is not the first spin's final loss.

The [Roulette page](https://play.cqnexus.com/casino-games/roulette/) advertises 19 included capabilities:

- American 0/00 layout and dealer order of operations, prebuilt/custom tables, custom rules/limits, visible min/max, and enforcement of table min/max plus maximum exposure to a number.
- Chip-unit selection, payout overlay, wheel-coverage view, payouts printed on felt, per-bet odds, mobile magnifier placement, three turbo speeds, and one-tap +1/-1/double adjustments.
- Hot/cold numbers, running red/black/even/dozen/column/zero statistics, offline play and permanent ownership.

Seven Pro capabilities are listed: session tracking/import/replay, recording real spins, multiplayer tables, hosting up to ten with live leaderboards, challenge tables, lobby chat and hosted-table chat. House multiplayer is described as live in dated build notes, but hosting is described as installed and still hidden pending QA. This review did not join a shared table or send chat.

Daily challenges, bots, Teach Me 101, themes and branded felts are listed as coming. European single-zero, racetrack, neighbor/complete bets, French rules, partage and en prison are in alpha on the dated roadmap. They must not be counted as current American-game functionality.

## Craps

**Exercised round:** Entered Little Birds Craps at $1–$3 with 3-4-5x odds, placed a $1 Field bet and rolled 5. The Field lost, the wallet settled at $99, the session showed -$1, total bet returned to zero, and the puck moved to 5. The header reached 28 XP after the table/analytics exploration. Evidence: `31-craps-lobby`, `40-craps-layout`, `41-craps-result`.

**Observed controls:** Pass/Don't Pass, Come/Don't Come, odds areas, place/buy/lay numbers, hardways, horn, Any Craps, Seven, on/off toggles, Press/Sisters/Inside/Across unit adjustments, three saved-bet slots, chips, Clear, Undo and Roll. Opened all four analytics tabs: Dice, Reality Check, Hot and Cold, Financial. Dice displays roll count, SRR/SOR/BSR, expected/actual distribution, hands and chi-squared. Financial displays theoretical loss, actual result, variance, comp value, bet efficiency and pace. These displays were inspected before the test roll; numerical accuracy over a sample was not audited. Preferences exposed Random Rolls/Manual Entry/Timer, proper-bet enforcement, take/lay-odds prompts and penny ETG versus standard payouts. Evidence: `33-craps-ready` through `38-craps-layout`, `42-craps-settings`.

The [Craps page](https://play.cqnexus.com/casino-games/craps/) advertises 30 included capabilities:

- Standard, Crapless and Bubble; default/custom rules; configurable odds multiples; unit selector; visible min/max; saved favorite bet sets.
- Pass/Don't Pass and Come/Don't Come with odds or reverse odds; place; buy, including extra Crapless numbers; auto-buy; lay; on/off controls; all hardways; horn family; all hop combinations; configurable field doubles/triples.
- Inside/outside presses, Sisters/Extremes, press/regress by unit, dealer take/pay/move/pay order, penny or dollar payout modes, puck/point state, optional proper-place and correct-unit enforcement, optional off-unit bets, offline play and permanent ownership.

Seven Pro capabilities are listed: session tracking/import/replay, real dice tracking, multiplayer tables, multiplayer leaderboards, hosting up to ten with moderation/dashboard, in-game chat and event challenge tables.

Build 6.9.2 advertises an integrated Dice Tracker with typed/tapped rolls, shooters separated within sessions, Hard/Natural/Point labels, shooter sevens/SRR, Pass Line wins/losses and bet-category hits. These are build claims until exercised.

Planned work includes bots, Teach Me 101, themes, branded felts, tournaments, ATS/Fire/Repeater/Hard All Day side bets, press ladders, stick calls and hot/cold repeats. A separate 4D Pro game promises a 3D table, voiced calls and David's Bridge Ladder System. Do not treat that separate planned game as part of the verified current Standard table.

Vendor-reported known bugs include Reset Stats clearing only until the next roll, mobile balance-panel clipping and unreadable large bets. A revised logic engine is in QA.

## Video Poker

**Exercised round:** Entered free Little Birds Jacks or Better at $0.05/one coin. Dealt 4♥, 4♦, J♣, 5♣, J♦. Hints said "Two Pair: Hold both pairs and draw one." Held both pairs, drew 7♣, and received the two-pair payout. Balance moved $100 → $99.95 → $100.05; the result displayed a $0.05 net win and the header reached 61 XP. Evidence: `45-video-poker-ready`, `46-video-poker-hints`, `47-video-poker-result`.

**Observed controls:** Coin denomination arrows, Bet 1, Max Bet, pay table with coin columns, Hints, Speed, 3 Hands, Deal/Draw, individual Hold and result history. Free Preferences showed Conservative and Aggressive hint styles; Optimal and Comp Points were not visible there. Presence of denomination/multi-hand controls does not verify free access to every value. Evidence: `43-video-poker-lobby`, `44-video-poker-table`, `48-video-poker-settings`.

The [Video Poker page](https://play.cqnexus.com/casino-games/video-poker/) advertises:

- Free Jacks or Better at $0.05 and one coin; a seven-day full trial; permanent nine-machine purchase at $9.99.
- Jacks or Better 9/6, full-pay Deuces Wild, NSUD Deuces Wild, Joker Poker Kings or Better, Joker Poker Two Pair, Double Joker, Bonus Poker, Double Bonus and Double Double Bonus.
- Denominations $0.05, $0.10, $0.25, $0.50, $1, $5, $25 and $100; one to five coins; one or three hands; compact and expanded pay tables.
- Hints that identify holds and reasons, with Optimal/Aggressive/Conservative/Comp Points styles; no-bet Strategy Practice with hand evaluation; achievements/levels; random cards and offline operation.

Desktop hotkeys and daily challenges are on deck. Missed-hand/payoff and strategy-accuracy statistics are coming soon. The build page still lists remaining variants/Bonus family work and multi-hand rebuilding, which conflicts with the feature page's completed nine-machine list. This review does not resolve availability of each paid variant.

## Baccarat and Pachinko

**Exercised Baccarat:** Entered Little Birds Baccarat, labelled Commission, eight decks, $1–$3. Placed $1 on Banker and completed automatic dealing. The result was Player 9 over Banker 7, no winning bets, wallet $99 and session -$1. Big Road and the history rail recorded a blue Player result. Opened the enlarged Big Road and each Game Info tab: Table Rules, Bet Payouts, How to Play, Playing Rules. Payout help showed Player 1:1, Banker 1:1 less 5% commission and Tie 8:1; playing rules included the third-card table. The free table exposed three betting positions, Player/Banker/Tie, chips, Clear/Undo/Re-bet/Deal and speed control. It had no Settings button. Other roads, variants and side bets were not exercised. Evidence: `50-baccarat-lobby` through `59-baccarat-roads`; `54-baccarat-result` is the settled result, while `53-baccarat-result` is still dealing.

**Exercised Pachinko:** Entered the $1–$3 free table, dropped a $1 ball with Medium risk and 16 rows, and waited for its zero-return result. Wallet settled at $99, profit -$1, and history showed 0. Opened risk options Low/Medium/High, changed to High and observed the peg/bucket configuration change, inspected row options 8/12/16, and switched to Auto to expose Number of bets. Manual/Auto, bet amount, halve/double, Risk, Rows, Bet, balance/profit and outcome history were visible. Auto betting was not started. The Achievements panel explicitly required purchased Pachinko and a connected Pro account. Evidence: `61-pachinko-lobby` through `69-achievements`; `64-pachinko-settled` establishes the result, while `63-pachinko-result` still has the ball falling.

[Baccarat's dated release notes](https://play.cqnexus.com/build/) describe open Early Access, sequential dealing, Dragon 7/Panda 8/Player Dragon Bonus/Banker Dragon Bonus side bets, all five roads with explanations, game rules/payouts/limits, dealer procedure and callouts. The broader roadmap lists Standard, EZ and Mini variants, Tie/Dragon/Panda, road practice/tracking, scorecards and session tracking. Player peeling and full statistics remain planned. The homepage mixes older October 6/12 release copy with the October 21 rollout; current lobby evidence takes priority over those stale dates.

Pachinko is described in build notes as configurable peg rows, volatility, dynamic buckets/layouts, custom configurations and enforced table limits. Crazy Pachinko is promoted as Pro. The homepage calls Pachinko free, while the Pro comparison says the full game is $1.99 without Pro. The live free table exposed the risk and row options described above; additional full-version configuration limits were not established.

## Shared tools and social features

**Observed during the existing Blackjack trial:** Shoe Trackers opened a real tool with My Trackers/Public tabs, an empty list and New Tracker. Its instructions describe active-shoe statistics, New Shoe, rank/suit entry with Save Card, selecting shoes and deleting cards. New Tracker opened a name field and a shared-with-followers option; it was cancelled without creating or publishing a tracker. Goals opened an empty list and New Goal entry, with text explaining win/loss limits and selecting goals for a session. These are accessible trial tools, but saved-data, replay and import/export behavior were not exercised. Evidence: `71-blackjack-trackers`, `72-tracker-create`, `73-goals`.

**Observed progress gate:** Free play visibly awarded XP in Roulette, Craps and Video Poker. Pachinko's Achievements panel required purchasing the game and connecting Pro even while the account held a Blackjack trial. This is a game-specific gate, not evidence that all account progress is unavailable. Evidence: `69-achievements`. The Blackjack trial dashboard also rendered its sidebar Achievements button disabled; this was confirmed from the control state after opening Goals. Evidence: `74-blackjack-achievements-disabled.txt`.

The [Pro page](https://play.cqnexus.com/go-pro/) advertises the following inventory. Unless separately marked exercised above, these are claims rather than tested workflows:

| Area | Advertised operations |
| --- | --- |
| Sessions and trackers | Unlimited logs; replay; import tracker/session data; run sessions against strategies; strategy reports; Top 20 highlights |
| Strategy | AI Strategy Builder; create/save strategies; Strategy Library; assign strategies to Blackjack bots; AI performance feedback |
| Bankroll | Unlimited virtual bank accounts; shared cross-game/device balances; deposits/withdrawals; bank-to-wallet transfer; goals; Bankroll Builder; risk-profile assessment |
| Progress | 81 achievements, Action/Wisdom/Experience/Mastery groups, level ladder 1–101, titles and profile upgrades |
| Competition | Pro challenge tables, live leaderboards, event challenges |
| Multiplayer | House Roulette/Craps tables, up-to-ten-player hosted tables, manual/RNG results, undo, moderation, table-manager dashboard |
| Community | Search players, friends, followers, private messages, groups, breakout chats, game lobbies |
| Planning | Casino trip planner, casino directory, reviews and casino submissions |
| Other | Pachinko, Jacks or Better, priority support |

The [bank walkthrough](https://play.cqnexus.com/library/getting-started/#your-bank) describes a $10,000 starting net worth split $9,000 bank/$1,000 wallet, rename/save, deposit transactions, reset bank, slider transfers, cash-out and separate accounts with Pro. It explicitly says one managed bank does not require Pro. The free in-game wallet panel instead says virtual bankroll features need both the game and a connected Pro account. Record the contradiction; do not infer a settled entitlement policy from it.

The [October 21 build notes](https://play.cqnexus.com/build/) say friends/followers/DMs, saved-session trophies, OBS viewer links/green screen, leaderboard data, branding and ten-player hosting are installed but not yet visible, awaiting QA later in the week. The Pro page presents many of them as available. Daily challenges also appear in the free comparison but showed an empty coming-soon state in the trial. Those are material differences between sales copy and observed availability.

## Help, support and distribution

The application has a visible Support entry before login. The help site describes ticket categories General Help, Bug Report, Feature Request, Account Issue, Billing and Other, plus a knowledge base, email, phone and Monday community call. No ticket or message was submitted. The older statement that there is no support channel is no longer current.

Downloads list web, Windows, Mac, iOS and Android. Cross-device entitlements and native offline support are advertised, not tested here. The help page recommends desktop browser use and says iPad users should use the mobile app; the roadmap simultaneously lists further iPad optimization in alpha. This review did not measure download size, cold-start benchmarks or version parity, so September's binary sizes and iOS-version gap should not be repeated as current measurements.

## Coverage and remaining uncertainty

| Area | Highest evidence level in this review | Remaining verification |
| --- | --- | --- |
| Home, game feature pages, free/Pro/bundle prices, help, downloads, build/roadmap | Rendered public pages captured | Checkout totals, every external link, native downloads |
| Sign-in and Blackjack trial | Exercised | New-account registration and expiration behavior |
| Free Blackjack | Bet placed, cards dealt, contextual hint opened, wallet reset control used | Completed settlement, every legal action and payout permutation |
| Blackjack trial tables and custom rules | Observed selectors and full custom editor | Saved custom table, side-bet settlement, rule-specific engine behavior |
| Card Counting Trainer | Started automated center-seat dealing and observed count display | Count arithmetic over a whole shoe, every deck/speed/position setting |
| Basic Strategy Trainer | Observed launch entry | Drill launch, scoring, explanation and completion |
| Blackjack Challenges | Observed empty coming-soon screen | Actual published challenge |
| Roulette | Settled red-bet loss on black 13; settings inspected | Other bet types, winning payouts, manual/timed modes and paid tables |
| Craps | Settled Field loss on 5, point established; settings and four analytics tabs inspected | Other wagers, odds settlements, variants, analytics accuracy |
| Video Poker | Completed hold/draw two-pair win; hints and settings inspected | Other pay-table outcomes, paid machines, multi-hand and no-bet practice |
| Baccarat | Settled Banker loss to Player 9/Banker 7; rules/payouts/Big Road inspected | Winning commission, ties, side bets, other roads and variants |
| Pachinko | Settled zero-return drop; risk change, row options and Auto panel inspected | Nonzero payouts, automatic batch execution and paid configuration |
| Trackers, goals, bots, achievements, bank management | Trial tracker/new-tracker and goals screens; free-game XP and achievements gate | Save/replay/export, bots, full bank-management flows |
| AI strategies, community, hosted tables, trip planner, casino directory | Advertised; some dated release conflicts | Authenticated companion tool workflows and actual availability |
| Native, offline and cross-device operation | Advertised | Installed-app behavior, offline reloads, account synchronization |

All five additional free games completed a real result in the resumed browser pass. The signed-out gate was resolved using the authorized existing account and Blackjack trial. A concrete entitlement gate remains for free Pachinko achievements. Daily Blackjack Challenges explicitly showed a coming-soon empty state. Other unverified rows are **untested**, not proven unavailable. No additional game trial, purchase or message was submitted; no shared tracker was created. Native apps, paid variants, AI tools, companion/community workflows and multiplayer remain outside the exercised coverage.

The public pages inventory every named feature listed in the captured product/Pro/roadmap sources, including planned dealer training and extra games below. That breadth is documentary coverage, not an assertion that every accessible control was exercised.

### Additional roadmap-only breadth

The [roadmap](https://play.cqnexus.com/roadmap/) also describes Keno with one to twenty cards, selectable pay tables/RTP and denominations, custom win/bonus triggers; a dealer portal with profiles and job boards; a casino portal with listings, promotions, events, job offers and dealer search; and a creator portal with branding, player titles, gated courses/downloads and revenue sharing. These are announced work, not verified live tools.

Four planned Learn to Deal add-ons cover Blackjack card placement, 3:2/6:5 payouts, signals and counting; Roulette picture bets, units/colors, progressive pays and sweep/pay; Craps payout drills, game protection, Come and prop/press/place drills; and Baccarat commission, calls, pyramid drills and Midi variations. Shared planned controls include custom hosted tables, selectable order of operations, manual payouts, bots/NPCs, timers, flash cards, hints and 101/201/301 courses. Spanish support, color themes and creator branding are also on the roadmap. No dealer add-on was exercised.

## Implications for True Count's MVP

This mapping identifies comparable areas in the existing repository. It does not silently expand the accepted MVP into CQ Nexus's full paid platform. [ADR-0003](../adr/0003-local-first-no-backend-for-mvp.md) explicitly chooses local state with no backend, account, multiplayer or cloud leaderboard. The product invariants in [CONTEXT.md](../../CONTEXT.md) remain the authority for training, explanations and shoe auditability.

| CQ Nexus area | Existing True Count route | MVP interpretation |
| --- | --- | --- |
| Marketing, game discovery, free entry | `/`, `/onboarding`, `/lobby` | Make every advertised local game reachable and usable without an account |
| Blackjack simulation and coaching | `/play` | Correct legal actions, settlement and visible explanations; verify split/double/surrender/insurance paths |
| Table customization | `/rules` | Match supported Rule Sets honestly; do not imply all CQ custom/side-bet options |
| Counting and strategy practice | `/drills`, `/drills/counting`, `/drills/true-count`, `/drills/basic-strategy`, `/drills/deviation` | Named Counting Systems and explanations remain a strong focus; do not claim CQ lacks all reasons or trainers |
| Shoe history and replay | `/shoe-integrity`, `/session` | Local reproducibility, composition and inspectable Decision history; no cloud account needed |
| Progress | `/progress` | Persist local progress honestly; do not imitate unimplemented cloud awards or levels |
| Other games | `/games/roulette`, `/games/craps`, `/games/video-poker`, `/games/baccarat` | Verify each local scope and state the supported variants; nine-machine or complete Craps parity is not implied |
| Strategy library/testing | `/strategies`, `/strategies/blackjack`, `/strategies/roulette`, `/strategies/craps` | Local authored strategies and simulation; distinguish this from CQ's advertised AI/service tools |
| Live-table presentation | `/live`, `/live/craps` | A local simulation must say so; real multiplayer would contradict ADR-0003 without a new decision |
| Pricing/entitlements | `/pricing` | State the actual local offer; avoid copied Pro/subscription/account claims |
| Hosted tables, messaging, casino directory, trip planner | No accepted MVP equivalent established | Separate product work, not a hidden completion requirement |
| Pachinko and dealer-training games | No existing route found | Document competitor breadth; do not add merely for parity |

## Corrections to the September comparison

1. Nexus Pro is now sold as prepaid access, not the previous Core/Ultra/Host/Creator monthly subscription ladder. A separate Pro charge still exists, but the old prices and renewal characterization are stale.
2. Blackjack trainers and bots are now described as game inclusions. Trial Practice visibly contains both trainers. Do not claim all core training requires a second subscription.
3. Blackjack hints visibly include a reason and a chart link before the cards clear. True Count must differentiate through the accuracy, depth and auditability of its Explanation, not through a claim that CQ offers no explanation.
4. The custom Blackjack editor visibly exposes Lucky Ladies and Perfect Pairs. Settlement remains untested; "no side bets in the product" is no longer supportable as an unqualified claim.
5. Baccarat completed a free hand in build 6.9.2 and exposed payout/rules help and Big Road. Public notes describe an open beta rollout, so "Baccarat is merely advertised and not shipped" is stale.
6. A visible Support entry and substantial help library now exist.
7. Named Counting Systems and scored deviation training were not established. The review cannot prove their absence across all paid surfaces.
8. Marketing/roadmap inconsistencies remain observable, especially hosting, community, daily challenges, table artwork and Video Poker variants. Distinguish those concrete discrepancies from unverified complaints.
