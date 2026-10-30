# ADR-0007: Optional Accounts on Convex, one Plan across Stripe and the app stores

**Status:** Accepted · 2026-10-25 · Supersedes the "no backend" part of ADR-0003 · Context
on store rules corrected and tax added 2026-10-27

## Context

ADR-0003 shipped the MVP with no backend, deferring cloud state "until there is a feature
that genuinely requires it". Paid plans are that feature. Plus and Lifetime (the pricing page,
`src/ui/pricing/pricing.ts`) are sold "on web, iOS and Android, one account": a purchase has
to follow the player to every device, and that means someone other than the device has to
remember it.

Three forces shape how:

1. **The business wants web checkout.** Players should mostly sign up and pay on the website
   (Stripe), not through the App Store, which takes up to 30%.
2. **The stores still require their own billing.** Apple guideline 3.1.3(b) lets an app honour
   web purchases only if the same items are also sold as in-app purchases, in every region.
   So the apps sell through StoreKit and Play Billing, and the web sells through Stripe.
   Linking out of the iOS app to web checkout is free only on the US storefront: 0% until the
   district court approves a fee, while the Supreme Court reviews the contempt ruling and
   Apple asks for 5–15%. The EU, Japan and Brazil allow it for a 10–15% Apple commission. In
   the US, Google allows link-outs and in-app alternative billing without Play Billing, but
   charges its service fee on them too (10% on subscriptions). This ADR does not depend on any
   of it. A US-only "Buy on the web" link to the existing Checkout is the one addition worth
   making, and it needs no change to the design below. Sources and per-region detail:
   `docs/research/payments-outside-app-stores.md` (2026-10-27).
3. **The incumbent's worst review is exactly this.** ADR-0003 records a paying CQ Nexus
   customer whose purchase on one platform never appeared on another. Cross-platform
   entitlements are the thing we must not get wrong.

And two invariants stand: nothing core sits behind an account (invariant 8), and there is no
second paywall on training depth (invariant 1).

## Decision

**Accounts are optional and exist to hold a Plan.** Sign-in is Google or Apple only (both are
required: Apple guideline 4.8 asks for Sign in with Apple wherever Google sign-in is offered).
No screen requires an Account; practice, progress and settings stay local exactly as ADR-0003
describes. A build without a backend (CI, any build without `EXPO_PUBLIC_CONVEX_URL`) shows
"Accounts aren't available in this build" and behaves as before.

**Convex is the backend**, with two components:

- **Better Auth** (`@convex-dev/better-auth`) for users, sessions and linked Google/Apple
  identities. Chosen over Convex Auth, which has no native Sign in with Apple (identity
  token) path, an open Apple `form_post` bug, and no account-deletion API. Better Auth gives
  native Apple on iOS, a redirect flow for Google everywhere and Apple on Android and web,
  automatic linking of the same verified email, and in-app deletion (guideline 5.1.1(v)).
- **Stripe** (`@convex-dev/stripe`) for web checkout, the customer portal and webhook
  signature checks.

**One Plan, resolved in one place.** Every store writes `entitlements` rows in one shape
(`convex/schema.ts`): Stripe through its webhooks, the App Store and Google Play through
RevenueCat's webhook. `resolvePlan` (`convex/lib/plan.ts`, pure and unit-tested) turns an
Account's rows into its Plan: Lifetime beats Plus, a failing renewal keeps access while the
store retries, and a second store still billing is reported so the player can cancel it.
Every client reads the Plan from the `account.me` query, so web, iOS and Android cannot
disagree, and a purchase anywhere updates every open screen.

**Each handler re-reads the store, never the webhook payload.** A Stripe event re-fetches the
subscription; a RevenueCat event re-fetches the subscriber and replaces the Account's store
rows. Late, duplicate and out-of-order events therefore leave the right answer behind.

**RevenueCat only for the app stores.** Its app user id is always the Account id, so store
purchases belong to the Account and restore anywhere. Considered and rejected: RevenueCat Web
Billing as the single hub. It would unify the SDK, but web subscriptions would live in
RevenueCat's billing engine rather than Stripe's (harder to leave), and the web would load its
checkout SDK. Stripe Checkout keeps web billing ours, with no client SDK at all. Two later
findings point the same way: RevenueCat's SDK runs on the web only with RevenueCat Billing,
and RevenueCat Billing can't use Stripe Managed Payments or sell to customers in India.

## Consequences

**Good**

- ADR-0003's worst failure (purchase on one platform invisible on another) is answered by a
  single read model rather than by syncing state between stores.
- Training stays offline and account-free (invariants 8 and 1 hold); CI keeps testing a
  build with no backend, so nothing can quietly start requiring one.
- Plan logic is pure and tested in plain Node, like the engine.
- Account deletion cancels a web subscription and removes every Entitlement in the same
  transaction as the user (a Better Auth trigger).

**Bad / accepted risks**

- There is now something to operate: a Convex deployment, Stripe and RevenueCat webhooks,
  OAuth clients, and an Apple client secret that expires every six months
  (`docs/accounts-and-billing.md`).
- Better Auth is pinned to 1.6 by the Convex component. On React Native, 1.6 can leave
  `useSession` stale after sign-in (better-auth#10545); `refreshSession` works around it.
- A player offline with an expired session appears signed out. Nothing gates on the Plan yet;
  when the first Plus feature does, it should honour a locally cached Plan until its
  `expiresAt`, so going offline never takes Plus away (the ADR-0003 failure in another form).
- A store subscription survives account deletion: Apple and Google bill it, not us. The
  account page tells the player to cancel it in the store first, as Apple asks.
- The web bundle grows about 11% (the Convex client and the Better Auth client). A Metro
  alias (`metro.config.js`) keeps Better Auth's server cookie module, with zod and jose,
  out of it; without it the growth was 35%.
- Two trials are possible, one on the web and one in a store. Accepted for now.
- Web sales make us the seller of record for sales tax and VAT: Stripe, unlike the stores, is
  not a merchant of record. Not yet decided between Stripe Tax (we register and file) and
  Stripe Managed Payments (Stripe is the merchant of record, +3.5%; it excludes betting and
  gambling, so Stripe must confirm a strategy trainer qualifies).
