# Landing page

The marketing page at `/` (design frame `Do2ZB`): nav, hero with the felt-table vignette built from design-system parts (Card Back, Playing Card, Chip, Coach Note), "How it teaches" 01–04, the five tables, community strategies (seeded example data, labelled as examples), a pricing teaser and the responsible-gaming footer. It replaced the old engine dev harness.

## Sub-features

- "Play free now — no signup" / "Play free": `/onboarding` for a new player, `/lobby` once onboarded (decided after the stored profile loads; prerendered as `/onboarding`)
- Game tiles link to the route map: `/play`, `/games/roulette`, `/games/craps`, `/games/video-poker`, `/games/baccarat`
- Nav: Games / How coaching works / Community strategies scroll to their section; Pricing → `/pricing`
- Sign in: no backend, so it opens an in-place notice ("No account needed: your progress stays on this device"), never a form
- "See the coach in 40s" and the coach note's buttons open `/play` (Show the chart → `/drills`)
- Responsive: 1440 design layout; stacked below 1200; phones (<760) get a 16pt gutter and the coach note moves under the scaled table

## How to get to it (user POV)

Open the app's root URL.

## Driving it with Playwright

`flows/landing.mjs`: hero headline, coach note and the four table cards by role → practice-only badge, footer, "Example strategies" label → tile hrefs → Sign in shows the `status` notice, no password field → no sideways scroll at 390 → the CTA's href is `/onboarding` and clicking it lands on onboarding step 1. `flows/onboarding.mjs` also checks the CTA becomes `/lobby` once onboarded.

## Gotchas

- The page scrolls inside a React Native ScrollView: set a tall viewport for full-page screenshots.
- Children of `Link asChild` must get one flat style object (no `({ pressed }) => …` function); a function style is dropped on web.
