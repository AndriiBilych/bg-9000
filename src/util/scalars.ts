/**
 * Resolution of the coarse, human-facing option names into numbers.
 *
 * Amount is expressed as a density rather than a count: a fixed count reads as
 * sparse on a monitor and suffocating on a phone.
 */

export type Amount = 'low' | 'moderate' | 'alot';
export type Size = 'small' | 'medium' | 'large';

/** Square CSS pixels of canvas per circle. */
export const AMOUNT_DENSITY: Readonly<Record<Amount, number>> = {
  low: 28_000,
  moderate: 12_000,
  alot: 4_500,
};

/** Radius range in CSS pixels, sampled uniformly. */
export const SIZE_RADIUS: Readonly<Record<Size, readonly [number, number]>> = {
  small: [3, 8],
  medium: [10, 22],
  large: [26, 48],
};

/**
 * Ceiling on the fraction of the canvas the circles may occupy.
 *
 * Without this, `large` + `alot` spawns a field that starts deeply overlapped;
 * once collisions are enabled the solver fights itself and the whole field
 * visibly jitters. Shedding circles is the lesser evil.
 */
export const MAX_AREA_COVERAGE = 0.45;

export function isAmount(value: unknown): value is Amount {
  return value === 'low' || value === 'moderate' || value === 'alot';
}

export function isSize(value: unknown): value is Size {
  return value === 'small' || value === 'medium' || value === 'large';
}

/** Expected value of r² for a radius sampled uniformly from [min, max]. */
export function meanRadiusSquared(range: readonly [number, number]): number {
  const [min, max] = range;
  return (min * min + min * max + max * max) / 3;
}

/**
 * How many circles to spawn, after both the explicit ceiling and the coverage
 * guard have been applied.
 */
export function resolveCount(
  amount: Amount,
  size: Size,
  width: number,
  height: number,
  maxCount: number,
): number {
  const area = Math.max(width * height, 1);

  const byDensity = Math.round(area / AMOUNT_DENSITY[amount]);
  const meanCircleArea = Math.PI * meanRadiusSquared(SIZE_RADIUS[size]);
  const byCoverage = Math.floor((area * MAX_AREA_COVERAGE) / meanCircleArea);

  return Math.max(1, Math.min(byDensity, byCoverage, maxCount));
}
