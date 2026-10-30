# Payments outside the app stores: RevenueCat Web, Stripe, and what each store allows

Gathered 2026-10-27. Primary sources: RevenueCat docs (`revenuecat.com/docs/llms-full.txt`, the
Web section, App-to-web purchases), Stripe docs (`docs.stripe.com` mobile digital goods,
Managed Payments) and `stripe.com/pricing`, Apple App Review Guidelines and Apple Developer
support pages (EU, Japan, Brazil, South Korea payment options), Google Play Console Help
(US programs, billing choice program, service fees) and the Android Developers Blog, the Ninth
Circuit opinion in *Epic v. Apple* (No. 25-2935) and the Supreme Court docket (No. 25-1311),
JFTC and European Commission pages. Secondary press is used only where noted as **[secondary]**.

All facts were checked on 2026-10-27 unless another date is given.

## Bottom line for Tableside

**Keep the current shape: Stripe-direct on the web, StoreKit and Play Billing through
RevenueCat in the apps, one Plan in Convex. Add one thing: a US-only "Buy on the web" link in
the iOS app that opens Stripe Checkout in Safari.** Don't adopt RevenueCat Web Billing, and
don't move web billing into RevenueCat's Stripe integration.

Why:

- **The only real saving is on iOS in the US.** There, a link-out costs 0% to Apple today
  ([Ninth Circuit, holding (d)](https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf)),
  against 15% for IAP under the Small Business Program
  ([Apple](https://developer.apple.com/app-store/small-business-program/)). Everywhere else
  the saving is small or negative once you add Stripe's fees and the tax you'd then owe
  yourself:
  - EU, Japan and Brazil charge 10–15% on link-outs.
  - Google charges 10% on subscriptions however they're paid.
- **Stripe-direct already does what this needs.** It needs no RevenueCat web SDK, and Convex
  already knows the Account. The app can ask Convex for a Checkout Session for the signed-in
  Account and open its URL in Safari. A universal link brings the player back to the app, and
  the existing Stripe webhook updates `account.me`. There's no Redemption Link and no app user
  id handoff, because the Account is the identity.
- **RevenueCat Web only pays off with its no-code pieces**, such as hosted Web Purchase Links,
  paywall buttons and Apple's token reporting outside the US. Tableside doesn't need those in
  the US. Moving web billing to RevenueCat Billing would also move the subscription lifecycle
  off Stripe Billing, which is the lock-in ADR-0007 rejected.

Per region:

| Region | iOS | Android | Web |
| --- | --- | --- | --- |
| US | IAP, plus a "Buy on the web" link to Stripe Checkout in Safari (0% today) | Play Billing (10% + 5%). An external link saves at most ~1–2 points after Stripe's fees; not worth it yet | Stripe Checkout |
| EU/EEA | IAP only (a link-out costs 10–15% and makes you the VAT seller) | Play Billing | Stripe Checkout with Stripe Tax, or Managed Payments (see Limitations) |
| Japan, Brazil | IAP only (a link-out costs 10–15% and has strict IAP-parity UI rules) | Play Billing | Stripe Checkout |
| Korea, rest of world | IAP only (no link-out program that fits) | Play Billing | Stripe Checkout |

Two things that matter wherever it sells:

- **Tax.** Plain Stripe is not a merchant of record, so web sales make Tableside the seller of
  record for sales tax and VAT. Stripe now offers a merchant-of-record mode, **Managed
  Payments**, for 3.5% on top of processing
  ([Stripe pricing](https://stripe.com/pricing)). It works with Checkout, so it fits the
  current integration. Whether a blackjack *trainer* passes Stripe's eligibility review is
  open (see Open questions).
- **IAP stays.** Every store and region still requires IAP alongside any web option, including
  the US ([Apple 3.1.1, 3.1.3(b)](https://developer.apple.com/app-store/review/guidelines/);
  [RevenueCat FAQ](https://www.revenuecat.com/docs/web/faqs)). Google's US programs are the
  exception: they allow "in lieu of" Play Billing
  ([Google](https://support.google.com/googleplay/android-developer/answer/16497028?hl=en)).

Net revenue on US iOS, before income tax:

| Sale | IAP (SBP 15%) | Link-out, Stripe (2.9% + 30¢; +0.7% Billing on subscriptions) | Link-out, Stripe + Managed Payments (+3.5%) |
| --- | --- | --- | --- |
| Plus yearly $49 | $41.65 | ~$46.94 | ~$45.22 |
| Lifetime $119 | $101.15 | ~$115.25 | ~$111.08 |

Fees are from [stripe.com/pricing](https://stripe.com/pricing). The table excludes sales tax,
international card (+1.5%) and currency conversion (+1%) surcharges, and any future Apple fee
(see US below).

---

## 1. Limitations

### The four ways to sell on the web

| | RevenueCat Billing ("Web Billing") | RevenueCat + your Stripe Billing | Web Purchase Links / Web Paywalls / Redemption Links | Stripe-direct (today) |
| --- | --- | --- | --- | --- |
| What it is | RevenueCat's own billing engine. Stripe is only the payment gateway, and RevenueCat runs renewals "instead of Stripe Billing" ([RC](https://www.revenuecat.com/docs/web/overview)) | Your Stripe catalog and subscriptions. RevenueCat launches Stripe Checkout or imports your purchases ([RC](https://www.revenuecat.com/docs/web/integrations/stripe)) | RevenueCat-hosted checkout pages and paywalls (`pay.rev.cat`) on top of either engine above ([RC](https://www.revenuecat.com/docs/web/web-billing/web-purchase-links)) | Your Checkout Sessions, your webhooks, entitlements in Convex |
| Product types | Auto-renewing subscriptions, consumables, non-consumables ([RC](https://www.revenuecat.com/docs/web/web-billing/product-setup)) | Flat-rate recurring and one-off prices. "Only per-unit and recurring quantity plans"; one price per product on import; once imported, a price's type can't change ([RC](https://www.revenuecat.com/docs/web/integrations/stripe)) | Whatever the engine supports | Anything Stripe supports |
| One-time (Lifetime) | Yes, as non-consumable | Yes, but only if bought through a Checkout Session: "Other ways of selling one-time purchases outside of Checkout Sessions can't be identified" ([RC](https://www.revenuecat.com/docs/web/integrations/stripe/track-external-purchases)) | Yes | Yes |
| Trials, coupons | Configured in RevenueCat; trial-eligibility rules per project | Supported in RevenueCat flows | Same as the engine | Stripe-native |
| Currencies | One price per currency. Existing prices can't be edited, so a price change means a new product ([RC](https://www.revenuecat.com/docs/web/web-billing/multi-currency-support)) | Configured in Stripe | Same as the engine | Stripe Adaptive Pricing or per-currency prices |
| Countries | **India not supported**, and no B2B ([RC](https://www.revenuecat.com/docs/web/overview)) | Stripe's countries | Same as the engine | Stripe's countries |
| Tax | You are the merchant of record. Optional Stripe Tax or Avalara; B2C only; no reversal transactions for chargebacks ([RC](https://www.revenuecat.com/docs/web/web-billing/tax)). **No Managed Payments** ([RC](https://www.revenuecat.com/docs/web/integrations/stripe/stripe-managed-payments)) | You by default. **Stripe is merchant of record if you enable Managed Payments**; ineligible products silently fall back to "non-managed payments mode", where you are merchant again ([RC](https://www.revenuecat.com/docs/web/integrations/stripe/stripe-managed-payments)) | Same as the engine | Stripe Tax, or Managed Payments with Checkout or Payment Links ([Stripe](https://docs.stripe.com/payments/managed-payments)) |
| Payment methods | Cards, Apple Pay, Google Pay ([RC](https://www.revenuecat.com/docs/web/web-billing/payment-methods)) | No PayPal, UPI, bank debits or redirect methods such as Cash App, iDEAL or Klarna ([RC](https://www.revenuecat.com/docs/web/integrations/stripe)) | Same as the engine | All Stripe methods |
| Customer portal | RevenueCat Customer Portal | Stripe Customer Portal, surfaced as `managementUrl` | Same as the engine | Stripe Customer Portal (already wired) |
| Refunds | From the RevenueCat dashboard. Refunding the latest payment removes access immediately ([RC](https://www.revenuecat.com/docs/web/web-billing/refunding-payments)) | In Stripe. Cancellations take "up to two hours" to reach RevenueCat. A billing-issue event fires only once ([RC](https://www.revenuecat.com/docs/web/integrations/stripe)) | Same as the engine | In Stripe; your webhook sees it straight away |
| Emails | RevenueCat sends them | Stripe sends them, except the RevenueCat redemption email | Same as the engine | Stripe |
| Identity | App user id, or anonymous with Redemption Links | The app user id must match the SDK's: "the Purchases SDK must be configured with the same App User ID" ([RC](https://www.revenuecat.com/docs/web/integrations/stripe/track-external-purchases)). Users can't restore Stripe purchases themselves (same page) | Redemption Links: one-time deep link that **expires in 60 minutes**; fails on desktop or without the app installed; uses a RevenueCat custom URL scheme ([RC](https://www.revenuecat.com/docs/web/redemption-links)) | The Convex Account; nothing to hand off |
| RevenueCat fee | Included. RevenueCat is free up to $2,500 MTR, then 1% of tracked revenue ([RC pricing](https://www.revenuecat.com/pricing)). "No additional RevenueCat fees" for web ([RC](https://www.revenuecat.com/docs/web/overview)) | Same 1%, plus Stripe Billing 0.7% | Same as the engine | No RevenueCat fee on web revenue (inference: RevenueCat never tracks it) |
| Stripe fee (US) | 2.9% + 30¢, plus optional Stripe Tax ([RC](https://www.revenuecat.com/docs/web/overview)) | 2.9% + 30¢ + Billing 0.7% (or $620/mo) + optional Tax | Same as the engine | Same as RevenueCat + Stripe Billing; Billing 0.7% applies to subscriptions only ([Stripe](https://stripe.com/pricing)) |
| Leaving later | Subscriptions live in RevenueCat's engine, and RevenueCat documents no Stripe export for them (none found in the docs) | Subscriptions are already Stripe objects | n/a | Already yours |

### SDKs (Expo / React Native)

- **`react-native-purchases`** needs an Expo development build, not Expo Go
  ([RC Expo](https://www.revenuecat.com/docs/getting-started/installation/expo)). It runs on
  React Native Web, but **"Web purchases require RevenueCat Billing setup"**, and
  `getProducts`, `purchaseProduct` and `restorePurchases` don't work on web
  ([RC React Native](https://www.revenuecat.com/docs/getting-started/installation/reactnative)).
  Using the same SDK on Tableside's web build would therefore force RevenueCat Billing.
- **`@revenuecat/purchases-js`** is the browser SDK. To use Apple's token reporting outside the
  US, pass `externalPurchaseTokenId` to it, which needs version 1.56.0 or later
  ([RC](https://www.revenuecat.com/docs/tools/paywalls/creating-paywalls/web-purchase-button)).
- **App-to-web from a RevenueCat paywall** needs `react-native-purchases` 8.10.1+ for iOS and
  9.6.1+ for Android. Apple's eligibility check, notice and token (`useExternalPurchaseCustomLinks`)
  need 10.13.0+, and that API is **experimental**. RevenueCat skips the notice and token on the
  US storefront ([RC](https://www.revenuecat.com/docs/tools/paywalls/creating-paywalls/web-purchase-button)).
  This all assumes RevenueCat Paywalls. Tableside draws its own Pricing screen.

### Things that would bite Tableside specifically

1. **Stripe isn't the seller of record unless you use Managed Payments.** With plain Stripe or
   Stripe Tax, Tableside registers, collects and files sales tax and VAT itself
   ([Stripe](https://docs.stripe.com/payments/managed-payments)). Managed Payments costs 3.5%
   extra and covers more than 80 countries.
   - It only works with Checkout and Payment Links, and subscriptions can't be created any
     other way.
   - Purchases show on statements as `LINK.COM* …`, and customers manage orders on link.com.
   - If you don't answer Link support within 48 hours, Stripe may refund without asking
     ([Stripe](https://docs.stripe.com/payments/managed-payments/how-it-works)).
   - Eligible categories include "Online courses and training" and "Video games", but
     **"does not include games that are considered betting, gambling"**
     ([Stripe](https://docs.stripe.com/payments/managed-payments/eligibility)). A
     casino-strategy trainer needs Stripe to confirm it qualifies.
2. **IAP can't go away.** Apple's 3.1.1 still requires IAP to unlock features, and the US
   exemption only covers "buttons, external links, or other calls to action"
   ([Apple](https://developer.apple.com/app-store/review/guidelines/)). 3.1.3(b) honours web
   purchases only "provided those items are also available as in-app purchases".
3. **Paid web trials and store trials are separate.** RevenueCat's trial-eligibility rules
   only cover RevenueCat Billing. Stripe-direct keeps today's position: two trials are
   possible (ADR-0007 already accepts this).
4. **Two hours of staleness** if RevenueCat tracks Stripe: cancellations can lag that long
   ([RC](https://www.revenuecat.com/docs/web/integrations/stripe/track-external-purchases)).
   Convex's own webhook doesn't have this lag.
5. **The App Store's US prominence rule.** Apple may stop your link from being more prominent
   than its IAP buttons, in font, size, number or placement
   ([Ninth Circuit](https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf)).

---

## 2. US vs global

### Comparison table

"Link-out" means sending the user to a web purchase. "Alt billing" means a non-store payment
processor inside the app, such as Stripe PaymentSheet. Std / reduced: Apple's reduced rate
covers Small Business Program members and subscriptions after their first year. Google's lower
tier covers the first $1M of annual earnings and all auto-renewing subscriptions.

| Region | Store | Link-out allowed? | Alt billing in-app? | Commission | Conditions | In effect since | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **US** | Apple | **Yes**, no entitlement needed | **No** (3.1.1 still requires IAP) | **0% on link-outs** until the district court approves a fee. IAP is 15% (SBP) or 30% | IAP must stay. Link no more prominent than Apple's IAP buttons. Only a neutral "leaving the app" message is allowed. Dynamic, logged-in links are allowed | Apr 30, 2025 order; affirmed in part Dec 11, 2025 | **In flux**: rate remand plus Supreme Court review (see below) |
| **US** | Google | **Yes**, external content links program (enroll and use the APIs) | **Yes**, US alternative billing program. Play Billing is optional ("in lieu of or alongside") | 10% on subscriptions and the first $1M; 20% on other purchases (15% in the programs). Link-out fees apply to purchases within **24 hours** of the link tap. Play Billing costs the same service fee **plus a 5% billing fee** | Report transactions to Google within 24 hours. Links **may open in a browser or a webview** | Compliance Oct 29, 2025; programs Dec 9, 2025; new fees Jun 30, 2026; **fees payable from Oct 1, 2026** | Tied to the court order. Google "may change or end" it |
| **EU/EEA** | Apple | Yes ("out-of-app offers") | Yes | Link-out: **15% / 10%** on sales within **7 days** of the tap. Alt in-app: **20% / 10%**. IAP: **26% / 15%**. No more Core Technology Fee/Commission or initial acquisition fee | Needs the StoreKit External Purchases or Offers entitlement, iOS 26.2+. Apple's system notice sheet is required. IAP must be shown at the same time and "at least as prominently". Your choice is locked for 12 months. Monthly reporting. You collect and remit VAT | **Oct 1, 2026** (Attachment 14 replaced the Alternative Terms and Link Entitlement addenda) | The Commission is still assessing it. Apple's appeal of the €500M fine is pending |
| **EU/EEA** | Google | Yes (billing choice program, or the External Offers program) | Yes (billing choice, user choice billing, or the alternative-billing-only EEA program) | 10% on subscriptions and the first $1M; 20% new / 25% existing installs on other purchases (in-app alt). Link-out: 10% / 20% within 24 hours. Play Billing adds 5% | Billing choice requires Play Billing to be offered alongside | Jun 30, 2026 | — |
| **UK** | Google | Yes (billing choice) | Yes (billing choice) | Same as EEA | Play Billing alongside | Jun 30, 2026 | — |
| **Japan** | Apple | Yes | Yes | Link-out: **15% / 10%** within 7 days. Alt in-app: **21% / 10%**. IAP: 21% / 10% + 5% processing = 26% / 15% | Japan storefront, iPhone, iOS 26.2+. Strict IAP-parity UI. Before iOS 27.2 you build the disclosure sheet yourself. The page implies the link must open in a browser | MSCA in full effect **Dec 18, 2025**; DPLA acceptance by Mar 17, 2026 | — |
| **Japan** | Google | Yes (billing choice) | Yes (billing choice or UCB) | New fee table, Play Billing adds 5% | Play Billing alongside | Sep 30, 2026 | — |
| **Brazil** | Apple | Yes | Yes | Link-out **15% / 10%** within 7 days. Alt in-app 21% / 10%. IAP 26% / 15% | iOS 26.5+. Users under 18 can't be offered website purchases. Same parity UI rules as Japan | DPLA acceptance by Jul 6, 2026 | — |
| **South Korea** | Apple | No | Yes, via a KR-only binary with no IAP; one listed PSP (KCP, Inicis, Toss, NICE); no web view | **26%** | Separate app, not yet published on the App Store | (no date on the page) | — |
| **South Korea** | Google | — | Yes (UCB) | Standard fee minus 4% until the new fees reach KR on **Dec 31, 2026** | — | UCB APIs since 2023 | New fees due Dec 31, 2026 |
| **Australia** | Google | Yes (billing choice) | Yes | New fee table, +5% for Play Billing | Play Billing alongside | Sep 30, 2026 | — |
| **BR, ID, ZA, IN** | Google | — | UCB (non-games in BR, ID, ZA; all apps in IN) | Standard fee minus 4% until the global rollout | — | — | New fees for the rest of the world by **Sep 30, 2027** |
| **Rest of world** | Apple | **No** ("apps and their metadata may not include buttons, external links…") | No | IAP 15% / 30% | — | — | — |
| **Rest of world** | Google | No (Payments policy) | No | Legacy Play fees until Sep 30, 2027 | — | — | — |
| Any | Apple, reader apps | One account-management link only | No | 0% | **Doesn't apply to Tableside.** It covers apps for "magazines, newspapers, books, audio, music, and video" that give access to content bought elsewhere ([3.1.3(a)](https://developer.apple.com/app-store/review/guidelines/)). Tableside sells features inside the app | — | — |
| NL | Apple, dating apps | — | — | — | Dating apps only. Not relevant | — | — |

Sources for the table:

- **Apple US**:
  [Guidelines 3.1.1(a) and 3.1.3](https://developer.apple.com/app-store/review/guidelines/);
  [Ninth Circuit opinion, 2025-12-11](https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf);
  [SBP](https://developer.apple.com/app-store/small-business-program/).
- **Google US**:
  [US policy timeline](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en);
  [external content links](https://support.google.com/googleplay/android-developer/answer/16470497?hl=en);
  [US alternative billing](https://support.google.com/googleplay/android-developer/answer/16497028?hl=en);
  [service fees](https://support.google.com/googleplay/android-developer/answer/16954621?hl=en).
- **Apple EU**:
  [EU payment options](https://developer.apple.com/support/payment-options-on-the-app-store-in-the-eu/);
  [EC decision, 2025-04-23](https://digital-strategy.ec.europa.eu/en/news/commission-finds-apple-and-meta-breach-digital-markets-act);
  [EC DMA report COM(2026) 247, 2026-05-21](https://digital-markets-act.ec.europa.eu/document/download/2f31180c-b9da-49d4-ae36-3a4109cc59a5_en?filename=CELEX_52026DC0247_EN_TXT.pdf);
  [DMA review SWD(2026) 123, 2026-04-28](https://digital-markets-act.ec.europa.eu/document/download/788ff6d9-f0bf-47d2-80a8-611d5ee5bc51_en?amp=&filename=DMA+Review_Commission+Staff+Working+Document_SWD_2026_123_1_EN.pdf).
- **Google EEA, UK, JP, AU**:
  [billing choice program](https://support.google.com/googleplay/android-developer/answer/17161464?hl=en);
  [Android Developers Blog, 2026-06-24](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html).
- **Apple Japan**:
  [payment options](https://developer.apple.com/support/payment-options-on-the-app-store-in-japan);
  [JFTC](https://www.jftc.go.jp/en/policy_enforcement/digital/index.html).
- **Apple Brazil**:
  [payment options](https://developer.apple.com/support/payment-options-on-the-app-store-in-brazil).
- **Apple Korea**:
  [KR entitlement](https://developer.apple.com/support/storekit-external-entitlement-kr).
  Apple's page cites the amended Telecommunications Business Act; a KCC primary source was not
  checked.
- **Google UCB**:
  [user choice billing](https://support.google.com/googleplay/android-developer/answer/13821247?hl=en).

### US detail and what's still in litigation

**Apple**

- **Dec 11, 2025: the Ninth Circuit affirmed contempt** but reversed the permanent
  zero-commission ban. Apple may charge for "costs that are genuinely and reasonably necessary
  for its coordination of external links", including some IP compensation. It may not charge
  for "security and privacy features". And **"Apple should not be able to charge any commission
  for linked-out purchases until such time as the district court has approved an appropriate
  fee"**
  ([opinion](https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf)).
- **Supreme Court, No. 25-1311**
  ([docket](https://www.supremecourt.gov/docket/docketfiles/html/public/25-1311.html)):
  - Cert granted **Jun 30, 2026**, limited to Question 1 (the "spirit of the injunction"
    contempt issue).
  - Apple's merits brief was filed Sep 14, 2026. **Epic's brief is due Nov 13, 2026.** No
    argument date is set.
  - Justice Kagan **denied** Apple's application to stay the district-court proceedings on
    Aug 13, 2026.
- **District court remand (N.D. Cal. 4:20-cv-05640).** **[secondary]** On about Aug 13, 2026,
  Apple proposed link-out commissions of 15% standard, 10% for programs and subscription
  renewals, and 5% for Small Business Program members
  ([9to5Mac](https://9to5mac.com/2026/08/13/apple-proposes-commissions-of-up-to-15-for-off-app-store-purchases-in-the-us/),
  [TechCrunch](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/)).
  No fee had been approved as of mid-September, and none was found by Oct 27, 2026. **Plan
  for a US link-out fee of 5–15% arriving in 2027.**

**Google**

- Google settled with Epic on **Mar 4, 2026** and asked the court to enter a revised Modified
  Injunction. Google's page doesn't say whether the court has entered it
  ([Google](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)).
- Fees under the US programs became payable from **Oct 1, 2026**.
- On Oct 21, 2026 Google moved the deadline for download-link fee reporting to Feb 1, 2027.

---

## 3. In-app payment vs opening a browser

| Option | Where it's permitted for digital goods | UX | Store fee | Apple Pay / Google Pay |
| --- | --- | --- | --- | --- |
| **StoreKit / Play Billing** (via `react-native-purchases`) | Everywhere | Native sheet, one tap, Restore built in | Apple 15–30% (SBP 15%). Google 10% service + 5% billing in US, EEA, UK, JP, AU; legacy 15% / 30% elsewhere | Store wallet only |
| **Stripe PaymentSheet / `@stripe/stripe-react-native` in the app** | **iOS:** only EU, Japan, Brazil (entitlement, Apple notice sheet, IAP shown alongside) and Korea (KR-only binary, listed PSPs only, so not Stripe). **Not the US.** **Android:** US alternative billing program; EEA, UK, JP, AU via billing choice; UCB markets. Stripe's own docs say: Android "process payments directly in-app"; iOS "redirect customers to an external payment page" ([Stripe](https://docs.stripe.com/mobile/digital-goods)) | Native, no app switch | iOS EU 20% / 10%; JP and BR 21% / 10%. Google 10% / 20% (no 5% billing fee). Plus Stripe's fees | Both natively in PaymentSheet |
| **Checkout in an in-app web view (WKWebView / Android WebView)** | **iOS:** treat it as in-app alternative payment, so EU, JP and BR only. RevenueCat's "Web checkout (in-app)" is "Supported in eligible EU storefronts", is in **private beta**, and its iOS SDK is "Coming soon" ([RC](https://www.revenuecat.com/docs/tools/paywalls/creating-paywalls/web-purchase-button)). Korea forbids web views. **Android US:** purchase links "may open on a browser, in a webview…" ([Google](https://support.google.com/googleplay/android-developer/answer/16470497?hl=en)) | No app switch, but no saved browser autofill or sessions | The in-app (alt billing) rate | Apple Pay works in any WKWebView on iOS 16+ ([WebKit](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/)). Google Pay in Android WebView needs Payment Request turned on, WebView 137+ and Google approval; it's always false in iOS web views ([Google Pay](https://developers.google.com/pay/api/android/guides/recipes/using-android-webview)) |
| **SFSafariViewController / Custom Tabs** (`expo-web-browser` `openBrowserAsync`) | **Ambiguous on iOS.** Apple's US guideline doesn't say. Apple's JP and BR pages describe link-outs as opening "in a web browser". Stripe's guide says "Open Checkout in Safari", and RevenueCat's US mode opens "the device's browser". Safest: don't use it for purchases on iOS. Android US: the program allows a browser | Feels in-app; shares Safari cookies | Link-out rate | Apple Pay yes; Google Pay as in Chrome (inference) |
| **External browser** (`Linking.openURL` to Safari or Chrome) | **iOS:** US (0%), EU, JP, BR (entitlement plus `ExternalPurchaseCustomLink` notice). **Android:** US external content links; EEA, UK, JP, AU billing choice | App switch, then a universal link back. Stripe redirects to `success_url` after the webhook is acknowledged, or after 10 seconds ([Stripe](https://docs.stripe.com/mobile/digital-goods/checkout)) | Apple US 0% today. EU, JP, BR 15% / 10% within 7 days. Google 10% / 20% within 24 hours | Apple Pay is on by default in Checkout ([Stripe](https://docs.stripe.com/mobile/digital-goods/checkout)); Google Pay in Chrome |
| **Web only, no in-app mention** | Everywhere (3.1.3(b): honour items bought elsewhere if they're also sold as IAP) | The player has to find the website | 0% | Both, in Checkout |

**Apple's disclosure sheets**

- **US:** no sheet is required. Apple may show only "a neutral message apprising users that
  they are going to a third-party site"
  ([Ninth Circuit](https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf)).
- **EU:** system sheet via `ExternalPurchaseCustomLink.showNotice(type:)`, after
  `canMakePayments` and `isEligible`. Users can switch off later reminders
  ([Apple EU](https://developer.apple.com/support/payment-options-on-the-app-store-in-the-eu/)).
- **JP and BR:** you build the sheet from Apple's design kit until iOS 27.2 (in beta) adds
  the system API ([JP](https://developer.apple.com/support/payment-options-on-the-app-store-in-japan),
  [BR](https://developer.apple.com/support/payment-options-on-the-app-store-in-brazil)).
- **KR:** a fixed modal shown before every purchase flow.
- **App Store listing (EU, JP, BR):** the product page gets an "External Purchases" banner and
  notation.

**Getting the purchase back into the app**

| Mechanism | How | Fits Tableside? |
| --- | --- | --- |
| Account sign-in (today) | Purchase is tied to the Convex Account. Webhook writes an `entitlements` row, and `account.me` updates every open client | **Yes.** It needs nothing new |
| Universal link / App Link `success_url` | Return the player to the app. Stripe uses `origin_context: 'mobile_app'` for an app-to-web UI. You need an `apple-app-site-association` file, the Associated Domains entitlement, and a fallback page ([Stripe](https://docs.stripe.com/mobile/digital-goods/checkout); [Expo](https://docs.expo.dev/linking/ios-universal-links/)) | Yes, just for the "return to app" UX |
| RevenueCat Redemption Links | Anonymous web purchase, then a 60-minute deep link that aliases the purchase to the app user ([RC](https://www.revenuecat.com/docs/web/redemption-links)) | No: sign-in is already required before buying |
| Restore | Store purchases only. Stripe purchases can't be restored by the user ([RC](https://www.revenuecat.com/docs/web/integrations/stripe/track-external-purchases)) | Already covered by the Account |

**Detecting the storefront.** Show the US link only when the App Store storefront is `USA`, not
when the device locale or IP says US. Stripe says to "Use StoreKit's Storefront"
([Stripe](https://docs.stripe.com/mobile/digital-goods/checkout)). RevenueCat's paywall mode
does this for you. With a custom Pricing screen, Tableside needs a native read of
`Storefront.current`. Whether `react-native-purchases` exposes it was not verified.

---

## Implications for ADR-0007

1. **Wrong: "Linking out of the apps to web checkout is allowed on US storefronts only."**
   - **EU:** link-outs have been allowed since 2024, now under Attachment 14 at 15% / 10% from
     Oct 1, 2026.
   - **Japan:** since iOS 26.2 (MSCA, Dec 18, 2025).
   - **Brazil:** since iOS 26.5.
   - **US:** the only place where it's free (0%).

   The same claim appears in `docs/accounts-and-billing.md` ("allowed only on US
   storefronts"). Suggested wording: "free only on the US storefront; allowed with Apple
   commission in the EU, Japan and Brazil."
2. **Partly right: "under terms still being litigated (late 2026)".** Correct, but out of
   date. Today it's 0% "until the district court has approved an appropriate fee"; the
   Supreme Court has granted review (No. 25-1311); and Apple has proposed 5–15%
   **[secondary]**.
3. **Out of date: "Google's Payments policy is similar outside its regional programs."** In the
   US, Google now allows link-outs and alternative billing **without** Play Billing. Google
   now also charges its service fee on every payment path: 10% for subscriptions, plus 5% if
   you use Play Billing.
4. **Can change: "this ADR does not depend on it."** It still doesn't have to. But a US iOS
   link-out to the existing Stripe Checkout is now the highest-value, lowest-effort addition,
   and it fits the ADR's design unchanged: the Account is the identity and the webhooks are
   already in place.
5. **Still valid: the reason for rejecting RevenueCat Billing.** RevenueCat Billing runs
   renewals "instead of Stripe Billing" and has no Managed Payments. Two new reasons to add:
   - `react-native-purchases` on web requires RevenueCat Billing.
   - RevenueCat Billing doesn't support customers in India.
6. **Missing: tax.** The ADR doesn't say who the seller of record is for web sales. It should
   choose between Stripe Tax (Tableside registers and files) and Managed Payments (Stripe is
   the merchant of record, +3.5%, and eligibility must be confirmed).
7. **Still true: 3.1.3(b).** IAP must stay available in every region, including the US.

## Open questions / in flux

- **The US Apple link-out fee.** The district court will set one on remand. Apple asked for
  15% / 10% / 5% **[secondary]**; Epic's response clock was stalled as of September
  **[secondary]**. The Supreme Court could also vacate the contempt finding. Epic's brief is
  due Nov 13, 2026, and a decision is likely in 2027.
- **Whether the revised Epic v. Google injunction has been entered.** Google's US programs say
  they "may change or end" if the order changes.
- **EU.** The Commission is still assessing Apple's terms, which changed again Oct 1, 2026.
  Apple's appeal of the April 2025 decision is pending. Rates may move again.
- **Stripe Managed Payments eligibility for a casino-strategy trainer.** Stripe excludes
  "betting, gambling" games. Tableside is neither, but Stripe decides at review. Ask before
  relying on it.
- **iOS in-app browsers for link-outs.** Apple's US guideline is silent on
  SFSafariViewController versus Safari. Use Safari until Apple or App Review says otherwise.
- **Google's lower tier.** Google's rates now split by install date (on or after Jun 30, 2026
  counts as "new") and earnings tier. Tableside stays at 10% only while it earns under $1M a
  year or sells subscriptions.
- **Storefront detection in Expo.** A native module is needed to read `Storefront.current`.
- **RevenueCat's own region summary** ([app-to-web guidelines](https://www.revenuecat.com/app-to-web-purchase-guidelines))
  still lists the pre-Oct-2026 Apple EU fees (Core Technology Fee, 2% acquisition fee) and
  treats user choice billing and External Offers as current. It's out of date; use the store
  pages above instead.
