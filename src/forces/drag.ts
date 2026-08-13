import type { SceneContext } from '../engine/scene-context.js';
import type { ParticleStore } from '../layers/particle-field/store.js';
import type { Force } from './force.js';

/**
 * Velocity-proportional damping, F = -k·m·v.
 *
 * Off by default — a background wants circles that drift indefinitely, not ones
 * that coast to a halt. It exists mainly so that pointer forces, once they
 * arrive, have something to settle against.
 */
export class Drag implements Force {
  readonly name = 'drag';

  constructor(public coefficient = 0) {}

  apply(store: ParticleStore, _ctx: SceneContext): void {
    const k = this.coefficient;
    if (k <= 0) return;

    const { fx, fy, vx, vy, mass, count } = store;
    for (let i = 0; i < count; i++) {
      const km = k * mass[i];
      fx[i] -= vx[i] * km;
      fy[i] -= vy[i] * km;
    }
  }
}
