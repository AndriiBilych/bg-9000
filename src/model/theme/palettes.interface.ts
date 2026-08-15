import type { PaletteName } from '../../theme/palettes.js';

/**
 * A colour scheme.
 *
 * The background, the fills and the outlines travel together because they are
 * only ever correct relative to one another. Several fills and outlines per
 * palette is what gives a field its variation: each circle draws a stable index
 * into these arrays at spawn and keeps it for life.
 */
export interface IPalette {
  readonly name: PaletteName;
  /** Painted across the whole canvas before any circle. */
  readonly background: string;
  readonly fills: readonly string[];
  readonly outlines: readonly string[];
}
