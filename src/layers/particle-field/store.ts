/**
 * Structure-of-arrays particle storage.
 *
 * An array of objects would be friendlier to read, but it costs a pointer
 * dereference per particle per field per frame, plus GC pressure from the
 * objects themselves. Flat typed arrays keep the hot loops linear over memory,
 * and being transferable they can cross a worker boundary without a copy.
 *
 * Capacity is fixed at construction. Nothing here allocates per frame.
 */
export class ParticleStore {
  count = 0;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** Force accumulators, zeroed at the top of every step. */
  readonly fx: Float32Array;
  readonly fy: Float32Array;
  readonly radius: Float32Array;
  readonly mass: Float32Array;
  readonly invMass: Float32Array;
  /** Index into the resolved palette. Assigned at spawn, never changes. */
  readonly colour: Uint16Array;

  constructor(readonly capacity: number) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.fx = new Float32Array(capacity);
    this.fy = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.mass = new Float32Array(capacity);
    this.invMass = new Float32Array(capacity);
    this.colour = new Uint16Array(capacity);
  }

  clear(): void {
    this.count = 0;
  }

  /**
   * Append a particle. Mass is proportional to r², so large circles shoulder
   * small ones aside instead of everything behaving identically on contact.
   *
   * @returns the new particle's index, or -1 if the store is full.
   */
  add(x: number, y: number, vx: number, vy: number, radius: number, colour: number): number {
    if (this.count >= this.capacity) return -1;

    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.fx[i] = 0;
    this.fy[i] = 0;
    this.radius[i] = radius;

    const mass = radius * radius;
    this.mass[i] = mass;
    this.invMass[i] = 1 / mass;
    this.colour[i] = colour;

    return i;
  }

  clearForces(): void {
    this.fx.fill(0, 0, this.count);
    this.fy.fill(0, 0, this.count);
  }

  /** Largest radius present, used to size the collision grid. */
  maxRadius(): number {
    let max = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.radius[i] > max) max = this.radius[i];
    }
    return max;
  }
}
