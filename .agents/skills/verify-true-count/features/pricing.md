# Pricing

`/pricing` (design frame `VcZwn`), inside the App Shell with no active nav item. Purchases go through `usePurchase` (ADR-0007, `account.md`); in a build with no backend, which is what CI and `launch` build, **no payment is ever processed**.

## Sub-features

- Monthly / Yearly toggle (radio group): Plus is $5.99 / month or $49 / year ($4.08 a month, "Save 32%"); Lifetime $119 once; Free $0 (current plan)
- Plan cards are a radio group; the chosen plan drives "Your order": name, total, trial timeline (Today → reminder 2 days before → trial ends after 7 days, dates counted from today after mount), "Due today"
- Pay and "Start free trial with card" (Pay with card for Lifetime): with no backend, an in-place notice "Purchases aren't available in this build"; with one, sign-in first, then Stripe Checkout (web) or the store (apps). Free shows "Keep playing free"; a plan the Account already has shows "Manage your plan"
- `?plan=plus|lifetime&billing=monthly|yearly` chooses the plan after mount (back from sign-in or a canceled Checkout)
- FAQ accordion (buttons with `aria-expanded`)
- The "You're paying for training tools, not chips" box

## How to get to it (user POV)

"Pricing" / "See full pricing" on the landing page.

## Driving it with Playwright

`flows/pricing.mjs`: yearly prices and order by default, timeline shows real dates → Monthly swaps prices, order and renewal text → Yearly back → Lifetime: $119.00 total and due today → Pay shows the `status` notice → choosing a plan clears it → card button shows it again → FAQ 2 opens and closes.

## Open product question

"Advanced trainers: counting" in Plus conflicts with CONTEXT.md invariant 1 (no second paywall on training depth). The design's copy is kept; the product owner decides.
