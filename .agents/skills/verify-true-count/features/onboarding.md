# Onboarding

Three steps at `/onboarding` (design frame `aLrYu` shows step 2): **1 skill** ("I'm brand new" / "I've played a few times" / "I play regularly"), **2 goal and games** (Have fun / Learn before a trip / Master strategy, plus game chips), **3 trip date and name** (both optional). Every answer is written to the local player profile (`updateProfile`, key `tableside/profile/v1`) as it is made.

## Sub-features

- Progress "Step n of 3" (a `progressbar`), Back / Continue (Finish on step 3), "Change" on the previous-answer chip
- "Your starting point" panel follows the answers live: title by goal, three lessons by skill/goal/games, coach line by coach level, trip countdown ("Trip on Nov 14 · 34 days away", pace in minutes a day), the name in the eyebrow
- "How often the coach speaks up" segmented control (radio group)
- Trip date: presets (In 2 weeks / a month / 3 months / No date yet) or typed YYYY-MM-DD, validated (an impossible date shows an error and is not saved)
- "Skip — just let me play" and Finish mark the player onboarded and go to `/lobby`
- Today's date is read after mount (`localIsoDate`), so the prerendered page has no clock

## How to get to it (user POV)

"Play free now — no signup" on the landing page (new players), or `/onboarding` directly.

## Driving it with Playwright

`flows/onboarding.mjs`: step 1 radio → Continue → step 2 shows the skill chip, goal radios change the panel title, Craps checkbox adds the Craps lesson, "Every decision" changes the coach line → Back keeps step 1's answer → step 3 rejects 2030-02-30, accepts 2030-11-14 (countdown), name "Sam" (eyebrow) → Finish → `/lobby` → localStorage holds every answer and `onboarded: true` → reload `/onboarding` shows the same answers → landing CTA now points at `/lobby`.

## Gotchas

- `/lobby` belongs to another PR; until it merges, Finish lands on the unmatched-route page (the flow only checks the URL).
