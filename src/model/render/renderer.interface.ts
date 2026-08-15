import type { ParticleStore } from '../../layers/particle-field/store.js';

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
 */
export interface IRenderer {
  readonly kind: string;

  /** Clear, or paint the canvas background colour. */
  beginFrame(background: string | null): void;

  drawCircleGroups(store: ParticleStore, groups: readonly IDrawGroup[]): void;

  endFrame(): void;

  dispose(): void;
}
