# Shoe Integrity

Proves the shoe is fair and reproducible: the seed, dealt history with count tags, and a count trace (ADR-0004).

## Sub-features
- Seed panel (copyable; "Seed to load" field rebuilds a shoe from a bug report's seed) · Dealt history ("Card N: <rank><suit>, tag ±k") · Count trace chart

## How to get to it (user POV)
Home → Shoe Integrity, or `/shoe-integrity`.

## Driving it with Playwright
No flow yet. Suggested: play one round on `/play`, read the Session seed, open `/shoe-integrity`, check dealt history lists the same cards; then load a known seed and check the history is deterministic.

## Gotchas
- Determinism is the feature: the same seed must produce the same cards in the same order.
