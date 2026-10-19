import type { ParticleStore } from '../../layers/particle-field/store';
import type { IColourVariant } from '../theme/theme.interface';

/**
 * What one particle looks like — the one place geometry lives. Spawn, forces,
 * collisions and colour never know which glyph is in use.
 *
 * Two contracts, and the trade between them is the reason there are two:
 *
 *   - **`trace`** adds the outline to a path that is already open. One path
 *     per colour run, filled and stroked once — a field of stars costs what a
 *     field of circles costs. Every built-in uses this.
 *   - **`draw`** paints the particle itself, one fill per particle. The escape
 *     hatch for what a single path cannot express: sprites, text, gradients,
 *     several colours in one glyph.
 *
 * When both are present, `trace` wins. In both, `(x, y)` is the centre and
 * `r` the **circumradius**: contacts and wall bounces resolve against the
 * circle of radius `r`, so the glyph must fit inside it.
 */
export interface IShape {
  readonly name: string;

  /**
   * Add this particle's outline to `path`. Begin with a `moveTo` — the path
   * already holds the previous particle, and without one the two are joined by
   * a line. Do not fill, stroke, or change any context state.
   */
  trace?(path: CanvasPath, x: number, y: number, r: number, i: number, store: ParticleStore): void;

  /**
   * Paint this particle. `fillStyle`, `strokeStyle` and `lineWidth` are already
   * set from `variant`; a `null` fill or stroke means the current style omits
   * it. Context state is saved and restored around each colour run, not around
   * each particle, so anything set here is visible to the next particle.
   */
  draw?(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    variant: IColourVariant,
    i: number,
    store: ParticleStore,
  ): void;
}

/** The part of a shape the caller writes; `defineShape` adds the name. */
export type IShapeDefinition = Pick<IShape, 'trace' | 'draw'>;
