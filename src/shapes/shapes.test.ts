import { describe, expect, it } from 'vitest';
import { ParticleStore } from '../layers/particle-field/store';
import {
  DEFAULT_SHAPE,
  SHAPES,
  SHAPE_NAMES,
  defineShape,
  isShape,
  isShapeName,
  normaliseShape,
  resolveShape,
} from './shapes';

/**
 * A `CanvasPath` that records every point on its outline. Curves are sampled
 * rather than recorded by control point — a bezier's control points may sit
 * well outside the curve they bound, and it is the curve that must fit.
 */
class RecordingPath implements CanvasPath {
  calls: string[] = [];
  points: Array<[number, number]> = [];
  arcs: Array<{ x: number; y: number; r: number }> = [];
  private cursor: [number, number] = [0, 0];

  private point(x: number, y: number): void {
    this.points.push([x, y]);
    this.cursor = [x, y];
  }
  moveTo(x: number, y: number): void {
    this.calls.push('moveTo');
    this.point(x, y);
  }
  lineTo(x: number, y: number): void {
    this.calls.push('lineTo');
    this.point(x, y);
  }
  closePath(): void {
    this.calls.push('closePath');
  }
  arc(x: number, y: number, r: number): void {
    this.calls.push('arc');
    this.arcs.push({ x, y, r });
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.calls.push('bezierCurveTo');
    const [x0, y0] = this.cursor;
    for (let k = 1; k <= 64; k++) {
      const t = k / 64;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      this.point(a * x0 + b * c1x + c * c2x + d * x, a * y0 + b * c1y + c * c2y + d * y);
    }
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.calls.push('quadraticCurveTo');
    const [x0, y0] = this.cursor;
    for (let k = 1; k <= 64; k++) {
      const t = k / 64;
      const u = 1 - t;
      this.point(
        u * u * x0 + 2 * u * t * cx + t * t * x,
        u * u * y0 + 2 * u * t * cy + t * t * y,
      );
    }
  }
  arcTo(): void {
    this.calls.push('arcTo');
  }
  ellipse(): void {
    this.calls.push('ellipse');
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.calls.push('rect');
    this.point(x, y);
    this.point(x + w, y + h);
  }
  roundRect(): void {
    this.calls.push('roundRect');
  }
}

const store = new ParticleStore(1);

describe('built-in shapes', () => {
  it('lists six, with circle first and as the default', () => {
    expect(SHAPE_NAMES).toEqual(['circle', 'square', 'triangle', 'hexagon', 'star', 'heart']);
    expect(DEFAULT_SHAPE).toBe('circle');
    expect(SHAPES.circle.name).toBe('circle');
  });

  it('all trace rather than draw, so a field of any of them stays batched', () => {
    for (const name of SHAPE_NAMES) {
      expect(typeof SHAPES[name].trace).toBe('function');
      expect(SHAPES[name].draw).toBeUndefined();
    }
  });

  /**
   * The contract a shape makes with the collision and boundary stages: it fits
   * inside the circle of radius `r`. Checked at an off-origin centre and an
   * awkward radius so a shape that forgot to offset or scale would show.
   */
  it.each(SHAPE_NAMES)('%s stays inside its circumradius', (name) => {
    const path = new RecordingPath();
    const cx = 137.5;
    const cy = -42.25;
    const r = 13.7;
    SHAPES[name].trace!(path, cx, cy, r, 0, store);

    for (const [x, y] of path.points) {
      expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(r + 1e-9);
    }
    for (const arc of path.arcs) {
      expect(Math.hypot(arc.x - cx, arc.y - cy) + arc.r).toBeLessThanOrEqual(r + 1e-9);
    }
  });

  it.each(SHAPE_NAMES)('%s reaches its circumradius, not merely fits inside it', (name) => {
    const path = new RecordingPath();
    const r = 20;
    SHAPES[name].trace!(path, 0, 0, r, 0, store);

    const reach = Math.max(
      ...path.points.map(([x, y]) => Math.hypot(x, y)),
      ...path.arcs.map((a) => Math.hypot(a.x, a.y) + a.r),
    );
    expect(reach).toBeCloseTo(r, 6);
  });

  /**
   * The path already holds the previous particle when a shape is traced, so
   * starting with anything but `moveTo` joins the two with a line.
   */
  it.each(SHAPE_NAMES)('%s begins a fresh sub-path', (name) => {
    const path = new RecordingPath();
    SHAPES[name].trace!(path, 10, 10, 5, 0, store);
    expect(path.calls[0]).toBe('moveTo');
  });

  it.each(SHAPE_NAMES.filter((n) => n !== 'circle'))('%s closes its outline', (name) => {
    const path = new RecordingPath();
    SHAPES[name].trace!(path, 10, 10, 5, 0, store);
    expect(path.calls.at(-1)).toBe('closePath');
  });

  it('traces a circle as a moveTo to its rim followed by a full arc', () => {
    const path = new RecordingPath();
    SHAPES.circle.trace!(path, 10, 20, 5, 0, store);
    expect(path.calls).toEqual(['moveTo', 'arc']);
    expect(path.points).toEqual([[15, 20]]);
    expect(path.arcs).toEqual([{ x: 10, y: 20, r: 5 }]);
  });

  it('has corners of the square on the circumradius', () => {
    const path = new RecordingPath();
    SHAPES.square.trace!(path, 0, 0, 10, 0, store);
    expect(path.points).toHaveLength(4);
    for (const [x, y] of path.points) expect(Math.hypot(x, y)).toBeCloseTo(10);
  });

  it('has five outer points on the star, alternating with inner ones', () => {
    const path = new RecordingPath();
    SHAPES.star.trace!(path, 0, 0, 10, 0, store);
    const radii = path.points.map(([x, y]) => Math.hypot(x, y));
    expect(radii).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(radii[i]).toBeCloseTo(i % 2 === 0 ? 10 : 4.5);
    }
  });
});

describe('defineShape', () => {
  const trace = (): void => {};
  const draw = (): void => {};

  it('builds a frozen shape carrying only what was given', () => {
    const traced = defineShape('t', { trace });
    expect(traced).toEqual({ name: 't', trace });
    expect(Object.isFrozen(traced)).toBe(true);
    expect('draw' in traced).toBe(false);

    const drawn = defineShape('d', { draw });
    expect(drawn).toEqual({ name: 'd', draw });
  });

  it('keeps both when both are given; the renderer prefers trace', () => {
    const both = defineShape('b', { trace, draw });
    expect(both.trace).toBe(trace);
    expect(both.draw).toBe(draw);
  });

  it('throws on a shape that could never paint anything', () => {
    expect(() => defineShape('empty', {})).toThrow(TypeError);
    expect(() => defineShape('', { trace })).toThrow(TypeError);
    // @ts-expect-error — runtime guard against non-functions.
    expect(() => defineShape('wrong', { trace: 'nope' })).toThrow(TypeError);
  });
});

describe('shape normalisation', () => {
  const custom = defineShape('custom', { trace: () => {} });

  it('recognises names and shapes, and nothing else', () => {
    expect(isShapeName('star')).toBe(true);
    expect(isShapeName('blob')).toBe(false);
    expect(isShapeName(custom)).toBe(false);

    expect(isShape(custom)).toBe(true);
    expect(isShape({ name: 'x', draw: () => {} })).toBe(true);
    expect(isShape({ name: 'x' })).toBe(false);
    expect(isShape({ trace: () => {} })).toBe(false);
    expect(isShape('star')).toBe(false);
    expect(isShape(null)).toBe(false);
  });

  it('passes a valid value through and falls back otherwise', () => {
    expect(normaliseShape('heart', 'circle')).toBe('heart');
    expect(normaliseShape(custom, 'circle')).toBe(custom);
    expect(normaliseShape('blob', 'circle')).toBe('circle');
    expect(normaliseShape(undefined, custom)).toBe(custom);
    expect(normaliseShape({ name: 'x' }, 'square')).toBe('square');
  });

  it('resolves a name to its built-in and a shape to itself', () => {
    expect(resolveShape('hexagon')).toBe(SHAPES.hexagon);
    expect(resolveShape(custom)).toBe(custom);
    expect(resolveShape(undefined)).toBe(SHAPES.circle);
  });
});
