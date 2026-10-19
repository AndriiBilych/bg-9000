import type { ICustomPalette, IPalette } from '../model/theme/palettes.interface';
import type { IColourVariant, ITheme } from '../model/theme/theme.interface';
import {
  PALETTES,
  expandCustomPalette,
  isCustomPalette,
  type PaletteName,
} from './palettes';
import { STYLES, type CircleStyle } from './styles';

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

// Fifteen combinations of stock palette and style exist in total and every one
// of them is immutable, so resolution happens at most fifteen times per process.
// Colours never resolve per frame, and after the first switch they do not
// resolve per config change either.
//
// Custom palettes are deliberately left out. Keying them by their colours is
// what a cache would have to do, and an app driving a colour picker would then
// grow this map without bound. Resolving one afresh builds four small objects,
// and `normalisePalette` already keeps the engine from asking twice for a
// palette that has not actually changed.
const cache = new Map<string, ITheme>();

/** Resolve a palette and style into flat, render-ready colours. */
export function resolveTheme(
  palette: PaletteName | ICustomPalette,
  style: CircleStyle,
): ITheme {
  if (isCustomPalette(palette)) return build(expandCustomPalette(palette), style);

  const key = `${palette}:${style}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const theme = build(PALETTES[palette], style);
  cache.set(key, theme);
  return theme;
}

function build(scheme: IPalette, style: CircleStyle): ITheme {
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

  return Object.freeze({
    palette: scheme.name,
    style,
    background: scheme.background,
    variants: Object.freeze(variants),
  });
}
