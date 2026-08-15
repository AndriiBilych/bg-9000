import type { IPalette } from '../model/theme/palettes.interface.js';
import type { IColourVariant, ITheme } from '../model/theme/theme.interface.js';
import { PALETTES, type PaletteName } from './palettes.js';
import { STYLES, type CircleStyle } from './styles.js';

/**
 * How many colour variants a palette offers, independent of style.
 *
 * Deliberately not per-style. If `see-through` (which only needs the outlines)
 * produced fewer variants than `full`, then toggling style would change the
 * number of colour runs and force a respawn — the whole field would jump for
 * what should be a repaint. Holding the count at the palette's widest array
 * makes style a pure repaint; the cost is that a style using the shorter array
 * repeats a colour across two runs, which is two path calls where one would do.
 */
export function variantCount(palette: IPalette): number {
  return Math.max(palette.fills.length, palette.outlines.length);
}

// Fifteen combinations exist in total and every one of them is immutable, so
// resolution happens at most fifteen times per process. Colours never resolve
// per frame, and after the first switch they do not resolve per config change
// either.
const cache = new Map<string, ITheme>();

/** Resolve a palette and style into flat, render-ready colours. */
export function resolveTheme(palette: PaletteName, style: CircleStyle): ITheme {
  const key = `${palette}:${style}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const scheme = PALETTES[palette];
  const spec = STYLES[style];
  const count = variantCount(scheme);

  const variants: IColourVariant[] = [];
  for (let i = 0; i < count; i++) {
    variants.push(
      Object.freeze({
        fill: spec.usesFill ? scheme.fills[i % scheme.fills.length] : null,
        stroke: spec.usesOutline ? scheme.outlines[i % scheme.outlines.length] : null,
        lineWidth: spec.lineWidth,
      }),
    );
  }

  const theme: ITheme = Object.freeze({
    palette,
    style,
    background: scheme.background,
    variants: Object.freeze(variants),
  });

  cache.set(key, theme);
  return theme;
}
