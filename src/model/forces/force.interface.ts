import type { ParticleStore } from '../../layers/particle-field/store.js';
import type { ISceneContext } from '../engine/scene-context.interface.js';

/**
 * The simulation runs in two phases, and it is worth being explicit about why.
 *
 *   forces → integrate → constraints
 *
 * A *force* contributes acceleration: pointer attraction, repulsion, drag,
 * noise, and whatever a consumer supplies. Forces compose by summation, so
 * order does not matter and any number can coexist.
 *
 * A *constraint* corrects position and velocity after integration: walls and
 * circle-to-circle contact. These cannot be expressed as forces without
 * becoming springs, and springy walls let fast particles escape the viewport
 * entirely.
 */
export interface IForce {
  readonly name: string;
  /** Add to `store.fx` / `store.fy`. Never write position or velocity. */
  apply(store: ParticleStore, ctx: ISceneContext): void;
}

export interface IConstraint {
  readonly name: string;
  /** Correct `store.x/y` and `store.vx/vy` in place. */
  resolve(store: ParticleStore, ctx: ISceneContext): void;
}
