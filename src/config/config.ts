import type { IBackgroundConfig } from '../model/config/config.interface';
import type { ILayer } from '../model/layers/layer.interface';
import type { ICustomPalette } from '../model/theme/palettes.interface';
import { DEFAULT_RENDERER, isRendererKind, type RendererKind } from '../render/renderer-kind';
import { DEFAULT_SHAPE, normaliseShape, type ShapeName } from '../shapes/shapes';
import { DEFAULT_PALETTE, normalisePalette, type PaletteName } from '../theme/palettes';
import { DEFAULT_STYLE, isCircleStyle, type CircleStyle } from '../theme/styles';
import { isAmount, isSize, type Amount, type Size } from '../util/scalars';

const NO_LAYERS: readonly ILayer[] = Object.freeze([]);

export const DEFAULT_CONFIG: Readonly<IBackgroundConfig> = {
  particles: true,
  amount: 'moderate',
  size: 'medium',
  collisions: true,
  style: DEFAULT_STYLE,
  palette: DEFAULT_PALETTE,
  shape: DEFAULT_SHAPE,
  speed: 1,
  drag: 0,
  restitution: 1,
  maxCount: 1200,
  renderer: DEFAULT_RENDERER,
  maxDpr: 2,
  pointer: true,
  layers: NO_LAYERS,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Structural check: the five lifecycle methods and a name. */
export function isLayer(value: unknown): value is ILayer {
  if (typeof value !== 'object' || value === null) return false;
  const layer = value as Partial<ILayer>;
  return (
    typeof layer.name === 'string' &&
    typeof layer.init === 'function' &&
    typeof layer.update === 'function' &&
    typeof layer.render === 'function' &&
    typeof layer.resize === 'function' &&
    typeof layer.dispose === 'function'
  );
}

/**
 * Coerce whatever arrived in `config.layers` into a frozen list of layers.
 *
 * Returns `fallback` itself when the contents are unchanged, for the same
 * reason `normalisePalette` does: the engine diffs by identity.
 */
export function normaliseLayers(value: unknown, fallback: readonly ILayer[]): readonly ILayer[] {
  if (!Array.isArray(value)) return fallback;

  const next: ILayer[] = [];
  for (const item of value) {
    if (isLayer(item) && !next.includes(item)) next.push(item);
  }

  if (next.length === fallback.length && next.every((layer, i) => layer === fallback[i])) {
    return fallback;
  }
  return Object.freeze(next);
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
    particles: flag(merged.particles, base.particles),
    amount: isAmount(merged.amount) ? merged.amount : base.amount,
    size: isSize(merged.size) ? merged.size : base.size,
    collisions: Boolean(merged.collisions),
    style: isCircleStyle(merged.style) ? merged.style : base.style,
    palette: normalisePalette(merged.palette, base.palette),
    shape: normaliseShape(merged.shape, base.shape),
    speed: clamp(merged.speed, 0, 20, base.speed),
    drag: clamp(merged.drag, 0, 100, base.drag),
    restitution: clamp(merged.restitution, 0, 1, base.restitution),
    maxCount: Math.round(clamp(merged.maxCount, 1, 20_000, base.maxCount)),
    renderer: isRendererKind(merged.renderer) ? merged.renderer : base.renderer,
    maxDpr: clamp(merged.maxDpr, 1, 4, base.maxDpr),
    seed: merged.seed,
    pointer: flag(merged.pointer, base.pointer),
    layers: normaliseLayers(merged.layers, base.layers),
  };
}

export type { Amount, Size };
// Owned by the theme and shape modules — re-exported here so `IBackgroundConfig`
// and every type it is built from can be imported from one place.
export type { CircleStyle, ICustomPalette, PaletteName, RendererKind, ShapeName };
