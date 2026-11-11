# Store rules for a subscription sold on sync and new content

Gathered 2026-11-10 for issue #71. Primary sources: Apple's App Review Guidelines (page "Last
Updated: October 16, 2026"), Apple's auto-renewable subscriptions page, App Store Connect Help
(submitting In-App Purchases, age-rating values), the Apple Developer Program License Agreement,
Apple Developer Forums threads (rejection text as posted by developers), Google Play Console Help
policy pages (Subscriptions and its October 2026 preview, Payments, Real-Money Gambling, Families,
Age-Restricted Content, content ratings), PEGI's label definitions, Nevada Revised Statutes
chapter 465, and current App Store and Google Play listings of competing trainers. Repo context:
`PRODUCT.md` (Monetisation), ADR-0007, `src/ui/pricing/`, `src/ui/account/`.

All web facts were checked on 2026-11-10 unless another date is given.

**Not repeated here:** link-outs, commissions, the US web-checkout link, the IAP-must-exist rule
(3.1.1, 3.1.3(b)) and Stripe Managed Payments eligibility are in
`docs/research/payments-outside-app-stores.md` (2026-10-27). Age-rating tiers, the ads rules
and the first look at 5.3.4 are in `docs/research/plus-tiers-and-ads.md` (2026-11-09). This
note builds on both.

## Bottom line for Tableside

**Plus as decided (sync, then new games and variants, later analysis tools) is a subscription
both stores name as appropriate. The risk lies in how it ships, not in what it is.** Four
things decide review:

1. **Plus has to deliver something real on day one.** Apple's 3.1.2(a) examples include "cloud
   support", "new game levels" and "apps that offer consistent, substantive updates". Google
   asks for "sustained or recurring value … throughout the life of the subscription". Sync
   alone meets both. A Plus whose only promise is future games does not: the reviewer must be
   able to see and use what is sold (2.1(b)), and the promise must be true (2.3.1(a), 3.1.2's
   "bait-and-switch", Google's "truthful and accurate"). This confirms `PRODUCT.md`'s rule
   "Plus is not sold until sync exists".
2. **The paywall disclosures are the most common 3.1.2 rejection, and they are fixable.**
   Apple's January 2026 rejection text lists the subscription's title, length, price, and
   working Terms of Use (EULA) and Privacy Policy links in the binary and in the metadata. The
   Pricing screen already covers most of it (see section 6).
3. **Apple's reviewer has to be able to reach sync.** That means review notes, a working
   backend and a way to sign in (2.1(a)). The first subscription also has to ship with a new
   app version.
4. **No gambling rule blocks a paid tier, because Tableside has no real-money wagering.** The
   one live risk is Apple 5.3.4's "illegal gambling aids, including card counters". Read with
   the Nevada statute it echoes, it targets tools used *at a casino game*. So the bet-spread
   and risk-of-ruin tools must be presented as study tools away from the table, never as a
   live or in-casino mode.

Precedents are thin, but they point the same way. Card-counting trainers with auto-renewing
subscriptions are live on both stores today:
- one sells a "Pro Tools" subscription of calculators with a risk-of-ruin planner (Count Dojo);
- one includes cross-device sync in Pro (High Count, Google Play).

The published 3.1.2(a) "not an appropriate use" rejections are all from 2017–2022 and hit
one-time unlocks: watermark removal, a whole productivity app, and one cloud-storage app.

---

## 1. Apple: what 3.1.2 requires

### The text

> **3.1.2(a) Permissible uses:** If you offer an auto-renewable subscription, you must provide
> ongoing value to the customer, and the subscription period must last at least seven days and
> be available across all of the user's devices. While the following list is not exhaustive,
> examples of appropriate subscriptions include: new game levels; episodic content; multiplayer
> support; apps that offer consistent, substantive updates; access to large collections of, or
> continually updated, media content; software as a service ("SAAS"); and cloud support.

([Guidelines 3.1.2(a)](https://developer.apple.com/app-store/review/guidelines/), retrieved
2026-11-10.) The same example list, "cloud support" included, was already there in December 2017
([archived copy, 2017-12-01](https://web.archive.org/web/20171201230523/https://developer.apple.com/app-store/review/guidelines/)).

Other parts of 3.1.2 that apply, from the same page:

- "Subscriptions may be offered alongside à la carte offerings". Lifetime as a non-consumable
  next to Plus is fine.
- "Subscriptions must work on all of the user's devices where the app is available." Apple's
  subscriptions page adds "Ensure that the subscriptions are available across all device types
  that your app supports"
  ([Apple](https://developer.apple.com/app-store/subscriptions/)). `app.json` sets
  `supportsTablet: true`, so Plus must work on iPad too. A 2026 forum thread blamed a 3.1.2
  rejection on the subscription failing to load on iPad during review (search summary only;
  not opened).
- "should allow a user to get what they've paid for without performing additional tasks, such
  as posting on social media, uploading contacts, checking in to the app a certain number of
  times". Signing in for sync is not one of these: 5.1.1(v) lets an app require a login for
  "significant account-based features", and sync is one.
- "If you are changing your existing app to a subscription-based business model, you should not
  take away the primary functionality existing users have already paid for." Model A keeps
  everything that is free today free, so it complies.
- "Apps that attempt to scam users will be removed … trick users into purchasing a subscription
  under false pretenses or engage in bait-and-switch".
- **3.1.2(b):** users "should not be able to inadvertently subscribe to multiple variations of
  the same thing". Monthly and yearly Plus belong in one subscription group, which Apple's
  page calls "the best practice for most apps"
  ([Apple](https://developer.apple.com/app-store/subscriptions/)).
- **3.1.2(c):** "Before asking a customer to subscribe, you should clearly describe what the
  user will get for the price. How many issues per month? How much cloud storage? What kind of
  access to your service?" It also points to Schedule 2 of the Paid Applications Agreement.

### What each part of Plus needs under 3.1.2(a)

| Plus component | Apple's own wording that covers it | What review will look for |
| --- | --- | --- |
| Cloud sync of progress, Sessions and strategies | "cloud support"; "software as a service" | It works across the reviewer's devices, including iPad, with the account the notes describe. It is a running service, so it gives ongoing value as long as it runs |
| New games and variants as they launch | "new game levels"; "apps that offer consistent, substantive updates" | They actually ship. Apple's subscriptions page: "plan to regularly update your app with feature enhancements or expanded content" ([Apple](https://developer.apple.com/app-store/subscriptions/)). On its own, before any new game exists, this is a promise and not yet value |
| Bet-spread / risk-of-ruin calculator | Not named. "SAAS" at most | A calculator is a one-time-value feature on its own, like the watermark case below. Bundled with sync it is fine. Sold alone as a subscription it is the weakest of the three. Gambling angle: section 5 |

### Disclosures on the purchase screen (3.1.2(c), Schedule 2)

Apple's subscriptions page says the sign-up screen "must" include
([Apple](https://developer.apple.com/app-store/subscriptions/)):

- "Subscription name and duration, and the content or services provided during the subscription
  period";
- "Full renewal price, shown clearly and prominently, and localized in available currencies";
- "A way for current subscribers to sign in or restore purchases";
- "your app and App Store metadata must include links to your Terms of Use and Privacy Policy".

It adds that "the amount that will be billed must be the most prominent pricing element", with
any monthly breakdown "in a subordinate position and size". For a free trial, "clearly indicate
how long the free trial lasts and the price billed once the free trial is over".

Current rejection text (January 2026, as posted in
[thread 812192](https://developer.apple.com/forums/thread/812192)) lists what the binary
must include: the title, length and price ("and price per unit if appropriate") of the
subscription, and "Functional links to the privacy policy and Terms of Use (EULA)". The
metadata must also have "the privacy policy in the Privacy Policy field … and the Terms of Use
(EULA) in the App Description or EULA field". An older rejection (November 2017,
[thread 92459](https://developer.apple.com/forums/thread/92459)) adds that the information
"must be displayed clearly and conspicuously during the purchase flow without requiring
additional action from the user, such as opening a link".

### Review mechanics that bite a sync subscription

- **2.1(a):** "include demo account info (and turn on your back-end service!) if your app
  includes a login." **2.1(b):** in-app purchases must be "complete, up-to-date, visible to the
  reviewer and functional"
  ([Guidelines](https://developer.apple.com/app-store/review/guidelines/)). Sign-in is Google or
  Apple only (ADR-0007), so there is no username and password to hand over. The review notes
  must say how to sign in (for example with Sign in with Apple) and how to see sync: open the
  web app or a second device, play a Session, and watch it appear.
- **2.3.1(a):** "All new features, functionality, and product changes must be described with
  specificity in the Notes for Review … (generic descriptions will be rejected) and accessible
  for review." **2.3.12:** significant changes must be listed in "What's New". Each new game
  that joins Plus needs both.
- **The first subscription needs an app version:** "The first … auto-renewable subscription …
  of each type must be submitted with a new app version", and "a new subscription … must be
  submitted together with its subscription group"
  ([App Store Connect Help](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase)).
  The first Lifetime (non-consumable) is a separate type, so it also needs an app version.
  Submit both with the same version.
- **Shipping new games over the air.** 2.5.2 says apps may not "download, install, or execute
  code which introduces or changes features or functionality of the app". DPLA 3.3.1(B) allows
  downloaded interpreted code only if it "does not change the primary purpose of the
  Application by providing features or functionality that are inconsistent with the intended
  and advertised purpose"
  ([DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)).
  A new casino game in a casino trainer is arguably within the app's purpose. Even so, the new
  games are the very thing Plus sells, and 2.3.1(a) wants them "accessible for review". Ship
  them in reviewed binaries. `docs/releasing.md` says EAS Update is not configured, so nothing
  needs to change today.
- **2.3.1(a) also forbids "promoting content or services that it does not actually offer".**
  "New games and variants as they launch" is forward-looking. Keep it worded as future
  breadth, next to something concrete that exists now (sync). Don't show unreleased games in
  screenshots or as locked tiles. Under 2.3.2, store screenshots of Plus content must
  "clearly indicate" that it needs a purchase.
- **2.3.10:** "don't include names, icons, or imagery of other mobile platforms … in your app or
  metadata" ([Guidelines](https://developer.apple.com/app-store/review/guidelines/)). See
  section 6: some Plus copy names Android.

## 2. Google Play: Subscriptions and Payments policies

### Subscriptions policy

From [Subscriptions](https://support.google.com/googleplay/android-developer/answer/9900533?hl=en)
(retrieved 2026-11-10):

- **Value:** "Subscriptions must provide sustained or recurring value to users throughout the
  life of the subscription, and may not be used to offer what are effectively one-time
  benefits". Products without it "must use an in-app product instead". It also bars
  "minimizing recurring value after the user has purchased the subscription". So if new games
  stop shipping, Plus must still carry sync.
- **Transparency:** disclose "the cost of your subscription, the frequency of your billing
  cycle, the automatic renewal terms, whether a subscription is required to use the app". Any
  benefits "must be truthful and accurate".
- **Examples of violations that apply to a Pricing screen:**
  - "Annual subscriptions that most prominently display their pricing in terms of monthly
    cost."
  - "In-app promotions that do not clearly demonstrate that a user can access content without a
    subscription (when available)."
  - A missing or hard-to-see dismiss button.
  - "Subscription pricing and terms that are incompletely localized."
  - SKU names like "Free Trial" for a recurring charge.
- **Trials:** say "how and when a free trial will convert to a paid subscription, how much the
  paid subscription will cost, and how a user can cancel".
- **Management:** the app must "clearly disclose how a user can manage or cancel their
  subscription". The account settings must have "A link to Google Play's Subscription Center"
  or "direct access to your cancellation process".
- **Coming change:** the [October 2026 preview](https://support.google.com/googleplay/android-developer/answer/18204939?hl=en)
  adds only disclosure rules for eligibility-based discounts such as student plans, effective
  2027-01-27. It doesn't apply unless Tableside adds such a plan.

### Payments policy

[Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en) names
both halves of Plus as needing Play Billing in the app:

- "app functionality or content (such as an ad-free version of an app or new features not
  available in the free version)";
- "cloud software and services (such as data storage services …)".

It also requires: "If your product description on Google Play refers to in-app features that may
require a specific or additional charge, your app listing must clearly notify users that payment
is required to access those features." The US exceptions to Play Billing are in the
payments-outside note.

Google has no published counterpart to Apple's list of example subscriptions, and no public
rejection forum comparable to Apple's. No Google Play precedent of a rejection was found.

## 3. Precedents

### Rejections under 3.1.2(a) ("not an appropriate use")

All were posted by developers on Apple's forums. None comes from App Review's own pages.

| Thread | Year | What was sold | Rejection text | Outcome |
| --- | --- | --- | --- | --- |
| [718080](https://developer.apple.com/forums/thread/718080) | 2022 | A subscription whose only benefit was removing a watermark | "Auto-renewing subscriptions are only appropriate for services that provide dynamic, ongoing value to the user over an extended period of time." | An Apple staff reply (App Store Commerce Engineer, accepted answer) pointed to 3.1.2(a) and to a "1-time purchase of a non-consumable" as the usual model |
| [93807](https://developer.apple.com/forums/thread/93807) | 2017 | A "secure cloud storage app" with unlimited storage | "not an appropriate use of the service … change your in-app purchase product to a non-renewing subscription" | The appeal was rejected within about 10 minutes. No resolution in the thread. This happened even though "cloud support" was already in 3.1.2(a) that month |
| [125622](https://developer.apple.com/forums/thread/125622) | 2019 | A macOS productivity app: 7-day trial, then full access | Same wording | The iOS twin, with the same subscription data, was approved. The developer launched with non-renewing subscriptions after two weeks |

**Reading:** the clear case (718080) is a one-time unlock, and Apple's answer was "make it a
non-consumable". The other two show that review was inconsistent, even for cloud services, in
2017–2019. Nothing more recent of this kind was found. Since 2023 the 3.1.2 rejections found
are all about disclosures, under 3.1.2(c). Inference: a Plus that leads with a working sync
service sits on the safe side of 718080. If a reviewer still says "not appropriate", the
remedy that thread suggests (one-time pricing) already exists as Lifetime. Appealing with the
"cloud support" wording is the other route.

### Disclosure rejections under 3.1.2(c)

- [812192](https://developer.apple.com/forums/thread/812192) (January 2026): EULA and Privacy
  links missing from the binary. Its "Resources" list is quoted in section 1.
- [92459](https://developer.apple.com/forums/thread/92459) (November 2017): the disclosures
  must be visible in the purchase flow, not behind a link or only in the StoreKit sheet.

### Approved trainers with a subscription (live listings, retrieved 2026-11-10)

A live listing shows that review passed, not why it passed.

| App, store | Model | What the subscription sells | Rating |
| --- | --- | --- | --- |
| [Count Dojo](https://apps.apple.com/us/app/count-dojo-bj-card-counting/id6760961014), App Store (Nobile Tech, Education) | Premium monthly \$9.99, annual \$59.99, lifetime \$119.99. **"Pro Tools"**: monthly \$4.99, annual \$24.99, lifetime \$49.99 | Pro Tools is "Edge Calculator, Bankroll Planner, Casino Database, Results Tracker". The Bankroll Planner can "solve for required bankroll or risk of ruin, custom bet ramps" | 13+, "Infrequent Simulated Gambling" |
| [Blackjack Guru](https://apps.apple.com/us/app/-/id6717589612), App Store (Growth Garage LLC, Casino) | Weekly \$6.99–9.99, annual \$89.99, lifetime \$119.99 | "unlocks unlimited training, the full card counting course, and Smart Training Mode". Course modules shipped through 2026, the latest about 2026-11-06 | 18+, "Frequent Simulated Gambling", contains ads |
| [Blackjack Wiz](https://apps.apple.com/us/app/blackjack-wiz-card-counting/id6788486381), App Store (Cedar Theory LLC, Card) | Weekly, monthly and yearly, \$8.99–89.99 | The listing doesn't say what is gated | 18+, "Frequent Simulated Gambling" |
| [High Count](https://play.google.com/store/apps/details?id=pro.highcount.app&hl=en_US), Google Play (Digital Darwin LLC; 10+ downloads) | "subscription or one-time lifetime purchase" | "unlocks the Count and Strategy drills, Play mode, every rule set, your full history, and cross-device sync". It describes itself as "a card counting trainer, not a casino. No real-money gambling" | Teen, "Simulated Gambling" |

Three points:
- Count Dojo is the closest analogue to Tableside's analysis tools: a calculator-only
  auto-renewing tier with risk of ruin is on the App Store.
- High Count is the closest analogue to sync-in-Plus, but it is tiny.
- None of these has a sync-*only* subscription, and no store page states its review history.

## 4. The launch bundle: must include, must avoid

**Must include (to pass review):**

1. **Working sync in the build that first sells Plus**, testable by the reviewer on iPhone and
   iPad and against the web. Add review notes on how to sign in and how to see a Session sync
   (2.1(a), 2.1(b), 2.3.1(a)).
2. **A paywall that shows each plan's name, length and full renewal price** as the most
   prominent price, localized to the store's currency. Any monthly breakdown is subordinate.
   Trial length and post-trial price. Restore purchases. Working Terms of Use and Privacy links
   in the binary, plus the Privacy URL and EULA in App Store Connect (Apple subscriptions page,
   3.1.2(c); Google Subscriptions).
3. **A clear way to dismiss the paywall and keep using the app free** (Google Subscriptions
   examples). On Android, a link to Play's Subscription Center in account settings. On iOS,
   Apple's page recommends showing the subscription status and a manage control
   (`showManageSubscriptions`).
4. **Monthly and yearly Plus in one subscription group** (3.1.2(b)). Submit the first
   subscription, its group and Lifetime with a new app version
   ([App Store Connect Help](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase)).
5. **Plus copy that says what sync covers** ("your progress, Sessions and strategies on every
   device"), in the spirit of "How much cloud storage?" (3.1.2(c)). New breadth should be
   described as future and stated plainly.

**Must avoid:**

1. **Selling Plus on future content alone**, or showing unreleased games as Plus content in
   screenshots or locked tiles (2.3.1(a), the 3.1.2 bait-and-switch clause, Google's
   "truthful and accurate").
2. **A subscription made of one-time unlocks**, for example a calculator-only Plus with no
   service behind it, or anything that "minimizes recurring value" after purchase (thread
   718080; Google Subscriptions). If analysis tools are ever sold alone, they fit Lifetime or a
   non-consumable better, although Count Dojo shows that Apple has let a tool-only
   subscription through.
3. **Moving anything that is free today into Plus** (3.1.2(a), changing business model).
   `PRODUCT.md` already forbids this.
4. **Naming Android or Google Play in the iOS app's sales copy** (2.3.10). See section 6.
5. **Delivering new Plus games by over-the-air code** instead of a reviewed binary (2.5.2,
   DPLA 3.3.1(B), 2.3.1(a)).
6. **Selling chips or anything a player can bet, or prizes of any value.** That would turn
   simulated gambling into the real-money category on both stores (section 5).

## 5. Gambling and simulated-gambling rules that touch a paid tier

### Apple

- **5.3** (Gaming, Gambling, and Lotteries) asks apps to be "prepared for extra time during the
  review process". Its rules:
  - 5.3.1 and 5.3.2 cover sweepstakes and contests. They would apply if Plus ever gave prizes
    for leaderboards.
  - 5.3.3: in-app purchase may not buy "credit or currency for use in conjunction with real
    money gaming". It doesn't apply, because Tableside's chips are play money and not for sale.
  - 5.3.4: real-money gaming must be licensed, geo-restricted and "free on the App Store". It
    doesn't apply. Then: **"Illegal gambling aids, including card counters, are not permitted
    on the App Store."**
  ([Guidelines 5.3](https://developer.apple.com/app-store/review/guidelines/).)
- **What "card counters" likely means.** Nevada makes it unlawful to use or possess any
  "software or hardware … programmed to obtain an advantage at playing any game in a licensed
  gaming establishment". That includes a device that "keeps track of cards played", "analyzes
  the probability of the occurrence of an event relating to the game" or "analyzes the strategy
  for playing or betting to be used in the game"
  ([NRS 465.075](https://www.leg.state.nv.us/NRS/NRS-465.html), retrieved 2026-11-10;
  primary law, not a store source). A bet-spread or risk-of-ruin calculator *is* betting
  analysis. What makes it an illegal aid is use **at the game**.
  - Inference: present the tools as preparation and study ("plan your bankroll before the
    trip").
  - Never build a discreet in-casino count entry, camera card recognition, a watch or widget
    counter, or "use it at the table" copy.
  - Say this in the review notes when the tools ship. Live trainers that teach counting, and
    Count Dojo's risk-of-ruin planner, show that App Review accepts trainers.
- **5.1.1(ix):** apps that "provide services in highly regulated fields (such as … gambling …)
  should be submitted by a legal entity". This is about real gambling services. Not applicable,
  but submitting as an organization removes the question.
- **Age rating, with region detail beyond the earlier note**
  ([age-rating values](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/)):
  - "Simulated Gambling: Betting or wagering without using real money or in-game currency that
    can be exchanged for real money." It is distinct from "Gambling".
  - Globally, infrequent simulated gambling sits in the 13+ tier and frequent in the 18+ tier.
  - **Australia:** "Infrequent simulated gambling" alone gives **R 18+**.
  - **Brazil:** frequent simulated gambling gives A18.
  - **Korea:** "Apps and games with Frequent or Intense simulated gambling content are only
    available on the App Store in Korea if you provide a Rating Classification Number (RCN)."
  - A paid tier doesn't change the rating. More casino content in Plus (new games, the later
    live tables) pushes toward "Frequent". Expect 18+ and plan for Korea's RCN or leave Korea
    out.

### Google Play

- **Real-Money Gambling, Games, and Contests**
  ([policy](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)):
  licensed gambling apps "must NOT … use Google Play In-app Billing". Every other app may not
  let users "wager, stake, or participate using real money (including in-app items purchased
  with money) to obtain a prize of real world monetary value".
  - A Plus subscription that unlocks games played with free play chips is outside this policy.
  - Selling chips that can win anything of value is inside it.
  - Calls to action like "BET!" for real-money play are violations.
- **Age-Restricted Content and Functionality**
  ([policy](https://support.google.com/googleplay/android-developer/answer/16302250?hl=en)):
  its blocking requirement covers apps that "facilitate Real Money Gambling, Games, and
  Contests", not simulated gambling.
- **Families**
  ([policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)):
  "Apps that include real or simulated gambling" is a listed violation for child-directed apps.
  Tableside's Play Console target audience must exclude children.
- **Content rating:** Google's help page puts simulated gambling at ESRB Teen, PEGI 12 and
  IARC 12+
  ([content ratings](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en)).
  **PEGI's own definitions say otherwise:** "Simulation of gambling, like games of chance that
  are normally carried out in casinos or gambling halls, will be classified with a PEGI 18"
  ([PEGI](https://pegi.info/what-do-the-labels-mean), retrieved 2026-11-10). Expect Teen in
  the Americas and 18 in PEGI regions. The IARC questionnaire decides.
- **Gambling ads:** an app that shows them "must not provide simulated gambling content". This
  is moot, because Tableside has no ads in any tier.

## 6. Repo observations against these rules

From `src/ui/pricing/` and `src/ui/account/` at `5cf9a81`. Nothing was changed.

**Already compliant:**
- Yearly Plus shows "\$49 / year" as the large price, with "\$4.08 a month, billed yearly" in
  small text (`pricing.ts` `planView`). This meets Apple's "most prominent" rule and Google's
  monthly-breakdown example.
- The order summary states the renewal ("renewing until you cancel") and the trial's end and
  price.
- There are "Restore purchases", "Keep playing free", Terms of Use and Privacy Policy links, a
  "Manage in Google Play" account action, and a "Can I win real money here?" FAQ that answers
  no.

**To fix or check before the first store submission:**
1. **2.3.10 and other platforms.** The selling copy says "Your plan follows your account across
   web, iPhone and Android" (`PricingScreen.tsx` `COPY.lead`). Sign-in says "on the web, iPhone
   and Android" (`SignInScreen.tsx:35`). Both render in the iOS app. Suggest per-platform
   wording on iOS, such as "on the web and your other devices". `planCopy.ts`'s "Billed by
   Google Play", shown on iOS to a player who bought on Android, is informational and
   lower-risk, but it is worth the same treatment. The Landing badge "Web, iOS & Android" is
   web-only (`app/index.tsx`), so it is fine.
2. **Plus bullets don't name analysis tools.** Today's Plus is sync plus new games, which
   matches what will exist at launch. Add tools to the copy only once they ship.
3. **Lifetime says "Includes future games as they launch".** It is truthful if they do, and it
   is a forward-looking claim under 2.3.1(a). Keep "Pay once and keep it on every device" as
   the first and concrete bullet, as it is now.
4. **The native card button says "Start free trial with card" and "Pay"** (`COPY`). In the apps
   the StoreKit or Play sheet takes payment (`usePurchase.ts`), so check that the native build
   doesn't say "with card". It was not verified here.

## Open questions

- **Will Apple accept a sync-led subscription without pushback?** "Cloud support" is listed, but
  thread 93807 shows a cloud service rejected in 2017. Recent evidence is only that
  sync-in-Pro trainers are live. Mitigation: clear review notes, and Lifetime as the fallback.
- **The reviewer's sign-in path with Google/Apple-only accounts.** Does App Review accept "use
  Sign in with Apple" with no demo credentials? 2.1(a) mentions a demo mode needing "prior
  approval". Ask App Review, or add a review-only account path.
- **Korea RCN** if the rating comes out "Frequent simulated gambling": obtain one, or exclude
  Korea at launch.
- **Whether 5.3.4 would ever be applied to a risk-of-ruin tool.** No rejection of a trainer was
  found. Count Dojo's live planner is the best evidence it won't be.

## Pages not reached

- Apple Developer Forums search (`/forums/search?q=…`) returns a bot-verification page, so
  threads were found through web search, and only the cited ones were opened. A 2026 thread
  on a 3.1.2 rejection tied to iPad loading was seen only as a search summary.
- Google Play listings render without details through the fetch tool. High Count was read
  from the raw HTML. Count Dojo and Blackjack Wiz on Play were not checked.
- The Paid Applications Agreement's Schedule 2 is not public. Its 3.8(b) list is known only
  from rejection text quoted in forum threads.
