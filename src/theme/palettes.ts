/**
 * The colour schemes.
 *
 * A palette is three things travelling together — the canvas background, the
 * circle fills, and the circle outlines — because they are only ever correct
 * relative to one another. Letting a caller mix a background from one scheme
 * with outlines from another is the fastest route to something illegible, so
 * the unit of choice is the whole palette.
 */
import type { ICustomPalette, IPalette } from '../model/theme/palettes.interface';
import { isColour } from './colour';

export type PaletteName = 'midnight' | 'blossom' | 'mint' | 'dusk' | 'ember';

/** What a resolved palette calls itself: one of the five, or custom. */
export type PaletteId = PaletteName | 'custom';

export const PALETTES: Readonly<Record<PaletteName, IPalette>> = {
  midnight: {
    name: 'midnight',
    background: '#0D1B2A',
    fills: ['#1B3A5C', '#255D78', '#2E7D8F'],
    outlines: ['#7DD3D8', '#A0E7E5'],
  },
  blossom: {
    name: 'blossom',
    background: '#FDF2F4',
    fills: ['#F9C8D0', '#F7B2C4', '#EFD3E0'],
    outlines: ['#E08FA8', '#D1789A'],
  },
  mint: {
    name: 'mint',
    background: '#F2FAF6',
    fills: ['#C7ECD9', '#A8E0C8', '#D9F2E6'],
    outlines: ['#5FB894', '#7FC9AA'],
  },
  dusk: {
    name: 'dusk',
    background: '#151226',
    fills: ['#2E2450', '#413066', '#57407F'],
    outlines: ['#B9A5F0', '#D3C4FF'],
  },
  ember: {
    name: 'ember',
    background: '#1A1114',
    fills: ['#4A2328', '#6B3239', '#8C4249'],
    outlines: ['#F2A68F', '#FFC9A8'],
  },
};

export const PALETTE_NAMES: readonly PaletteName[] = Object.keys(PALETTES) as PaletteName[];

/** Chosen to sit on the portfolio site's light page. */
export const DEFAULT_PALETTE: PaletteName = 'mint';

export function isPaletteName(value: unknown): value is PaletteName {
  return typeof value === 'string' && Object.hasOwn(PALETTES, value);
}

/**
 * How many colour variants a custom palette expands to.
 *
 * Every stock palette resolves to three, and a change in that number is the one
 * thing `ParticleField` cannot repaint its way out of — it respawns the field,
 * and every circle jumps. Matching the stock count keeps a custom palette a
 * repaint like any other, at the cost of three draw calls painting one colour
 * where one would do. `theme.test.ts` holds this equal to the stock count.
 */
export const CUSTOM_VARIANTS = 3;

export function isCustomPalette(value: unknown): value is ICustomPalette {
  if (typeof value !== 'object' || value === null) return false;
  const { background, fill, outline } = value as Partial<ICustomPalette>;
  // All three or none: a palette is only ever correct as a unit, so half a
  // custom scheme falls back rather than mixing with the default's other half.
  return isColour(background) && isColour(fill) && isColour(outline);
}

/** Widen a caller's three colours into the array shape the resolver expects. */
export function expandCustomPalette(palette: ICustomPalette): IPalette {
  return Object.freeze({
    name: 'custom' as const,
    background: palette.background,
    fills: Object.freeze(new Array<string>(CUSTOM_VARIANTS).fill(palette.fill)),
    outlines: Object.freeze(new Array<string>(CUSTOM_VARIANTS).fill(palette.outline)),
  });
}

function sameCustomPalette(a: ICustomPalette, b: ICustomPalette): boolean {
  return a.background === b.background && a.fill === b.fill && a.outline === b.outline;
}

/**
 * Coerce whatever arrived in `config.palette` into a name or a valid custom set.
 *
 * Handing back `fallback` itself for an unchanged custom palette is load-bearing
 * rather than a micro-optimisation: the engine re-resolves the theme on
 * `config.palette !== previous.palette`, and the field repaints on
 * `theme !== previous.theme`. Both are identity checks. A caller pushing a fresh
 * object literal on every input event — which is exactly what a colour picker
 * does — would otherwise rebuild the draw groups on every frame of a drag.
 */
export function normalisePalette(
  value: unknown,
  fallback: PaletteName | ICustomPalette,
): PaletteName | ICustomPalette {
  if (isPaletteName(value)) return value;
  if (!isCustomPalette(value)) return fallback;

  const next: ICustomPalette = Object.freeze({
    background: value.background.trim(),
    fill: value.fill.trim(),
    outline: value.outline.trim(),
  });

  if (typeof fallback === 'object' && sameCustomPalette(fallback, next)) return fallback;
  return next;
}
