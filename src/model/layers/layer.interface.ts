import type { ISceneContext } from '../engine/scene-context.interface.js';
import type { IRenderer } from '../render/renderer.interface.js';

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
 */
export interface ILayer {
  readonly name: string;

  init(ctx: ISceneContext): void;

  /** Advance the simulation by `ctx.dt`. No drawing. */
  update(ctx: ISceneContext): void;

  /** Draw the current state. No mutation. */
  render(renderer: IRenderer, ctx: ISceneContext): void;

  /** The surface changed size. Previous dimensions are given for rescaling. */
  resize(ctx: ISceneContext, prevWidth: number, prevHeight: number): void;

  dispose(): void;
}
