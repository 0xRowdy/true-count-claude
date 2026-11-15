# What Plus should include, and whether Free should show ads

Gathered 2026-11-09 for issue #57. Primary sources: CQ Nexus's own pages (`play.cqnexus.com`
home, `/free/`, `/bundles/`, `/go-pro/`, `/news/`, `/build/`, `/casino-games/blackjack/`) and
its App Store listing; competitors' App Store listings and `qfit.com`; Apple's App Review
Guidelines, age-rating reference and user-privacy page; Google Play policy and Play Console
help; AdMob help; Appodeal's Q4 2024 eCPM report; RevenueCat's State of Subscription Apps 2026;
the pricing pages of Convex, Stripe, RevenueCat, Expo, Apple, Google Play and Cloudflare. Repo
context: `CONTEXT.md`, `PRODUCT.md`, ADR-0007, `docs/accounts-and-billing.md` and the three
earlier notes in `docs/research/`.

All web facts were checked on 2026-11-09 unless another date is given. Labels:
**[estimate]** is arithmetic on stated assumptions; **[chart read]** is a value read off a
published chart, ±10%; **[secondary]** is not from the party that owns the fact.

## Bottom line

**Keep Free ad-free and make Plus "more tables, and your training everywhere":** cloud sync of
progress, Sessions and strategies across devices, plus new games and variants as they ship.
Everything that ships free today stays free. Launch Plus once its first feature (sync) exists.

Why:

- **Running costs are not the problem.** Infrastructure is about **\$10 a month** from zero to
  ~30k monthly actives, and **\$15–55** at 100k (section 4). Two or three yearly Plus
  subscribers cover it. Ads would be paying for the owner's time, not for servers.
- **Ads earn about what a modest Plus does.** At published mobile eCPMs, with ads kept off
  training screens, ads come to roughly **\$35–90 per 1,000 monthly actives per month [estimate]**. Plus
  bought by 1–2% of actives is about **\$35–75 [estimate]**. Same order of magnitude, before the
  costs below.
- **Ads cost more than they show.** An ATT prompt on iOS, a certified consent platform in the
  EEA/UK/Switzerland, rewritten privacy labels, Data safety form and privacy policy (which today
  says "No advertising, no analytics or tracking SDKs", `src/ui/legal/LegalScreen.tsx:57`), a
  "Contains ads" label on Play, and a native SDK. And AdMob **allows social-casino ads by
  default**, so a casino trainer will be shown slot-machine apps unless that category is
  blocked.
- **"No ads" is how this niche sells.** CQ Nexus puts "NO Tokens · NO Ads · NO Gambling" on
  every page. TwentyOne sells "no ads", CountJack "No annoying ads" (its ads are optional), and a
  reviewer praises a top-rated paid trainer for having none. Ads would hand the incumbent a line
  Tableside could no longer say.
- **Ads in Free break invariant 9** ("Zero ads. Ever.") and the Brand Commitment in
  `PRODUCT.md`. It's a legitimate choice, but it needs an ADR that supersedes invariant 9
  (Model B, section 5).

The current Plus copy ("No ads", "Unlimited training sessions") describes neither model. Free
has no ads to remove, and no session limit exists to lift.

## Method and limits

Pages were fetched as text; CQ Nexus's browser game was **not** re-exercised, so in-app
behaviour still rests on `docs/research/cqnexus-functionality.md`. Revenue figures are estimates
from industry medians plus the assumptions stated beside them: Tableside has no usage data
(`PRODUCT.md`, "Absent, do not fabricate"). Unreachable pages are listed at the end.

## 1. CQ Nexus today

### Prices and tiers

| Product                       | Price                                                                                                          | Terms                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Blackjack, Roulette, Craps    | \$24.99 each, one-time                                                                                         | "One game, lifetime … no subscription" ([home](https://play.cqnexus.com/))                                  |
| Video Poker                   | \$9.99, "9 game variations"                                                                                    | One-time ([bundles](https://play.cqnexus.com/bundles/))                                                     |
| Baccarat                      | **Conflicting:** \$24.95 "at release" (bundles), \$19.99 "at launch" (free page), \$24.99 IAP (App Store)      | Free in Early Access since Oct 19–21 ([news](https://play.cqnexus.com/news/))                               |
| Pachinko                      | "\$1.99 alone, or free with Nexus Pro" (bundles); "live · free for everyone" (home)                            | Conflicting                                                                                                 |
| Nexus Pro                     | \$7.77 / 30 days, \$19.99 / 90 days, \$49 / 365 days, \$98 lifetime                                            | "Nexus Pro is prepaid, never a subscription"; "Pro simply switches off" with data saved                     |
| Bundles                       | Trifecta \$69 (3 games + 90 days Pro); Core Player \$95 (5 games + 90 days); Pro Gambler \$199 (+365 days, add-ons); The Operator \$249 (lifetime Pro, every future game, "200 spots") | "No auto-renewal. Nothing to cancel."                                                                       |
| Founding tiers                | I Am George \$1,250 (75 spots), Casino Baron \$2,500 (10), The Whale \$7,777 (7)                               | In-person perks: meetups, dealer practice, VIP lounge                                                       |

Source for each row unless linked: [bundles](https://play.cqnexus.com/bundles/),
[Pro](https://play.cqnexus.com/go-pro/). App Store IAPs: Craps, Roulette, Blackjack and
Baccarat at \$24.99 each, Video Poker \$9.99, Pachinko \$1.99
([App Store](https://apps.apple.com/us/app/cq-nexus/id6758868182)).

### Free, trial, owned, Pro ([free page](https://play.cqnexus.com/free/))

- **Free, no account:** all five games at \$1–\$3 tables; Video Poker is "Jacks or Better, one
  nickel at a time"; a \$100 bankroll "refilled once a day".
- **7-day trial per game:** "The whole game, unlocked" plus all Pro; email code; "Nothing is
  charged; we never asked for a card"; then back to free, and "Your data waits for you".
- **Owned:** without login, the apps, every table and a \$10,000 bankroll; signed in, one synced
  bank, 1 goal, 5 session logs, 1 trip planner, view-only community.
- **Pro adds:** unlimited bankrolls, goals and logs, session tracking and replay, AI Strategy
  Builder, shared strategies, Blackjack bots, multi-user and hosted tables, leaderboards,
  achievements, community and messaging, trip planner, casino directory, priority support
  ([Pro](https://play.cqnexus.com/go-pro/)).

**What is gated:** games (per-game purchase); tables and variants beyond the \$1–\$3 table and
nickel Jacks or Better; session tracking, multiplayer, strategy sharing, community and
cross-device banks (Pro). **Not gated:** trainers ("Thirty-three built in with the game",
including the Card Counting and Basic Strategy Trainers,
[Blackjack page](https://play.cqnexus.com/casino-games/blackjack/); the bundles page still says
"31 features · 33 with Pro") and devices ("yours for life on mobile, desktop, and in your
browser"). No counting system is named anywhere; deviations appear only as "Surrender,
count-based and no-bust deviations".

**Ads: none.** Every page header says "NO Ads"; home says "NO Tokens · NO Ads · NO Gambling"; the
free page says "No ads. No tokens. No subscriptions." The App Store listing has no "Data Used to
Track You" ([App Store](https://apps.apple.com/us/app/cq-nexus/id6758868182)).

**Since the October 21 review:** prices, bundles, trial terms and the absence of named counting
systems are unchanged. New: v6.14.5 (Oct 26: tablet layouts, new Craps engine, penetration and
burn card, [build](https://play.cqnexus.com/build/)); App Store 6.14.6 (Oct 27), 4.7 from 26
ratings, rated **18+** for "Frequent simulated gambling"; the daily bankroll refill; free
Baccarat in Early Access; European (SR) Roulette "Beta 11/9", Keno and Pai Gow "On deck"
([home](https://play.cqnexus.com/)); founding tiers (the September note's "up to \$9,969" is
stale).

**Takeaway.** CQ Nexus sells breadth (games, tables, variants) one time, and sells service
(cloud, social, multiplayer, analytics) as prepaid time. It does not sell training depth any
more (its trainers come with the game), and it shows no ads. That is close to what Tableside's
invariants 1 and 9 already require.

## 2. Other trainers

| App (seller)                                                                                          | Model                                                                                                                                                                    | Ads                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [Blackjack Guru – BJ Trainer 21](https://apps.apple.com/us/app/-/id6717589612) (Growth Garage LLC)    | Free. Subscription "unlocks unlimited training, the full card counting course, and Smart Training Mode". Weekly \$6.99–\$9.99, annual \$89.99, lifetime \$119.99. 4.7 from 4K ratings, 18+ | **"Contains Advertising"**. "Data Used to Track You": purchases, identifiers, usage, other            |
| [Blackjack & Card Counting Pro](https://apps.apple.com/us/app/id388857410) (Dealer Bust Time LLC)     | Paid \$4.99, plus "Card Counting Drill" \$0.99. 4.8 from 10K ratings                                                                                                     | None listed. "Data Not Collected". A review: "you don't have to suffer through ads like other apps" |
| [BJA Blackjack Trainer](https://apps.apple.com/us/app/id582187547) (Dealer Bust Time LLC)             | Free. "Go Pro" \$2.99, Card Counting Drill \$0.99. 4.6 from 863 ratings, rated 4+                                                                                        | None listed. "Data Not Collected"                                                                    |
| [TwentyOne: Blackjack Trainer](https://apps.apple.com/us/app/id6781118717) (Justin Taddeo)            | Free. "TwentyOne Pro" \$4.99, "a single one-time purchase — no subscriptions, no ads". Pro adds per-hand EV and a counting trainer                                       | None                                                                                                 |
| [CountJack](https://apps.apple.com/us/app/id6462346330)                                              | Free. Coin packs \$0.99–\$4.99                                                                                                                                           | "No annoying ads … All ads in the game are optional" (rewarded). Third-party advertising data linked |
| [CVCX](https://www.qfit.com/cvcx.htm) (Casino Vérité, Windows)                                        | \$75 one-time, free upgrades. CVData \$140, both \$200. Demos, refund guarantee                                                                                          | n/a                                                                                                  |

Two patterns bear on the decision:

1. **The rest of the category charges for counting.** TwentyOne, Dealer Bust Time and Blackjack
   Guru all put counting behind the paywall. That is what invariant 1 rules out for Tableside,
   so it is a differentiator to keep, not a model to copy.
2. **Ads show up only alongside subscriptions or coins.** Blackjack Guru pairs ads with weekly
   subscriptions and tracking, and it rates well (4.7 from 4K ratings), so ads don't sink a
   trainer. CountJack sells coins and runs optional rewarded ads. Every paid-once trainer here
   is ad-free and says so.

## 3. Ads, honestly assessed

### Platform rules

- **Apple.** Simulated gambling is rated by frequency: "Infrequent simulated gambling" gives
  13+, and "Frequent simulated gambling" gives 18+. "Advertising" is a separate capability in
  the questionnaire
  ([age ratings](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/)).
  Ads "must be appropriate for the app's age rating". Interstitials need "easily accessible and
  visible close/skip buttons". Apps with ads "must also include the ability for users to report
  any inappropriate or age-inappropriate ads" (2.5.18). Tracking needs ATT permission (5.1.2(i)),
  and functionality may not be gated on it
  ([user privacy](https://developer.apple.com/app-store/user-privacy-and-data-use/)). Placing an
  SDK "that combines user data from your app with user data from other developers' apps" counts
  as tracking "even if you don't use the SDK for these purposes". A separate risk, not about
  ads: 5.3.4 says "Illegal gambling aids, including card counters, are not permitted"
  ([guidelines](https://developer.apple.com/app-store/review/guidelines/)). Card-counting
  *trainers* are listed widely (section 2), so this reads as covering in-casino devices, but App
  Review decides.
- **Google Play.** An app that shows gambling ads "must not provide simulated gambling content
  (for example, social casino apps…)"
  ([policy](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)). So
  Tableside may run ads, but **never real-money gambling ads**. Ads must be declared, and the
  listing then shows "Contains ads" to every user
  ([Play Console](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en)).
- **AdMob.** The Google Publisher Restrictions on gambling cover only *real-money* online
  gambling. Restricted inventory gets "fewer advertising sources", and Google Ads won't serve on
  it ([restrictions](https://support.google.com/admob/answer/10437795?hl=en)). Tableside's
  virtual-chip games aren't restricted, so it can monetise normally. But in
  [AdMob's sensitive categories](https://support.google.com/admob/answer/3150953?hl=en), "Social
  Casino Games" ("simulated gambling games … poker, slots, bingo") is a **standard category,
  allowed by default**. "Gambling & Betting (18+)" is restricted and blocked by default. An
  ad-supported Tableside would show slot-machine and social-casino apps unless the publisher
  blocks that category. That runs against "a training tool, not a gambling product"
  (`CONTEXT.md`).
- **EEA, UK and Switzerland.** AdMob requires "a consent management platform (CMP) that has been
  certified by Google" and integrated with the IAB TCF: since 16 January 2024 for the EEA and UK,
  and 31 July 2024 for Switzerland. Without one, traffic "may be eligible for non-personalized
  ads or limited ads" ([AdMob](https://support.google.com/admob/answer/13554116?hl=en)).

### Revenue

eCPM from [Appodeal's Quarterly Mobile eCPM Report, Q4 2024](https://appodeal.com/wp-content/uploads/2025/03/Quarterly_Mobile_eCPM_Report_-_Q4_2024.pdf):
Oct–Dec 2024, "100,000+ apps & 70+ ad networks", mostly games. Values are **[chart read]**.
Appodeal notes "December recorded the highest eCPM across all ad formats", so treat these as a
seasonal high.

| Region (Q4 2024)                          | Banner     | Interstitial | Rewarded video |
| ----------------------------------------- | ---------- | ------------ | -------------- |
| United States, iOS                        | ~\$0.4     | ~\$13        | ~\$17          |
| United States, Android                    | ~\$0.6     | ~\$12        | ~\$13          |
| North America, iOS / Android              | ~\$0.4–0.5 | ~\$10 / ~\$10 | ~\$14 / ~\$9  |
| Europe, iOS / Android                     | ~\$0.2     | ~\$5 / ~\$4  | ~\$9 / ~\$5    |

No first-party web (AdSense) RPM benchmark was found, so the web is left out.

**Ads per 1,000 monthly actives [estimate].** Assume 20% DAU/MAU (200 daily actives; no
Tableside data) and ads only off the table, keeping Product Principle 4 ("ads or paywalls never
interrupt training"): one interstitial when a Session ends and ~5 banner impressions per daily
active on the lobby and results screens. No rewarded video: there is nothing to reward, since
bankroll resets are free (invariant 6) and gating a drill breaks invariant 1. That is 6,000
interstitials and 30,000 banners a month: **high** (US, Q4, full fill) 6,000 × \$12.5 + 30,000 ×
\$0.5 ≈ **\$90**; **low** (US and Europe mix, off-season, partial fill, effective \$5 and \$0.2)
≈ **\$36**.

That is **about \$0.04–0.09 per active per month**. iOS users who decline ATT lower the iOS
figure further. Adjust reports about 35% opt-in among users shown the prompt in Q2 2025
**[secondary]**: the page returned HTTP 429 and the figure is from a search summary.

**Plus per 1,000 monthly actives [estimate].** RevenueCat's State of Subscription Apps 2026
covers 115,000+ apps and 2025 metrics
([RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026/)): freemium median
day-35 download-to-paid 2.1% (top quartile above 4.5%), Gaming 1.0%; trials of 5–9 days convert
at a median 37.4%; Education has the highest yearly median price, \$44.99, next to Tableside's \$49.

Assume subscribers are 1–2% of monthly actives. That is an assumption: download-to-paid is a
different metric. Assume mostly yearly plans at about \$3.50–3.75 net a month (section 4). Then
**10–20 subscribers bring \$35–75 a month**, and top quartile (4.5%) brings about \$160.

Ads and Plus land in the same range. Ads scale with engagement and the US share of users. Plus
scales with Plus being worth buying, and today it gates nothing. No primary source quantifies
how much "remove ads" lifts conversion.

### Costs of ads beyond revenue

- **SDK.** `react-native-google-mobile-ads` "does not run in Expo Go". It needs the config
  plugin and a development build, and its README says to gather consent before initialising
  ([GitHub](https://github.com/invertase/react-native-google-mobile-ads)). Tableside already
  needs dev builds for RevenueCat, so this is extra weight, not a new workflow. The binary
  growth was not measured.
- **Privacy surface.** An ATT prompt, a TCF consent message in Europe, new App Store privacy
  labels ("you must describe what data [SDKs] collect … and whether it tracks users"), a new Play
  Data safety form, and a rewritten privacy policy, which today promises "No advertising, no
  analytics or tracking SDKs".
- **Web.** Ads on the static export would load a third-party ad script into a site positioned as
  "Light and immediate" (`PRODUCT.md`). The offline cache doesn't help: ads need the network.
- **Category evidence.** It is weaker than invariant 9 implies. The September review study
  (`competitive-landscape.md`) has no "ads" theme among its seven complaint themes. The evidence
  is how competitors sell instead: CQ Nexus's "NO Ads" header, TwentyOne's "no ads", CountJack's
  "No annoying ads", and a review praising a paid trainer for having none. **Paywall friction**,
  not ads, is the top measured complaint (36% of low-star reviews).

## 4. What it costs to run

| Item                   | Current price                                                                                                                                                                                                                       | Tableside's use                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convex                 | Free & Starter \$0: 1M function calls, 0.5 GB storage, 1 GB DB I/O, 1 GB egress a month. Pay-as-you-go above (\$2.20 per 1M calls, \$0.22/GB). Professional \$25 per developer a month ([pricing](https://www.convex.dev/pricing)) | Training is local, so gameplay never reaches Convex. Traffic is the auth session check and `account.me` for signed-in players (`src/ui/account/account.tsx:73`), plus webhooks and a few rows per Account                                                |
| Stripe                 | 2.9% + 30¢; +1.5% international; +1% conversion; Billing 0.7%; **Managed Payments +3.5%** ([pricing](https://stripe.com/pricing))                                                                                                  | Web sales, Managed Payments on (`docs/accounts-and-billing.md`)                                                                                                                                                                                         |
| RevenueCat             | Free to \$2,500 monthly tracked revenue, "Then pay 1% of what you track" ([pricing](https://www.revenuecat.com/pricing/))                                                                                                           | App-store revenue only                                                                                                                                                                                                                                  |
| Apple                  | Developer Program "99 USD per membership year" ([Apple](https://developer.apple.com/programs/enroll/)). Small Business Program "15% on paid apps and Apple In-App Purchases" under \$1M proceeds ([SBP](https://developer.apple.com/app-store/small-business-program/)) | Required for iOS                                                                                                                                                                                                                                        |
| Google Play            | "US\$25 one-time registration fee" ([Google](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)). Subscriptions 10% service + 5% billing (new structure), or 15% (legacy) ([fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)) | Required for Android                                                                                                                                                                                                                                    |
| Expo (EAS)             | Free: 15 iOS + 15 Android builds a month, low-priority queue. Starter \$19, Production \$199 ([pricing](https://expo.dev/pricing))                                                                                                 | The app doesn't use `expo-updates`, so Update MAU charges don't apply. Free covers releases                                                                                                                                                             |
| Web hosting            | Cloudflare: "Requests to static assets are free and unlimited" ([docs](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). Pages Free allows 20,000 files and 25 MiB per file ([limits](https://developers.cloudflare.com/pages/platform/limits/)) | The export is 162 files, 13 MB (`dist/`, 2026-11-09). No host is chosen in the repo                                                                                                                                                                     |
| Domain                 | Cloudflare Registrar sells at cost with "no markup" ([Cloudflare](https://www.cloudflare.com/products/registrar/)). About \$10–15 a year for `.com` **[estimate]**                                                                    | One domain                                                                                                                                                                                                                                              |

**Monthly running cost [estimate].** Assumes ~30 Convex function calls per active a month (10
opens × ~3 calls; not measured), 10% of actives signed in, ~200 KB per signed-in player if sync
ships, and payment fees counted against revenue, not here.

| Monthly actives              | ~0      | 1k      | 10k     | 100k                                                                                       |
| ---------------------------- | ------- | ------- | ------- | ------------------------------------------------------------------------------------------ |
| Apple (\$99 / 12)            | \$8.25  | \$8.25  | \$8.25  | \$8.25                                                                                     |
| Domain                       | ~\$1    | ~\$1    | ~\$1    | ~\$1                                                                                       |
| Hosting, EAS, Google         | \$0     | \$0     | \$0     | \$0, or \$19 for EAS Starter's faster queue                                               |
| Convex                       | \$0     | \$0 (30k calls) | \$0 (300k calls) | ~\$5 on pay-as-you-go (3M calls), or \$25 Professional; sync adds ~2 GB (≈ \$0.35) |
| RevenueCat                   | \$0     | \$0     | \$0     | \$0 until store revenue passes \$2,500 a month                                            |
| **Total**                    | **≈ \$9** | **≈ \$9** | **≈ \$9** | **≈ \$15–55**                                                                        |

**Net per sale:**

| Sale              | App Store or Play (15%) | Web: Stripe + Billing + Managed Payments |
| ----------------- | ----------------------- | ---------------------------------------- |
| Plus monthly      | \$5.09                  | ~\$5.26                                  |
| Plus yearly       | \$41.65 (\$3.47 a month) | ~\$45.22 (\$3.77 a month)               |
| Lifetime \$199.99 | \$169.99                | ~\$186.89                                |

The web figures assume a US card with no conversion.

**Break-even:** about **3 yearly Plus subscribers** cover ~\$9 a month, and **4–15** cover the
100k case. The costs that matter are outside this table: the owner's time, sales-tax and
accounting work if Managed Payments isn't confirmed (ADR-0007), and support.

## 5. Options for Plus that fit the invariants

### Candidate features

Invariant tags: **1** = gates breadth, not training depth. **8** = training stays offline with
no login; Plus must work offline from a cached Plan (ADR-0007, Consequences). **9** = no ads.

| Candidate                                                                                           | Who charges for it                                               | Tableside today                                                                                                                         | 1                                                                                                       | 8                                          | 9   |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --- |
| **Cloud sync** of progress, Sessions, strategies and bankrolls across devices                       | CQ Pro (cross-device banks, goals, unlimited logs)               | Local only, plus JSON backup and restore (`src/ui/session/SessionBackupPanel.tsx`). Sync deferred until a feature needs it (ADR-0003)   | Keeps it: a service, not training                                                                       | Keeps it, if local stays the source of truth | Keeps |
| **New games** (e.g. Pai Gow, Three Card Poker, Spanish 21, Free Bet blackjack)                      | CQ per-game \$24.99; Keno and Pai Gow "on deck"                  | 5 games, all free                                                                                                                       | Keeps it: the invariant's own example                                                                   | Keeps                                      | Keeps |
| **New variants** of existing games (more video-poker machines, Crapless or Bubble craps, side bets) | CQ: Video Poker \$9.99 for 9 machines; Crapless and Bubble in Craps | Video poker: Jacks or Better 9/6, 8/5, 7/5, 6/5, Deuces Wild, 9/6 DDB. European and American roulette. Punto Banco and EZ baccarat (`src/games/`) | Keeps it, for **new** variants only                                                                     | Keeps                                      | Keeps |
| Simulated live tables for blackjack and roulette ("Opens soon")                                     | CQ Pro multiplayer                                               | Live craps exists, local and labelled                                                                                                   | Keeps it                                                                                                | Keeps, if simulated locally                | Keeps |
| Advantage-play tools (bet-spread, risk of ruin, N0, large simulations)                              | CVCX \$75; CQ Pro "strategy reports"                             | Strategy builders test runs free                                                                                                        | **Grey**: fine as an analysis tool. Never gate an Explanation or drill feedback behind it             | Keeps                                      | Keeps |
| Strategy sharing and community publishing                                                           | CQ Pro                                                           | Seeded examples, labelled                                                                                                               | Keeps it                                                                                                | Keeps; publishing needs network            | Keeps. Needs its own product decision and moderation (`PRODUCT.md`) |
| Multiple saved custom tables, casino rule-set library, trip planner                                 | CQ Pro (trip planner, casino directory)                          | Rules screen and presets, trip date in onboarding                                                                                       | Keeps it, if the Rules screen stays free                                                                | Keeps                                      | Keeps |
| Gate counting systems beyond Hi-Lo                                                                  | TwentyOne Pro, Dealer Bust Time, Blackjack Guru                  | All six are free                                                                                                                        | **Breaks** it in spirit: takes back a shipped free feature, the product's lead differentiator           | Keeps                                      | Keeps |
| "Unlimited training sessions"                                                                       | Blackjack Guru ("unlimited training")                            | No limit exists                                                                                                                         | **Breaks** it: a depth gate                                                                             | —                                          | —   |
| "No ads"                                                                                            | —                                                                | No ads exist                                                                                                                            | —                                                                                                       | —                                          | Implies Free has ads: **breaks** 9 |

Moving anything that is free today into Plus also contradicts the Free plan copy ("All 5 games
with every supported rule set", "Every drill, counting system, and coaching explanation",
`src/ui/pricing/PricingScreen.tsx`). Plus should gate **new** breadth.

### Tier models

**A. Ad-free; Plus is sync plus new breadth (keeps 1, 8 and 9).** Free: everything shipped
today, forever, offline, no account. Plus (\$5.99 a month or \$49 a year, 7-day trial): cloud
sync, then new games and variants as they ship, later simulated live blackjack and roulette and
advantage-play tools. Lifetime (\$199.99): the same, permanently. Sync is a real recurring
service, so it meets Apple 3.1.2(a)'s "ongoing value", and its per-user cost is easy to explain.
The risk is that Plus has nothing until sync ships.

**B. Ads in Free; Plus removes them and adds breadth (breaks 9).** Free: everything today, plus a
banner on the lobby and results screens and an interstitial at Session end, never on a table or
in a drill. Plus and Lifetime: no ads, plus Model A's features. It needs: (1) an ADR that
supersedes invariant 9, with edits to `CONTEXT.md` (invariant 9, "What this is"), `PRODUCT.md`
(Product Purpose, Brand Commitments, Principle 4) and the Landing "No ads" badge; (2) a new
privacy policy, App Store privacy labels, Play Data safety and "Contains ads" declaration; (3)
an ATT prompt and a certified CMP; (4) AdMob's Social Casino Games category blocked, and
Gambling & Betting kept blocked (Play policy); (5) an ad-report control (Apple 2.5.18). Expected
yield: ~\$35–90 per 1,000 actives a month, lower once Plus buyers stop seeing ads. The
case for it: revenue from users who never pay, which no other model gets. The case against:
CQ Nexus's "NO Ads" becomes a contrast against Tableside.

**C. No subscription; buy breadth once (keeps 1, 8 and 9).** Free: everything today. Paid:
one-time packs for new games or variant sets (as CQ Nexus, TwentyOne and Dealer Bust Time sell),
or Lifetime only, with sync included or left out. This fits the category's top complaint (paywall and subscription friction, 36%), and
"never a subscription" is CQ's own pitch. It gives the least recurring revenue, but costs are
small enough that recurring revenue isn't needed to break even. It also drops monthly and
yearly products that ADR-0007's billing already supports.

### Recommendation

**Model A**, with three conditions:

1. **Don't sell Plus until sync exists.** `docs/accounts-and-billing.md` already says not to
   create store products until the tiers are settled. Apple asks a subscription to "provide
   ongoing value". Until then, keep the labelled preview.
2. **Plus copy promises only real, new breadth**, never "unlimited", "deeper" or "no ads". Bring
   back the "No ads" badge in every build (#57 acceptance).
3. **Review in six months with real numbers.** If paid conversion is under ~1% of actives and
   costs have grown, reconsider Model B through an ADR, with this note's numbers replaced by
   measured ones.

The ads option is not irrational. It earns from the 98% who never pay, and Blackjack Guru shows
a trainer can carry ads and keep a 4.7 rating. But at Tableside's cost base the money doesn't
need it, and "no ads, no tokens, no second paywall" is most of the positioning shared with the
incumbent. Giving that up for an estimated \$0.04–0.09 per active a month is a
poor trade until the numbers say otherwise.

## Open questions

- **Stripe Managed Payments eligibility** for a casino-strategy trainer (Stripe excludes
  "betting, gambling"); open since ADR-0007, and it decides who handles web sales tax.
- **Apple's age rating:** Tableside's tables are likely "Frequent simulated gambling", so 18+
  like CQ Nexus. Confirm in the App Store Connect questionnaire.
- **Apple 5.3.4** ("card counters" as illegal gambling aids) concerns the whole app. A review
  note that Tableside is a trainer with no in-casino use is cheap insurance.
- **Convex calls per active:** the ~30 a month is a guess; read it from the dashboard.
- **"Ad-free" as a conversion lever:** no primary data found.

## Pages not reached

- `blackjackapprenticeship.com` (home and `/pricing/`): HTTP 403, so BJA's price isn't recorded.
  App Store id6717589612, titled "Blackjack Apprenticeship BJ 21" in search results, is
  Growth Garage LLC's "Blackjack Guru", not BJA.
- App Store id6768187788 ("Reckon"): HTTP 404; its "\$99.99 lifetime" is from a search snippet
  and unused. Google Play `com.countdojo.app`: rendered without app details.
- Adjust's ATT post: HTTP 429 twice (35% marked [secondary]). `qfit.com`: no CVBJ price.
- Appodeal's report: text not extractable; figures read from charts. `games.cqnexus.com`: not
  re-exercised; in-app behaviour relies on the October review.
