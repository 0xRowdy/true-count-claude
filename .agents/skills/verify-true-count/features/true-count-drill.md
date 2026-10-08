# True Count drill

Convert a running count + shoe state into a true count; graded under a rounding rule, recorded into a drill Session.

## Sub-features
- Question panel (Running Count · <system>, decks remaining) · Count entry pad (keyboard or keys, ".5", Clear, Answer)
- Grading (Correct, Streak, rounding/sign error tallies) · Next question · Drill settings (system, rounding) · End session

## How to get to it (user POV)
Home → Drills → "True Count drill" link, or `/drills/true-count`.

## Driving it with Playwright
`flows/true-count-drill.mjs`: hub link → Question 1 → type "2" on the keyboard → button "Answer: 2" → graded, Next question → Question 2.

## Gotchas
- The drills hub stays mounted underneath: filter to visible, anchor on `^Question 1$` and `^Running Count · `.
- The Answer button's accessible name includes the typed value ("Answer: 2") — use it to prove entry reached the pad.
