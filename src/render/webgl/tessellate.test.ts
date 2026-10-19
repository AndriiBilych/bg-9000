import { describe, expect, it } from 'vitest';
import { SHAPES } from '../../shapes/shapes';
import { PathRecorder } from './path-recorder';
import { FloatSink, buildGlyphMesh, tessellateFill, tessellateStroke } from './tessellate';

/**
 * What the stencil buffer computes, on the CPU: the signed count of fan
 * triangles covering a point. Non-zero means "inside" under the non-zero
 * rule, which is what `ctx.fill()` uses.
 */
function winding(fill: Float32Array, px: number, py: number): number {
  let count = 0;
  for (let i = 0; i < fill.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = [fill[i], fill[i + 1], fill[i + 2], fill[i + 3], fill[i + 4], fill[i + 5]];
    const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
    const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (neg && pos) continue;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    count += area > 0 ? 1 : area < 0 ? -1 : 0;
  }
  return count;
}

function unitMesh(name: keyof typeof SHAPES) {
  const p = new PathRecorder(0.002);
  SHAPES[name].trace!(p, 0, 0, 1, 0, null as never);
  return buildGlyphMesh(p.subpaths);
}

describe('tessellateFill (stencil fan)', () => {
  it('covers the inside of a concave star exactly once and leaves its notches empty', () => {
    const mesh = unitMesh('star');
    expect(Math.abs(winding(mesh.fill, 0, 0))).toBe(1);
    // A point tip, straight up at radius 0.9.
    expect(Math.abs(winding(mesh.fill, 0, -0.9))).toBe(1);
    // Between two tips at radius 0.8 is outside the star (inner radius 0.45).
    const a = -Math.PI / 2 + Math.PI / 5;
    expect(winding(mesh.fill, Math.cos(a) * 0.8, Math.sin(a) * 0.8)).toBe(0);
    expect(winding(mesh.fill, 1.5, 0)).toBe(0);
  });

  it('fills the heart, a curve-only shape, inside and not outside', () => {
    const mesh = unitMesh('heart');
    expect(Math.abs(winding(mesh.fill, 0.1, 0.2))).toBe(1);
    expect(Math.abs(winding(mesh.fill, -0.5, -0.4))).toBe(1);
    // The notch between the lobes sits above the shape.
    expect(winding(mesh.fill, 0, -0.9)).toBe(0);
  });

  it('ignores degenerate subpaths', () => {
    const out = new FloatSink();
    tessellateFill([{ points: [0, 0, 1, 1], closed: false }], out);
    expect(out.length).toBe(0);
  });
});

describe('tessellateStroke', () => {
  it('emits two triangles per edge with unit normals, plus joins', () => {
    const out = new FloatSink();
    tessellateStroke([{ points: [0, 0, 1, 0], closed: false }], out);
    expect(out.length).toBe(6 * 4);
    const d = out.data;
    // Normals are perpendicular to the edge and of unit length.
    for (let i = 0; i < out.length; i += 4) {
      expect(Math.abs(d[i + 2])).toBeCloseTo(0, 6);
      expect(Math.abs(d[i + 3])).toBeCloseTo(1, 6);
    }
  });

  it('joins the seam of a closed subpath and skips a duplicated closing point', () => {
    const open = new FloatSink();
    tessellateStroke([{ points: [0, 0, 1, 0, 1, 1, 0, 1], closed: false }], open);
    const closed = new FloatSink();
    tessellateStroke([{ points: [0, 0, 1, 0, 1, 1, 0, 1], closed: true }], closed);
    const dup = new FloatSink();
    tessellateStroke([{ points: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0], closed: true }], dup);
    expect(closed.length).toBeGreaterThan(open.length);
    expect(dup.length).toBe(closed.length);
  });

  it('skips a polyline with a single point', () => {
    const out = new FloatSink();
    tessellateStroke([{ points: [0, 0], closed: true }], out);
    expect(out.length).toBe(0);
  });
});

describe('buildGlyphMesh', () => {
  it('bounds every built-in with one cover quad inside the unit square', () => {
    for (const name of Object.keys(SHAPES) as Array<keyof typeof SHAPES>) {
      const mesh = unitMesh(name);
      expect(mesh.coverVertices).toBe(6);
      expect(mesh.fillVertices % 3).toBe(0);
      expect(mesh.strokeVertices % 3).toBe(0);
      expect(mesh.fillVertices).toBeGreaterThan(0);
      for (let i = 0; i < mesh.cover.length; i += 4) {
        expect(Math.abs(mesh.cover[i])).toBeLessThanOrEqual(1 + 1e-6);
        expect(Math.abs(mesh.cover[i + 1])).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });
});

describe('FloatSink', () => {
  it('grows without losing what was written', () => {
    const sink = new FloatSink(4);
    for (let i = 0; i < 100; i++) sink.push2(i, -i);
    expect(sink.length).toBe(200);
    expect(sink.data[198]).toBe(99);
    expect(sink.snapshot()).toHaveLength(200);
    sink.reset();
    expect(sink.length).toBe(0);
  });
});
