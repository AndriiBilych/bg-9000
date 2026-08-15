import type { IBackgroundConfig } from '../model/config/config.interface.js';
import { DEFAULT_PALETTE, isPaletteName, type PaletteName } from '../theme/palettes.js';
import { DEFAULT_STYLE, isCircleStyle, type CircleStyle } from '../theme/styles.js';
import { isAmount, isSize, type Amount, type Size } from '../util/scalars.js';

export const DEFAULT_CONFIG: Readonly<IBackgroundConfig> = {
  amount: 'moderate',
  size: 'medium',
  collisions: true,
  style: DEFAULT_STYLE,
  palette: DEFAULT_PALETTE,
  speed: 1,
  drag: 0,
  restitution: 1,
  maxCount: 1200,
  maxDpr: 2,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/**
 * Merge a partial config over a base and coerce every field into range.
 *
 * A background that silently misbehaves because someone passed `amount: 'lots'`
 * is worse than one that quietly falls back to a sane value, so unknown values
 * are replaced rather than thrown on.
 */
export function normaliseConfig(
  patch: Partial<IBackgroundConfig> | undefined,
  base: Readonly<IBackgroundConfig> = DEFAULT_CONFIG,
): IBackgroundConfig {
  const merged = { ...base, ...(patch ?? {}) };

  return {
    amount: isAmount(merged.amount) ? merged.amount : base.amount,
    size: isSize(merged.size) ? merged.size : base.size,
    collisions: Boolean(merged.collisions),
    style: isCircleStyle(merged.style) ? merged.style : base.style,
    palette: isPaletteName(merged.palette) ? merged.palette : base.palette,
    speed: clamp(merged.speed, 0, 20, base.speed),
    drag: clamp(merged.drag, 0, 100, base.drag),
    restitution: clamp(merged.restitution, 0, 1, base.restitution),
    maxCount: Math.round(clamp(merged.maxCount, 1, 20_000, base.maxCount)),
    maxDpr: clamp(merged.maxDpr, 1, 4, base.maxDpr),
    seed: merged.seed,
  };
}

export type { Amount, Size };
// Owned by the theme module — re-exported here so `IBackgroundConfig` and every
// type it is built from can be imported from one place.
export type { CircleStyle, PaletteName };
