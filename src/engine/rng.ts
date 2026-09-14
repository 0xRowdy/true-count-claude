/**
 * Seeded, reproducible randomness.
 *
 * ADR-0004: every shoe is reproducible from its seed, which is what makes shoe integrity
 * user-verifiable and bug reports replayable. `Math.random()` must never appear in the
 * engine — it would make the test suite meaningless and the integrity panel a lie.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. More than adequate for
 * shuffling a shoe, and its tiny state keeps a Session's seed a single number.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt: (maxExclusive: number) => Math.floor(next() * maxExclusive),
  };
}

/**
 * Fisher-Yates, in place. Unbiased given an unbiased `nextInt`, which matters:
 * a biased shuffle is exactly the defect users accuse trainers of (ADR-0004).
 */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const a = items[i] as T;
    const b = items[j] as T;
    items[i] = b;
    items[j] = a;
  }
  return items;
}
