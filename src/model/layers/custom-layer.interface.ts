import type { ISceneContext } from '../engine/scene-context.interface';
import type { IGLFrame } from '../render/gl-frame.interface';
import type { LayerPlacement } from './layer.interface';

/**
 * A layer written against the 2D context directly.
 *
 * `ILayer` draws through `IRenderer`, which is batch-shaped on purpose and has
 * no "give me the context" call. That is the right contract for the field and
 * the wrong one for a page that wants a sine wave under its hero copy. This is
 * the same lifecycle with `render` handed a `CanvasRenderingContext2D` in CSS
 * pixels, state saved and restored around it, and every hook optional.
 *
 * `renderGL` is the same idea for the WebGL renderer. A layer may carry either
 * hook or both: on WebGL `renderGL` is used when present and `render` is
 * composited through an overlay otherwise; on Canvas2D only `render` runs.
 *
 * `defineLayer` turns one of these into an `ILayer`.
 */
export interface ILayerDefinition {
  readonly placement?: LayerPlacement;

  init?(scene: ISceneContext): void;

  /** Advance by `scene.dt`. No drawing. */
  update?(scene: ISceneContext): void;

  /**
   * Draw. The context is in CSS pixels with the DPR transform applied; the
   * palette background has already been painted. State is restored afterwards,
   * so there is no need to undo a `fillStyle` or `globalAlpha` here.
   */
  render?(ctx: CanvasRenderingContext2D, scene: ISceneContext): void;

  /**
   * Draw on the WebGL renderer. `frame` carries the projection, the size and
   * helpers for programs, full-screen quads and frame-sized textures. GL state
   * is reset before the call and assumed clobbered after it.
   */
  renderGL?(gl: WebGL2RenderingContext, scene: ISceneContext, frame: IGLFrame): void;

  resize?(scene: ISceneContext, prevWidth: number, prevHeight: number): void;

  dispose?(): void;
}
