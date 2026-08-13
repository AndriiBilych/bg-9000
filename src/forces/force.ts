import type { SceneContext } from '../engine/scene-context.js';
import type { ParticleStore } from '../layers/particle-field/store.js';

/**
 * The simulation runs in two phases, and it is worth being explicit about why.
 *
 *   forces → integrate → constraints
 *
 * A *force* contributes acceleration: pointer attraction, repulsion, drag,
 * noise, and whatever a consumer supplies. Forces compose by summation, so
 * order does not matter and any number can coexist.
 *
 * A *constraint* corrects position and velocity after integration: walls,
 * circle-to-circle contact, and later a grabbed particle pinned to the cursor.
 * These cannot be expressed as forces without becoming springs, and springy
 * walls let fast particles escape the viewport entirely.
 *
 * The plan described a single force accumulator holding both. Splitting them is
 * the same amount of code and does not lie about what boundary bouncing is.
 */
export interface Force {
  readonly name: string;
  /** Add to `store.fx` / `store.fy`. Never write position or velocity. */
  apply(store: ParticleStore, ctx: SceneContext): void;
}

export interface Constraint {
  readonly name: string;
  /** Correct `store.x/y` and `store.vx/vy` in place. */
  resolve(store: ParticleStore, ctx: SceneContext): void;
}
