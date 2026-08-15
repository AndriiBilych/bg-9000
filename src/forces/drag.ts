import type { ISceneContext } from '../model/engine/scene-context.interface.js';
import type { IForce } from '../model/forces/force.interface.js';
import type { ParticleStore } from '../layers/particle-field/store.js';

/**
 * Velocity-proportional damping, F = -k·m·v.
 *
 * Off by default — a background wants circles that drift indefinitely, not ones
 * that coast to a halt. Turned up, it gives any other force something to settle
 * against instead of oscillating.
 */
export class Drag implements IForce {
  readonly name = 'drag';

  constructor(public coefficient = 0) {}

  apply(store: ParticleStore, _ctx: ISceneContext): void {
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
