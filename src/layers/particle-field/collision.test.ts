import { describe, expect, it } from 'vitest';
import { createPointerState } from '../../engine/scene-context.js';
import type { ISceneContext } from '../../model/engine/scene-context.interface.js';
import { createRng } from '../../util/rng.js';
import { CircleCollisions } from './collision.js';
import { spawnField } from './spawn.js';
import { ParticleStore } from './store.js';

function scene(width = 1280, height = 720): ISceneContext {
  return {
    width,
    height,
    dpr: 1,
    time: 0,
    dt: 1 / 60,
    frame: 0,
    pointer: createPointerState(),
    rng: createRng(1),
  };
}

/** Every overlapping pair, found the slow, obviously-correct way. */
function bruteForcePairs(store: ParticleStore): number {
  const { x, y, radius, count } = store;
  let pairs = 0;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const rsum = radius[i] + radius[j];
      if (dx * dx + dy * dy < rsum * rsum) pairs++;
    }
  }
  return pairs;
}

function kineticEnergy(store: ParticleStore): number {
  let total = 0;
  for (let i = 0; i < store.count; i++) {
    total += 0.5 * store.mass[i] * (store.vx[i] ** 2 + store.vy[i] ** 2);
  }
  return total;
}

function momentum(store: ParticleStore): [number, number] {
  let px = 0;
  let py = 0;
  for (let i = 0; i < store.count; i++) {
    px += store.mass[i] * store.vx[i];
    py += store.mass[i] * store.vy[i];
  }
  return [px, py];
}

function worstOverlap(store: ParticleStore): number {
  const { x, y, radius, count } = store;
  let worst = 0;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const rsum = radius[i] + radius[j];
      const overlap = rsum - Math.hypot(x[j] - x[i], y[j] - y[i]);
      if (overlap > worst) worst = overlap;
    }
  }
  return worst;
}

describe('narrowphase and resolve', () => {
  it('separates an overlapping pair', () => {
    const store = new ParticleStore(2);
    store.add(100, 100, 0, 0, 20, 0);
    store.add(130, 100, 0, 0, 20, 0);

    new CircleCollisions(2).resolve(store, scene());

    // Separated to within the slop — the hair of overlap deliberately left
    // behind so a resting contact does not buzz.
    const gap = Math.hypot(store.x[1] - store.x[0], store.y[1] - store.y[0]);
    expect(gap).toBeGreaterThan(40 - 0.05);
    // Symmetric masses, symmetric correction.
    expect(store.x[0]).toBeCloseTo(95.01, 2);
    expect(store.x[1]).toBeCloseTo(134.99, 2);
  });

  it('exchanges velocity on a head-on hit between equals', () => {
    const store = new ParticleStore(2);
    store.add(100, 100, 50, 0, 20, 0);
    store.add(139, 100, -50, 0, 20, 0);

    new CircleCollisions(2, 1).resolve(store, scene());

    expect(store.vx[0]).toBeCloseTo(-50, 4);
    expect(store.vx[1]).toBeCloseTo(50, 4);
  });

  it('conserves momentum whatever the mass ratio', () => {
    const store = new ParticleStore(2);
    store.add(100, 100, 60, 20, 8, 0);
    store.add(130, 108, -15, -5, 30, 0);

    const [px, py] = momentum(store);
    new CircleCollisions(2, 1).resolve(store, scene());
    const [px2, py2] = momentum(store);

    expect(px2).toBeCloseTo(px, 2);
    expect(py2).toBeCloseTo(py, 2);
  });

  /** Mass goes as r², so the small circle does nearly all the moving. */
  it('shoulders the small circle aside, not the large one', () => {
    const store = new ParticleStore(2);
    store.add(100, 100, 0, 0, 6, 0);
    store.add(130, 100, 0, 0, 30, 0);

    new CircleCollisions(2).resolve(store, scene());

    const smallMoved = Math.abs(store.x[0] - 100);
    const largeMoved = Math.abs(store.x[1] - 130);
    expect(smallMoved).toBeGreaterThan(largeMoved * 20);
  });

  it('leaves an overlapping but separating pair to keep going', () => {
    const store = new ParticleStore(2);
    store.add(100, 100, -30, 0, 20, 0);
    store.add(130, 100, 30, 0, 20, 0);

    new CircleCollisions(2, 1).resolve(store, scene());

    // Pushed apart, but not slowed or reversed: they were already leaving.
    expect(store.vx[0]).toBe(-30);
    expect(store.vx[1]).toBe(30);
  });

  it('survives exactly coincident centres', () => {
    const store = new ParticleStore(2);
    store.add(200, 200, 0, 0, 15, 0);
    store.add(200, 200, 0, 0, 15, 0);

    new CircleCollisions(2).resolve(store, scene());

    for (const value of [store.x[0], store.y[0], store.x[1], store.y[1]]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(Math.hypot(store.x[1] - store.x[0], store.y[1] - store.y[0])).toBeGreaterThan(29.9);
  });

  it('never adds energy, at any restitution', () => {
    for (const restitution of [0, 0.5, 1]) {
      const store = new ParticleStore(2);
      store.add(100, 100, 40, 15, 12, 0);
      store.add(122, 104, -35, -8, 12, 0);

      const before = kineticEnergy(store);
      new CircleCollisions(2, restitution).resolve(store, scene());
      expect(kineticEnergy(store)).toBeLessThanOrEqual(before * 1.000001);
    }
  });
});

describe('broadphase', () => {
  /**
   * The half-neighbourhood sweep is the one part of this that fails silently:
   * a missed pair just quietly passes through another circle, and a pair
   * visited twice gets a double impulse. So the grid is checked against every
   * pair, tested the slow way.
   *
   * Infinite mass — `invMass` of zero — makes the resolve a no-op while the
   * detection still runs, which is what lets the two counts be compared at all:
   * the real solver moves circles as it sweeps, so pairs found later in a frame
   * are not the pairs a snapshot taken beforehand would list.
   */
  it('finds every overlapping pair, and each exactly once', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const store = new ParticleStore(1200);
      const ctx = scene();
      spawnField(store, {
        amount: 'alot',
        size,
        speed: 1,
        maxCount: 1200,
        width: ctx.width,
        height: ctx.height,
        colourCount: 3,
        rng: createRng(2024),
      });

      const expected = bruteForcePairs(store);
      const snapshot = Float32Array.from(store.x.subarray(0, store.count));
      store.invMass.fill(0, 0, store.count);

      const grid = new CircleCollisions(1200);
      grid.resolve(store, ctx);

      expect(expected).toBeGreaterThan(0);
      expect(grid.contacts).toBe(expected);
      expect(Array.from(store.x.subarray(0, store.count))).toEqual(Array.from(snapshot));
    }
  });

  it('finds pairs that straddle a cell boundary in every direction', () => {
    const ctx = scene(200, 200);
    // Radius 10 puts the cells at 20px, so these pairs sit across cell edges
    // and corners rather than inside one cell.
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [19, 0],
      [0, 19],
      [13, 13],
      [-13, 13],
    ];

    for (const [dx, dy] of offsets) {
      const store = new ParticleStore(2);
      store.add(100, 100, 0, 0, 10, 0);
      store.add(100 + dx, 100 + dy, 0, 0, 10, 0);

      const grid = new CircleCollisions(2);
      grid.resolve(store, ctx);
      expect(grid.contacts).toBe(1);
    }
  });

  it('handles a particle outside the viewport, before the walls run', () => {
    const ctx = scene(400, 400);
    const store = new ParticleStore(2);
    store.add(-50, -50, 0, 0, 20, 0);
    store.add(-35, -50, 0, 0, 20, 0);

    const grid = new CircleCollisions(2);
    expect(() => grid.resolve(store, ctx)).not.toThrow();
    expect(grid.contacts).toBe(1);
  });

  it('does nothing with fewer than two particles', () => {
    const store = new ParticleStore(1);
    store.add(10, 10, 5, 5, 4, 0);

    const grid = new CircleCollisions(1);
    grid.resolve(store, scene());

    expect(grid.contacts).toBe(0);
    expect(store.x[0]).toBe(10);
  });
});

describe('a whole field under contact', () => {
  it('settles into separation and stays there', () => {
    const ctx = scene();
    const store = new ParticleStore(1200);
    spawnField(store, {
      amount: 'alot',
      size: 'large',
      speed: 1,
      maxCount: 1200,
      width: ctx.width,
      height: ctx.height,
      colourCount: 3,
      rng: createRng(7),
    });

    const grid = new CircleCollisions(1200);
    const energyBefore = kineticEnergy(store);

    // No integration between steps: this isolates the solver, which should
    // converge on its own rather than relying on the particles drifting apart.
    for (let step = 0; step < 60; step++) grid.resolve(store, ctx);

    expect(worstOverlap(store)).toBeLessThan(0.5);
    expect(kineticEnergy(store)).toBeLessThanOrEqual(energyBefore * 1.05);
    for (let i = 0; i < store.count; i++) {
      expect(Number.isFinite(store.x[i])).toBe(true);
      expect(Number.isFinite(store.vx[i])).toBe(true);
    }
  });
});
