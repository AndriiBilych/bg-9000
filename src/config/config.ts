import { isAmount, isSize, type Amount, type Size } from '../util/scalars.js';

/** How a circle is painted. */
export type CircleStyle = 'see-through' | 'dot' | 'full';

export type PaletteName = 'midnight' | 'blossom' | 'mint' | 'dusk' | 'ember';

export interface BackgroundConfig {
  amount: Amount;
  size: Size;
  /** Circle-to-circle contact. Landing in M3; ignored until then. */
  collisions: boolean;
  /** Landing in M2; ignored until then. */
  style: CircleStyle;
  /** Landing in M2; ignored until then. */
  palette: PaletteName;
  /** Multiplier on drift velocity. */
  speed: number;
  /** Velocity damping. 0 disables the force entirely. */
  drag: number;
  /** Fraction of velocity retained on a wall bounce. */
  restitution: number;
  /** Hard ceiling on particle count, whatever the density says. */
  maxCount: number;
  /** Device pixel ratio ceiling. 2 is plenty for a soft background. */
  maxDpr: number;
  /** Fixed seed reproduces a layout exactly; omit for a random one. */
  seed?: number;
}

export const DEFAULT_CONFIG: Readonly<BackgroundConfig> = {
  amount: 'moderate',
  size: 'medium',
  collisions: true,
  style: 'see-through',
  palette: 'mint',
  speed: 1,
  drag: 0,
  restitution: 1,
  maxCount: 1200,
  maxDpr: 2,
};

const STYLES: readonly CircleStyle[] = ['see-through', 'dot', 'full'];
const PALETTES: readonly PaletteName[] = ['midnight', 'blossom', 'mint', 'dusk', 'ember'];

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
  patch: Partial<BackgroundConfig> | undefined,
  base: Readonly<BackgroundConfig> = DEFAULT_CONFIG,
): BackgroundConfig {
  const merged = { ...base, ...(patch ?? {}) };

  return {
    amount: isAmount(merged.amount) ? merged.amount : base.amount,
    size: isSize(merged.size) ? merged.size : base.size,
    collisions: Boolean(merged.collisions),
    style: STYLES.includes(merged.style) ? merged.style : base.style,
    palette: PALETTES.includes(merged.palette) ? merged.palette : base.palette,
    speed: clamp(merged.speed, 0, 20, base.speed),
    drag: clamp(merged.drag, 0, 100, base.drag),
    restitution: clamp(merged.restitution, 0, 1, base.restitution),
    maxCount: Math.round(clamp(merged.maxCount, 1, 20_000, base.maxCount)),
    maxDpr: clamp(merged.maxDpr, 1, 4, base.maxDpr),
    seed: merged.seed,
  };
}

export type { Amount, Size };
