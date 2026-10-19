import type { ISceneContext } from '../engine/scene-context.interface';
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

  resize?(scene: ISceneContext, prevWidth: number, prevHeight: number): void;

  dispose?(): void;
}
