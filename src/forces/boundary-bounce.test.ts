import { describe, expect, it } from 'vitest';
import { createRng } from '../util/rng.js';
import { createPointerState } from '../engine/scene-context.js';
import { ParticleStore } from '../layers/particle-field/store.js';
import type { ISceneContext } from '../model/engine/scene-context.interface.js';
import { BoundaryBounce } from './boundary-bounce.js';

function scene(width: number, height: number): ISceneContext {
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

describe('BoundaryBounce', () => {
  it('reverses a particle travelling out through the right wall', () => {
    const store = new ParticleStore(1);
    store.add(795, 300, 10, 0, 10, 0);

    new BoundaryBounce(1).resolve(store, scene(800, 600));

    expect(store.x[0]).toBe(790); // clamped to width - radius
    expect(store.vx[0]).toBe(-10);
  });

  it('accounts for radius symmetrically on the left wall', () => {
    const store = new ParticleStore(1);
    store.add(4, 300, -10, 0, 10, 0);

    new BoundaryBounce(1).resolve(store, scene(800, 600));

    expect(store.x[0]).toBe(10); // radius, not 0
    expect(store.vx[0]).toBe(10);
  });

  it('leaves a particle already travelling inward alone', () => {
    const store = new ParticleStore(1);
    // Beyond the wall but heading back in — reversing here is what causes the
    // two-frame oscillation the naive implementation gets stuck in.
    store.add(795, 300, -10, 0, 10, 0);

    new BoundaryBounce(1).resolve(store, scene(800, 600));

    expect(store.x[0]).toBe(790);
    expect(store.vx[0]).toBe(-10); // unchanged
  });

  /**
   * The regression that motivated the rewrite: a circle spawned within one
   * radius of the right edge, moving slower than its overshoot, used to flip
   * velocity every frame and vibrate in place forever.
   */
  it('never traps a particle that starts outside the boundary', () => {
    const store = new ParticleStore(1);
    store.add(795, 595, 1, 1, 30, 0); // 25px past both walls, 1px/step
    const ctx = scene(800, 600);
    const boundary = new BoundaryBounce(1);

    const seen = new Set<string>();
    for (let step = 0; step < 240; step++) {
      store.x[0] += store.vx[0];
      store.y[0] += store.vy[0];
      boundary.resolve(store, ctx);
      seen.add(`${store.x[0].toFixed(3)},${store.y[0].toFixed(3)}`);
    }

    // A trapped particle revisits two positions forever.
    expect(seen.size).toBeGreaterThan(50);
    expect(store.x[0]).toBeLessThanOrEqual(770);
    expect(store.y[0]).toBeLessThanOrEqual(570);
  });

  it('keeps every particle inside the viewport over a long run', () => {
    const store = new ParticleStore(200);
    const rng = createRng(42);
    for (let i = 0; i < 200; i++) {
      const r = rng.range(10, 22);
      store.add(rng.range(0, 800), rng.range(0, 600), rng.range(-40, 40), rng.range(-40, 40), r, 0);
    }

    const ctx = scene(800, 600);
    const boundary = new BoundaryBounce(1);
    for (let step = 0; step < 600; step++) {
      for (let i = 0; i < store.count; i++) {
        store.x[i] += store.vx[i] * ctx.dt;
        store.y[i] += store.vy[i] * ctx.dt;
      }
      boundary.resolve(store, ctx);
    }

    for (let i = 0; i < store.count; i++) {
      const r = store.radius[i];
      expect(store.x[i]).toBeGreaterThanOrEqual(r - 1e-3);
      expect(store.x[i]).toBeLessThanOrEqual(800 - r + 1e-3);
      expect(store.y[i]).toBeGreaterThanOrEqual(r - 1e-3);
      expect(store.y[i]).toBeLessThanOrEqual(600 - r + 1e-3);
    }
  });
});
