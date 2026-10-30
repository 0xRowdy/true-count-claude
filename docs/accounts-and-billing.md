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
4. Set:
   ```sh
   npx convex env set APPLE_SERVICE_ID=com.truecount.web
   npx convex env set APPLE_BUNDLE_ID=com.truecount.app
   npx convex env set "APPLE_CLIENT_SECRET=$(node scripts/apple-client-secret.mjs \
     --team <TEAM_ID> --key-id <KEY_ID> --client-id com.truecount.web --key AuthKey_<KEY_ID>.p8)"
   ```

**The client secret expires after at most six months.** The script prints the date. When it
lapses, Apple sign-in on the web and Android fails (native iOS keeps working: it sends an
identity token instead). Put the renewal in a calendar.

iOS uses the system Apple sheet (`expo-apple-authentication`), which needs a development or
store build: in Expo Go the token is issued to Expo Go's bundle id and is refused.

## Stripe (web)

1. Products (test mode first):
   - **Tableside Plus**: two recurring prices, $5.99 / month and $49 / year. No trial on the
     price: Checkout adds the 7-day trial to a player's first subscription only.
   - **Tableside Lifetime**: one-time price $119.
2. Settings → Billing → **Customer portal**: allow canceling, switching between the monthly
   and yearly price, and updating payment methods. "Manage billing" on the account page opens it.
3. Developers → Webhooks → endpoint `<site>/stripe/webhook` with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `charge.refunded`, `customer.created`, `customer.updated`, `customer.deleted`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.created`, `invoice.finalized`, `invoice.updated`,
   `invoice.paid`, `invoice.payment_failed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`.
4. Set `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (`whsec_…` from the endpoint),
   `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_LIFETIME` (`price_…`).

Try it: sign in on `pnpm web`, Pricing → Start free trial → card `4242 4242 4242 4242`. Stripe
returns to `/account?checkout=success`, which shows "Confirming…" until the webhook lands and
then the Plan. Apple Pay and Google Pay appear in Checkout on their own where available.

## App Store and Google Play (RevenueCat)

1. **App Store Connect**: auto-renewable subscriptions Plus monthly and Plus yearly in one
   group, each with a 7-day free-trial introductory offer, and a non-consumable Lifetime.
   **Play Console**: the same as subscriptions (with a free-trial offer) and a one-time product.
2. **RevenueCat** project with an App Store app and a Play Store app (store credentials as
   RevenueCat's guides describe). Entitlement **`plus`** with all three products attached.
   Default offering with packages **`$rc_monthly`**, **`$rc_annual`**, **`$rc_lifetime`**: the
   app buys from the current offering by those slots.
3. Integrations → Webhooks: URL `<site>/revenuecat/webhook`, Authorization header value a long
   random string. Set the same string as `REVENUECAT_WEBHOOK_AUTH`.
4. API keys: a **secret v1** key as `REVENUECAT_SECRET_KEY` (the backend re-reads each
   subscriber with it). The public **Apple** and **Google** SDK keys go to the app as
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (EAS environment
   variables for builds; `.env.local` for local runs).

Purchases need a development build: `npx expo install expo-dev-client`, then
`eas build --profile development`. Expo Go runs RevenueCat's preview mode, with no real
purchases. In the apps, a signed-out player is sent to sign in before buying, so every purchase
belongs to an Account; "Restore purchases" is on Pricing and the account page.

Store rules this follows: the apps sell through the store (Apple 3.1.1 and 3.1.3(b): web
purchases count in the app only if the same items are sold in-app). They do not link to web
checkout. That is free only on the US App Store storefront (under terms still in court) and
costs a 10–15% Apple commission in the EU, Japan and Brazil; see ADR-0007.

## Account deletion

Account → Delete account (Apple 5.1.1(v)). It removes the user, their sign-in links and
Entitlements in one transaction, and cancels any web subscription immediately. A store
subscription keeps billing until the player cancels it in the store; the page tells them so
first. Better Auth asks for a sign-in from the last 24 hours before deleting.

Not yet done: revoking the player's Apple tokens through Apple's REST API on deletion, which
Apple asks of apps with Sign in with Apple.

## Production

1. `npx convex deploy` creates/updates the production deployment
   (`dazzling-meadowlark-730`). Set every variable above on it, with production values:
   `SITE_URL` is the public web origin, Stripe live keys and live webhook, a second Google
   redirect URI and Apple return URL for the production `.convex.site` host, and RevenueCat's
   webhook pointed at it.
2. Build the web app and the EAS builds with that deployment's `EXPO_PUBLIC_CONVEX_URL` and
   `EXPO_PUBLIC_CONVEX_SITE_URL`. A build without them has no Accounts, by design (CI).

## Local development

- `npx convex dev` watches `convex/` and pushes to the dev deployment.
- `pnpm web` serves on `localhost:8081`, the dev `SITE_URL`, which Better Auth trusts. The
  verify harness (`verify.sh launch`) builds without a backend, as CI does.
- Expo Go on a device signs in through `exp://…`: add it with
  `npx convex env set TRUSTED_ORIGINS=exp://`.
