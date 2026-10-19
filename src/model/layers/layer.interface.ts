import type { ISceneContext } from '../engine/scene-context.interface';
import type { IRenderer } from '../render/renderer.interface';

/**
 * Where a layer sits relative to the built-in particle field.
 *
 * `'above'` is the default and what an overlay wants. `'below'` is for anything
 * that should read as backdrop — a slow gradient wash, grid lines, a horizon —
 * with the circles drifting over it.
 */
export type LayerPlacement = 'below' | 'above';

/**
 * The extension seam.
 *
 * The unit of extension is the *effect*, not the particle. A field of drifting
 * circles and a set of sinusoidal lines that react to hover share the engine,
 * clock, renderer and pointer, but they share no data model at all — forcing
 * the second into a `Particle[]` shape would produce something incoherent.
 *
 * `update` must not draw and `render` must not mutate. Keeping that split is
 * what allows the simulation to be stepped without rendering, or run somewhere
 * the renderer cannot reach.
 *
 * A layer is handed to the engine through `config.layers` or `addLayer`, and
 * the engine owns its lifecycle from then on: `init` when it joins the stack,
 * `dispose` when it leaves. The same instance may join again later, so `init`
 * must be safe to call after `dispose`.
 */
export interface ILayer {
  readonly name: string;

  /** Defaults to `'above'`. Read once, when the layer joins the stack. */
  readonly placement?: LayerPlacement;

  init(ctx: ISceneContext): void;

  /** Advance the simulation by `ctx.dt`. No drawing. */
  update(ctx: ISceneContext): void;

  /** Draw the current state. No mutation. */
  render(renderer: IRenderer, ctx: ISceneContext): void;

  /** The surface changed size. Previous dimensions are given for rescaling. */
  resize(ctx: ISceneContext, prevWidth: number, prevHeight: number): void;

  dispose(): void;
}
