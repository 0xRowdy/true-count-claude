# ADR-0005: Explanation-first pedagogy over visual fidelity

**Status:** Accepted · 2026-09-14

## Context

There is a fork in the road for a casino trainer, and the incumbent took the other branch.

CQ Nexus competes on **casino authenticity**: CEG-approved dealer order of operations, a
photorealistic 3D felt, correct hole-card peek procedure, penny-accurate electronic-table
payouts. That moat is real and it is backed by a physical dealer school with thousands of
graduates and casino partnerships. We cannot out-authenticate them and should not try.

The category's own reviews point at an entirely different unmet need. **"It doesn't actually
teach" is the largest product complaint at 22% of low-star reviews.** In the users' words:

> *"The app rarely explains why a choice is wrong, only states that it's wrong."*
> *"They tell you if your move is right or wrong, but they don't tell you why. So all it's
> doing is teaching you to memorize the card combinations, not actually think through the game."*
> *"You literally have to pay just to be told whether you're right or wrong. Bro, just watch
> a YouTube video."*

Nobody has left a review asking for a prettier felt.

## Decision

We compete on **explanation quality**, not visual fidelity. The interface is clean, fast,
legible, and 2D. Engineering effort that a competitor would spend on rendering goes into the
EV engine and the Explanation surface.

Concretely, every graded Decision can show:

- the expected value of *each* legal action for this exact hand, rule set, and count
- the governing basic-strategy chart cell, and the chart around it
- how the current true count shifted that decision, and the index number that would flip it
- what would have to change for the other answer to be correct

Feedback appears **while the cards are still on screen** (invariant 3), because a competitor
review identified post-sweep grading as the specific thing that made a drill useless.

## Consequences

**Good**

- Attacks the largest unmet need in the category head-on, and does so in the one dimension
  where the incumbent's Unity investment gives them no advantage whatsoever.
- A 2D interface is dramatically cheaper to build, which is what makes the EV engine
  affordable inside a one-week MVP.
- Fast, light, responsive, and accessible on every screen size — against a competitor that
  letterboxes to 16:9 and takes 30 seconds to paint.
- Explanations are generated from the engine, so they cannot drift out of sync with the
  verdicts (ADR-0002).

**Bad / accepted risks**

- We will lose any head-to-head comparison judged on looks alone. Accepted deliberately.
- Real-time EV for every legal action is the performance-critical path. If it proves too slow
  we memoize; see ADR-0002.
- "Clean and legible" is not a licence to ship something ugly. The bar is a tool that feels
  precise and pleasant, not a spreadsheet.
