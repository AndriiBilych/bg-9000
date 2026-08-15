import type { IRng } from '../model/util/rng.interface.js';

/**
 * Seeded pseudo-random source (mulberry32).
 *
 * Deterministic layouts matter for two reasons: screenshots of a given preset
 * stay identical between runs, and collision tests can reproduce a failure.
 */
export function createRng(seed: number = (Math.random() * 0x1_0000_0000) >>> 0): IRng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };

  return {
    seed,
    next,
    range: (min, max) => min + next() * (max - min),
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
  };
}
