import type { IForce, ISceneContext, ParticleStore } from 'bg-9000';

/**
 * The pointer as a vortex.
 *
 * Moving the pointer stirs the swarm: within `radius`, particles are pushed
 * around it tangentially and a little inward, with a smooth falloff so the
 * edge of the influence is invisible. Holding a button tightens the pull and
 * the swarm gathers into a spiral; releasing lets the current carry it away
 * again. Reads `scene.pointer` and nothing else — the whole of the
 * interactivity API.
 */
export class Vortex implements IForce {
  readonly name = 'vortex';

  /** Reach of the vortex, in CSS pixels. */
  radius = 260;
  /** Acceleration around the pointer at its strongest, in CSS px/s². */
  swirl = 420;
  /** Acceleration toward the pointer at its strongest, in CSS px/s². */
  pull = 90;

  apply(store: ParticleStore, scene: ISceneContext): void {
    const { pointer } = scene;
    if (!pointer.active) return;

    const { x, y, fx, fy, mass, count } = store;
    const { radius } = this;
    const radiusSquared = radius * radius;
    const swirl = pointer.down ? this.swirl * 1.4 : this.swirl;
    const pull = pointer.down ? this.pull * 4 : this.pull;
    const pointerX = pointer.x;
    const pointerY = pointer.y;

    for (let i = 0; i < count; i++) {
      const offsetX = x[i] - pointerX;
      const offsetY = y[i] - pointerY;
      const distanceSquared = offsetX * offsetX + offsetY * offsetY;
      if (distanceSquared >= radiusSquared || distanceSquared < 1e-6) continue;

      const distance = Math.sqrt(distanceSquared);
      // Unit vector from the pointer to the particle.
      const towardX = offsetX / distance;
      const towardY = offsetY / distance;
      // Its quarter turn: the direction around the pointer.
      const aroundX = -towardY;
      const aroundY = towardX;

      // Smoothstep from full strength at the pointer to nothing at the edge.
      const closeness = 1 - distance / radius;
      const falloff = closeness * closeness * (3 - 2 * closeness);

      // Accelerations become forces by mass, so every particle turns alike.
      const particleMass = mass[i];
      fx[i] += (aroundX * swirl - towardX * pull) * falloff * particleMass;
      fy[i] += (aroundY * swirl - towardY * pull) * falloff * particleMass;
    }
  }
}
