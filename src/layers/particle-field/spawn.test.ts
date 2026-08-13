import { describe, expect, it } from 'vitest';
import { createRng } from '../../util/rng.js';
import { SIZE_RADIUS, resolveCount } from '../../util/scalars.js';
import { spawnField } from './spawn.js';
import { ParticleStore } from './store.js';

const DESKTOP = { width: 1920, height: 1080 };

describe('resolveCount', () => {
  it('matches the published density figures at 1920x1080', () => {
    expect(resolveCount('low', 'medium', DESKTOP.width, DESKTOP.height, 1200)).toBe(74);
    expect(resolveCount('moderate', 'medium', DESKTOP.width, DESKTOP.height, 1200)).toBe(173);
    expect(resolveCount('alot', 'medium', DESKTOP.width, DESKTOP.height, 1200)).toBe(461);
  });

  it('scales down with the viewport rather than holding a fixed count', () => {
    const phone = resolveCount('moderate', 'medium', 390, 844, 1200);
    const desktop = resolveCount('moderate', 'medium', DESKTOP.width, DESKTOP.height, 1200);
    expect(phone).toBeLessThan(desktop / 5);
    expect(phone).toBeGreaterThan(0);
  });

  it('honours the explicit ceiling', () => {
    expect(resolveCount('alot', 'small', 4000, 4000, 50)).toBe(50);
  });

  /**
   * The guard that keeps `large` + `alot` from spawning a field so overlapped
   * that the collision solver fights itself into visible jitter.
   */
  it('caps large + alot by area coverage, well below the density figure', () => {
    const uncapped = Math.round((DESKTOP.width * DESKTOP.height) / 4500);
    const actual = resolveCount('alot', 'large', DESKTOP.width, DESKTOP.height, 1200);

    expect(uncapped).toBe(461);
    expect(actual).toBeLessThan(uncapped);
    expect(actual).toBe(210);
  });

  it('leaves small circles uncapped — they cannot reach the coverage limit', () => {
    const byDensity = Math.round((DESKTOP.width * DESKTOP.height) / 4500);
    expect(resolveCount('alot', 'small', DESKTOP.width, DESKTOP.height, 1200)).toBe(byDensity);
  });
});

describe('spawnField', () => {
  it('places every circle fully inside the viewport', () => {
    const store = new ParticleStore(1200);
    spawnField(store, {
      amount: 'alot',
      size: 'medium',
      speed: 1,
      maxCount: 1200,
      width: 1280,
      height: 720,
      colourCount: 1,
      rng: createRng(7),
    });

    expect(store.count).toBeGreaterThan(0);
    for (let i = 0; i < store.count; i++) {
      const r = store.radius[i];
      expect(store.x[i]).toBeGreaterThanOrEqual(r);
      expect(store.x[i]).toBeLessThanOrEqual(1280 - r);
      expect(store.y[i]).toBeGreaterThanOrEqual(r);
      expect(store.y[i]).toBeLessThanOrEqual(720 - r);
    }
  });

  it('samples radii from the range for the requested size', () => {
    const store = new ParticleStore(1200);
    spawnField(store, {
      amount: 'moderate',
      size: 'large',
      speed: 1,
      maxCount: 1200,
      width: 1920,
      height: 1080,
      colourCount: 1,
      rng: createRng(3),
    });

    const [min, max] = SIZE_RADIUS.large;
    for (let i = 0; i < store.count; i++) {
      expect(store.radius[i]).toBeGreaterThanOrEqual(min);
      expect(store.radius[i]).toBeLessThanOrEqual(max);
    }
  });

  /**
   * Rendering draws one path per colour and never sorts per frame, which only
   * works because spawn writes colours in contiguous ascending runs.
   */
  it('writes colours as contiguous ascending runs', () => {
    const store = new ParticleStore(1200);
    const { colourBounds } = spawnField(store, {
      amount: 'moderate',
      size: 'medium',
      speed: 1,
      maxCount: 1200,
      width: 1920,
      height: 1080,
      colourCount: 3,
      rng: createRng(11),
    });

    expect(colourBounds.length).toBe(4);
    expect(colourBounds[0]).toBe(0);
    expect(colourBounds[3]).toBe(store.count);

    for (let c = 0; c < 3; c++) {
      for (let i = colourBounds[c]; i < colourBounds[c + 1]; i++) {
        expect(store.colour[i]).toBe(c);
      }
    }
  });

  it('gives mass proportional to r², so large circles win contacts', () => {
    const store = new ParticleStore(2);
    store.add(0, 0, 0, 0, 10, 0);
    store.add(0, 0, 0, 0, 20, 0);

    // Float32 storage, so precision beyond ~7 significant digits is noise.
    expect(store.mass[1] / store.mass[0]).toBeCloseTo(4, 5);
    expect(store.invMass[0]).toBeCloseTo(1 / 100, 8);
  });

  it('reproduces an identical field from the same seed', () => {
    const opts = {
      amount: 'moderate' as const,
      size: 'medium' as const,
      speed: 1,
      maxCount: 1200,
      width: 1920,
      height: 1080,
      colourCount: 2,
    };

    const a = new ParticleStore(1200);
    const b = new ParticleStore(1200);
    spawnField(a, { ...opts, rng: createRng(99) });
    spawnField(b, { ...opts, rng: createRng(99) });

    expect(a.count).toBe(b.count);
    expect(Array.from(a.x.subarray(0, a.count))).toEqual(
      Array.from(b.x.subarray(0, b.count)),
    );
  });

  it('applies the speed multiplier to drift velocity', () => {
    const base = new ParticleStore(1200);
    const fast = new ParticleStore(1200);
    const opts = {
      amount: 'low' as const,
      size: 'medium' as const,
      maxCount: 1200,
      width: 1920,
      height: 1080,
      colourCount: 1,
    };

    spawnField(base, { ...opts, speed: 1, rng: createRng(5) });
    spawnField(fast, { ...opts, speed: 3, rng: createRng(5) });

    const speedOf = (s: ParticleStore, i: number) => Math.hypot(s.vx[i], s.vy[i]);
    for (let i = 0; i < base.count; i++) {
      expect(speedOf(fast, i) / speedOf(base, i)).toBeCloseTo(3, 4);
    }
  });
});
