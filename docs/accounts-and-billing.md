# Accounts and billing: setup

How to bring up sign-in (Google, Apple) and payments (Stripe on the web, App Store and Google
Play through RevenueCat) on a Convex deployment. Why it is built this way: ADR-0007.

```
 web ──Stripe Checkout──► Stripe ──webhook──┐
 iOS ──StoreKit──► App Store ─┐             ▼
 Android ──Play Billing──► Play ─┴► RevenueCat ──webhook──► Convex: entitlements ──► account.me (Plan)
 all ──Google / Apple sign-in──► Better Auth (Convex HTTP, /api/auth/*)            ▲
                                                               every client reads ─┘
```

Everything below is per deployment. The dev deployment is `determined-kookabura-612`
(team `mmgj`, project `truecount`); in URLs, `<site>` means
`https://determined-kookabura-612.convex.site`. Production gets its own values.

## Already done on dev

- Linked: `.env.local` (git-ignored) names the deployment and sets `EXPO_PUBLIC_CONVEX_URL` and
  `EXPO_PUBLIC_CONVEX_SITE_URL`, which the app reads at build time.
- `BETTER_AUTH_SECRET` (random) and `SITE_URL=http://localhost:8081` (`pnpm web`).
- Stripe lives in the **TrueCountCoach sandbox** (`acct_1UY6osBd4pt3HDch`), not its parent
  account of nearly the same name.
- RevenueCat project **True Count** (`projf603c934`; not the separate "Tableside" project)
  with the `plus` entitlement, the webhook ("Convex dev"), `REVENUECAT_SECRET_KEY` and
  `REVENUECAT_WEBHOOK_AUTH`. Its only app is the **Test Store**, with `tableside_plus_monthly`
  (\$5.99), `tableside_plus_yearly` (\$49), both with a 7-day trial for customers who never
  subscribed, and `tableside_lifetime` (\$199.99), in the default offering's `$rc_monthly`,
  `$rc_annual` and `$rc_lifetime`. Its SDK key is in `.env.local` as both
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`;
  `REVENUECAT_ALLOW_TEST_STORE=true` is set. No App Store or Play apps yet.
- Functions and both components deployed. Until the providers below are configured, sign-in
  answers "Provider not found" and checkout answers "Purchases aren't set up on this server
  yet", both in place, with nothing charged.

Set Convex variables with `npx convex env set NAME=value` (the `NAME=value` form; a value
starting with `-` is read as a flag otherwise), or in the dashboard under Settings →
Environment Variables.

## Google sign-in

1. Google Cloud Console → APIs & Services → OAuth consent screen: app name Tableside, scopes
   `email`, `profile`, `openid`.
2. Credentials → Create OAuth client ID → **Web application** (one client serves web, iOS and
   Android: every platform signs in through a browser that returns to Convex).
   - Authorized JavaScript origin: `<site>`
   - Authorized redirect URI: `<site>/api/auth/callback/google`
3. `npx convex env set GOOGLE_CLIENT_ID=… ` and `GOOGLE_CLIENT_SECRET=…`.

## Sign in with Apple

Apple Developer → Certificates, Identifiers & Profiles:

1. **App ID** `com.truecount.app`: enable Sign in with Apple. (`app.json` already sets
   `ios.usesAppleSignIn`, so EAS adds the entitlement.)
2. **Services ID**, e.g. `com.truecount.web`: enable Sign in with Apple, primary App ID
   `com.truecount.app`, domain `determined-kookabura-612.convex.site`, return URL
   `<site>/api/auth/callback/apple`. (Apple refuses localhost; the Convex host works.)
3. **Key** with Sign in with Apple enabled: download `AuthKey_<KEY_ID>.p8` once, keep it out of
   the repo (`*.p8` is git-ignored), and note the Key ID and your Team ID.
4. Set (the `NAME=value` form: the CLI reads a value starting with `-----` as an option):
   ```sh
   npx convex env set APPLE_SERVICE_ID=com.truecount.web
   npx convex env set APPLE_TEAM_ID=<TEAM_ID>
   npx convex env set APPLE_KEY_ID=<KEY_ID>
   npx convex env set "APPLE_PRIVATE_KEY=$(cat AuthKey_<KEY_ID>.p8)"
   ```

The backend signs the client secrets Apple asks for with this key (`convex/apple.ts`), one for
the Services ID (web and Android sign-in) and one for the bundle id (revoking an iOS sign-in),
so nothing expires. Revoking a key in the Apple Developer portal stops both; set the new one.

iOS uses the system Apple sheet (`expo-apple-authentication`), which needs a development or
store build: in Expo Go the token is issued to Expo Go's bundle id and is refused.

## Stripe (web)

1. Products (test mode first):
   - **Tableside Plus**: two recurring prices, $5.99 / month and $49 / year. No trial on the
     price: Checkout adds the 7-day trial to a player's first subscription only.
   - **Tableside Lifetime**: one-time price $199.99.
     **Managed Payments** stays on: Stripe is the merchant of record, handling tax, fraud and
     disputes, for an extra 3.5%. Checkout refuses a session until every product has an eligible
     tax code, so set `txcd_10103000` (SaaS, personal use) on both products (done on dev). Each
     mode has its own products, so production needs this too.
2. Settings → Billing → **Customer portal**: allow canceling, switching between the monthly
   and yearly price, and updating payment methods. Leave quantity changes off: Plus is for one
   player. "Manage billing" on the account page opens it.
3. Workbench → [Webhooks](https://dashboard.stripe.com/webhooks) → Create an event destination
   (or `stripe webhook_endpoints create`): endpoint `<site>/stripe/webhook`, API version
   `2026-08-26.dahlia` (the one the `stripe` package pins), with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `charge.refunded`, `charge.dispute.closed`, `customer.created`, `customer.updated`,
   `customer.deleted`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.created`, `invoice.finalized`, `invoice.updated`,
   `invoice.paid`, `invoice.payment_failed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`. A refund or a lost chargeback (Stripe answers disputes
   under Managed Payments, but they still reach this endpoint) ends a Lifetime purchase.
4. Set `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (`whsec_…`, shown only when
   the endpoint is created),
   `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_LIFETIME` (`price_…`).

Try it: sign in on `pnpm web`, Pricing → Start free trial → card `4242 4242 4242 4242`. Stripe
returns to `/account?checkout=success`, which shows "Confirming…" until the webhook lands and
then the Plan. Apple Pay and Google Pay appear in Checkout on their own where available.

## App Store and Google Play (RevenueCat)

1. **App Store Connect**: auto-renewable subscriptions Plus monthly and Plus yearly in one
   group, each with a 7-day free-trial introductory offer, and a non-consumable Lifetime.
   **Play Console**: the same as subscriptions (with a free-trial offer) and a one-time product.
   The app reads prices, currency and trial eligibility from the store, but says "7-day" itself:
   keep the trials at 7 days.
2. **RevenueCat** project with an App Store app and a Play Store app (store credentials as
   RevenueCat's guides describe). Entitlement **`plus`** with all three products attached.
   Default offering with packages **`$rc_monthly`**, **`$rc_annual`**, **`$rc_lifetime`**: the
   app buys from the current offering by those slots. Leave Project settings → General →
   Restore behavior on the default, **Transfer to new App User ID**: every buyer is signed in,
   and the webhook re-reads both Accounts on a `TRANSFER`.
3. Integrations → Webhooks: URL `<site>/revenuecat/webhook`, Authorization header value a long
   random string. Set the same string as `REVENUECAT_WEBHOOK_AUTH`.
4. API keys: a **secret v1** key as `REVENUECAT_SECRET_KEY` (the backend re-reads each
   subscriber with it). The public **Apple** and **Google** SDK keys go to the app as
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (EAS environment
   variables for builds; `.env.local` for local runs).
5. **Server notifications**, so a refund or expiry reaches the Plan promptly. Without them a
   store refund may show only once the player reopens the app, and `EXPIRATION` can arrive about
   an hour late.
   - Apple: RevenueCat → the iOS app → Apple Server to Server notification settings →
     **Apply in App Store Connect** (sets the Production and Sandbox URLs, version 2). Or copy
     its URL into App Store Connect → App Information → App Store Server Notifications, both
     fields.
   - Google: enable Cloud Pub/Sub in the service account's Google Cloud project; RevenueCat →
     the Play app → **Connect to Google** and copy the topic; Play Console → Monetize with Play →
     Monetization setup → Topic name, notifications for "Subscriptions, voided purchases, and all
     one-time products"; **Send test notification** until RevenueCat shows "Last received". If it
     fails, give `google-play-developer-notifications@system.gserviceaccount.com` Pub/Sub
     Publisher on the topic. New service credentials can take ~36 hours to work.
6. **Legal links**: Pricing links Terms of Use (`/terms`) and the Privacy Policy (`/privacy`),
   which Apple requires for subscriptions. Put `<web origin>/privacy` in App Store Connect → App
   Privacy and in Play Console → App content; leave App Store Connect's license on Apple's
   standard EULA, which `/terms` links.

Purchases need a development or store build (`eas build --profile development`). Expo Go runs
RevenueCat's preview mode, with no real purchases. In the apps, a signed-out player is sent to
sign in before buying, so every purchase belongs to an Account; "Restore purchases" is on
Pricing and the account page. RevenueCat is configured at launch, once sign-in settles (as the
Account, or anonymously when signed out, which never buys), so a purchase a crash interrupted is
finished then.

What Pricing shows in the apps: the store's prices in the player's currency, one button for the
store's sheet, and a free trial only where the store says this player gets one (on iOS an
"unknown" answer shows no trial). On the web, an Account that has had Plus from any store gets
no second trial; a store can still give a web subscriber one, which is the store's call. Nor
does a new Account whose email had a Stripe subscription before, on an Account since deleted.

### Trying it before any store products exist

1. **Promotional grant** (no build): grant a player's Account id `plus` with
   `POST /v1/subscribers/<id>/entitlements/plus/promotional` (or RevenueCat → Customers → Grant
   entitlement). RevenueCat's webhook arrived within 10 seconds on dev, and `account.me` reports
   Plus, "A gift from Tableside", until you call `revoke_promotionals`.
2. **Test Store** (development build; set up on dev, above): RevenueCat → Apps → Test Store
   holds the three products and the offering. Its key goes in `EXPO_PUBLIC_REVENUECAT_IOS_KEY` /
   `_ANDROID_KEY` in `.env.local` and the EAS **development** environment only. The SDK crashes
   on purpose if it finds a Test Store key in a release build, TestFlight and Play testing
   tracks included, so preview and production builds take the real store keys. The backend
   counts Test Store purchases only where `REVENUECAT_ALLOW_TEST_STORE=true`: set it on the dev
   deployment, never production (anyone with a debug build could otherwise give themselves
   Plus).
3. **Sandbox** (after the store products exist): real StoreKit and Play sandbox purchases. The
   iOS `development` profile builds for the simulator only, so this needs a device profile.

Create the store products only after the tiers are settled: App Store product ids can't be
reused, and Apple requires a subscription to give ongoing value, which Plus doesn't do yet.

Store rules this follows: the apps sell through the store (Apple 3.1.1 and 3.1.3(b): web
purchases count in the app only if the same items are sold in-app). They do not link to web
checkout. That is free only on the US App Store storefront (under terms still in court) and
costs a 10–15% Apple commission in the EU, Japan and Brazil; see ADR-0007.

## Account deletion

Account → Delete account (Apple 5.1.1(v)). It removes the user, their sign-in links and
Entitlements in one transaction, and cancels any web subscription immediately. A store
subscription keeps billing until the player cancels it in the store; the page tells them so
first. Better Auth asks for a sign-in from the last 24 hours before deleting.

Deleting also revokes the player's Sign in with Apple through Apple's REST API, as Apple asks
(#62):

- **iOS**: native sign-in keeps no Apple token, so the app shows Apple's sheet once more before
  deleting, and the backend swaps its fresh code for a token and revokes it. Closing the sheet
  keeps the Account.
- **Web and Android**: Better Auth stored the sign-in's token (encrypted with
  `BETTER_AUTH_SECRET`); deleting the sign-in link revokes it, as does unlinking Apple.
- An Account that signed in with Apple only on an iPhone and is deleted on the web has no token
  to revoke there. The page tells the player where to remove it in Settings.

These, and the Stripe cancel, run under the action retrier: 6 tries over about 13 hours. If
every try fails, the log reads "GAVE UP after every retry" and says what to do by hand. Check
after deletion: Settings → your name → Sign-In & Security → Sign in with Apple no longer lists
Tableside.

## Production

1. `npx convex deploy` creates/updates the production deployment
   (`dazzling-meadowlark-730`). Set every variable above on it, with production values:
   `SITE_URL` is the public web origin, Stripe live keys and live webhook, a second Google
   redirect URI for the production `.convex.site` host, that host added to the Apple Services
   ID's domains with its return URL, and RevenueCat's webhook pointed at it.
2. Build the web app and the EAS builds with that deployment's `EXPO_PUBLIC_CONVEX_URL` and
   `EXPO_PUBLIC_CONVEX_SITE_URL`. A build without them has no Accounts, by design (CI), and its
   Landing and Pricing stay a labelled preview. So does an app build with no RevenueCat key.

## Local development

- `npx convex dev` watches `convex/` and pushes to the dev deployment.
- `pnpm web` serves on `localhost:8081`, the dev `SITE_URL`, which Better Auth trusts. The
  verify harness (`verify.sh launch`) builds without a backend, as CI does.
- Expo Go on a device signs in through `exp://…`: add it with
  `npx convex env set TRUSTED_ORIGINS=exp://`.
