import { describe, expect, it } from 'vitest';
import type { Surface } from '../engine/surface';
import { ParticleStore } from '../layers/particle-field/store';
import type { IDrawGroup } from '../model/render/renderer.interface';
import { SHAPES, defineShape } from '../shapes/shapes';
import { Canvas2DRenderer } from './canvas2d';

/** Records every method call and style assignment made on a 2D context. */
function fakeContext(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_, key: string) {
      if (key in state) return state[key];
      return (...args: unknown[]) => {
        log.push(args.length ? `${key}(${args.map((a) => (typeof a === 'number' ? +a.toFixed(2) : String(a))).join(',')})` : `${key}()`);
        if (key === 'save') log.push(`state=${JSON.stringify(state)}`);
      };
    },
    set(_, key: string, value) {
      state[key] = value;
      log.push(`${key}=${String(value)}`);
      return true;
    },
  });
  return { ctx, log };
}

function renderer(): { r: Canvas2DRenderer; log: string[] } {
  const { ctx, log } = fakeContext();
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  const surface = { width: 100, height: 50, dpr: 1, revision: 1 } as unknown as Surface;
  return { r: new Canvas2DRenderer(canvas, surface), log };
}

function field(): { store: ParticleStore; groups: IDrawGroup[] } {
  const store = new ParticleStore(4);
  store.add(10, 10, 0, 0, 5, 0);
  store.add(20, 10, 0, 0, 5, 0);
  store.add(30, 10, 0, 0, 5, 1);
  const groups: IDrawGroup[] = [
    { start: 0, end: 2, fill: 'red', stroke: null, lineWidth: 0 },
    { start: 2, end: 3, fill: null, stroke: 'blue', lineWidth: 1.5 },
  ];
  return { store, groups };
}

describe('Canvas2DRenderer.drawShapeGroups', () => {
  it('batches a tracing shape into one path per group, painted once', () => {
    const { store, groups } = field();
    const { r, log } = renderer();
    r.drawShapeGroups(store, groups, SHAPES.circle);

    expect(log).toEqual([
      'beginPath()',
      'moveTo(15,10)',
      'arc(10,10,5,0,6.28)',
      'moveTo(25,10)',
      'arc(20,10,5,0,6.28)',
      'fillStyle=red',
      'fill()',
      'beginPath()',
      'moveTo(35,10)',
      'arc(30,10,5,0,6.28)',
      'lineWidth=1.5',
      'strokeStyle=blue',
      'stroke()',
    ]);
  });

  it('keeps drawCircleGroups as an alias for drawShapeGroups with the circle', () => {
    const { store, groups } = field();
    const shaped = renderer();
    shaped.r.drawShapeGroups(store, groups, SHAPES.circle);
    const aliased = renderer();
    aliased.r.drawCircleGroups(store, groups);
    expect(aliased.log).toEqual(shaped.log);
  });

  it('throws on a shape with neither contract, before touching the canvas', () => {
    const { store, groups } = field();
    const { r, log } = renderer();
    const broken = { name: 'broken' };
    expect(() => r.drawShapeGroups(store, groups, broken)).toThrow(/broken/);
    expect(log).toEqual([]);
  });

  it('hands a tracing shape the index and the store', () => {
    const { store, groups } = field();
    const seen: number[] = [];
    const shape = defineShape('probe', {
      trace(path, x, y, r, i, s) {
        seen.push(i);
        expect(s).toBe(store);
        expect([x, y, r]).toEqual([store.x[i], store.y[i], store.radius[i]]);
        path.moveTo(x, y);
      },
    });
    renderer().r.drawShapeGroups(store, groups, shape);
    expect(seen).toEqual([0, 1, 2]);
  });

  it('gives a drawing shape the group colours, saved and restored per group', () => {
    const { store, groups } = field();
    const variants: Array<string | null> = [];
    const shape = defineShape('probe', {
      draw(ctx, _x, _y, _r, variant) {
        variants.push(variant.fill ?? variant.stroke);
        ctx.fill();
      },
    });
    const { r, log } = renderer();
    r.drawShapeGroups(store, groups, shape);

    expect(variants).toEqual(['red', 'red', 'blue']);
    expect(log.filter((l) => l === 'save()')).toHaveLength(2);
    expect(log.filter((l) => l === 'restore()')).toHaveLength(2);
    // Styles are applied before the first particle of the run is drawn.
    expect(log.indexOf('fillStyle=red')).toBeLessThan(log.indexOf('fill()'));
    expect(log).toContain('strokeStyle=blue');
    expect(log).toContain('lineWidth=1.5');
  });

  it('prefers trace when a shape offers both', () => {
    const { store, groups } = field();
    let drawn = 0;
    let traced = 0;
    const shape = defineShape('both', {
      trace(path, x, y) {
        traced++;
        path.moveTo(x, y);
      },
      draw() {
        drawn++;
      },
    });
    renderer().r.drawShapeGroups(store, groups, shape);
    expect(traced).toBe(3);
    expect(drawn).toBe(0);
  });

  it('skips groups that paint nothing or lie past the count, like circles do', () => {
    const store = new ParticleStore(4);
    store.add(10, 10, 0, 0, 5, 0);
    const groups: IDrawGroup[] = [
      { start: 0, end: 1, fill: null, stroke: null, lineWidth: 0 },
      { start: 1, end: 3, fill: 'red', stroke: null, lineWidth: 0 },
    ];
    const { r, log } = renderer();
    r.drawShapeGroups(store, groups, SHAPES.star);
    expect(log).toEqual([]);
  });
});

describe('Canvas2DRenderer.beginFrame', () => {
  it('applies the DPR transform once per surface revision, then paints the background', () => {
    const { ctx, log } = fakeContext();
    const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
    const surface = { width: 100, height: 50, dpr: 2, revision: 1 } as unknown as Surface;
    const r = new Canvas2DRenderer(canvas, surface);
    r.beginFrame('#123');
    expect(log).toEqual(['setTransform(2,0,0,2,0,0)', 'fillStyle=#123', 'fillRect(0,0,100,50)']);
    log.length = 0;
    r.beginFrame(null);
    expect(log).toEqual(['clearRect(0,0,100,50)']);
    (surface as { revision: number }).revision = 2;
    log.length = 0;
    r.beginFrame(null);
    expect(log[0]).toBe('setTransform(2,0,0,2,0,0)');
  });

  it('throws when the canvas cannot give a 2D context', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => new Canvas2DRenderer(canvas, {} as Surface)).toThrow(/2D context/);
  });
});

describe('Canvas2DRenderer.drawImmediate', () => {
  it('wraps the callback in save/restore', () => {
    const { r, log } = renderer();
    r.drawImmediate((ctx) => {
      ctx.fillStyle = 'lime';
      ctx.fillRect(0, 0, 1, 1);
    });
    expect(log[0]).toBe('save()');
    expect(log.at(-1)).toBe('restore()');
    expect(log).toContain('fillRect(0,0,1,1)');
  });

  it('restores even when the callback throws', () => {
    const { r, log } = renderer();
    expect(() =>
      r.drawImmediate(() => {
        throw new Error('layer bug');
      }),
    ).toThrow('layer bug');
    expect(log.at(-1)).toBe('restore()');
  });
});
