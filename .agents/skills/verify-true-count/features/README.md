# Feature map — verify-true-count

One file per user-facing feature: what it is, how a user reaches it, how to drive it, what proves it works.
A proof that only drives one convenient entry point is incomplete when the map lists others.

| Feature                                              | Route                  | Flow                                                | Status         |
| ---------------------------------------------------- | ---------------------- | --------------------------------------------------- | -------------- |
| [Landing page](landing.md)                           | `/`                    | `flows/landing.mjs`                                 | scripted, PASS |
| [Onboarding](onboarding.md)                          | `/onboarding`          | `flows/onboarding.mjs`                              | scripted, PASS |
| [Pricing](pricing.md)                                | `/pricing`             | `flows/pricing.mjs`                                 | scripted, PASS |
| [Lobby](lobby.md)                                    | `/lobby`               | `flows/lobby.mjs`                                   | scripted, PASS |
| [Progress & Mastery](progress.md)                    | `/progress`            | `flows/progress.mjs`                                | scripted, PASS |
| [Baccarat table](game-baccarat.md)                   | `/games/baccarat`      | `flows/game-baccarat.mjs`                           | scripted, PASS |
| [Play](play.md) (Tableside blackjack table, coach)   | `/play`                | `flows/play-round.mjs`, `flows/blackjack-coach.mjs` | scripted, PASS |
| [Live tables](live-tables.md)                        | `/live`, `/live/craps` | `flows/live-craps.mjs`                              | scripted, PASS |
| [Drills (Trainer): hub + all four drills](drills.md) | `/drills`, `/drills/*` | `flows/drills.mjs`                                  | scripted, PASS |
| [True Count drill](true-count-drill.md)              | `/drills/true-count`   | `flows/true-count-drill.mjs`                        | scripted, PASS |
| [Rules / your table](rules.md)                       | `/rules`               | `flows/rules-integrity.mjs`                         | scripted, PASS |
| [Shoe Integrity](shoe-integrity.md)                  | `/shoe-integrity`      | `flows/rules-integrity.mjs`                         | scripted, PASS |
| [Session / Statistics](session.md)                   | `/session`             | `flows/rules-integrity.mjs`                         | scripted, PASS |
| [Design system](design-system.md)                    | `/design-system`       | `flows/design-system.mjs`                           | scripted, PASS |

Cross-cutting: `flows/no-hydration-errors.mjs` loads every top-level route above (plus every drill) and fails on a React hydration mismatch (#32). Add a new top-level route to its `ROUTES`.
