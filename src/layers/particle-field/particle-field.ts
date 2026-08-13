import type { SceneContext } from '../../engine/scene-context.js';
import { BoundaryBounce } from '../../forces/boundary-bounce.js';
import { Drag } from '../../forces/drag.js';
import type { Constraint, Force } from '../../forces/force.js';
import type { DrawGroup, Renderer } from '../../render/renderer.js';
import type { Amount, Size } from '../../util/scalars.js';
import type { Layer } from '../layer.js';
import { spawnField } from './spawn.js';
import { ParticleStore } from './store.js';

/** Placeholder appearance until the theme system lands in M2. */
const PLACEHOLDER_STROKE = 'rgba(122, 146, 155, 0.55)';

export interface ParticleFieldOptions {
  amount: Amount;
  size: Size;
  speed: number;
  drag: number;
  maxCount: number;
  restitution: number;
}

/**
 * A field of drifting circles.
 *
 * Rebuilding the field is cheap, but doing it on every resize event makes a
 * window drag look like a slideshow. Instead positions are rescaled
 * proportionally on every resize, and a full respawn happens only once the area
 * has drifted far enough from the area the current count was chosen for.
 */
const REBUILD_AREA_RATIO = 1.3;

export class ParticleField implements Layer {
  readonly name = 'particle-field';

  private readonly store: ParticleStore;
  private readonly forces: Force[] = [];
  private readonly constraints: Constraint[] = [];
  private readonly drag = new Drag(0);
  private readonly boundary = new BoundaryBounce(1);

  private groups: DrawGroup[] = [];
  private builtForArea = 0;

  constructor(private options: ParticleFieldOptions) {
    this.store = new ParticleStore(options.maxCount);
    this.drag.coefficient = options.drag;
    this.boundary.restitution = options.restitution;

    this.forces.push(this.drag);
    this.constraints.push(this.boundary);
  }

  init(ctx: SceneContext): void {
    this.rebuild(ctx);
  }

  /** Apply an options patch, rebuilding only when the change requires it. */
  configure(options: ParticleFieldOptions, ctx: SceneContext): void {
    const previous = this.options;
    this.options = options;
    this.drag.coefficient = options.drag;
    this.boundary.restitution = options.restitution;

    const needsRebuild =
      options.amount !== previous.amount ||
      options.size !== previous.size ||
      options.maxCount !== previous.maxCount;

    if (needsRebuild) {
      this.rebuild(ctx);
      return;
    }

    if (options.speed !== previous.speed && previous.speed > 0) {
      const ratio = options.speed / previous.speed;
      const { vx, vy, count } = this.store;
      for (let i = 0; i < count; i++) {
        vx[i] *= ratio;
        vy[i] *= ratio;
      }
    }
  }

  update(ctx: SceneContext): void {
    const store = this.store;
    const { dt } = ctx;
    if (dt <= 0) return;

    store.clearForces();
    for (const force of this.forces) force.apply(store, ctx);

    const { x, y, vx, vy, fx, fy, invMass, count } = store;
    for (let i = 0; i < count; i++) {
      vx[i] += fx[i] * invMass[i] * dt;
      vy[i] += fy[i] * invMass[i] * dt;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
    }

    for (const constraint of this.constraints) constraint.resolve(store, ctx);
  }

  render(renderer: Renderer, _ctx: SceneContext): void {
    renderer.drawCircleGroups(this.store, this.groups);
  }

  resize(ctx: SceneContext, prevWidth: number, prevHeight: number): void {
    if (prevWidth > 0 && prevHeight > 0 && this.store.count > 0) {
      const sx = ctx.width / prevWidth;
      const sy = ctx.height / prevHeight;
      const { x, y, count } = this.store;
      for (let i = 0; i < count; i++) {
        x[i] *= sx;
        y[i] *= sy;
      }
    }

    const area = ctx.width * ctx.height;
    const ratio = this.builtForArea > 0 ? area / this.builtForArea : Infinity;
    if (ratio > REBUILD_AREA_RATIO || ratio < 1 / REBUILD_AREA_RATIO) {
      this.rebuild(ctx);
    } else {
      this.boundary.resolve(this.store, ctx);
    }
  }

  dispose(): void {
    this.store.clear();
    this.groups = [];
  }

  private rebuild(ctx: SceneContext): void {
    const { colourBounds } = spawnField(this.store, {
      amount: this.options.amount,
      size: this.options.size,
      speed: this.options.speed,
      maxCount: this.options.maxCount,
      width: ctx.width,
      height: ctx.height,
      colourCount: 1,
      rng: ctx.rng,
    });

    this.groups = [];
    for (let c = 0; c < colourBounds.length - 1; c++) {
      this.groups.push({
        start: colourBounds[c],
        end: colourBounds[c + 1],
        fill: null,
        stroke: PLACEHOLDER_STROKE,
        lineWidth: 1,
      });
    }

    this.builtForArea = ctx.width * ctx.height;
  }

  get count(): number {
    return this.store.count;
  }
}
