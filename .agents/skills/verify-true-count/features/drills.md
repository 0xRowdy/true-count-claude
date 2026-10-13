# Drills (Trainer)

The "Trainer" nav item: the hub of four drills, each grading every answer and explaining it while
the cards or numbers are still on screen. Every drill is included; none is sold separately.

## Sub-features

- Hub (`/drills`): four drill cards, links named "<Drill name> drill" — "Basic Strategy drill",
  "Counting drill", "True Count drill", "Deviations drill" · the table line with "Change your table"
- Every drill: page head (Report a bug, All drills) · Recording panel (Recording badge, Statistics,
  End session) · felt card area · Stat Cards for the run (Correct/Accuracy, Streak) · Setup
  (counting-system radios, speed/rounding) · Undo last answer
- Explanation: the verdict as the dealer's Coach Note (`role="note"`, name "Coach note: <verdict>",
  good-call or mistake variant), then the drill's why — Basic Strategy and Deviations: Every legal
  action (EV ladder), The chart cell, The count, What would have to change; Counting: The count,
  Since your last check (tag trail), By rank; True Count: The division, Every rounding of it

## How to get to it (user POV)

App header → Trainer, or `/drills` → a drill card.

## Driving it with Playwright

`flows/drills.mjs`: hub lists four drills, Trainer is `aria-current=page` → each drill: answer one
question (Basic Strategy: Deal → No insurance/Stand/Hit; Counting: Deal one card ×2 → type → Check;
True Count: type → Answer; Deviations: first legal action) → a Coach Note and the drill's own
"why" heading appear. `flows/true-count-drill.mjs` covers the True Count drill in more depth.

## Gotchas

- The hub stays mounted underneath a drill: filter to visible.
- A Basic Strategy deal can be a natural that settles with no decision; deal the next hand.
- Felt labels ("RUNNING COUNT · HI-LO") are uppercased by CSS; match the source text ("Running Count · ").
