import type { ISceneContext } from '../../model/engine/scene-context.interface.js';
import type { IConstraint } from '../../model/forces/force.interface.js';
import type { ParticleStore } from './store.js';

/**
 * Overlap left uncorrected, in CSS pixels.
 *
 * Resolving contact down to the last float is what makes a resting pile buzz:
 * the correction overshoots, the pair re-collides next frame, and the jitter
 * never settles. Leaving a hair of penetration costs nothing visually.
 */
const SLOP = 0.02;

/**
 * Ceiling on grid cells, so a viewport full of tiny circles cannot allocate an
 * enormous table. Past this the cells grow instead, which costs a few more
 * narrowphase tests per cell and nothing else.
 */
const MAX_CELLS = 1 << 16;

/** Cells never go below this, whatever the radii say. */
const MIN_CELL_SIZE = 4;

/**
 * Circle-to-circle contact, resolved against a uniform grid.
 *
 * Testing every pair is 106,000 checks per frame at `alot` — quadratic in a
 * loop that has 16 ms to finish. A uniform grid brings that to roughly nine
 * neighbour checks per circle:
 *
 *   - **Broadphase.** Cells are `2 × maxRadius` across, so two circles can only
 *     touch if their centres sit in the same cell or in one of its eight
 *     neighbours. The grid is rebuilt every frame by counting sort into two
 *     `Int32Array`s, which allocates nothing after the first sizing.
 *   - **Half-neighbourhood sweep.** Each cell tests itself plus four of its
 *     eight neighbours. The other four see the pair from the opposite side, so
 *     testing all eight would examine every pair exactly twice.
 *   - **Narrowphase.** Squared distance against `(r₁ + r₂)²`; no square root
 *     until a pair genuinely overlaps.
 *   - **Resolve.** Positional correction splitting the overlap along the
 *     contact normal, then an elastic impulse. Both are weighted by inverse
 *     mass, and mass is `r²`, so a large circle shoulders a small one aside
 *     instead of the two behaving identically.
 *
 * The whole stage is absent when collisions are off — this constraint is not in
 * the list at all, rather than being a branch inside the loop.
 */
export class CircleCollisions implements IConstraint {
  readonly name = 'circle-collisions';

  /** Overlapping pairs found on the last resolve. Diagnostics only. */
  contacts = 0;

  private cols = 0;
  private rows = 0;

  /** Prefix sums; cell c owns `cellItems[cellStart[c] … cellStart[c + 1])`. */
  private cellStart = new Int32Array(1);
  private cursor = new Int32Array(1);
  private cellItems: Int32Array;
  private cellOf: Int32Array;

  constructor(
    capacity: number,
    public restitution = 1,
  ) {
    this.cellItems = new Int32Array(capacity);
    this.cellOf = new Int32Array(capacity);
  }

  resolve(store: ParticleStore, ctx: ISceneContext): void {
    this.contacts = 0;
    if (store.count < 2) return;

    this.build(store, ctx);
    this.sweep(store);
  }

  /** Counting-sort every particle into its cell. */
  private build(store: ParticleStore, ctx: ISceneContext): void {
    const { count, x, y } = store;

    // Cells must be at least `2 × maxRadius` across, never less: the whole
    // half-neighbourhood argument rests on two touching circles being unable to
    // land more than one cell apart. Larger cells are merely slower — smaller
    // ones silently miss contacts.
    let size = Math.max(store.maxRadius() * 2, MIN_CELL_SIZE);
    let cols = Math.max(1, Math.ceil(ctx.width / size));
    let rows = Math.max(1, Math.ceil(ctx.height / size));

    if (cols * rows > MAX_CELLS) {
      const scale = Math.sqrt((cols * rows) / MAX_CELLS);
      cols = Math.max(1, Math.floor(cols / scale));
      rows = Math.max(1, Math.floor(rows / scale));
      size = Math.max(size, ctx.width / cols, ctx.height / rows);
    }

    // The tables are only reallocated when the grid actually changes shape —
    // on a resize, or when a respawn changes the largest radius.
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
      this.cellStart = new Int32Array(cols * rows + 1);
      this.cursor = new Int32Array(cols * rows);
    }

    if (this.cellItems.length < count) {
      this.cellItems = new Int32Array(count);
      this.cellOf = new Int32Array(count);
    }

    const { cellStart, cursor, cellItems, cellOf } = this;

    cellStart.fill(0);

    // Positions are clamped rather than trusted: collisions resolve before the
    // boundary constraint, so a particle can be a step outside the viewport.
    for (let i = 0; i < count; i++) {
      const cx = clampIndex(Math.floor(x[i] / size), cols);
      const cy = clampIndex(Math.floor(y[i] / size), rows);
      const cell = cy * cols + cx;
      cellOf[i] = cell;
      cellStart[cell + 1]++;
    }

    for (let c = 0; c < cols * rows; c++) {
      cellStart[c + 1] += cellStart[c];
      cursor[c] = cellStart[c];
    }

    for (let i = 0; i < count; i++) {
      cellItems[cursor[cellOf[i]]++] = i;
    }
  }

  /**
   * Every cell against itself and four of its neighbours.
   *
   * The four are right, down-left, down, and down-right: between them they
   * cover all eight adjacencies exactly once, because a cell's remaining four
   * neighbours each look back at it from their own sweep.
   */
  private sweep(store: ParticleStore): void {
    const { cols, rows, cellStart, cellItems } = this;

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const cell = cy * cols + cx;
        const start = cellStart[cell];
        const end = cellStart[cell + 1];
        if (start === end) continue;

        for (let a = start; a < end; a++) {
          const i = cellItems[a];
          for (let b = a + 1; b < end; b++) {
            this.contact(store, i, cellItems[b]);
          }
        }

        const down = cy + 1 < rows;
        if (cx + 1 < cols) this.crossCell(store, start, end, cell + 1);
        if (down && cx > 0) this.crossCell(store, start, end, cell + cols - 1);
        if (down) this.crossCell(store, start, end, cell + cols);
        if (down && cx + 1 < cols) this.crossCell(store, start, end, cell + cols + 1);
      }
    }
  }

  private crossCell(store: ParticleStore, start: number, end: number, other: number): void {
    const { cellStart, cellItems } = this;
    const otherStart = cellStart[other];
    const otherEnd = cellStart[other + 1];
    if (otherStart === otherEnd) return;

    for (let a = start; a < end; a++) {
      const i = cellItems[a];
      for (let b = otherStart; b < otherEnd; b++) {
        this.contact(store, i, cellItems[b]);
      }
    }
  }

  /** Narrowphase and resolve for one candidate pair. */
  private contact(store: ParticleStore, i: number, j: number): void {
    const { x, y, vx, vy, radius, invMass } = store;

    const dx = x[j] - x[i];
    const dy = y[j] - y[i];
    const rsum = radius[i] + radius[j];
    const d2 = dx * dx + dy * dy;

    if (d2 >= rsum * rsum) return;
    this.contacts++;

    let dist: number;
    let nx: number;
    let ny: number;

    if (d2 < 1e-12) {
      // Coincident centres have no contact normal to recover. The direction is
      // derived from the pair's indices rather than drawn at random, so a
      // seeded field stays reproducible frame for frame.
      const angle = ((i * 31 + j * 17) % 360) * (Math.PI / 180);
      dist = 0;
      nx = Math.cos(angle);
      ny = Math.sin(angle);
    } else {
      dist = Math.sqrt(d2);
      nx = dx / dist;
      ny = dy / dist;
    }

    const invI = invMass[i];
    const invJ = invMass[j];
    const invSum = invI + invJ;
    if (invSum <= 0) return;

    const overlap = rsum - dist;
    if (overlap > SLOP) {
      const push = (overlap - SLOP) / invSum;
      x[i] -= nx * push * invI;
      y[i] -= ny * push * invI;
      x[j] += nx * push * invJ;
      y[j] += ny * push * invJ;
    }

    // Approaching speed along the normal. Positive means the pair is already
    // separating — overlapping, but on its way out, so an impulse here would
    // suck them back together.
    const vn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
    if (vn > 0) return;

    const impulse = (-(1 + this.restitution) * vn) / invSum;
    vx[i] -= nx * impulse * invI;
    vy[i] -= ny * impulse * invI;
    vx[j] += nx * impulse * invJ;
    vy[j] += ny * impulse * invJ;
  }
}

function clampIndex(value: number, limit: number): number {
  if (!(value >= 0)) return 0; // Also catches NaN.
  return value < limit ? value : limit - 1;
}
