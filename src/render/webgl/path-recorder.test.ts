import { describe, expect, it } from 'vitest';
import { SHAPES } from '../../shapes/shapes';
import { PathRecorder } from './path-recorder';

function maxRadius(points: number[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i += 2) max = Math.max(max, Math.hypot(points[i], points[i + 1]));
  return max;
}

describe('PathRecorder', () => {
  it('records moveTo/lineTo/closePath as one closed subpath', () => {
    const p = new PathRecorder(0.01);
    p.moveTo(0, 0);
    p.lineTo(1, 0);
    p.lineTo(1, 1);
    p.closePath();
    expect(p.subpaths).toEqual([{ points: [0, 0, 1, 0, 1, 1], closed: true }]);
  });

  it('starts a fresh subpath at the closed one’s first point, as the canvas does', () => {
    const p = new PathRecorder(0.01);
    p.moveTo(0, 0);
    p.lineTo(2, 0);
    p.lineTo(2, 2);
    p.closePath();
    p.lineTo(5, 5);
    expect(p.subpaths).toHaveLength(2);
    expect(p.subpaths[1]).toEqual({ points: [0, 0, 5, 5], closed: false });
  });

  it('drops zero-length segments', () => {
    const p = new PathRecorder(0.01);
    p.moveTo(1, 1);
    p.lineTo(1, 1);
    p.lineTo(2, 2);
    expect(p.subpaths[0].points).toEqual([1, 1, 2, 2]);
  });

  it('flattens a full arc within tolerance and joins it to the current point', () => {
    const p = new PathRecorder(0.002);
    p.moveTo(1, 0);
    p.arc(0, 0, 1, 0, Math.PI * 2);
    const { points } = p.subpaths[0];
    const n = points.length / 2;
    expect(n).toBeGreaterThan(40);
    expect(n).toBeLessThan(80);
    for (let i = 0; i < points.length; i += 2) {
      expect(Math.hypot(points[i], points[i + 1])).toBeCloseTo(1, 6);
    }
    // Mid-chord error is within tolerance.
    const step = Math.PI * 2 / (n - 1);
    expect(1 - Math.cos(step / 2)).toBeLessThanOrEqual(0.002 + 1e-9);
  });

  it('honours the sweep direction and partial arcs', () => {
    const cw = new PathRecorder(0.01);
    cw.arc(0, 0, 1, 0, Math.PI / 2);
    const last = cw.subpaths[0].points.slice(-2);
    expect(last[0]).toBeCloseTo(0, 6);
    expect(last[1]).toBeCloseTo(1, 6);

    const ccw = new PathRecorder(0.01);
    ccw.arc(0, 0, 1, 0, Math.PI / 2, true);
    // Counter-clockwise from 0 to π/2 is the long way round: 3π/2 of travel.
    expect(ccw.subpaths[0].points.length / 2).toBeGreaterThan(cw.subpaths[0].points.length / 2 * 2);
  });

  it('flattens béziers close to the true curve', () => {
    const p = new PathRecorder(0.001);
    p.moveTo(0, 0);
    p.bezierCurveTo(0, 1, 1, 1, 1, 0);
    const { points } = p.subpaths[0];
    expect(points.length / 2).toBeGreaterThan(10);
    // The curve's apex is at y = 0.75.
    let maxY = 0;
    for (let i = 1; i < points.length; i += 2) maxY = Math.max(maxY, points[i]);
    expect(maxY).toBeCloseTo(0.75, 2);

    const q = new PathRecorder(0.001);
    q.moveTo(0, 0);
    q.quadraticCurveTo(0.5, 1, 1, 0);
    let qMax = 0;
    for (let i = 1; i < q.subpaths[0].points.length; i += 2) qMax = Math.max(qMax, q.subpaths[0].points[i]);
    expect(qMax).toBeCloseTo(0.5, 2);
  });

  it('records rect as its own closed subpath and roundRect as a rounded one', () => {
    const p = new PathRecorder(0.01);
    p.rect(1, 2, 3, 4);
    expect(p.subpaths[0]).toEqual({ points: [1, 2, 4, 2, 4, 6, 1, 6], closed: true });

    const r = new PathRecorder(0.01);
    r.roundRect(0, 0, 10, 10, 2);
    expect(r.subpaths[0].closed).toBe(true);
    expect(r.subpaths[0].points.length / 2).toBeGreaterThan(8);
    // No corner point survives: (0,0) is rounded away.
    expect(r.subpaths[0].points).not.toContain(-1);
    for (let i = 0; i < r.subpaths[0].points.length; i += 2) {
      expect(r.subpaths[0].points[i] === 0 && r.subpaths[0].points[i + 1] === 0).toBe(false);
    }
  });

  it('arcTo draws the tangent arc the short way', () => {
    const p = new PathRecorder(0.001);
    p.moveTo(0, 10);
    p.arcTo(0, 0, 10, 0, 5);
    const { points } = p.subpaths[0];
    // Tangent points are (0, 5) and (5, 0); every arc point is 5 from (5, 5).
    expect(points[2]).toBeCloseTo(0, 9);
    expect(points[3]).toBeCloseTo(5, 9);
    const last = points.slice(-2);
    expect(last[0]).toBeCloseTo(5, 6);
    expect(last[1]).toBeCloseTo(0, 6);
    for (let i = 2; i < points.length; i += 2) {
      expect(Math.hypot(points[i] - 5, points[i + 1] - 5)).toBeCloseTo(5, 5);
      // Short way: stays in the corner quadrant.
      expect(points[i]).toBeLessThanOrEqual(5 + 1e-9);
      expect(points[i + 1]).toBeLessThanOrEqual(5 + 1e-9);
    }
  });

  it('traces every built-in inside the unit circle', () => {
    for (const shape of Object.values(SHAPES)) {
      const p = new PathRecorder(0.002);
      shape.trace!(p, 0, 0, 1, 0, null as never);
      expect(p.subpaths.length).toBeGreaterThan(0);
      for (const sub of p.subpaths) {
        expect(maxRadius(sub.points)).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });

  it('reset keeps the recorder reusable', () => {
    const p = new PathRecorder(0.01);
    p.rect(0, 0, 1, 1);
    p.reset();
    expect(p.subpaths).toEqual([]);
    p.lineTo(3, 3); // no current point: acts as moveTo
    expect(p.subpaths).toEqual([{ points: [3, 3], closed: false }]);
  });
});
