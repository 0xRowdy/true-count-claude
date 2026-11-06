# Pricing

`/pricing` (design frame `VcZwn`), inside the App Shell with no active nav item. Purchases go through `usePurchase` (ADR-0007, `account.md`); in a build with no backend, which is what CI and `launch` build, **no payment is ever processed**.

## Sub-features

- With no backend (this harness and CI), an upfront preview disclosure: all current games, drills, local history and builders are free; purchases and trials are unavailable. Plus and Lifetime describe future plan previews.
- Monthly / Yearly toggle (radio group): Plus is $5.99 / month or $49 / year ($4.08 a month, "Save 32%"); Lifetime $199.99 once; Free $0 (current plan)
- Plan cards are a radio group; the chosen plan drives "Your order": name, total, hypothetical trial timeline and "Due today" example. Every timeline step identifies its hypothetical nature and states that no trial, reminder, purchase or subscription occurs. Example dates use today after mount.
- Plus plan cards call the trial an example ("example 7-day trial"); no copy offers an "N-day free trial"
- "Pay (unavailable)" and "Free trial (unavailable)" ("Pay with card (unavailable)" for Lifetime) say what they do before they are pressed, then show an in-place notice: "Purchases aren't available in this build"; Free shows "Keep playing free" instead
- With a backend (ADR-0007), the same page sells: "Pay", "Start free trial with card" ("Pay with card" for Lifetime), sign-in first, then Stripe Checkout (web) or the store (apps), with a real trial timeline. An Account that has had Plus from any store gets no second web trial, so it sees the price due today. In the apps there is one store button ("Start free trial", "Subscribe", "Buy Lifetime"), with the store's prices and currency, and a trial only where the store says the player gets one. A plan the Account already has shows "Manage your plan"
- "Terms of Use" and "Privacy Policy" links under the order (Apple 3.1.2) open `/terms` and `/privacy`
- `?plan=plus|lifetime&billing=monthly|yearly` chooses the plan after mount (back from sign-in or a canceled Checkout)
- FAQ accordion (buttons with `aria-expanded`)
- The "You're paying for training tools, not chips" box

## How to get to it (user POV)

"Pricing" / "See full pricing" on the landing page.

## Driving it with Playwright

`flows/pricing.mjs`: yearly prices and order by default, timeline shows real dates → Monthly swaps prices, order and renewal text → Yearly back → Lifetime: $199.99 total and due today → Pay shows the `status` notice → choosing a plan clears it → card button shows it again → FAQ 2 opens and closes → Terms of Use and Privacy Policy open their pages.

The flow also asserts the preview disclosure and free training scope before inspecting prices. A price/timeline preview must not imply a purchasable entitlement.
