/** Seeded pseudo-random source. */
export interface IRng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  readonly seed: number;
}
