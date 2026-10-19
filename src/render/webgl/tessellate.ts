/**
 * Polylines → triangles, in the shape the shaders expect.
 *
 * Fills are not triangulated. Ear clipping fails on self-intersections and
 * needs hole bookkeeping for a shape made of several subpaths; the stencil
 * buffer does not care about either. Each subpath becomes a triangle fan
 * from its first vertex, the fan is drawn into the stencil with increment on
 * one winding and decrement on the other, and a cover quad then paints every
 * pixel whose count is not zero. That is the non-zero fill rule exactly —
 * the same rule the 2D context fills with — for any polygon whatsoever.
 *
 * Strokes are segment quads plus round joins, with the *normal* stored per
 * vertex rather than baked into the position. The vertex shader expands
 * `position · radius + normal · lineWidth / 2`, so one unit mesh serves every
 * radius and the outline stays a constant pixel width, as a canvas stroke
 * does. Stroke geometry also goes through the stencil, so a translucent
 * outline does not darken where a join overlaps its segment.
 *
 * Vertex layouts, both `Float32Array`:
 *   fill   — `[x, y]`
 *   stroke — `[x, y, nx, ny]` (also used for cover quads)
 */
import type { ISubpath } from './path-recorder';

export interface IGlyphMesh {
  fill: Float32Array;
  fillVertices: number;
  stroke: Float32Array;
  strokeVertices: number;
  /** One quad around the glyph's bounds, expanded by the line width. */
  cover: Float32Array;
  coverVertices: number;
}

/** Steps per radian of turn on a round join; ~12 per half-turn. */
const JOIN_STEPS_PER_RADIAN = 4;

/** A growable float buffer. Nothing here allocates per frame once warm. */
export class FloatSink {
  data: Float32Array;
  length = 0;

  constructor(capacity = 1024) {
    this.data = new Float32Array(capacity);
  }

  reset(): void {
    this.length = 0;
  }

  reserve(extra: number): void {
    const needed = this.length + extra;
    if (needed <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < needed) size *= 2;
    const next = new Float32Array(size);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }

  push2(x: number, y: number): void {
    this.reserve(2);
    this.data[this.length++] = x;
    this.data[this.length++] = y;
  }

  push4(x: number, y: number, nx: number, ny: number): void {
    this.reserve(4);
    this.data[this.length++] = x;
    this.data[this.length++] = y;
    this.data[this.length++] = nx;
    this.data[this.length++] = ny;
  }

  /** A copy trimmed to what was written. */
  snapshot(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

/** Append the fan triangles of every subpath. 2 floats per vertex. */
export function tessellateFill(subpaths: readonly ISubpath[], out: FloatSink): void {
  for (const { points } of subpaths) {
    const vertexCount = points.length >> 1;
    if (vertexCount < 3) continue;
    // Every triangle shares the first vertex; the other two walk the outline.
    const originX = points[0];
    const originY = points[1];
    for (let vertex = 1; vertex < vertexCount - 1; vertex++) {
      const at = vertex * 2;
      out.push2(originX, originY);
      out.push2(points[at], points[at + 1]);
      out.push2(points[at + 2], points[at + 3]);
    }
  }
}

/**
 * Append the stroke geometry of every subpath. 4 floats per vertex. Open
 * subpaths get butt caps, closed ones a join at the seam — the canvas
 * defaults, give or take a mitre nobody can see at 1.5 px.
 */
export function tessellateStroke(subpaths: readonly ISubpath[], out: FloatSink): void {
  for (const { points, closed } of subpaths) {
    const pointCount = points.length >> 1;
    if (pointCount < 2) continue;

    // A closed subpath wraps from its last vertex back to its first. One
    // whose last point already repeats its first has one vertex fewer.
    const wraps = closed && pointCount > 2;
    const lastAt = (pointCount - 1) * 2;
    const duplicateSeam = wraps && points[0] === points[lastAt] && points[1] === points[lastAt + 1];
    const vertexCount = duplicateSeam ? pointCount - 1 : pointCount;
    const edgeCount = wraps ? vertexCount : vertexCount - 1;
    if (edgeCount < 1) continue;

    let previousNormalX = 0;
    let previousNormalY = 0;
    let firstNormalX = 0;
    let firstNormalY = 0;

    for (let edge = 0; edge < edgeCount; edge++) {
      const from = (edge % vertexCount) * 2;
      const to = ((edge + 1) % vertexCount) * 2;
      const fromX = points[from];
      const fromY = points[from + 1];
      const toX = points[to];
      const toY = points[to + 1];
      const edgeX = toX - fromX;
      const edgeY = toY - fromY;
      const edgeLength = Math.hypot(edgeX, edgeY);
      if (edgeLength === 0) continue;
      // The edge's unit normal: its direction turned a quarter turn.
      const normalX = -edgeY / edgeLength;
      const normalY = edgeX / edgeLength;

      // Two triangles: the edge, offset to either side by the normal.
      out.push4(fromX, fromY, normalX, normalY);
      out.push4(fromX, fromY, -normalX, -normalY);
      out.push4(toX, toY, normalX, normalY);
      out.push4(toX, toY, normalX, normalY);
      out.push4(fromX, fromY, -normalX, -normalY);
      out.push4(toX, toY, -normalX, -normalY);

      if (edge === 0) {
        firstNormalX = normalX;
        firstNormalY = normalY;
      } else {
        join(out, fromX, fromY, previousNormalX, previousNormalY, normalX, normalY);
      }
      previousNormalX = normalX;
      previousNormalY = normalY;
    }

    if (wraps) join(out, points[0], points[1], previousNormalX, previousNormalY, firstNormalX, firstNormalY);
  }
}

/**
 * A round join at `(x, y)` between the edge arriving with normal `in` and
 * the edge leaving with normal `out`: a fan of thin triangles sweeping the
 * short way from one normal to the other, on both sides. The inner side is
 * redundant — it is already inside both segment quads — but sweeping both
 * costs a handful of triangles and never has to decide which side is outer.
 */
function join(
  sink: FloatSink,
  x: number,
  y: number,
  inNormalX: number,
  inNormalY: number,
  outNormalX: number,
  outNormalY: number,
): void {
  const inAngle = Math.atan2(inNormalY, inNormalX);
  let sweep = Math.atan2(outNormalY, outNormalX) - inAngle;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  if (Math.abs(sweep) < 1e-6) return; // straight on

  const steps = Math.max(1, Math.ceil(Math.abs(sweep) * JOIN_STEPS_PER_RADIAN));
  for (let side = 0; side < 2; side++) {
    const sideAngle = inAngle + side * Math.PI;
    for (let step = 0; step < steps; step++) {
      const fromAngle = sideAngle + (sweep * step) / steps;
      const toAngle = sideAngle + (sweep * (step + 1)) / steps;
      sink.push4(x, y, 0, 0);
      sink.push4(x, y, Math.cos(fromAngle), Math.sin(fromAngle));
      sink.push4(x, y, Math.cos(toAngle), Math.sin(toAngle));
    }
  }
}

/**
 * Append one quad around the bounds of every point, with normals pointing
 * outward so the shader can pad it by half the line width. A 1-unit margin of
 * normal is added on top so round joins, which poke out a full half-width
 * past the corner, are covered too.
 */
export function tessellateCover(subpaths: readonly ISubpath[], out: FloatSink): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { points } of subpaths) {
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return;
  pushCoverQuad(out, minX, minY, maxX, maxY);
}

export function pushCoverQuad(out: FloatSink, minX: number, minY: number, maxX: number, maxY: number): void {
  // Normals of length √2 reach the corner of a square of half-width 1,
  // which is where a round join's fan ends.
  const reach = Math.SQRT2;
  out.push4(minX, minY, -reach, -reach);
  out.push4(maxX, minY, reach, -reach);
  out.push4(maxX, maxY, reach, reach);
  out.push4(minX, minY, -reach, -reach);
  out.push4(maxX, maxY, reach, reach);
  out.push4(minX, maxY, -reach, reach);
}

/** Build the three meshes of a glyph from its recorded subpaths. */
export function buildGlyphMesh(subpaths: readonly ISubpath[]): IGlyphMesh {
  const fill = new FloatSink();
  const stroke = new FloatSink();
  const cover = new FloatSink(24);
  tessellateFill(subpaths, fill);
  tessellateStroke(subpaths, stroke);
  tessellateCover(subpaths, cover);
  return {
    fill: fill.snapshot(),
    fillVertices: fill.length / 2,
    stroke: stroke.snapshot(),
    strokeVertices: stroke.length / 4,
    cover: cover.snapshot(),
    coverVertices: cover.length / 4,
  };
}
