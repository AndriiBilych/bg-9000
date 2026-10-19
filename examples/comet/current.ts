import type { IForce, ISceneContext, ParticleStore } from 'bg-9000';

/**
 * A slow current for the swarm to ride.
 *
 * The current is a velocity field: at every point on the canvas it says
 * which way the water flows and how fast. It is built so that the swarm is
 * stirred into eddies and streams rather than piling up anywhere, which
 * means the field must be divergence-free — as much flows out of every
 * region as flows in. The standard way to get such a field in 2D is to take
 * the *curl* of a scalar "stream function":
 *
 *     flowX =  d(stream) / dy
 *     flowY = -d(stream) / dx
 *
 * The stream function here is a sum of three sine-cosine ripples at
 * different wavelengths — a broad one, a medium one and a fine one, each
 * contributing less than the last — drifting slowly with time so the eddies
 * wander. Because the ripples are products of a sine in x and a cosine in y,
 * both partial derivatives are available in closed form: differentiating
 * a sine gives a cosine, and differentiating a cosine gives minus a sine.
 * (Each derivative also carries a factor of the ripple's frequency; it is
 * dropped, since it only rescales the speed, which `baseSpeed` sets
 * directly.)
 *
 * The force does not set velocity outright. It steers: the particle is
 * pulled toward the current's velocity in proportion to how far off it is,
 * like a spring on velocity. Scaling that by mass makes a bright head and a
 * faint mote answer the current alike, since the integrator divides by mass
 * again; size is a matter of brightness here, not of inertia.
 */
export class Current implements IForce {
  readonly name = 'current';

  /** Multiplier on the current's speed; the page's "Current" slider. */
  strength = 1;

  /** How hard a particle is steered toward the current, per second. */
  private readonly steering = 1.6;

  /** Speed of the current before `strength`, in CSS pixels per second. */
  private readonly baseSpeed = 38;

  apply(store: ParticleStore, scene: ISceneContext): void {
    const { x, y, vx, vy, fx, fy, mass, count } = store;
    const { width, height, time } = scene;

    // Wavelengths are fractions of the longer canvas side, so the eddies
    // look the same size on a phone and a monitor.
    const longestSide = Math.max(width, height);
    const broadFrequency = (Math.PI * 2) / (longestSide * 0.55);
    const mediumFrequency = (Math.PI * 2) / (longestSide * 0.31);
    const fineFrequency = (Math.PI * 2) / (longestSide * 0.17);

    // Each ripple drifts at its own pace so the pattern never repeats.
    const slowDrift = time * 0.11;
    const slowerDrift = time * 0.07;
    const quickDrift = time * 0.19;

    const speed = this.baseSpeed * this.strength;
    const steering = this.steering;

    for (let i = 0; i < count; i++) {
      const particleX = x[i];
      const particleY = y[i];

      // The three ripples, each a sine along x times a cosine along y, and
      // the pieces their derivatives need.
      const broadSinX = Math.sin(broadFrequency * particleX + slowDrift);
      const broadCosX = Math.cos(broadFrequency * particleX + slowDrift);
      const broadSinY = Math.sin(broadFrequency * particleY - slowerDrift);
      const broadCosY = Math.cos(broadFrequency * particleY - slowerDrift);

      const mediumSinX = Math.sin(mediumFrequency * particleX - quickDrift);
      const mediumCosX = Math.cos(mediumFrequency * particleX - quickDrift);
      const mediumSinY = Math.sin(mediumFrequency * particleY + slowDrift);
      const mediumCosY = Math.cos(mediumFrequency * particleY + slowDrift);

      const fineSinX = Math.sin(fineFrequency * particleX + slowerDrift);
      const fineCosX = Math.cos(fineFrequency * particleX + slowerDrift);
      const fineSinY = Math.sin(fineFrequency * particleY + quickDrift);
      const fineCosY = Math.cos(fineFrequency * particleY + quickDrift);

      // stream = broadSinX·broadCosY + ½·mediumSinX·mediumCosY + ¼·fineSinX·fineCosY
      // d(stream)/dy: the cosine in y becomes minus the sine in y.
      const streamSlopeY = -(broadSinX * broadSinY) - 0.5 * (mediumSinX * mediumSinY) - 0.25 * (fineSinX * fineSinY);
      // d(stream)/dx: the sine in x becomes the cosine in x.
      const streamSlopeX = broadCosX * broadCosY + 0.5 * (mediumCosX * mediumCosY) + 0.25 * (fineCosX * fineCosY);

      // The curl: flow along x follows the slope in y, and flow along y
      // follows minus the slope in x.
      const flowX = streamSlopeY * speed;
      const flowY = -streamSlopeX * speed;

      const particleMass = mass[i];
      fx[i] += (flowX - vx[i]) * steering * particleMass;
      fy[i] += (flowY - vy[i]) * steering * particleMass;
    }
  }
}
