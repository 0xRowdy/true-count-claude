# Feature map — verify-true-count

One file per user-facing feature: what it is, how a user reaches it, how to drive it, what proves it works.
A proof that only drives one convenient entry point is incomplete when the map lists others.

| Feature                                              | Route                   | Flow                                                | Status         |
| ---------------------------------------------------- | ----------------------- | --------------------------------------------------- | -------------- |
| [Landing page](landing.md)                           | `/`                     | `flows/landing.mjs`                                 | scripted, PASS |
| [Onboarding](onboarding.md)                          | `/onboarding`           | `flows/onboarding.mjs`                              | scripted, PASS |
| [Pricing](pricing.md)                                | `/pricing`              | `flows/pricing.mjs`                                 | scripted, PASS |
| [Lobby](lobby.md)                                    | `/lobby`                | `flows/lobby.mjs`                                   | scripted, PASS |
| [Progress & Mastery](progress.md)                    | `/progress`             | `flows/progress.mjs`                                | scripted, PASS |
| [Play](play.md) (Tableside blackjack table, coach)   | `/play`                 | `flows/play-round.mjs`, `flows/blackjack-coach.mjs` | scripted, PASS |
| [Live tables](live-tables.md)                        | `/live`, `/live/craps`  | `flows/live-craps.mjs`                              | scripted, PASS |
| [Baccarat table](game-baccarat.md)                   | `/games/baccarat`       | `flows/game-baccarat.mjs`                           | scripted, PASS |
| [Roulette table](game-roulette.md)                   | `/games/roulette`       | `flows/game-roulette.mjs`                           | scripted       |
| [Craps table](game-craps.md)                         | `/games/craps`          | `flows/game-craps.mjs`                              | scripted       |
| [Video poker](game-video-poker.md)                   | `/games/video-poker`    | `flows/game-video-poker.mjs`                        | scripted, PASS |
| [Drills (Trainer): hub + all four drills](drills.md) | `/drills`, `/drills/*`  | `flows/drills.mjs`                                  | scripted, PASS |
| [True Count drill](true-count-drill.md)              | `/drills/true-count`    | `flows/true-count-drill.mjs`                        | scripted, PASS |
| [Rules / your table](rules.md)                       | `/rules`                | `flows/rules-integrity.mjs`                         | scripted, PASS |
| [Shoe Integrity](shoe-integrity.md)                  | `/shoe-integrity`       | `flows/rules-integrity.mjs`                         | scripted, PASS |
| [Session / Statistics](session.md)                   | `/session`              | `flows/rules-integrity.mjs`                         | scripted, PASS |
| [Session backup and restore](session.md)             | `/session`              | `flows/session-backup.mjs`                          | scripted       |
| [Offline install and updates](offline.md)            | all exported routes     | `flows/offline.mjs`, `flows/offline-updates.mjs`    | scripted       |
| [Strategy library](strategies.md)                    | `/strategies`           | `flows/strategies.mjs`                              | scripted, PASS |
| [Blackjack strategy builder](strategies.md)          | `/strategies/blackjack` | `flows/strategies.mjs`                              | scripted, PASS |
| [Craps strategy builder](strategy-craps.md)          | `/strategies/craps`     | `flows/strategy-craps.mjs`                          | scripted, PASS |
| [Roulette strategy builder](strategy-roulette.md)    | `/strategies/roulette`  | `flows/strategy-roulette.mjs`                       | scripted, PASS |
| [Design system](design-system.md)                    | `/design-system`        | `flows/design-system.mjs`                           | scripted, PASS |

Cross-cutting: `flows/no-hydration-errors.mjs` discovers every exported route from the sitemap and fails on React hydration mismatches (#32). `flows/links.mjs` crawls links at desktop and phone widths. `flows/early-surrender.mjs` and `flows/no-hole-card.mjs` cover rule-sensitive blackjack rounds; `flows/strategy-handoff.mjs` checks builder-to-table use.

Status labels describe available scripts, not evidence for the current worktree. Run `doctor` and inspect each fresh `result.json`, including `consoleErrors`, before claiming a change is verified.
