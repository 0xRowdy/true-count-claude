# Independent strategy chart fixtures

Captured 2026-10-21 from two published calculators. These JSON files contain source calculator outputs, never outputs of this repository's strategy generator. Tests consume frozen data and do not fetch or execute upstream code.

## BlackjackInfo

- Page: https://www.blackjackinfo.com/blackjack-basic-strategy-engine/
- Calculator: https://www.blackjackinfo.com/content/themes/bjinfo/js/strategy-engine.js?ver=2.0.120-studio-page-flow
- SHA-256 of downloaded JavaScript: `70dddcb797fd0533405ed116663329cdf838a6337792c66b55d6c4bb171b468f`
- Extraction: call the source's exported `chartData(decks, h17, double, das, surrender, peek)` for decks 1, 2, 3, 4; both soft-17 rules; both DAS settings; `all/d9/d10`; `ns/ls/es`; both peek settings. Read its hard 5–18, A2–A9, 22–99, TT, AA rows in that order.
- 288 parameter families produce 252 distinct charts. Decks 4–8 share a family; deck 3 has a distinct surrender threshold. Tests map all 576 combinations of the six chart parameters for decks 1–8 to these outputs.

## Wizard of Odds

- Page and embedded calculator: https://wizardofodds.com/games/blackjack/strategy/calculator/
- SHA-256 of the extracted strategy script, beginning `// 1 DECK, DEALER HITS SOFT 17`: `e9778af9de8a583c837623cfe1c0ef712635e5b6a3980b52cdcf1de6eac36fa8`
- Extraction: read the six `H17_0` through `S17_2` tables and render their cells using the source's `CellCode`. Use American columns T/A for peek, ET/EA for European. Capture decks 1/2/4+, both soft-17 and DAS settings, American none/late surrender and European no surrender. The calculator does not offer restricted doubling. European surrender semantics are not compared with the app's late surrender.
- 36 shared configurations cross-check the primary source. One disputed cell is retained verbatim: the calculator recommends surrender-or-split for 2D H17 DAS late surrender, 8,8 vs Ace. BlackjackInfo recommends split.
- The discrepancy is resolved by Wizard's dedicated [surrender article](https://wizardofodds.com/games/blackjack/surrender/): “In a double-deck game, when the dealer hits a soft 17, surrender 8+8 vs. A only if double after a split is not allowed.” The shipped chart follows that explicit DAS exception. The test names this single calculator discrepancy and asserts both raw values, so new disagreements cannot hide behind it.

## Format and scope

Keys are `decks/S17-or-H17/DAS-or-NDAS/double/surrender/peek-or-nhc`. Values contain 32 space-separated rows, each with ten cells for dealer 2,3,4,5,6,7,8,9,10,A. Symbols are H hit, S stand, D double/hit, d double/stand, P split, R surrender/hit, r surrender/stand, p surrender/split.

These are published total-dependent chart recommendations. Split limits, resplitting aces and drawing to split aces affect legal actions and the separate EV calculation; the published calculators do not independently parameterize them. The family tests verify chart mapping for all 1–4 split limits, both ace settings and both payouts. Contextual legal-action fallbacks and split EVs have separate tests. Payout, bet limits and penetration do not change these chart cells. Composition-dependent EV estimates can prefer a different action in marginal situations; this fixture is not an exact finite-shoe EV oracle.
