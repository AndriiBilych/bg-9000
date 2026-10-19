import type { ParticleStore } from '../../layers/particle-field/store';
import type { IShape } from '../shapes/shape.interface';
import type { IGLFrame } from './gl-frame.interface';

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
 * `drawImmediate` and `drawImmediateGL` are where that rule bends, on purpose
 * and with the cost stated. Each is optional: a renderer offers the ones it can
 * honour, and `defineLayer` picks whichever the layer and the renderer share.
 */
export interface IRenderer {
  readonly kind: string;

  /** Clear, or paint the canvas background colour. */
  beginFrame(background: string | null): void;

  /**
   * Draw every particle in each group as `shape`, in the group's colours.
   * Throws on a shape with neither `trace` nor `draw`. A renderer that cannot
   * run one of the two degrades rather than throws — the WebGL renderer draws
   * a `draw`-only shape as circles and says so on the console.
   */
  drawShapeGroups(store: ParticleStore, groups: readonly IDrawGroup[], shape: IShape): void;

  /**
   * @deprecated Alias for `drawShapeGroups(store, groups, SHAPES.circle)`,
   * kept so a renderer call written against 0.1 still compiles. Removed in 0.2.
   */
  drawCircleGroups(store: ParticleStore, groups: readonly IDrawGroup[]): void;

  /**
   * Immediate-mode escape hatch for custom layers. The callback receives a
   * 2D context in CSS pixels; the renderer saves and restores state around it,
   * so a layer cannot leak a `fillStyle` into the field's draw calls.
   *
   * On the WebGL renderer the context belongs to an offscreen overlay canvas
   * that is uploaded and composited, in order, before the next GL draw. That
   * costs a texture upload per frame in which a 2D layer drew — correct and
   * drop-in, but not the fast path; `drawImmediateGL` is.
   */
  drawImmediate?(draw: (ctx: CanvasRenderingContext2D) => void): void;

  /**
   * Immediate-mode escape hatch onto the GL context, for layers that are
   * shaders. Absent on Canvas2D. Before the callback the renderer puts the
   * context in a known state — full viewport, premultiplied blending on,
   * stencil/depth/scissor off, no vertex array bound — and it assumes nothing
   * about the state afterwards, so the callback need not tidy up.
   */
  drawImmediateGL?(draw: (gl: WebGL2RenderingContext, frame: IGLFrame) => void): void;

  endFrame(): void;

  dispose(): void;
}
