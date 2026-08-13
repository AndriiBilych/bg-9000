import type { SceneContext } from '../engine/scene-context.js';
import type { Renderer } from '../render/renderer.js';

/**
 * The extension seam.
 *
 * The unit of extension is the *effect*, not the particle. A field of drifting
 * circles and a set of sinusoidal lines that react to hover share the engine,
 * clock, renderer and pointer, but they share no data model at all — forcing
 * the second into a `Particle[]` shape would produce something incoherent.
 *
 * `update` must not draw and `render` must not mutate. Keeping that split is
 * what allows the simulation to be stepped without rendering (or eventually
 * moved off the main thread).
 */
export interface Layer {
  readonly name: string;

  init(ctx: SceneContext): void;

  /** Advance the simulation by `ctx.dt`. No drawing. */
  update(ctx: SceneContext): void;

  /** Draw the current state. No mutation. */
  render(renderer: Renderer, ctx: SceneContext): void;

  /** The surface changed size. Previous dimensions are given for rescaling. */
  resize(ctx: SceneContext, prevWidth: number, prevHeight: number): void;

  dispose(): void;
}
