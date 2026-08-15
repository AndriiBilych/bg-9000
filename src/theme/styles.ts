/**
 * How a circle is painted, independent of which colours it is painted in.
 *
 * Style and palette are deliberately separate axes: three styles across five
 * palettes is fifteen looks from eight declarations, and neither has to know
 * anything about the other beyond "fill, outline, or both".
 */
import type { IStyleSpec } from '../model/theme/styles.interface.js';

export type CircleStyle = 'see-through' | 'dot' | 'full';

export const STYLES: Readonly<Record<CircleStyle, IStyleSpec>> = {
  // Outline only — the field reads as glass at a distance.
  'see-through': { usesFill: false, usesOutline: true, lineWidth: 1.5 },
  // Fill only — flat, solid, the quietest of the three.
  dot: { usesFill: true, usesOutline: false, lineWidth: 0 },
  // Both, with a thinner stroke: at 1.5 the outline overwhelms a small circle
  // that is already carrying a fill.
  full: { usesFill: true, usesOutline: true, lineWidth: 1.25 },
};

export const STYLE_NAMES: readonly CircleStyle[] = Object.keys(STYLES) as CircleStyle[];

export const DEFAULT_STYLE: CircleStyle = 'see-through';

export function isCircleStyle(value: unknown): value is CircleStyle {
  return typeof value === 'string' && Object.hasOwn(STYLES, value);
}
