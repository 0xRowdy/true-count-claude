# Pricing

`/pricing` (design frame `VcZwn`), inside the App Shell with no active nav item. **No payment is ever processed.**

## Sub-features

- Upfront preview disclosure: all current games, drills, local history and builders are free; purchases and trials are unavailable. Plus and Lifetime describe future plan previews.
- Monthly / Yearly toggle (radio group): Plus is $5.99 / month or $49 / year ($4.08 a month, "Save 32%"); Lifetime $119 once; Free $0 (current plan)
- Plan cards are a radio group; the chosen plan drives "Your order": name, total, hypothetical trial timeline and "Due today" example. Every timeline step identifies its hypothetical nature and states that no trial, reminder, purchase or subscription occurs. Example dates use today after mount.
- Pay and "Start free trial with card" (Pay with card for Lifetime) show an in-place notice: "Purchases aren't available in this build"; Free shows "Keep playing free" instead
- FAQ accordion (buttons with `aria-expanded`)
- The "You're paying for training tools, not chips" box

## How to get to it (user POV)

"Pricing" / "See full pricing" on the landing page.

## Driving it with Playwright

`flows/pricing.mjs`: yearly prices and order by default, timeline shows real dates → Monthly swaps prices, order and renewal text → Yearly back → Lifetime: $119.00 total and due today → Pay shows the `status` notice → choosing a plan clears it → card button shows it again → FAQ 2 opens and closes.

The flow also asserts the preview disclosure and free training scope before inspecting prices. A price/timeline preview must not imply a purchasable entitlement.
