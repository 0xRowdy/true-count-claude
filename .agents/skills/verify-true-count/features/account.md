# Accounts: sign in and account

`/sign-in` and `/account` (ADR-0007; no design frame yet, built from the design system inside
the App Shell). Optional: nothing else in the app needs an Account (invariant 8).

## Two builds

- **No backend** (CI, and `verify.sh launch`, which builds with `EXPO_NO_DOTENV=1`): both
  pages show "Accounts aren't available in this build", there are no sign-in buttons, the
  header avatar is not a link, the landing page's Sign in opens its no-account notice, and
  Pricing's Pay shows "Purchases aren't available in this build".
- **A backend** (`pnpm web` with `.env.local`, on `localhost:8081`, the dev deployment's
  trusted origin; the harness's random port would be refused by CORS):
  - `/sign-in`: Continue with Apple / Continue with Google (the providers' own artwork, equal
    size); `?next=` (in-app paths only) is where a successful sign-in lands; `?error=` (a
    refused web sign-in) is explained in place.
  - `/account`: signed out, the same two buttons; signed in, the Plan (name, what happens next,
    where it is billed, a warning when two stores bill for Plus), Manage billing (Stripe portal,
    web), Manage in the App Store / Google Play, Restore purchases (apps), Sign out, Delete
    account (two steps; asks for a fresh sign-in after 24 hours). `?checkout=success` shows
    "Confirming your purchase…" until Stripe's webhook lands.
  - Pricing: signed out, Pay goes to `/sign-in?next=/pricing?plan=…&billing=…`; signed in,
    Stripe Checkout (web) or the store (apps); a plan already owned offers "Manage your plan".

## How to get to it (user POV)

Landing → Sign in; the avatar in the App Header; Pricing → Pay while signed out.

## Driving it with Playwright

`flows/account.mjs` detects which build it is in. CI drives the no-backend branch. For the
backend branch:
`node .agents/skills/verify-true-count/scripts/drive.mjs .agents/skills/verify-true-count/flows/account.mjs http://localhost:8081 <evidence-dir>`
with `PLAYWRIGHT_ROOT` set. Without OAuth credentials on the deployment, Google sign-in is
refused by the backend ("Provider not found") and the flow checks that refusal is explained.
A completed sign-in, checkout or deletion needs real provider credentials and is not scripted.
