# Shoe Integrity

Proves the shoe is fair and reproducible: the seed, dealt history with count tags, and a count trace (ADR-0004).

## Sub-features

- Stat Cards (Cards dealt, Running Count, Decks remaining, Composition) · Seed panel (copyable; "Seed to load" field rebuilds a shoe from a bug report's seed) · Counting System radios · Zero-sum check ("Reconciles", Deal 1 / Deal 10 / To the cut card / Run the Shoe out, "Finished on 0") with the count trace · Rank table · Results vs. expectation band · Dealt history ("Card N: <rank><suit>, tag ±k") · Export · Report a bug

## How to get to it (user POV)

`/shoe-integrity` (linked from the home screen).

## Driving it with Playwright

`flows/rules-integrity.mjs`: "Reconciles" → Run the Shoe out → "Finished on 0" (Hi-Lo). Still to script: load a known seed and check the history is deterministic.

## Gotchas

- Determinism is the feature: the same seed must produce the same cards in the same order.
- Running the Shoe out takes about three seconds; wait on "Finished on 0" with a longer timeout.
