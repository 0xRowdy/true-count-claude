# Where per-casino table rules can come from

Gathered 2026-11-10 for issue #70 (parent map #67, blocks #75). Primary sources: BJ21.com and a
Current Blackjack News issue (CBJN, April 2022 PDF); Wizard of Vegas surveys and terms; Vegas
Advantage survey pages, terms and Patreon; vpFREE2 casino pages and update log;
blackjack.tools casino database and terms; Blackjack Review Network (BJRN) rules pages and
terms; vegas-aces.com; casino sites (Caesars, Penn); CQ Nexus's marketing pages, terms and the
JavaScript bundle of its companion app `app.cqnexus.com`; Nevada Gaming Commission Regulation
5; 58 Pa. Code Chapters 601a and 633a; N.J.A.C. 13:69F; the Massachusetts Gaming Commission's
table-game rules page; the Michigan Gaming Control Board's rules; *Feist v. Rural* (1991); EU
Directive 96/9/EC. Repo context: `src/engine/rules.ts`, `src/ui/rules/presets.ts`,
`src/games/{craps,roulette,baccarat,video-poker}`, `docs/research/cqnexus-functionality.md`,
ADR-0003 and ADR-0007.

All web facts were checked on 2026-11-10 unless another date is given. Labels:
**[estimate]** is arithmetic on stated assumptions; **[inference]** is a reading of evidence
that no source states outright; **[secondary]** is not from the party that owns the fact. This
is not legal advice. The licensing notes say what each source's own terms say, and where a
lawyer should look before anything ships.

## Bottom line

1. **No source can be shipped as-is.** Every compiled source either says "private use only"
   (CBJN and the Wizard of Vegas copy of it), requires attribution and only "limited" reuse
   (Vegas Advantage), forbids copying and automated extraction (blackjack.tools, CQ Nexus), or
   is all-rights-reserved with no licence offered (vpFREE2, BJRN). Facts themselves are not
   copyrightable in the US (*Feist*), but these sites' terms, and the EU and UK database right
   for European data, are the real constraints.
2. **The best data is CBJN.** It is monthly since 1979, covers the US and much of Canada, has
   paid field reporters, comes as Excel on the \$42/quarter and \$129/year plans, and has a
   column ("cut") that converts straight into `RuleSet.penetration`. It **leaves out 6:5
   games** and has no published commercial licence. Using it in a product means negotiating
   with BJ21. The price is unknown until asked.
3. **Vegas Advantage is the best-maintained source for Las Vegas only**: 62 to 68 casinos,
   visited at least yearly (Strip and downtown at least three times a year). It also covers
   craps odds and field pays, and roulette zeros. Its terms allow "limited" reuse with a
   backlink and threaten a \$1,000 fee for uncredited use. A competing directory is probably
   not "limited". It also needs a negotiated licence.
4. **Regulators and casinos give constraints, not per-casino tables.** Pennsylvania's rules
   fix standard blackjack at S17 and 3:2 statewide. That is a useful default for every PA
   casino, from a primary source. New Jersey and Massachusetts publish a menu of options. Each
   casino's choices sit in filings that are not published (PA Rules Submissions, the NJ "rules
   of the games checklist"). Nevada only requires payoffs to be posted at the table. Casino
   websites rarely state deck counts, H17/S17 or surrender.
5. **CQ Nexus's directory is crowdsourced on top of seeded "Official" data.** Its app code shows
   per-game data tagged `official`, `user-reported` or `pending-review`, with confirmation
   counts, user amendments that wait for review, users adding casinos, and reviews limited to
   paying members. Where the "Official" rows come from is not stated. The roadmap's unshipped
   Casino Portal suggests casinos may one day edit their own listings [inference].
6. **The only route that needs no licence is collecting the data ourselves**: dated player
   reports, plus our own seed of a few markets, shown as "reported on *date*". Ongoing cost is
   moderation plus field checks. Volunteer and staff models already exist at vpFREE2 (about
   22,000 logged updates), blackjack.tools (841 casinos) and Vegas Advantage (two people, about
   65 casinos). It fits ADR-0007's Convex backend, but invariant 8 means a bundled offline
   snapshot is needed.

## How the app models a table today

Each game has a pure-TypeScript rules type. A directory entry would have to fill one of these
for every table. The blackjack type is the demanding one:

| Game | Type and file | Fields a directory must supply |
| --- | --- | --- |
| Blackjack | `RuleSet`, `src/engine/rules.ts` | `decks` (1–8), `dealerSoft17` (hit/stand), `blackjackPayout` (3:2/6:5), `doubleAfterSplit`, `doubleRule` (any/9-11/10-11), `surrender` (none/late/early), `maxSplitHands` (1–4), `resplitAces`, `oneCardToSplitAces`, `dealerPeek`, `penetration` (0–1), `minBet`, `maxBet` |
| Craps | `CrapsRules`, `src/games/craps/rules.ts` | `odds` (3-4-5x or flat N×), `fieldTwoPays` (2/3), `fieldTwelvePays` (2/3), buy and lay commission (rate, timing, minimum), `hardwaysWorkOnComeOut`, `minBet`, `maxBet` |
| Roulette | `src/games/roulette/wheel.ts`, `coach.ts` | wheel `european`/`american`, `laPartage`, limits `min`/`max`/`insideMin` |
| Baccarat | `BaccaratRules`, `src/games/baccarat/rules.ts` | `variant` (punto-banco/ez), `decks`, `tiePays` (8/9), `commission`, `sideBets`, `cardsBehindCut`, `burn`, `minBet`, `maxBet` |
| Video poker | `PayTable`, `src/games/video-poker/paytables.ts` | one of six `PayTableId`s: JoB 9/6, 8/5, 7/5, 6/5, Full Pay Deuces Wild, 9/6 Double Double Bonus |

Two details matter for mapping:

- `presets.ts` matches a preset by **exact** equality on all thirteen fields, including
  penetration and limits (`sameRules`). Directory tables will almost never equal a preset, so
  the Rules screen will show them as "no match" unless matching ignores limits and
  penetration for directory entries.
- The preset file already says penetration and limits "are the one part of a preset that is a
  reasonable representative rather than a fact". They are also the fields sources disagree on
  most and that go stale fastest.

## Sources, one by one

### Current Blackjack News (CBJN), BJ21.com, Stanford Wong

- **What it is:** a monthly newsletter "published monthly since 1979", released "on the 1st of
  each month" by email. Reporters "visit casinos throughout the United States and Canada", and
  "Five of those reporters split up Las Vegas" ([bj21.com/cbjn](https://www.bj21.com/cbjn)).
- **Fields:** per casino and rule set: tables, edge, decks, **cut** ("decks yet unseen when the
  dealer usually shuffles"), min, max and coded rules (`h17`/`s17`, `ds`, `ls`, `rsa`, `d10`,
  `nm`, `sc`, `shoe`, `pv` = penetration varies, `toke`). Each issue opens with a list of
  changes, e.g. "Bally's … downgraded its six deckers to eight decks with dealer hitting soft
  17", "Treasure Island worsened penetration at low-limit six deck"
  ([CBJN Apr 2022 PDF](https://assets.bj21.com/newsletters/pdf_files/000/000/078/original/CBJN2204.pdf)).
- **Gaps:** "We do not list 6:5 games, continuous shuffling machine games, or most other
  carnival games" (same PDF). So it cannot fill `blackjackPayout: "6:5"` tables, the ones most
  worth warning players about.
- **Price:** Starter \$19 per issue (PDF), Standard \$42 per quarter (PDF and Excel), Pro \$129
  per year (PDF and Excel). Auto-renews, "Minimum subscription time is one quarter"
  ([bj21.com](https://www.bj21.com/)). The 2022 issue showed \$109 per year, so the price has
  risen.
- **Licence:** every data page says "Copyright © 2022 by BJ21.com. This information is for your
  private use. Resale of any of it in any form without written permission from BJ21.com is
  prohibited" (PDF). The site publishes no terms of use and no data-licensing offer. A product
  licence means asking BJ21 (`info@bj21.com`, per the PDF masthead).
- **Mapping to `RuleSet`:** very good. `h17`/`s17` → `dealerSoft17`. `ds` → `doubleAfterSplit`.
  `ls` → `surrender: "late"`. `rsa` → `resplitAces`. `d10` → `doubleRule: "10-11"`. The baseline
  ("resplit any pair except aces to make up to four hands; split aces receive one card each")
  → `maxSplitHands: 4`, `oneCardToSplitAces: true`. `penetration = 1 − cut / decks`, e.g. Aria
  six-deck, cut 1.5 → 0.75. Min and max map directly. The CBJN baseline is "the dealer does not
  look at the hole card; … one bet lost to a dealer's BJ", which plays like a peek game, so it
  maps to `dealerPeek: true` [inference]. Rows coded `Spanish` and other variants have no type
  in the app and would be dropped. CBJN also lists 3- and 5-deck games, which `validateRules`
  accepts.

### Wizard of Vegas / Wizard of Odds (Michael Shackleford)

- **Blackjack survey:** "shows only true 3-2 Blackjack games in the Las Vegas area". It has the
  same columns and codes as CBJN, credits the edge figures to CBJN, and its data table is
  labelled **"January 2025"**, although the page byline is Aug 25, 2026. Licence text: "This
  information is for your private use. Sale of any of it in any form without written
  permission from wizardofvegas.com or BJ21.com is prohibited", "Copyright © 2025 by BJ21.com"
  ([blackjack survey](https://wizardofvegas.com/guides/blackjack-survey/)). In effect this is
  a licensed, older copy of CBJN's Las Vegas section. Using it raises the same question as
  CBJN, with older data.
- **Craps survey:** columns Casino, # of Tables, Min Bet, Max Bet, Odds (2x to 100x, 3-4-5x),
  Field12 (Double/Triple), Video. Posted **Jul 22, 2018** and lists closed names (Monte Carlo,
  SLS) ([craps survey](https://wizardofvegas.com/guides/craps-survey/)). It maps onto
  `CrapsRules.odds`, `fieldTwelvePays`, `minBet` and `maxBet`, but it is stale.
- **Roulette survey:** wheel types "00", "0", "Euro" (single zero where even-money bets "only
  lose half", i.e. la partage) and "Sands" (triple-zero maths), with min and max. Posted **Feb
  14, 2017** ([roulette survey](https://wizardofvegas.com/guides/roulette-survey/)). It maps to
  `european`/`american` plus `laPartage`. Triple zero has no type in the app.
- **Terms:** the Wizard of Vegas terms have no date and do not cover reuse of the site's own
  content. They only stop members posting others' copyrighted material. The footer says "©
  2009-2026 Michael Shackleford" ([terms](https://wizardofvegas.com/terms-conditions/)). I
  found no terms-of-use page on wizardofodds.com (`/terms-of-use/` returns 404). Its About
  page says "we've allowed a few other sites to reprint some of our articles", i.e. reprints
  are by permission ([about](https://wizardofodds.com/site/about/)).

### Vegas Advantage / US Casino Advantage (Advantage Media LLC)

- **What it is:** John and Kristina Mehaffey visit casinos, "find a dealer at an idle table and
  ask about the blackjack rules", "confirm with a second person" and get help from "several
  table game supervisors". The blackjack survey covers 68 casinos, "Survey pages are updated
  several times per month", and the page was last updated May 26, 2026
  ([blackjack survey](https://vegasadvantage.com/las-vegas-blackjack/)). The table game survey
  covers "62 licensed casinos operating under 66 brand names", with every casino visited "at
  least once per year" and "at least three annual visits to every Strip and downtown casino".
  It tracks craps "by the odds allowed and the payout on a Field 12" and "the number of zeros at
  each roulette table". The database has been collected "since 2010" and is updated "at least
  once a month for our paid subscribers"; the page was last updated May 13, 2026
  ([table game survey](https://vegasadvantage.com/las-vegas-table-game-survey/)).
- **Price:** "subscriptions are available through Patreon starting at \$5 per month" (same
  page). The Patreon page says "Survey subscriptions will end September 2027!"
  ([Patreon](https://www.patreon.com/VegasAdvantage751)). Whether the survey continues after
  that date is not stated, which is a continuity risk for anything built on it.
- **Licence:** "We require a backlink to the page where the information is published on our
  site if it is used by your website." "Failure to properly cite Vegas Advantage per our terms
  of use will result in a fee of \$1,000." Sharing is allowed "on a limited basis" while "still
  giving the user a reason to visit our site". Apps are not mentioned. Terms dated Feb 24, 2026
  ([terms](https://vegasadvantage.com/privacy-policy/)). A Plus directory that replaces visits
  to their site is the use they say they fight. Ask for a licence.
- **US Casino Advantage**, the same publisher's sister site, has narrative pages for casinos
  outside Nevada: decks, payout, soft 17, doubling, craps odds, field 12, wheel zeros and
  minimums. The pages are dated (e.g. Hollywood Columbus, "Last Updated on May 25, 2025") but
  are years apart and are prose, not tables
  ([example](https://uscasinoadvantage.com/gambling/ohio/hollywood-columbus/)).
- **Mapping:** the public pages are prose. The subscriber PDFs were not inspected. Penetration
  is not mentioned on the public pages.

### vpFREE2 (video poker pay tables)

- **What it is:** a "complete inventory of the best video poker at 558 casinos in US and
  Canada" (the same page also says "440+"), "maintained by a cadre of volunteer casino monitors
  and an active community of video poker players" ([vpfree2.com](https://www.vpfree2.com/)).
  Listings give pay tables in per-coin shorthand with return and denominations, e.g. "99.54%
  JOB : 1-2-3-4-6-9-25-50-800"
  ([pay table help](https://www.vpfree2.com/video-poker/pay-tables/help)).
- **Freshness:** very active. The update log shows entries "about 22 hours ago", 30 per page
  across 733 pages (≈22,000 entries [estimate])
  ([recent updates](https://www.vpfree2.com/video-poker/recent-updates)). Casino pages carry no
  per-game verification dates ([Las Vegas](https://www.vpfree2.com/casinos/las-vegas)).
- **Licence:** "All rights Reserved © 2026 vpFREE2". The site has no terms of use, licence or
  API, only a contact page.
- **Mapping:** the shorthand maps directly onto `PayRow.pays`. But the app knows six pay tables.
  Most of vpFREE2's best games (TB+, NSUD, DW44, BP) have no `PayTableId`. A directory could
  only point players to casinos with one of the six, unless the app adds games.

### blackjack.tools

- **What it is:** a free card-counter site with a casino database: "841 casinos" in total
  (sign-in required to search), 691 public profiles (USA 560, Canada 53, Caribbean 17). It
  records only 3:2 games: decks, penetration, soft 17, surrender, DAS, limits and optional
  notes. "Written updates are reviewed first", and profiles are "dated game reports" that
  readers should "check the date and confirm" ([casinos](https://blackjack.tools/casinos/)).
  The latest updates are dated 6 Nov 2026 ([home](https://blackjack.tools/)).
- **Licence:** "All software, simulations, strategies, training tools, text, images, and code
  belong to us or our licensors". Users may not "Reverse engineer, copy, or resell any part of
  the Website" or "Use automated tools to extract data without permission". The terms say
  nothing about the licence contributors grant. Last updated November 26th 2025
  ([terms](https://blackjack.tools/terms)).
- **Mapping:** close to `RuleSet`, except it has no 6:5 tables, as with CBJN.

### Blackjack Review Network (BJRN, blackjackreview.com)

- Regional "Blackjack Rules and Conditions" pages exist
  ([sitemap](https://www.blackjackreview.com/wp/site-map-index/)), but the Las Vegas page says
  "Last Update 02/04/02" and "THIS PAGE IS ARCHIVED", and credits Wong's CBJN
  ([Las Vegas](https://www.blackjackreview.com/wp/blackjack-rules-las-vegas-nv-usa/)). The
  terms forbid reproducing copyrighted material without the owner's permission (updated Nov 30,
  2025) ([terms](https://www.blackjackreview.com/wp/terms-and-conditions/)). Its own links page
  points readers to Vegas Advantage for current games [secondary]. **Not usable:** the data is
  about 24 years old.

### blackjackinfo.com

- The site still runs a basic strategy engine and forum
  ([rules page](https://www.blackjackinfo.com/blackjack-rules/)). I found no live casino rules
  database. An old forum thread answering "how do I find the rules at a casino" points to the
  Wizard survey, CBJN and the felt itself
  ([thread](https://www.blackjackinfo.com/community/threads/urgent-how-do-i-find-out-about-the-rules-of-a-blackjack-table-at-a-casino.22994/)).
  Pagat says the site "has now been acquired by an affiliate advertisement network"
  [secondary] ([pagat](https://www.pagat.com/banking/blackjack.html)). **Not a source.**

### vegas-aces.com

- It publishes no per-casino rules. It has per-casino *toke* (dealer tip) reports by region,
  game pages for new table games and articles. The footer says "Copyright © 2010-2026 Vegas
  Aces Services, LLC · All rights reserved", with no terms of use
  ([vegas-aces.com](https://www.vegas-aces.com/)). **Not a source.**

### Paid industry databases

- **Casino City Press / GamingDirectory.com** sells data on "9,500+ properties worldwide" and
  27,000+ executive contacts. It has per-property *counts* of slots and table games, CSV
  downloads and seat-based subscriptions, but no rules per table
  ([GamingDirectory](https://www.casinocitypress.com/gbd/gamingbusinessdirectory/),
  [file specs](https://www.gamingdirectory.com/pdf/GamingDirectoryDownloadHelpandFileSpecifications.pdf)).
  Useful only as the master list of casinos (name, address, owner, table count), and its
  licence is per-seat, not for republishing.
- I found **no commercial vendor that sells per-table rules**. The paid sources for rules are
  the player newsletters above (CBJN, Vegas Advantage). Historic ones (Blackjack Forum,
  Blackjack Insider) are defunct [secondary].

### Casinos' own published rules

- Casino sites rarely give concrete house rules. Caesars' Harrah's Metropolis table-games page
  lists games only
  ([page](https://www.caesars.com/harrahs-metropolis/casino/table-games)). Caesars'
  Las Vegas blackjack guide is generic, saying tables where the dealer hits soft 17 "say so on
  the table"
  ([guide](https://www.caesars.com/las-vegas/explore/casino/how-to-play-blackjack-las-vegas)).
  Penn's pages describe side bets, not deck counts. Penn's site refused automated fetches
  (HTTP 403).
- Circa is a worked example of why one source is not enough. Third-party reports from 2020 to
  2026 disagree on its high-limit games: six-deck S17 only, or also a double-deck H17 game, and
  whether resplitting aces is allowed. None of the evidence found comes from Circa itself
  [secondary]. The April 2022 CBJN shows Circa as 2D H17, 6D S17 and 8D H17, all `ds`.
- **Licence:** a casino's statement of its own rules is a fact. Copying its page text is a
  different matter. In practice there is little to copy.

### State gaming regulators

| State | What is public | What is not | Use |
| --- | --- | --- | --- |
| Pennsylvania | 58 Pa. Code Ch. 633a: the dealer draws "until he has a hard or soft total of 17", i.e. **S17**; blackjack "shall be paid at odds of 3 to 2"; layout must say "Dealer shall draw to 16 and stand on all 17s"; re-splits set per casino ([TOC](https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/058/chapter633a/chap633atoc.html), [§633a.7](https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/058/chapter633a/s633a.7.html)) | Each casino's **Rules Submission** is filed electronically with the Bureau of Gaming Operations and kept "through secure computer access" for audit and Board staff ([§601a.2](https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/058/chapter601a/s601a.2.html)). Patrons get table signs ([§601a.7](https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/058/chapter601a/s601a.7.html)) | A primary-source **default for every PA casino**: S17, 3:2. Decks, DAS, surrender, re-splits and limits still need reports |
| New Jersey | N.J.A.C. 13:69F-2.12: casino chooses S17 or H17; the 6:5 variation must hit soft 17; elections go on the casino's "rules of the games checklist" ([§2.12](https://www.law.cornell.edu/regulations/new-jersey/N-J-A-C-13-69F-2-12)). Rules must be posted at the table, and changes notified to the Division half an hour ahead ([§8.3](https://www.law.cornell.edu/regulations/new-jersey/N-J-A-C-13-69F-8-3)) | The checklist itself is not published | The legal option space, plus a consistency check (6:5 ⇒ H17) |
| Massachusetts | Approved rules per game, with dated PDFs (blackjack rules dated 4-9-26), under 205 CMR 147 ([table games rules](https://massgaming.com/regulations/table-games-rules/)). Its 2019 investigation found Encore paid 3:2 at 64.5% of tables and 6:5 at 35.5% [secondary, press] | Per-casino option elections | Option space |
| Michigan | Casino Gaming Rules (effective 4/27/2026) require posted table limits ([MGCB rules](https://www.michigan.gov/mgcb/-/media/Project/Websites/mgcb/Detroit-Casinos/ActandRules/Casino-Gaming-Rules-effective-4272026_Melissa-Hamp.pdf)). Casino-specific game rules are board-approved [secondary] | Approved casino-specific rules are not posted as separate documents that I found | Little |
| Nevada | Regulation 5.012: "payoff schedules … shall be displayed at all times either on the table … or in a conspicuous place immediately adjacent". For craps, a schedule "readily accessible to players" is enough. Payoffs "shall not be worded in such manner as to mislead" ([Reg. 5, rev. 12/24](https://www.gaming.nv.gov/siteassets/content/home/features/Regulation5Operation.pdf)) | No house-rules filing is published. 6:5 is a payoff choice, not a separate approved game [inference from Reg. 5.012] | None for per-casino data |

Regulators therefore give **legal defaults and option menus**, not per-casino tables. A
public-records request for PA Rules Submissions or NJ checklists might be possible, but I have
not tested that, and they would show what the rules allow, not table mix or penetration.

### CQ Nexus's casino directory

- **What the pages say:** the Pro page lists "Casino Directory: read reviews, write reviews,
  submit casinos" among the extras, and a trip planner in both tiers
  ([go-pro](https://play.cqnexus.com/go-pro/)). The roadmap's "Casino Portal" is set to
  "Manage public listings" (build started October 1, no ship date)
  ([roadmap](https://play.cqnexus.com/roadmap/)). None of these pages says where the data comes
  from.
- **What the app code shows** (the public JavaScript chunks of `app.cqnexus.com/casinos`,
  read 2026-11-10; nothing was submitted and no API was called):
  - API calls to `api.cqnexus.com`: `/nexus/casinos/paginated` (filters `q`, `region`, `game`,
    `minBet`), `/nexus/casinos/regions`, `/nexus/casinos/condition-options`,
    `/nexus/casinos/{id}/table-conditions/{game}`, `/nexus/casinos/{id}/reports`,
    `/nexus/casinos/check-duplicate` (by name, city and state) and `POST /api/v1/casinos`
    (create a casino).
  - Each game's metadata carries `source` ∈ {`official` → "Official", `user-reported` → "User
    Reported", `pending-review` → "Pending Review"}, a `confirmationCount` ("N confirmed") and a
    `pendingAmendment` ("Amendment pending review"). Users can "Confirm Info", "Suggest Edit"
    or "Add a game not listed".
  - A user report bundles pit ratings (dealer expertise and friendliness, supervisor
    friendliness, overall pit), amenity ratings, comments, `tableConfirmations`,
    `provisionalTables` and `tableAmendments`. The UI says "Nexus+ Core or Pro members can
    submit casino reviews."
  - Condition options are blackjack: Number of Decks (Single, 2, 4, 6, 8), Blackjack Pays (3:2,
    6:5, 1:1), Dealer Hits Soft 17, Double Down Restrictions (Any Two Cards, "9, 10, 11 Only", "10, 11 Only"),
    Double After Split, Surrender (none/late/early), Resplit Aces, Deck Penetration (~50% to
    ~80%+), Continuous Shuffler. Craps: Maximum Odds (1x to 100x, 3x-4x-5x), Field 2 Pays,
    Field 12 Pays, Prop Bet Payouts, Fire Bet, All Tall Small, Crapless. Roulette: Wheel Type
    (Single/Double/Triple Zero), La Partage, En Prison, Electronic Wheel. Baccarat: Banker
    Commission, EZ, Mini, Dragon Bonus, Panda 8, Squeeze. Plus Min Bet, Max Bet and Table
    Count.
  - Regions include Las Vegas, Atlantic City, Biloxi/Gulf Coast, California, Midwest,
    Northeast, Northwest, Southeast and Southwest US, Native American, Cruise Ships,
    London/UK, Macau, Singapore and Online.
- **Reading:** a crowdsourced directory with moderation, seeded with "Official" data from an
  unstated origin. That is probably staff entry now and casino self-service later via the
  portal [inference]. I did not measure how many casinos it lists or how many have conditions.
  That would need a logged-in session.
- **Terms:** users keep ownership of what they post and grant CQ Nexus "a non-exclusive,
  royalty-free, worldwide license to display, distribute, and promote your content". Site
  content is "the exclusive property of Casino Education Investments LLC … You may not copy,
  reproduce, modify, distribute". Information is "as is", with no warranty that it is
  "current". Last updated and effective November 10, 2026
  ([terms](https://play.cqnexus.com/terms-of-use/)). **Not a source for us. It is a template.**
- **Mapping:** their option set is almost exactly our `RuleSet`. Penetration comes in coarse
  buckets. Their deck options leave out 3 and 5, and they add CSM and 1:1 payouts, which we do
  not model.

## Licensing in one table

| Source | Licence or terms (own words) | Product use without asking? |
| --- | --- | --- |
| CBJN | "for your private use. Resale … without written permission … is prohibited" | No. Negotiate |
| Wizard of Vegas blackjack survey | "private use … Sale … without written permission from wizardofvegas.com or BJ21.com is prohibited" | No |
| Wizard of Vegas craps and roulette surveys | © Shackleford, no reuse terms | No, and the data is from 2017–18 |
| Vegas Advantage | Backlink required, "limited basis", \$1,000 fee if uncited | Only light, cited mentions. Negotiate for a directory |
| vpFREE2 | "All rights Reserved", no terms | No. Ask |
| blackjack.tools | No copying or reselling, no automated extraction | No |
| BJRN | No reproduction without the rights holder's permission | No, and the data is from 2002 |
| CQ Nexus | Exclusive property, no copying | No |
| Regulators | Government regulations | Yes, as facts and defaults |
| Casino statements | Facts. Page text is the casino's | Facts yes, text no |

The legal background for a lawyer:

- **US:** "there can be no valid copyright in facts", and a compilation's copyright is "thin",
  covering only original selection or arrangement (*Feist*, 499 U.S. 340,
  [LII](https://www.law.cornell.edu/supremecourt/text/499/340)). A fact such as "Bellagio deals
  6D S17 DAS LS RSA" is not owned by whoever wrote it down. But a subscriber who agreed to
  "private use" may be bound by that contract, and site terms that ban copying or automated
  extraction are a contract question, not a copyright one.
- **EU (and the UK's equivalent right):** a database maker with "a substantial investment in
  either the obtaining, verification or presentation of the contents" can stop extraction of
  "a substantial part". "Repeated and systematic extraction … of insubstantial parts" is also
  barred, and "any substantial change" to a continuously updated database can start a new
  15-year term (Directive 96/9/EC, Arts. 7 and 10,
  [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31996L0009)). This
  matters if the directory covers London or Europe and draws on a European compiler.

## How current each source is

| Source | Latest data seen | Refresh |
| --- | --- | --- |
| CBJN | Monthly issue on the 1st (current issue not bought; sample read is Apr 2022) | Monthly, field reporters |
| Wizard of Vegas blackjack | "January 2025" | Irregular reprint of CBJN |
| Wizard of Vegas craps / roulette | 2018 / 2017 | None evident |
| Vegas Advantage | Pages updated May 2026; Patreon post Nov 9, 2026 | Several times a month; each casino at least yearly. Subscriptions end Sept 2027 |
| US Casino Advantage | Per page, e.g. May 2025 | Irregular |
| vpFREE2 | Updates within the last day | Continuous, volunteers |
| blackjack.tools | Reports dated 6 Nov 2026 | Continuous, users, reviewed |
| BJRN | Feb 2002 | Archived |
| Regulators | PA §633a.7 amended 2015; MA blackjack rules 4-9-26; MI rules 4/27/2026; NV Reg. 5 rev. 12/24 | When rules change; they say nothing about table mix |
| CQ Nexus | Unknown | Crowd confirmations and amendments |

## What keeping it current would cost

All figures are **[estimate]** unless quoted.

- **Licensing CBJN:** the subscription is \$129/year, but that is the private-use price. A
  redistribution licence is unpublished. Ask before assuming anything. Then the work is a
  monthly import from Excel: map the codes, drop 6:5, CSM and Spanish 21, and check the
  differences. That is roughly a day a month plus a parser built once. The coverage gap
  remains: no 6:5 tables, so the directory would say nothing about the worst tables.
- **Licensing Vegas Advantage:** also unpublished. Las Vegas only. The September 2027 end of
  survey subscriptions is a risk to plan around.
- **Collecting it ourselves, Vegas Advantage style:** they use two people for about 65 Las Vegas
  casinos, each visited at least once a year and Strip and downtown at least three times.
  At 3 visits × 45 Strip and downtown casinos + 1 × 20 others ≈ 155 visits a year, and about
  20–30 minutes each plus travel, that is roughly 80–120 hours a year for Las Vegas alone. Each
  further market adds travel. This only works if someone is already in Las Vegas.
- **Crowdsourcing in the app (the CQ Nexus, blackjack.tools and vpFREE2 model):**
  - Engineering: a reports table and moderation queue on the existing Convex backend
    (ADR-0007). A contributor needs an Account, so reading must not. Invariant 8 means shipping
    a bundled, dated snapshot so the directory works offline, and refreshing it when online.
  - Moderation: each report needs a check for plausibility. Some checks can be automatic: 6:5
    in NJ must be H17; standard blackjack in PA must be S17 and 3:2. The cost scales with
    volume. Below a few hundred reports a month, an hour or two a week [estimate].
  - Cold start: an empty directory is worthless. Seed one or two markets yourself (Las Vegas,
    Atlantic City), or under a licence, and show every row with its "reported on" date and a
    confirmation count, as blackjack.tools and CQ Nexus do.
  - The terms need a contributor licence, as CQ Nexus's §7.3 has. blackjack.tools' terms do not
    have one.
- **Regulator defaults (free):** encode PA (S17, 3:2 standard blackjack) and the NJ 6:5 ⇒ H17
  rule as validation and defaults. This is a small one-off job.

## How well each source fills the app's types

| Source | Blackjack `RuleSet` | Craps | Roulette | Baccarat | Video poker |
| --- | --- | --- | --- | --- | --- |
| CBJN | All 13 fields except 6:5 (excluded); peek inferred | — | — | — | — |
| Vegas Advantage | Decks, soft 17, payout, minimums (public); rest unseen | Odds, field 12, min | Zeros | Presence, min | — |
| Wizard of Vegas | As CBJN, Jan 2025 | Odds, field 12, min/max (2018) | 0/00/Euro (2017) | Survey exists, not read | — |
| vpFREE2 | — | — | — | — | Exact pay rows, but most games are not among our six tables |
| blackjack.tools | Decks, penetration, soft 17, surrender, DAS, limits; 3:2 only | — | — | — | — |
| CQ Nexus | Every field; penetration bucketed | Odds, field 2 and 12, props | Zeros, partage, en prison | Commission, variant, side bets | — |
| Regulators | PA: soft 17, payout. NJ: consistency rules | — | — | — | — |

Fields no source supplies: `insideMin` for roulette, buy and lay commission timing for craps,
`cardsBehindCut` and `burn` for baccarat. A directory entry should leave these at the game's
default.

## Open questions for #75

- What would BJ21 and Vegas Advantage charge for a redistribution licence, and would either
  allow it in a paid tier? Two emails answer this.
- Is the directory worth having if it says nothing about 6:5 tables, as with a CBJN-based one?
  If not, crowdsourcing is required anyway.
- Should the directory be read-free, with contributing, saving and syncing tables as Plus?
  Invariant 1 says breadth may be gated. A directory is breadth, but so is the information that
  helps a player avoid a bad table.
