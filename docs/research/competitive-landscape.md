# Competitive research — CQ Nexus and the trainer category

Gathered 2026-09-14. Primary sources: `play.cqnexus.com` and sub-pages, `games.cqnexus.com`
(hands-on), Google Play `com.cqnexus.games`, Apple App Store id6758868182, plus review corpora
for eleven competing trainers.

## The incumbent: CQ Nexus (Casino Quest Nexus)

Operated by CEI Limited / CEG Dealer School + Casino Quest, Las Vegas. A casino *training*
platform — explicitly not a social casino. Five live games: Blackjack, Roulette, Craps,
Video Poker, Plinko. Baccarat and "Pro" variants announced.

### Hands-on measurements (verified directly in-browser)

- **~30 seconds** from navigation to first paint; **~50 seconds** to a playable table.
- Web build **160 MB**; iOS binary **257 MB**; Android **106 MB**.
- The `/blackjack` deep link does **not** open blackjack — it lands on a login lobby.
- The game is **letterboxed to 16:9**, not responsive. Black bars on a normal laptop viewport.
- Skeuomorphic 3D felt, gold-framed chrome, Hints / Re-Bet / Deal controls, XP and level in
  the header, trial bankroll of $100 at a $1–$15 table.

### Tech stack (fingerprinted)

**Unity WebGL** (`createUnityInstance`, `companyName: "Casino Quest"`), with the lobby shell
being a **React SPA rendered inside Unity via Vuplex WebView**. The Nexus+ companion at
`app.cqnexus.com` is **Next.js App Router running React Native Web**. Marketing is WordPress;
courses are Kajabi. Backend `api.cqnexus.com` is a custom API-key REST service on Render behind
Cloudflare, with `access-control-allow-origin: *`.

The Unity dependency is the root of their binary size, their cold-start time, and their iOS
release latency. **Their iOS build is a full major version behind web** (3.5.10 vs 5.0.3).

### Feature strengths (do not attack these)

Casino-procedure authenticity: CEG-approved order of operations, correct dealer peek, penny-
accurate electronic-table payouts, dealer-perspective add-ons, a real dealer school behind it.
Breadth: 5 live games with 4 more in flight. Craps is genuinely deep — 27 features and four
analytics panels (dice/SRR/chi-squared, reality check, hot-and-cold, financial with comp value).

### Feature gaps (attack these)

1. **No named counting systems at all.** No Hi-Lo, KO, Omega II, Wong Halves, Zen, Red 7.
   One unnamed running/true count is the entire counting offering.
2. **No index/deviation play as a trainable skill.** "Count-based deviations" exists only as a
   rule toggle, never scored or drilled.
3. **No blackjack side bets** in the product, despite App Store copy advertising them.
4. **No bet-spread, risk-of-ruin, or N0 tooling.** Their financial panel stops at comp value.
5. **Roulette is American double-zero only.** No European wheel, racetrack, or call bets.
6. **Store copy overstates the product** — advertises Baccarat, European wheels, side bets, and
   a Host mode that are not shipped. A credibility gap.

### Pricing (first-party verified)

$24.99 per game one-time (includes 3 months Nexus+ Core); Video Poker $7.77; bundles at $60 /
$189 / $265 (unverified); founder tiers up to $9,969. **Nexus+ subscription $4.99 Core /
$9.99 Ultra / $19.99 Host / $99.99 Creator per month.**

The critical structural weakness: **the actual training features — the counting mini-game, the
basic-strategy mini-game, session replay, bots — are behind the $4.99+/mo subscription, on top
of the $24.99 game purchase.** Users pay, then hit a second wall.

## Verified complaints about CQ Nexus

The review corpus is tiny: **5 Google Play ratings, 16 App Store ratings, two negative reviews
in total.** No Reddit, forum, or Trustpilot presence found. CQ Nexus is *not* an entrenched
incumbent. Treat the themes below as directional, not statistical.

- **1★ Google Play, Jul 8 2026** — paid $24.99 for roulette, virtual bankroll hit zero with no
  in-game way to add more. The developer's reply confirms the top-up feature existed but lived
  on a separate website: *"We're working harder at making that clearer."*
- **2★ App Store, "Fun but buggy", v3.0.5** — four distinct defects: sessions do not close
  reliably; craps missing on mobile while present on browser/desktop; **a purchase not
  recognized in "My Stuff" after logging in from another platform**; and *"I looked all over
  your website and couldn't find anything short of DMing yall on IG"* — no bug-report channel.
- **Developer's own build log** admits shipped defects including **split hands being processed
  in the wrong order** and the trial bankroll reset being broken — correctness bugs in the core
  teaching loop.

Ranked CQ Nexus weaknesses: (1) cross-platform entitlement/session sync, (2) core-loop
correctness bugs, (3) bankroll dead-ends, (4) discoverability, (5) platform feature parity,
(6) no support channel.

## Category complaints (n=278 low-star reviews across ~1,100 scanned, 11 apps)

| Rank | Theme | Share of low-star |
| --- | --- | --- |
| 1 | Pricing / paywall / subscription friction | 36% |
| 2 | **"It doesn't actually teach" — verdict without explanation** | 22% |
| 3 | Wrong strategy / wrong math / wrong count | 21% |
| 4 | "Rigged" RNG / unrealistic dealer luck | 19% |
| 5 | Crashes / bugs / glitches | 17% |
| 6 | Missing features / no customization | 12% |
| 7 | UI/UX, controls, gestures, hit-targets | 9% |

Representative quotes, verbatim from App Store reviews:

- Paywall: *"Bait & Switch. They get you to subscribe then want to charge you more for counting
  tool."* · *"Once I bought the app... I HAD TO PAY FOR IT after paying to even download the app."*
- Teaching: *"They tell you if your move is right or wrong, but they don't tell you why. So all
  it's doing is teaching you to memorize the card combinations, not actually think through the
  game."* · *"when you make a mistake, you find out only after the cards dealt have been removed.
  So there's no way to learn immediately what you did wrong."*
- Correctness: *"Updated version is completely wrong in terms of how to handle a pair of 9s."* ·
  *"it told me the correct move was to hit because I have a high chance of getting a hard total
  of '22'."* · *"Makes me wonder if other plays are wrong in this training app as well."*
- RNG trust: *"the count does not end on 0 when the shoe is finished like it should."* ·
  *"I've practiced double deck with over 12 2's in the deck."*
- Input: *"App is flaky on how it reads 'hand' signals. Splits and double downs randomly read as
  hits."* · *"multiple times, the split button is blocked for when i get double Aces, 8s, & 7s"*
  (greyed-out legal actions corrupting the user's own accuracy stats).
- Content depth: *"I hit the end in 1 hour as a beginner learning how to count."*

Each of the ten product invariants in `CONTEXT.md` traces to one of these findings.

## Where we win

1. **Counting and advantage-play depth.** The category leader has none. This is our wedge and
   the reason the product is called True Count.
2. **Explanation as the product.** The largest unmet need in the category, and the dimension
   where Unity buys the incumbent nothing.
3. **Shipping velocity and weight.** A fast 2D cross-platform app updates same-day everywhere
   against a 160 MB Unity build that is a major version behind on iOS.
4. **One honest price.** A single purchase that includes every trainer, against a $24.99 game
   plus a $4.99/mo subscription to unlock the actual training.

## Gaps in this research

- CQ Nexus negative reviews: **n=2**. Do not over-interpret.
- Reddit could not be fetched; absence of mentions is probable, not proven.
- **Casino Quest's YouTube channel comments (claimed 700k+ subscribers) are the highest-value
  unmined source** — their audience gives feedback there, not in app stores.
- Android competitor reviews were not mined; all 278 low-star reviews are iOS.
- Bundle pricing ($60/$189/$265) is from a search summary, not a first-party page.
