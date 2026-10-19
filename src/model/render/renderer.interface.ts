import type { ParticleStore } from '../../layers/particle-field/store';
import type { IShape } from '../shapes/shape.interface';

/**
 * A contiguous run of particles sharing one fill and stroke.
 *
 * Particles are laid out sorted by colour at spawn and nothing reorders them
 * afterwards, so a "group" is just an index range — no per-frame sorting, and
 * one fill call covers a hundred circles instead of one covering each.
 */
export interface IDrawGroup {
  /** Inclusive. */
  start: number;
  /** Exclusive. */
  end: number;
  fill: string | null;
  stroke: string | null;
  lineWidth: number;
}

/**
 * The rendering surface, deliberately batch-shaped.
 *
 * Every method takes many primitives at once. A per-primitive interface
 * (`drawCircle(x, y, r)`) cannot be implemented efficiently on top of WebGL,
 * where the whole point is uploading arrays and issuing one instanced call. No
 * backend swap recovers from getting that shape wrong.
 *
 * `drawImmediate` is where that rule bends, on purpose and with the cost
 * stated. A backend that cannot honour it leaves it out, and a custom layer
 * draws nothing there.
 */
export interface IRenderer {
  readonly kind: string;

  /** Clear, or paint the canvas background colour. */
  beginFrame(background: string | null): void;

  /**
   * Draw every particle in each group as `shape`, in the group's colours.
   * Throws if the shape cannot be drawn on this backend.
   */
  drawShapeGroups(store: ParticleStore, groups: readonly IDrawGroup[], shape: IShape): void;

  /**
   * @deprecated Alias for `drawShapeGroups(store, groups, SHAPES.circle)`,
   * kept so a renderer call written against 0.1 still compiles. Removed in 0.2.
   */
  drawCircleGroups(store: ParticleStore, groups: readonly IDrawGroup[]): void;

  /**
   * Immediate-mode escape hatch for custom layers. The callback receives the
   * 2D context in CSS pixels; the renderer saves and restores state around it,
   * so a layer cannot leak a `fillStyle` into the field's draw calls.
   */
  drawImmediate?(draw: (ctx: CanvasRenderingContext2D) => void): void;

  endFrame(): void;

  dispose(): void;
}
