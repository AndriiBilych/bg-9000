import type { PaletteName } from '../../theme/palettes.js';
import type { CircleStyle } from '../../theme/styles.js';

/**
 * One resolved appearance: everything the renderer needs for a run of circles,
 * with no lookup left to do.
 *
 * `null` means "do not paint this at all" rather than "paint it transparent" —
 * a transparent fill still costs a full `fill()` call over the path.
 */
export interface IColourVariant {
  readonly fill: string | null;
  readonly stroke: string | null;
  readonly lineWidth: number;
}

export interface ITheme {
  readonly palette: PaletteName;
  readonly style: CircleStyle;
  /** Canvas background. Painted once per frame, before the circles. */
  readonly background: string;
  /**
   * Indexed by a particle's stable colour index. Rendering draws one path per
   * variant, so this length is also the number of draw calls per frame.
   */
  readonly variants: readonly IColourVariant[];
}
