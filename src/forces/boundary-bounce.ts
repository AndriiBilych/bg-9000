import type { SceneContext } from '../engine/scene-context.js';
import type { ParticleStore } from '../layers/particle-field/store.js';
import type { Constraint } from './force.js';

/**
 * Keeps every circle fully inside the viewport.
 *
 * Two details matter, and the obvious implementation gets both wrong:
 *
 *   1. The test is symmetric — radius is accounted for on all four edges, not
 *      only the right and bottom.
 *   2. Velocity is reversed only when the particle is actually travelling
 *      *outward*. Flipping on position alone traps anything that starts beyond
 *      the boundary by more than one step: it reverses, moves one step in, is
 *      still outside, reverses again, and vibrates in place forever.
 *
 * Position is also clamped to the wall, so a particle can never accumulate
 * overshoot regardless of how large a step it took.
 */
export class BoundaryBounce implements Constraint {
  readonly name = 'boundary-bounce';

  constructor(public restitution = 1) {}

  resolve(store: ParticleStore, ctx: SceneContext): void {
    const { x, y, vx, vy, radius, count } = store;
    const { width, height } = ctx;
    const e = this.restitution;

    for (let i = 0; i < count; i++) {
      const r = radius[i];

      const maxX = width - r;
      if (maxX <= r) {
        // Circle is wider than the viewport; park it and stop the axis.
        x[i] = width * 0.5;
        vx[i] = 0;
      } else if (x[i] < r) {
        x[i] = r;
        if (vx[i] < 0) vx[i] = -vx[i] * e;
      } else if (x[i] > maxX) {
        x[i] = maxX;
        if (vx[i] > 0) vx[i] = -vx[i] * e;
      }

      const maxY = height - r;
      if (maxY <= r) {
        y[i] = height * 0.5;
        vy[i] = 0;
      } else if (y[i] < r) {
        y[i] = r;
        if (vy[i] < 0) vy[i] = -vy[i] * e;
      } else if (y[i] > maxY) {
        y[i] = maxY;
        if (vy[i] > 0) vy[i] = -vy[i] * e;
      }
    }
  }
}
