import type { PaletteId } from '../../theme/palettes';

/**
 * A colour scheme.
 *
 * The background, the fills and the outlines travel together because they are
 * only ever correct relative to one another. Several fills and outlines per
 * palette is what gives a field its variation: each circle draws a stable index
 * into these arrays at spawn and keeps it for life.
 */
export interface IPalette {
  readonly name: PaletteId;
  /** Painted across the whole canvas before any circle. */
  readonly background: string;
  readonly fills: readonly string[];
  readonly outlines: readonly string[];
}

/**
 * A palette supplied by the caller, as three colours — one per role.
 *
 * Narrower than `IPalette` on purpose. The arrays exist to give a field its
 * variation, and picking a set of colours that vary well together is the part
 * that is easy to get wrong; asking for one of each keeps a custom scheme
 * something you can get right in three lines. It is expanded into a full
 * `IPalette` on the way in — see `expandCustomPalette`.
 *
 * Any CSS colour the canvas accepts will do: hex, `rgb()`, `hsl()`, or a
 * keyword.
 */
export interface ICustomPalette {
  readonly background: string;
  readonly fill: string;
  readonly outline: string;
}
