# Advantage-play calculator: risk of ruin, N0, SCORE and bet-spread formulas

Gathered 2026-11-10 for issue #69 (parent map #67, feeds the scoping decision in #74). Primary
sources: Edward O. Thorp's "The Kelly Criterion in Blackjack, Sports Betting, and the Stock
Market" (Handbook of Asset and Liability Management, 2006); the front matter of Don
Schlesinger's _Blackjack Attack: Playing the Pros' Way_ (3rd ed., Huntington Press sample PDF);
Norm Wattenberger's qfit.com pages for CVCX, CVCX Online and CVData, and his book _Modern
Blackjack_ (qfit.com/book); Michael Shackleford's Wizard of Odds (Kelly, risk of ruin, session
ruin calculator, Appendix 4 variance, High-Low and Ace/Five pages); the Encyclopedia of
Blackjack (blackjackreview.com). Repo context: `src/engine/*`, `src/ui/strategies/betRamp.ts`,
`src/state/strategies.ts`, `src/ui/rules/houseEdge.ts`, `src/ui/shoe-integrity/integrity.ts`,
`CONTEXT.md`.

Labels: **[derived]** means algebra on the cited formulas, done here. **[measured]** means a
throwaway run of Tableside's own engine on 2026-11-10 (scripts kept outside the repo).
**[secondary]** means the fact is not from the party that owns it (forum posts, or a site
quoting a book). **[unverified]** means a formula's attribution to a specific page could not
be checked against the book text. _Blackjack Attack_'s body text is not online. Its page
numbers below come from qfit.com and Wizard of Odds, which cite them, and they match the
book's published table of contents.

## Bottom line

- **Every calculator output is closed-form once you have three numbers per round:** expected
  win (EV), standard deviation (SD) and rounds per hour. Risk of ruin (lifetime, with a goal, or
  for a trip), N0, DI, SCORE, hourly win and SD, the chance of being ahead and the required
  bankroll are all short formulas on those numbers (sections 1–3). They are cheap to compute,
  and anyone can check them.
- **EV and SD per round for a counter cannot be computed directly. They need a
  simulation.** They depend on how often each true count turns up, and that depends on decks,
  penetration, the counting system, how true counts are rounded and how decks are estimated.
  They also depend on the edge and variance at each count when the player's real strategy
  (basic strategy plus indices) is played. CVCX, CVData and _Blackjack Attack_ all get these
  from simulations of billions of rounds (section 4).
- **The bet ramp is the easy part once those per-count numbers exist.** The best bet at each
  count is proportional to edge divided by variance (Kelly). That shape is then clamped to the
  table minimum, the spread cap and the table maximum, scaled to hit a target risk of ruin, and
  rounded to chips (section 3).
- **Tableside already has most of the inputs, but not the per-count statistics.** It has
  the rules, penetration, six counting systems with true-count rounding, a ramp with six count
  buckets, a seeded shoe, and a playable round loop. It has a composition-exact EV engine that
  scores a whole shoe in about 0.2 s **[measured]**, and a normal CDF. What it lacks is a
  simulation harness, a bankroll and hands-per-hour input, indices for systems other than Hi-Lo,
  and a random number generator good for billions of rounds (section 5).
- **How long to simulate follows from one rule: the relative standard error of the win rate is
  `sqrt(N0 / rounds)`.** At a typical N0 of about 25,000, 10 million rounds pins the win rate to
  about ±5%. 250 million gets ±1%, and the 2 billion that CVCX uses gets ±0.35%. Each count's
  own edge needs about 10⁸ rounds before its standard error falls near 0.1% (section 6).
  Tableside's engine plays about 68,000 rounds a second on one desktop core **[measured]**, so
  2 billion rounds is about 8 hours. That points to precomputed tables, or short on-device
  simulations that show their error bars.

## 1. The quantities and their units

Everything below is per round, in units of the table-minimum bet, unless it says otherwise.

| Symbol | Meaning                                                                                 | Who supplies it                                        |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `f_i`  | Frequency of true-count bucket `i` (share of rounds dealt at that count)                | Simulation                                             |
| `a_i`  | Player edge per unit bet at count `i`, playing the actual strategy                       | Simulation (or composition EV, section 5)              |
| `v_i`  | Variance per unit bet of one hand at count `i`, about 1.3 for a shoe game                | Simulation. Wizard Appendix 4 gives the off-the-top value |
| `b_i`  | Units bet at count `i`, which is the ramp                                                | `BetRamp.units` (`src/state/strategies.ts`)           |
| `EV`   | Expected win per round, `Σ f_i b_i a_i`                                                   | Derived                                                |
| `SD`   | Standard deviation per round                                                             | Derived (or simulated)                                 |
| `B`    | Bankroll in units                                                                        | User input (not in the app today)                      |
| `R`    | Rounds per hour                                                                          | User input (not in the app today)                      |
| `n`    | Rounds in a trip or session                                                              | User input                                             |

The Wizard of Odds measured the variance of one flat-bet hand under basic strategy, from
simulations "of about ten billion hands" each. It is 1.303 for six decks, S17, DAS, LS and
RSA, and 1.312 for the same game under H17. The covariance between two hands played at once is
about 0.48 ([Wizard Appendix 4](https://wizardofodds.com/games/blackjack/appendix/4/)).

## 2. Win rate, SD, N0, DI and SCORE

### 2.1 Win rate and standard deviation, per round and per hour

- `EV = Σ f_i · b_i · a_i` (units per round). **[derived]** This is the frequency-weighted
  average of the bet times the edge. CVCX Online reports exactly the inputs it needs: "True
  Count Frequency: The percentage of hands at each True Count" and "EV per TC: The expected
  percentage won at each true count and the standard error"
  ([qfit CVCX Online Viewer](https://www.qfit.com/c.htm)).
- `Var = Σ f_i · b_i² · (v_i + a_i²) − EV²` and `SD = sqrt(Var)`. **[derived]** This is the
  law of total variance over the count buckets. The `a_i²` and `EV²` terms are tiny, because
  edges are a few percent.
- **Hourly:** `EV_hour = R · EV` and `SD_hour = sqrt(R) · SD`. CVCX quotes SD "by hand and
  hour" ([qfit](https://www.qfit.com/c.htm)). _Modern Blackjack_ quotes it "by Round, Hour, 100
  Rounds, or Shoe" ([glossary](https://www.qfit.com/book/ModernBlackjackPage518.htm)).
- **Playing several spots:** for `k` hands of one bet each, the variance per round is
  `k·v + k·(k−1)·c`, where `c` is the covariance
  ([Wizard Appendix 4](https://wizardofodds.com/games/blackjack/appendix/4/)). CVData supports
  "optimal bet calculations for 1-7 hands"
  ([qfit simulator](https://www.qfit.com/blackjack-simulator.htm)).
- **Sanity values:** a six-deck S17 Hi-Lo game run in CVCX with I18 and Fab 4, a 1–10 spread
  and 4.5 of 6 decks dealt gives a player edge of 0.587% of initial bets, an SD of 2.27 and an
  average bet of 1.68 units
  ([Wizard, High-Low](https://wizardofodds.com/games/blackjack/card-counting/high-low/)).

### 2.2 N0

- **Definition** (Brett Harris): "the number of rounds that must be played, with a fixed
  betting spread, such that the accumulated expectation equals the accumulated standard
  deviation" ([qfit](https://www.qfit.com/c.htm);
  [Modern Blackjack glossary](https://www.qfit.com/book/ModernBlackjackPage518.htm)).
- **Formula:** `N0 = Var / EV² = (SD / EV)²`
  ([Encyclopedia of Blackjack, "N"](https://www.blackjackreview.com/wp/encyclopedia/n/)). It
  follows from solving `N·EV = sqrt(N)·SD`. In Harris's forum derivation, a typical good game
  has N0 near 30,000 **[secondary]**.
- **Useful consequences** **[derived]:**
  - After `n` rounds, the chance of being ahead is about `Φ(sqrt(n / N0))`. At `n = N0` that
    is 84%, and at `4·N0` it is 98%. _Blackjack Attack_ Table 2.2 tabulates the "Probability of
    Being Ahead after n Hours of Play".
  - Hours to N0 is `N0 / R`.

### 2.3 DI and SCORE

- **DI** (Desirability Index, Schlesinger): `DI = 1000 · EV / SD`, so `DI = 1000 / sqrt(N0)`
  **[secondary]**. qfit names DI as Schlesinger's "combination of win rate and standard
  deviation" designed to rate a situation, where "a higher DI is better"
  ([qfit](https://www.qfit.com/c.htm)). It does not print the factor of 1000. The forum posts
  that do print it agree with `SCORE = DI²` below.
- **SCORE** (Standardized Comparison Of Risk and Expectation, Schlesinger, _Blackjack Attack_
  ch. 9): "the win rate per 100 hands, given a \$10,000 bankroll, a risk of ruin of 13.5%, and
  a standard set of conditions"
  ([Modern Blackjack p. 99](https://www.qfit.com/book/ModernBlackjackPage99.htm)). The
  _Modern Blackjack_ glossary gives "SCORE = DI squared"
  ([glossary](https://www.qfit.com/book/ModernBlackjackPage518.htm)). The Wizard defines it as
  "the advantage squared divided by the variance", in other words the expected win for a Kelly
  bettor with a \$10,000 bankroll at 13.5% risk of ruin
  ([Wizard, Ace/Five](https://wizardofodds.com/games/blackjack/ace-five-count/)).
- **Putting them together** **[derived]:** `SCORE = 10⁶ · EV² / Var = DI² = 10⁶ / N0`. Why a
  \$10,000 Kelly bettor wins exactly this much: scale every bet by `k`. Then the per-round
  mean is `k·EV` and the variance is `k²·Var`. The ruin formula in 2.4 gives
  `exp(−2·k·EV·B / (k²·Var))`. Setting that equal to `e⁻² = 13.53%` gives
  `k = B·EV / Var`. The win per round is then `B·EV² / Var`. With `B = 10,000` and 100 rounds,
  that is `10⁶·EV²/Var`. qfit calls 13.5% "the risk associated with maximum bankroll growth"
  ([qfit](https://www.qfit.com/c.htm)).
- **c-SCORE** (Richard Reid) is DI² "calculated without the bankroll and risk requirements"
  of SCORE ([qfit](https://www.qfit.com/c.htm)).
- _Blackjack Attack_ ch. 9, "Before You Play, Know the SCORE!" (p. 151), prints 28 SCORE tables.
  They cover Hi-Lo and K-O across 1, 2, 6 and 8 decks, play-all and back-count, plus Hi-Lo
  against Red Seven against K-O (Table 9.28, p. 176)
  ([BJA front matter](https://www.lasvegasadvisor.com/shop/wp-content/uploads/2018/10/BJAttackSample.pdf)).

## 3. Risk of ruin

_Blackjack Attack_ ch. 8, "Risk of Ruin", runs from p. 111. It contains Table 8.1 Risk of
Ruin, 8.2 Bankroll Requirements, 8.3–8.4 Trip Bankroll Requirements, 8.5–8.8 comparisons of
lifetime, trip and goal risk, and normal and exponential lookup tables (8.9–8.11)
([BJA front matter](https://www.lasvegasadvisor.com/shop/wp-content/uploads/2018/10/BJAttackSample.pdf)).
CVCX's twelve calculators are "either in or based on formulae in Don Schlesinger's Blackjack
Attack", with these page references
([qfit CVCX Online](https://www.qfit.com/cvcxonline.htm)):

| Calculator (CVCX)                                    | BJA page |
| ---------------------------------------------------- | -------- |
| Risk, no goal, no time limit ("simple" lifetime ruin) | 112      |
| Risk, no goal, time limit (trip ruin)                 | 132      |
| Probability of reaching a goal, with time limit       | 136      |
| Risk with goal and time limit (double barrier)        | 137      |
| Probability of reaching a goal, no time limit         | 138      |
| Risk with goal, no time limit                         | 139      |
| Required bankroll / hands / expected result           | 137, 139 |

### 3.1 Fixed bankroll, lifetime: no goal, no time limit

The player bets a fixed ramp, never resizes, and plays forever.

- **BJA p. 112 form:** `RoR = ((1 − EV/SD) / (1 + EV/SD)) ^ (B / SD)`. This is quoted from p. 112
  on blackjackinfo **[secondary]**. A mathematician's blog quotes _Blackjack Attack_ as
  crediting it to "George C., p. 8 of _How to Win \$1 Million Playing Casino Blackjack_". The
  same blog notes that it rescales to unit variance and applies the two-outcome ruin formula,
  which needs `EV ≪ SD ≪ B` to be accurate
  ([possiblywrong](https://possiblywrong.wordpress.com/2017/01/02/risk-of-gamblers-ruin/))
  **[secondary]**.
- **Exponential (Brownian) form:** `RoR = exp(−2 · EV · B / Var)`. This is Thorp's
  continuous-approximation result for the chance of ever falling to a given level (eq. 3.2), in
  additive form. For small `EV/SD` the BJA form reduces to it, because
  `ln((1−x)/(1+x)) ≈ −2x` **[derived]**.
- **Hourly figures give the same answer.** Per-hour EV and SD can go into the BJA form
  (`B/SD_hour`, `EV_hour/SD_hour`) without changing the result in the limit. A forum reply
  confirms "the specification of hourly rates is arbitrary" **[secondary]**.
- **Inverse, the bankroll for a target risk `r`:** `B = −ln(r) · Var / (2·EV)` **[derived]**.

### 3.2 With a win goal, no time limit

Play stops on reaching a gain `G`, or on ruin. With `θ = 2·EV/Var`:

`RoR = (exp(θ·G) − 1) / (exp(θ·(G + B)) − 1)`

This is the two-barrier ruin probability for Brownian motion with drift **[derived]**. It
matches "Sileo's goal ruin formula" as printed by Clarke Cant, before Cant's own "RWI"
adjustment ([Blackjack Review, Appendix A](https://www.blackjackreview.com/wp/archives/clarke-cant-blackjack-therapy/appendix-a/)).
BJA p. 139 is the published version **[unverified]**.

### 3.3 Trip bankroll: a time limit of `n` rounds

The question is whether the bankroll survives `n` rounds, with no goal.

`RoR_trip = Φ( −(B + n·EV) / (SD·sqrt(n)) ) + exp(−2·EV·B/Var) · Φ( (n·EV − B) / (SD·sqrt(n)) )`

- **Basis:** Thorp gives the general first-passage formula for Brownian motion (eq. 3.1, which
  he credits to Howard Tucker): `P(sup[X(t) − (at + b)] ≥ 0, 0 ≤ t ≤ T) = N(−α−β) + e^(−2ab)·N(α−β)`,
  with `α = a·sqrt(T)` and `β = b/sqrt(T)`. Substituting `a = EV/SD`, `b = B/SD` and `T = n`
  gives the line above **[derived]**. As `n → ∞` the first term goes to 0 and the second to
  the lifetime formula in 3.1.
- **Source and caveat:** the Wizard's session-ruin calculator uses "the trip ruin formula
  from Blackjack Attack, by Don Schlesinger, 2004 edition, page 132, 'The Short-Term, or Trip,
  Ruin Formula'". He adds: "Schlesinger says the risk of ruin from this formula is an
  overestimate and my own simulations agree with this"
  ([Wizard session RoR](https://wizardofodds.com/games/session-risk-of-ruin-calculator/)).
  Clarke Cant calls the book's derivation "highly flawed", while saying its results
  approximate his own corrected values
  ([Appendix A](https://www.blackjackreview.com/wp/archives/clarke-cant-blackjack-therapy/appendix-a/)).
  The book's exact printed form could not be checked against its text. The formula above is
  the standard reflection result, which the cited descriptions match (two normal-CDF terms
  plus the exponential) **[unverified as BJA's exact text]**.
- **Double barrier** (goal and time limit, BJA p. 137) has no short closed form. qfit calls its
  calculator "Don Schlesinger's current Double-Barrier Trip Ruin Formula": enter any five of
  goal, bankroll, win rate per 100, SD per 100, hands and probability, and it solves for the
  sixth ([CVData risk calculator](https://www.qfit.com/cvblackjackhelp/riskofruincalculator.htm)).
  For Tableside, the cheapest honest implementation is a numerical method: a truncated
  image-series sum, or Monte Carlo on the normal approximation.
- **Trip bankroll for a target risk:** solve `RoR_trip(B) = r` for `B` by bisection.
  `RoR_trip` falls monotonically in `B` **[derived]**.

### 3.4 Proportional resizing (Kelly bettors)

If bets are resized as the bankroll changes, lifetime ruin is theoretically 0. The useful
figure becomes the chance of ever dropping to a fraction `x` of the starting bankroll. Thorp
(eq. 7.13): betting a fraction `c` of Kelly, `P(ever ≤ x·B₀) = x^(2/c − 1)`. Full Kelly
therefore halves the bankroll at some point with probability 1/2, and half Kelly with
probability 1/8. Half Kelly keeps 3/4 of the growth rate ("g∞(f*/2) = .75 g∞(f*)"). Thorp
reports that most players "strongly prefer the increased safety ... of 'half Kelly'"
([Thorp 2006, pp. 394–395, 408–409, 415](https://gwern.net/doc/statistics/decision/2006-thorp.pdf)).

### 3.5 Range of results

After `n` rounds the result is about normal, with mean `n·EV` and SD `SD·sqrt(n)`. CVCX's
"Range of Probable Results" and "Probability of your actual results" calculators are this
([qfit CVCX Online](https://www.qfit.com/cvcxonline.htm)). Tableside already applies it to a
flat-bet basic-strategy player in `expectationBand` (`src/ui/shoe-integrity/integrity.ts`).

## 4. Optimal bet spread

1. **Kelly bet per count.** For a bet with several outcomes, the optimal Kelly wager maximizes
   expected log bankroll. "Most gamblers use advantage/variance as an approximation, which is a
   very good estimator." The Wizard's card-counting example: a 1% edge with SD 1.15 gives
   `0.01 / 1.3225 = 0.76%` of bankroll
   ([Wizard, Kelly](https://wizardofodds.com/gambling/kelly-criterion/)). Thorp: "in actual
   blackjack fi∗ would be adjusted down somewhat for the greater variance". With a spread cap
   `k·f0`, "the solution is just fi ⩽ min(fi∗, kf0)" (Thorp 2006, §5, p. 400). So the ideal
   shape is `b_i ∝ a_i / v_i` wherever `a_i > 0`.
2. **Waiting bets lower the ramp.** If the player must bet at negative counts (play-all), the
   optimal favourable-count fraction is smaller than with no waiting bets. Thorp's Case 2 shows
   the Kelly fraction falling from .02 toward 0 as the waiting-bet ratio rises (§5, p. 400).
   Back-counting and Wonging (CVCX's "Wong In/Out" and "Back-Counting" inputs) remove those
   rounds ([qfit](https://www.qfit.com/c.htm)).
3. **Maximize DI, then scale to the target risk.** CVCX Online: "Optimal Bet Exact: the ideal
   number of units to bet is calculated to maximize the desirability index"
   ([qfit](https://www.qfit.com/c.htm)). Setting the derivative of `EV/SD` to zero gives
   `b_i = (a_i / v_i) · (Var / EV)` at the optimum, which is the same proportional shape
   **[derived]**. Solve it by iteration, clamping `b_i` to `[1, spread]` and to
   `[minBet, maxBet]` in dollars. Then scale the whole ramp so that `exp(−2·EV·B/Var)` equals
   the target `r`, using `k = −2·B·EV₁ / (Var₁·ln r)`, where `EV₁` and `Var₁` belong to the
   unscaled ramp **[derived]**. At `r = 13.5%` this is Kelly. CVCX's default risk "is set to
   13.5"; the Wizard and CVCX charts assume "optimal betting at a risk of ruin of 13.5%"
   ([qfit CVCX Online](https://www.qfit.com/cvcxonline.htm)).
4. **Round to chips.** CVCX has "Optimal Bet Chips", which rounds to the unit size and "Bet
   Exactness" (the minimum increment), and "Simplify Bets" using the "Rational" algorithm,
   where "bet sizes are constructed to look more natural" ([qfit](https://www.qfit.com/c.htm)).
   Rounding costs some EV. Recompute EV, SD and risk after rounding, and do not report the
   exact-bet numbers.
5. **Spread size.** _Blackjack Attack_ Table 2.5, "Expectation as a Function of 'Spread'"
   (p. 27), and Table 2.4, "Optimal Number of Simultaneous Hands" (p. 26), cover this. Typical
   CVCX numbers for six-deck Hi-Lo: 1–5 at 4/6 decks gives 0.157%, 1–10 at 4.5/6 gives 0.587%,
   and 1–15 at 5/6 with all indices gives 1.182%
   ([Wizard, High-Low](https://wizardofodds.com/games/blackjack/card-counting/high-low/)).

## 5. What CVCX, CVData and _Blackjack Attack_ publish

| Source                                                                   | Publishes                                                                                                                                                                                                                                                                                                                                                                           | How the numbers are made                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CVCX** ([qfit.com/cvcx.htm](https://qfit.com/cvcx.htm))                | Win rate, expectation, SCORE "and other stats", which update instantly as settings change. "Advantage, desirability, risk and optimal bets" by penetration. "Twelve calculators and nine charts." Optimal ramps that "maximize your bankroll growth".                                                                                                                                  | Lookup over precomputed simulations: "150,000 2 billion round sims included with CVCX". "The latest edition of BJA Chapter 10 was created using CVCX."                                                                    |
| **CVCX Online** ([qfit.com/c.htm](https://www.qfit.com/c.htm))           | Win rate (units and \$ per hour), SD (per hand and hour), DI, c-SCORE, N0, risk of ruin, Optimal Bet Exact (maximizes DI), Optimal Bet Chips, Certainty Equivalent, CE/WR ratio ("Ideally this is 0.5"), average bet, EV/IBA, TC frequency, EV per TC with standard error. Inputs: decks, rules, spread, hands/hour, risk %, penetration, Wong in/out, bankroll, back-counting, two hands, simplify bets. | The same precomputed sims ("150,000 2,000,000,000 round sims", [cvcxonline.htm](https://www.qfit.com/cvcxonline.htm)), re-weighted for a new ramp or risk without re-simulating.                                       |
| **CVData** ([qfit.com/blackjack-simulator.htm](https://www.qfit.com/blackjack-simulator.htm)) | A full simulator. "Up to 60,000 stats are created per seat." Stats by count, depth and units bet (MRI Slices). Optimal bets for 1–7 hands. Wong in/out by depth. Double-barrier RoR/bankroll and trip-ruin calculators covering "all such formulae" in BJA 3e ("twelve card counting calculators and nine charts"). Its sample output gives per-TC wins, losses and pushes with "Std. Err. and Variance". | Raw simulation: "Up to 100,000,000,000 rounds", at "up to 80 million rounds a second" on a high-end desktop chip.                                                                                                       |
| **_Blackjack Attack_ 3e** (Schlesinger, [front matter](https://www.lasvegasadvisor.com/shop/wp-content/uploads/2018/10/BJAttackSample.pdf)) | Ch. 2, Betting Techniques and Win Rates (SD by decks, probability of being ahead, win rates and SD for many games, optimal simultaneous hands, EV against spread). Ch. 5, Illustrious 18 and Fab 4. Ch. 6, Floating Advantage. Ch. 8, Risk of Ruin (pp. 111–149: lifetime, trip and goal formulas and tables). Ch. 9, SCORE (28 tables). Ch. 10, "World's Greatest Blackjack Simulation" (SCORE summaries and results for 8, 6, 2 and 1 decks, pp. 185–286). Ch. 13, optimal departure tables. Appendix D, effects of removal. | "BJA Chapter Ten contains summaries of over 600 separate 20 billion round sims" ([qfit.com/cvcx.htm](https://qfit.com/cvcx.htm)).                                                                                      |

The pattern in all three is the same. A large simulation produces per-count frequency, edge
and variance, or per-ramp EV and SD. Everything users see is formulas on top of that.

## 6. What Tableside already supplies, and what needs simulation

### Already in the repo

| Calculator input                       | Where it lives                                                                                                                                                                                  | Notes                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules, decks, penetration, table limits | `RuleSet` (`src/engine/rules.ts`)                                                                                                                                                               | `penetration`, `minBet` and `maxBet` are already fields.                                                                                                                                                                                                                                                             |
| Off-the-top edge                       | `src/ui/rules/houseEdge.ts` (published Wizard baseline plus per-rule deltas, about ±0.1%). Also composition EV from `ev.ts`.                                                                     | The table assumes a continuous shuffler, as the file itself notes. Off-the-top edge is the TC 0 anchor, not the counter's edge.                                                                                                                                                                                      |
| Counting system and TC conversion      | `src/engine/counting.ts`: six systems, `trueCount` with `exact`/`truncate`/`floor`/`round`, KO key counts and pivot, Omega II ace side count via `bettingTrueCount`                              | KO and Red 7 bet off the running count or key count, not a true count. A TC-indexed ramp does not fit them as is.                                                                                                                                                                                                     |
| Bet ramp                               | `BetRamp` (`src/state/strategies.ts`): unit in dollars plus 6 buckets (TC ≤ 0, +1 … +5 or more). `checkRamp` and `aggressiveSpread` in `betRamp.ts`.                                             | Gives `b_i` directly. There is no Wong-out bucket, and everything at TC ≤ 0 is one bucket, so play-all is the only model. `aggressiveSpread` (4/8/12 by decks) is a camouflage heuristic, not an optimum.                                                                                                             |
| Per-hand EV for a composition          | `actionEvs`, `dealerOutcomes`, `fullShoeComposition` (`src/engine/ev.ts`)                                                                                                                       | **[measured]** Enumerating every two-card hand and upcard with `actionEvs` gives a pre-deal EV of a whole composition in about 0.2 s. A full six-deck H17 DAS LS shoe scores −0.533%. `houseEdge.ts`'s published-delta total for the same rules is about −0.56%. The gap fits composition-optimal play and the engine's documented split and depletion approximations. |
| Index plays                            | `src/engine/deviations.ts`: Hi-Lo Illustrious 18 and Fab 4 only                                                                                                                                 | Other systems would simulate as basic strategy plus nothing, which understates them.                                                                                                                                                                                                                                 |
| Playable round loop and seeded shoe    | `startRound`, `applyAction`, `basicStrategy`, `createShoe`, `needsShuffleBeforeRound`                                                                                                           | **[measured]** A 40-line Bun script played 2,000,000 heads-up rounds (6D H17 DAS LS, 75% penetration, flat bet, basic strategy, no insurance) at about 68,000 rounds a second on one core. Result: EV −0.497% ± 0.081% and SD 1.1442 per round. The Wizard gives about 1.145 (var 1.312) for six-deck H17 DAS LS RSA. That is about 43.5 rounds per shoe.   |
| Normal CDF                             | `normalCdf` in `src/ui/shoe-integrity/integrity.ts` (A&S 7.1.26, error below 1.5e-7)                                                                                                            | Enough for the trip-ruin and probability-of-being-ahead formulas.                                                                                                                                                                                                                                                    |

### Missing inputs (user entry, no simulation needed)

Bankroll (in dollars or units), rounds per hour, trip length, a win goal, a target risk of
ruin, the number of spots, and Wong-in and Wong-out points.

### Needs simulation (or a heavy offline computation)

- **`f_i`, the true-count frequency distribution.** It depends on decks, penetration, the
  system, the TC rounding mode and the deck-estimation resolution, and none of these has a
  closed form in the engine. The Wizard's CVCX runs, for example, round decks remaining to the
  nearest half deck ([High-Low](https://wizardofodds.com/games/blackjack/card-counting/high-low/)),
  whereas `decksRemaining` in Tableside is exact.
- **`a_i` and `v_i` under the player's actual strategy.** `ev.ts` can price one composition
  exactly, but a true count covers many compositions. Averaging over them is what a
  simulation does. The edge at a fixed TC also drifts with depth: this is the "floating
  advantage", BJA ch. 6, with tables by deck and depth. And `ev.ts` assumes
  composition-optimal play, which is not basic strategy plus I18. A hybrid is possible: sample
  compositions from the simulation, score each with `ev.ts`, and average by TC bucket. It is
  slower per sample, but its variance is far lower than results of played hands.
- **Covariance for several spots, and the effect of Wonging** on `f_i` and on rounds per
  hour.
- **Validation of the whole pipeline** against published numbers, for example the Wizard's
  CVCX Hi-Lo table or a _Blackjack Attack_ ch. 10 row. This is the same way
  `strategy.reference.ts` and `ev.test.ts` already pin the chart and EVs (invariant 4).

## 7. How many rounds before simulated numbers can be trusted

### The governing formulas [derived]

- **Win rate:** `SE(EV) = SD / sqrt(n)`, so the relative error is
  `SE(EV)/EV = sqrt(N0 / n)`.
- **SCORE and DI:** SCORE goes as `EV²`, and the SD estimate is much tighter than the EV
  estimate, so `relSE(SCORE) ≈ 2·sqrt(N0/n)` and `relSE(DI) ≈ sqrt(N0/n)`.
- **Edge at one count bucket:** `SE(a_i) ≈ sqrt(v_i) / sqrt(f_i · n)`, about
  `1.14 / sqrt(f_i·n)` per unit bet. It does not depend on the ramp. **[measured]** At
  2,000,000 rounds, the TC +5 bucket (`f` = 1.18%) showed an SE of 0.72%, against 0.74% from
  the formula. That is as large as the edge being measured.

### Rounds needed

| Target                                                  | N0 = 10,000 | N0 = 25,000 | N0 = 50,000 |
| ------------------------------------------------------- | ----------- | ----------- | ----------- |
| Win rate ±5% (1 SE): `n = 400·N0`                        | 4 M         | 10 M        | 20 M        |
| Win rate ±1%: `n = 10⁴·N0`                               | 100 M       | 250 M       | 500 M       |
| Win rate ±0.5%: `n = 4·10⁴·N0`                           | 400 M       | 1 B         | 2 B         |
| Edge at a 1%-frequency count, SE 0.1%                    | 130 M       | 130 M       | 130 M       |
| Edge at a 1%-frequency count, SE 0.05%                   | 520 M       | 520 M       | 520 M       |

What practitioners actually run:

- CVCX ships 2-billion-round sims ([qfit](https://qfit.com/cvcx.htm)).
- _Blackjack Attack_ ch. 10 is "over 600 separate 20 billion round sims"
  ([qfit](https://qfit.com/cvcx.htm)).
- The Wizard's variance tables use "about ten billion hands" each
  ([Appendix 4](https://wizardofodds.com/games/blackjack/appendix/4/)).
- Wattenberger on a small simulation: "What counts is the standard error. The standard error
  with 7 million hands is vastly larger than the difference between counting strategies". He
  also warns users that tiny samples "have no meaning"
  ([blackjackinfo thread](https://www.blackjackinfo.com/community/threads/software-simulator-and-unexpected-results.15575/page-5))
  **[secondary]**.

A practical floor: about 10⁸ rounds for a single "what is my win rate and risk" answer
(±1–2%), and 10⁹ or more for comparing two systems or ramps that differ by a few percent.
Always show the SE beside the number, as CVCX Online does for EV per TC.

### What this means for Tableside

- **Throughput.** At the measured 68,000 rounds a second, 10⁸ rounds takes about 25 minutes
  and 2·10⁹ about 8 hours on one desktop core. A phone is slower, and invariant 3 work shares
  the thread. Faster paths are a simulation-only code path (mutable state, an incremental
  running count instead of re-summing `dealtCards` every round), Web Workers, or precomputing
  offline and shipping tables as data. Precomputed data is CVCX's own model.
- **The RNG is not fit for long simulations.** `createRng` is mulberry32 (`src/engine/rng.ts`).
  Its state is a Weyl sequence (`state += 0x6d2b79f5`), so every seed is a position on a single
  2³² ≈ 4.3·10⁹-step cycle. **[derived and measured]** Each six-deck shuffle uses 311 draws
  and a shoe yields about 43.5 rounds, so 2·10⁹ rounds needs about 1.4·10¹⁰ draws, about 3.3
  laps of the cycle. Even at 46 M sequential seeds, six seed differences put pairs of shoes on
  overlapping stretches of the stream, so their shuffles are correlated rather than
  independent. A simulation should use a 64-bit or larger generator (for example xoshiro256\*\*
  or PCG64) with properly split seeds. Keep mulberry32 for the user-verifiable shoe
  (ADR-0004).

## 8. Options for #74 (for context, not a decision)

1. **Formulas only.** The user enters EV and SD per round (or per 100), hands per hour and
   bankroll. The app computes risk (lifetime, goal, trip), N0, DI, SCORE, hours to N0, the
   probability of being ahead, the required bankroll and the range of results. No simulation,
   fully auditable, and fast enough for the UI thread. This matches CVCX's calculators page.
2. **Shipped tables.** Precompute `f_i`, `a_i` and `v_i` per (system, decks, rules family,
   penetration), offline, at 10⁸–10⁹ rounds each, with SE stored. The app then derives EV and
   SD for any user ramp and solves the optimal ramp in milliseconds. This is the CVCX Online
   model. It needs a validated simulator and a 64-bit RNG, and the grid size sets the data
   size.
3. **On-device simulation.** Run short simulations of the user's exact ramp and rules, and
   always display the SE and "rounds run". It is honest at 10⁷ rounds for win rate (about ±5%)
   but not for per-count edges or system comparisons.

CONTEXT.md invariant 1 ("No second paywall. Gate breadth, never depth") is noted for context
only. Where analysis tooling falls relative to training depth is #74's question, not this
note's.

## 9. Open points and caveats

- _Blackjack Attack_'s exact printed formulas (pp. 112, 132, 136–139) were not read
  first-hand. The page numbers come from qfit and the Wizard, and the forms in 3.1–3.3 match
  their descriptions and Thorp's mathematics. Before shipping, check them against a copy of
  the book, because the trip formula is described by its author as an overestimate.
- The risk formulas assume a fixed ramp, independent rounds and a normal approximation. Count
  dependence inside a shoe and the skew of blackjack outcomes are ignored. Cant's "RWI"
  correction (about 2.084 instead of 2) is one published refinement
  ([Appendix A](https://www.blackjackreview.com/wp/archives/clarke-cant-blackjack-therapy/appendix-a/)).
  Simulated ruin is the ground truth.
- The SE and rounds-needed figures in section 7 are derived. They match the one measured
  check (the TC +5 bucket) but were not validated beyond it.
- The engine prototype numbers in section 6 come from throwaway scripts that are not in the
  repo. They played basic strategy only, with exact decks remaining, truncated TC, no indices
  and no insurance.

## Sources

- Thorp, E. O. (2006). "The Kelly Criterion in Blackjack, Sports Betting, and the Stock
  Market." Handbook of Asset and Liability Management, vol. 1, pp. 385–428. Eqs. 3.1, 3.2,
  7.6, 7.13 and §5. <https://gwern.net/doc/statistics/decision/2006-thorp.pdf>
- Schlesinger, D. _Blackjack Attack: Playing the Pros' Way_, 3rd ed., Huntington Press.
  Table of contents and list of tables:
  <https://www.lasvegasadvisor.com/shop/wp-content/uploads/2018/10/BJAttackSample.pdf>
- Wattenberger, N. (QFIT): CVCX <https://qfit.com/cvcx.htm>; CVCX Online calculators
  <https://www.qfit.com/cvcxonline.htm>; CVCX Online Viewer definitions
  <https://www.qfit.com/c.htm>; CVData <https://www.qfit.com/blackjack-simulator.htm>; CVData
  risk calculator <https://www.qfit.com/cvblackjackhelp/riskofruincalculator.htm>; _Modern
  Blackjack_ p. 99 <https://www.qfit.com/book/ModernBlackjackPage99.htm> and glossary
  <https://www.qfit.com/book/ModernBlackjackPage518.htm>
- Shackleford, M. (Wizard of Odds): Kelly criterion
  <https://wizardofodds.com/gambling/kelly-criterion/>; risk of ruin
  <https://wizardofodds.com/games/blackjack/risk-of-ruin/>; session risk of ruin calculator
  <https://wizardofodds.com/games/session-risk-of-ruin-calculator/>; Appendix 4, variance
  <https://wizardofodds.com/games/blackjack/appendix/4/>; High-Low
  <https://wizardofodds.com/games/blackjack/card-counting/high-low/>; Ace/Five (SCORE)
  <https://wizardofodds.com/games/blackjack/ace-five-count/>
- Encyclopedia of Blackjack, "N" (N0): <https://www.blackjackreview.com/wp/encyclopedia/n/>
- Cant, C. _Blackjack Therapy_, Appendix A (ruin formulas, RWI):
  <https://www.blackjackreview.com/wp/archives/clarke-cant-blackjack-therapy/appendix-a/>
- [secondary] possiblywrong blog, "Risk of (gambler's) ruin" (quotes BJA's p. 112 formula and its
  attribution): <https://possiblywrong.wordpress.com/2017/01/02/risk-of-gamblers-ruin/>
- [secondary] blackjackinfo.com forum: "RUIN Formula?" (BJA p. 112 quote)
  <https://www.blackjackinfo.com/community/threads/ruin-formula.20521/>; QFIT on simulation
  standard error
  <https://www.blackjackinfo.com/community/threads/software-simulator-and-unexpected-results.15575/page-5>
- Repo: `src/engine/{counting,ev,rng,shoe,round,rules,deviations}.ts`,
  `src/ui/strategies/betRamp.ts`, `src/state/strategies.ts`, `src/ui/rules/houseEdge.ts`,
  `src/ui/shoe-integrity/integrity.ts`, `CONTEXT.md`.
