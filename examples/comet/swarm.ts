import {
  Drag,
  ParticleStore,
  SHAPES,
  type IConstraint,
  type IDrawGroup,
  type IForce,
  type ILayer,
  type IRenderer,
  type ISceneContext,
  type ITheme,
} from 'bg-9000';
import { Current } from './current';
import { Vortex } from './vortex';

/**
 * The swarm: thousands of tiny particles assembled from the library's parts.
 *
 * The built-in field speaks in densities — `alot` is one particle per 4,500
 * px², a few hundred on a laptop — which is the right vocabulary for a
 * background under text and the wrong one for a sky. So this layer fills a
 * `ParticleStore` itself, runs its own forces and constraints in the same
 * `forces → integrate → constraints` order the field does, and renders
 * through `renderer.drawShapeGroups` — one instanced call per colour on
 * WebGL, one path per colour on Canvas2D. Nothing here knows which.
 */
export interface ISwarmOptions {
  count: number;
  /** Multiplier on the current's strength. */
  speed: number;
}

const CAPACITY = 20_000;
const RADIUS: readonly [number, number] = [0.7, 2.1];

export class Swarm implements ILayer {
  readonly name = 'swarm';
  readonly placement = 'above';

  readonly store = new ParticleStore(CAPACITY);
  readonly current = new Current();
  readonly vortex = new Vortex();

  private readonly forces: IForce[] = [this.current, this.vortex, new Drag(0.4)];
  private readonly constraints: IConstraint[] = [new Wrap()];
  private groups: IDrawGroup[] = [];
  private colourBounds = new Int32Array(2);
  private theme: ITheme | null = null;
  private scene: ISceneContext | null = null;

  constructor(private options: ISwarmOptions) {}

  get count(): number {
    return this.store.count;
  }

  configure(options: ISwarmOptions): void {
    const previous = this.options;
    this.options = options;
    this.current.strength = options.speed;
    if (options.count !== previous.count && this.scene) this.spawn(this.scene);
  }

  init(scene: ISceneContext): void {
    this.scene = scene;
    this.current.strength = this.options.speed;
    this.spawn(scene);
  }

  update(scene: ISceneContext): void {
    if (scene.theme !== this.theme) this.paint(scene.theme);

    const { dt } = scene;
    if (dt <= 0) return;
    const store = this.store;

    store.clearForces();
    for (const force of this.forces) force.apply(store, scene);

    const { x, y, vx, vy, fx, fy, invMass, count } = store;
    for (let i = 0; i < count; i++) {
      vx[i] += fx[i] * invMass[i] * dt;
      vy[i] += fy[i] * invMass[i] * dt;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
    }

    for (const constraint of this.constraints) constraint.resolve(store, scene);
  }

  render(renderer: IRenderer): void {
    renderer.drawShapeGroups(this.store, this.groups, SHAPES.circle);
  }

  resize(scene: ISceneContext, prevWidth: number, prevHeight: number): void {
    if (prevWidth <= 0 || prevHeight <= 0) return;
    const scaleX = scene.width / prevWidth;
    const scaleY = scene.height / prevHeight;
    const { x, y, count } = this.store;
    for (let i = 0; i < count; i++) {
      x[i] *= scaleX;
      y[i] *= scaleY;
    }
  }

  dispose(): void {
    this.store.clear();
    this.groups = [];
    this.theme = null;
    this.scene = null;
  }

  /**
   * Laid out sorted by colour, as the field does, so each colour is one
   * contiguous run and one draw group.
   */
  private spawn(scene: ISceneContext): void {
    const { rng, width, height, theme } = scene;
    const store = this.store;
    const count = Math.min(Math.max(1, Math.round(this.options.count)), store.capacity);
    const colourCount = theme.variants.length;

    // bounds[c] is the first index of colour c; bounds[c + 1] is one past its last.
    const bounds = new Int32Array(colourCount + 1);
    for (let colour = 0; colour <= colourCount; colour++) {
      bounds[colour] = Math.round((colour * count) / colourCount);
    }
    this.colourBounds = bounds;

    store.clear();
    for (let colour = 0; colour < colourCount; colour++) {
      for (let i = bounds[colour]; i < bounds[colour + 1]; i++) {
        const heading = rng.next() * Math.PI * 2;
        const drift = rng.range(4, 18);
        // Skewed small: many faint motes, a few bright heads.
        const radius = RADIUS[0] + (RADIUS[1] - RADIUS[0]) * rng.next() ** 2.2;
        store.add(
          rng.next() * width,
          rng.next() * height,
          Math.cos(heading) * drift,
          Math.sin(heading) * drift,
          radius,
          colour,
        );
      }
    }
    this.paint(theme);
  }

  /**
   * The dots take the palette's *outline* colours — the bright ones on a dark
   * palette — and fall back to the fills for a style without outlines.
   */
  private paint(theme: ITheme): void {
    this.theme = theme;
    const bounds = this.colourBounds;
    const groups: IDrawGroup[] = [];
    for (let colour = 0; colour < bounds.length - 1; colour++) {
      if (bounds[colour + 1] <= bounds[colour]) continue;
      const variant = theme.variants[colour % theme.variants.length];
      groups.push({
        start: bounds[colour],
        end: bounds[colour + 1],
        fill: variant.stroke ?? variant.fill,
        stroke: null,
        lineWidth: 0,
      });
    }
    this.groups = groups;
  }
}

/**
 * Comets fly off one edge and return from the other. With persistence trails
 * there is no visible seam: the trail simply ends at the edge and a new one
 * begins opposite.
 */
class Wrap implements IConstraint {
  readonly name = 'wrap';

  resolve(store: ParticleStore, scene: ISceneContext): void {
    const { x, y, radius, count } = store;
    const { width, height } = scene;
    for (let i = 0; i < count; i++) {
      // A particle leaves once it is entirely past an edge, and enters
      // entirely past the opposite one, so it never pops into view.
      const margin = radius[i];
      if (x[i] < -margin) x[i] += width + 2 * margin;
      else if (x[i] > width + margin) x[i] -= width + 2 * margin;
      if (y[i] < -margin) y[i] += height + 2 * margin;
      else if (y[i] > height + margin) y[i] -= height + 2 * margin;
    }
  }
}
