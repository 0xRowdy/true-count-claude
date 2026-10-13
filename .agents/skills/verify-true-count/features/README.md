# Feature map — verify-true-count

One file per user-facing feature: what it is, how a user reaches it, how to drive it, what proves it works.
A proof that only drives one convenient entry point is incomplete when the map lists others.

| Feature                                           | Route                   | Flow                          | Status              |
| ------------------------------------------------- | ----------------------- | ----------------------------- | ------------------- |
| [Play](play.md)                                   | `/play`                 | `flows/play-round.mjs`        | scripted, PASS      |
| [True Count drill](true-count-drill.md)           | `/drills/true-count`    | `flows/true-count-drill.mjs`  | scripted, PASS      |
| [Design system](design-system.md)                 | `/design-system`        | `flows/design-system.mjs`     | scripted, PASS      |
| [Strategy library](strategies.md)                 | `/strategies`           | `flows/strategies.mjs`        | scripted, PASS      |
| [Blackjack strategy builder](strategies.md)       | `/strategies/blackjack` | `flows/strategies.mjs`        | scripted, PASS      |
| [Craps strategy builder](strategy-craps.md)       | `/strategies/craps`     | `flows/strategy-craps.mjs`    | scripted, PASS      |
| [Roulette strategy builder](strategy-roulette.md) | `/strategies/roulette`  | `flows/strategy-roulette.mjs` | scripted, PASS      |
| [Rules / your table](rules.md)                    | `/rules`                | —                             | mapped, no flow yet |
| [Shoe Integrity](shoe-integrity.md)               | `/shoe-integrity`       | —                             | mapped, no flow yet |
| Other drills: Basic strategy, Counting, Deviation | `/drills/*`             | —                             | not mapped yet      |
| Session / Statistics                              | `/session`              | —                             | not mapped yet      |

Cross-cutting: `flows/no-hydration-errors.mjs` loads every top-level route above (plus `/` and `/drills`) and fails on a React hydration mismatch (#32). Add a new top-level route to its `ROUTES`.
