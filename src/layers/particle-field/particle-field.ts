import { BoundaryBounce } from '../../forces/boundary-bounce.js';
import { Drag } from '../../forces/drag.js';
import type { ISceneContext } from '../../model/engine/scene-context.interface.js';
import type { IConstraint, IForce } from '../../model/forces/force.interface.js';
import type { ILayer } from '../../model/layers/layer.interface.js';
import type { IParticleFieldOptions } from '../../model/layers/particle-field/particle-field.interface.js';
import type { IDrawGroup, IRenderer } from '../../model/render/renderer.interface.js';
import { CircleCollisions } from './collision.js';
import { spawnField } from './spawn.js';
import { ParticleStore } from './store.js';

/**
 * A field of drifting circles.
 *
 * Rebuilding the field is cheap, but doing it on every resize event makes a
 * window drag look like a slideshow. Instead positions are rescaled
 * proportionally on every resize, and a full respawn happens only once the area
 * has drifted far enough from the area the current count was chosen for.
 */
const REBUILD_AREA_RATIO = 1.3;

export class ParticleField implements ILayer {
  readonly name = 'particle-field';

  private readonly store: ParticleStore;
  private readonly forces: IForce[] = [];
  private readonly constraints: IConstraint[] = [];
  private readonly drag = new Drag(0);
  private readonly boundary = new BoundaryBounce(1);
  private readonly contacts: CircleCollisions;

  private groups: IDrawGroup[] = [];
  /** Kept so a palette or style change can repaint without respawning. */
  private colourBounds: Int32Array = new Int32Array(2);
  private builtForArea = 0;

  constructor(private options: IParticleFieldOptions) {
    this.store = new ParticleStore(options.maxCount);
    this.contacts = new CircleCollisions(options.maxCount, options.restitution);
    this.drag.coefficient = options.drag;
    this.boundary.restitution = options.restitution;

    this.forces.push(this.drag);
    this.syncConstraints();
  }

  /**
   * Rebuild the constraint list.
   *
   * Contacts resolve before walls so that the boundary has the last word on
   * position: a circle shouldered out of the viewport by a neighbour is put
   * back inside within the same frame, rather than being visibly outside for
   * one. Turning collisions off removes the stage from the pipeline entirely —
   * there is no per-particle branch to pay for.
   */
  private syncConstraints(): void {
    this.constraints.length = 0;
    if (this.options.collisions) this.constraints.push(this.contacts);
    this.constraints.push(this.boundary);
  }

  init(ctx: ISceneContext): void {
    this.rebuild(ctx);
  }

  /** Apply an options patch, rebuilding only when the change requires it. */
  configure(options: IParticleFieldOptions, ctx: ISceneContext): void {
    const previous = this.options;
    this.options = options;
    this.drag.coefficient = options.drag;
    this.boundary.restitution = options.restitution;
    this.contacts.restitution = options.restitution;
    if (options.collisions !== previous.collisions) this.syncConstraints();

    // Colour count is a property of the palette, not the style, so switching
    // style never lands here — and switching between the stock palettes does
    // not either, since they all offer the same number of variants.
    const needsRebuild =
      options.amount !== previous.amount ||
      options.size !== previous.size ||
      options.maxCount !== previous.maxCount ||
      options.theme.variants.length !== previous.theme.variants.length;

    if (needsRebuild) {
      this.rebuild(ctx);
      return;
    }

    if (options.theme !== previous.theme) this.applyTheme();

    if (options.speed !== previous.speed && previous.speed > 0) {
      const ratio = options.speed / previous.speed;
      const { vx, vy, count } = this.store;
      for (let i = 0; i < count; i++) {
        vx[i] *= ratio;
        vy[i] *= ratio;
      }
    }
  }

  update(ctx: ISceneContext): void {
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

  render(renderer: IRenderer, _ctx: ISceneContext): void {
    renderer.drawCircleGroups(this.store, this.groups);
  }

  resize(ctx: ISceneContext, prevWidth: number, prevHeight: number): void {
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

  private rebuild(ctx: ISceneContext): void {
    const { colourBounds } = spawnField(this.store, {
      amount: this.options.amount,
      size: this.options.size,
      speed: this.options.speed,
      maxCount: this.options.maxCount,
      width: ctx.width,
      height: ctx.height,
      colourCount: this.options.theme.variants.length,
      rng: ctx.rng,
    });

    this.colourBounds = colourBounds;
    this.applyTheme();
    this.builtForArea = ctx.width * ctx.height;
  }

  /**
   * Turn the resolved theme into draw groups.
   *
   * One group per colour run, and the runs are fixed at spawn — so this is the
   * whole cost of changing palette or style. Nothing about colour is touched
   * again until the next configure call.
   */
  private applyTheme(): void {
    const { variants } = this.options.theme;
    const bounds = this.colourBounds;
    const groups: IDrawGroup[] = [];

    for (let c = 0; c < bounds.length - 1; c++) {
      if (bounds[c + 1] <= bounds[c]) continue;
      const variant = variants[c % variants.length];
      groups.push({
        start: bounds[c],
        end: bounds[c + 1],
        fill: variant.fill,
        stroke: variant.stroke,
        lineWidth: variant.lineWidth,
      });
    }

    this.groups = groups;
  }

  get count(): number {
    return this.store.count;
  }

  /** Overlapping pairs resolved on the last step; 0 when collisions are off. */
  get contactCount(): number {
    return this.options.collisions ? this.contacts.contacts : 0;
  }
}
