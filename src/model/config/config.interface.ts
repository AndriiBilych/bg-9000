import type { RendererKind } from '../../render/renderer-kind';
import type { ShapeName } from '../../shapes/shapes';
import type { PaletteName } from '../../theme/palettes';
import type { CircleStyle } from '../../theme/styles';
import type { Amount, Size } from '../../util/scalars';
import type { ILayer } from '../layers/layer.interface';
import type { IShape } from '../shapes/shape.interface';
import type { ICustomPalette } from '../theme/palettes.interface';

export interface IBackgroundConfig {
  // --- the particle field ------------------------------------------------
  // These describe the built-in field of drifting shapes and nothing else. A
  // custom layer may read them through `scene.config` to stay in vocabulary
  // with the rest of the page, but the engine never interprets them for it.

  /** Whether the built-in field is in the stack at all. Off removes the layer. */
  particles: boolean;
  amount: Amount;
  size: Size;
  /** Circle-to-circle contact. Off removes the stage from the pipeline. */
  collisions: boolean;
  /** Fill, outline, or both. */
  style: CircleStyle;
  /**
   * Background, fills and outlines, chosen as a set — one of the five stock
   * names, or three custom colours.
   */
  palette: PaletteName | ICustomPalette;
  /** What each particle looks like: one of the built-in names, or a custom shape. */
  shape: ShapeName | IShape;
  /** Multiplier on drift velocity. */
  speed: number;
  /** Velocity damping. 0 disables the force entirely. */
  drag: number;
  /** Fraction of velocity retained on a wall bounce. */
  restitution: number;
  /** Hard ceiling on particle count, whatever the density says. */
  maxCount: number;

  // --- the engine ----------------------------------------------------------

  /**
   * Which renderer draws the canvas. `canvas2d` is the default; `webgl` draws
   * the same scene through WebGL2 and falls back to `canvas2d` (with an error
   * on the console) where WebGL2 is unavailable. Read once, at creation: a
   * canvas holds one kind of context for life, so a later `update` cannot
   * change it.
   */
  renderer: RendererKind;
  /** Device pixel ratio ceiling. 2 is plenty for a soft background. */
  maxDpr: number;
  /** Fixed seed reproduces a layout exactly; omit for a random one. */
  seed?: number;
  /**
   * Track the pointer on `window` and publish it as `scene.pointer`. Off means
   * no listeners are attached at all and the pointer reads as inert.
   */
  pointer: boolean;
  /**
   * Custom layers, in draw order. Each sits above or below the field per its
   * `placement`. The engine owns their lifecycle: a layer that appears here is
   * initialised, one that disappears is disposed.
   */
  layers: readonly ILayer[];
}
