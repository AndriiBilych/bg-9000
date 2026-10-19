/**
 * A `CanvasPath` that remembers, instead of draws.
 *
 * `IShape.trace` is written against the path API, and that is the contract
 * the WebGL renderer honours: a shape traces into this recorder exactly as it
 * would into a context, and what comes out is a list of flat polylines the
 * tessellator can turn into triangles. Curves are flattened to a tolerance —
 * the unit glyph is traced once and then drawn at up to ~100 device pixels,
 * so the tolerance is set by the largest size it will be stamped at, not by
 * the size it is traced at.
 *
 * Semantics follow the canvas spec where it matters for a fill: `closePath`
 * marks the subpath closed and starts a new one at its first point, `rect`
 * is its own closed subpath, and a curve call with no current point begins
 * at the curve's start.
 */

export interface ISubpath {
  /** Flat `[x0, y0, x1, y1, …]`. */
  points: number[];
  closed: boolean;
}

const TAU = Math.PI * 2;

export class PathRecorder implements CanvasPath {
  readonly subpaths: ISubpath[] = [];

  private current: ISubpath | null = null;
  /** The point a `closePath` left the pen at; the next segment starts here. */
  private pendingX = 0;
  private pendingY = 0;
  private pending = false;

  constructor(private readonly tolerance: number) {}

  /** Forget everything, keeping the allocation. */
  reset(): void {
    this.subpaths.length = 0;
    this.current = null;
    this.pending = false;
  }

  private get cursorX(): number {
    const c = this.current;
    return c && c.points.length ? c.points[c.points.length - 2] : this.pendingX;
  }

  private get cursorY(): number {
    const c = this.current;
    return c && c.points.length ? c.points[c.points.length - 1] : this.pendingY;
  }

  private hasCursor(): boolean {
    return (this.current !== null && this.current.points.length > 0) || this.pending;
  }

  /** The subpath to append to, opening one at the pending point if needed. */
  private open(): ISubpath {
    if (this.current === null) {
      this.current = { points: [], closed: false };
      this.subpaths.push(this.current);
      if (this.pending) {
        this.current.points.push(this.pendingX, this.pendingY);
        this.pending = false;
      }
    }
    return this.current;
  }

  private push(x: number, y: number): void {
    const sub = this.open();
    const n = sub.points.length;
    // Zero-length segments draw nothing and break normals; drop them.
    if (n >= 2 && sub.points[n - 2] === x && sub.points[n - 1] === y) return;
    sub.points.push(x, y);
  }

  moveTo(x: number, y: number): void {
    this.current = { points: [x, y], closed: false };
    this.subpaths.push(this.current);
    this.pending = false;
  }

  lineTo(x: number, y: number): void {
    if (!this.hasCursor()) {
      this.moveTo(x, y);
      return;
    }
    this.push(x, y);
  }

  closePath(): void {
    const sub = this.current;
    if (sub === null || sub.points.length === 0) return;
    sub.closed = true;
    this.pendingX = sub.points[0];
    this.pendingY = sub.points[1];
    this.pending = true;
    this.current = null;
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.push(x + w, y);
    this.push(x + w, y + h);
    this.push(x, y + h);
    this.closePath();
  }

  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number | DOMPointInit | Iterable<number | DOMPointInit> = 0,
  ): void {
    // One radius for all four corners covers every use a background has;
    // per-corner lists take their first entry.
    let r = 0;
    if (typeof radii === 'number') r = radii;
    else if (radii && typeof radii === 'object') {
      const first = Symbol.iterator in radii ? [...radii][0] : radii;
      r = typeof first === 'number' ? first : (first?.x ?? 0);
    }
    r = Math.min(Math.max(r, 0), Math.abs(w) / 2, Math.abs(h) / 2);
    if (r <= 0) {
      this.rect(x, y, w, h);
      return;
    }
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    this.lineTo(x + w, y + h - r);
    this.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    this.lineTo(x + r, y + h);
    this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    this.lineTo(x, y + r);
    this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    this.closePath();
  }

  arc(x: number, y: number, r: number, start: number, end: number, ccw = false): void {
    this.ellipse(x, y, r, r, 0, start, end, ccw);
  }

  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
    ccw = false,
  ): void {
    if (!(rx >= 0) || !(ry >= 0)) return;

    // Normalise the sweep the way the canvas does: a full turn or more in the
    // chosen direction is a whole ellipse; otherwise wrap into (0, 2π].
    let sweep = end - start;
    if (ccw) {
      if (sweep <= -TAU) sweep = -TAU;
      else {
        sweep = sweep % TAU;
        if (sweep > 0) sweep -= TAU;
        if (sweep === 0 && end !== start) sweep = -TAU;
      }
    } else {
      if (sweep >= TAU) sweep = TAU;
      else {
        sweep = sweep % TAU;
        if (sweep < 0) sweep += TAU;
        if (sweep === 0 && end !== start) sweep = TAU;
      }
    }

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const point = (a: number): [number, number] => {
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      return [x + px * cosR - py * sinR, y + px * sinR + py * cosR];
    };

    const [sx, sy] = point(start);
    // The spec joins the current point to the arc's start with a line.
    if (this.hasCursor()) this.push(sx, sy);
    else this.moveTo(sx, sy);

    const segments = this.arcSegments(Math.max(rx, ry), Math.abs(sweep));
    for (let k = 1; k <= segments; k++) {
      const [px, py] = point(start + (sweep * k) / segments);
      this.push(px, py);
    }
  }

  /** Steps so that no chord sits more than `tolerance` from the true arc. */
  private arcSegments(radius: number, sweep: number): number {
    if (radius <= this.tolerance) return Math.max(1, Math.ceil(sweep / (Math.PI / 2)));
    const step = 2 * Math.acos(1 - this.tolerance / radius);
    return Math.max(1, Math.min(512, Math.ceil(sweep / step)));
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    if (!this.hasCursor()) {
      this.moveTo(x1, y1);
      return;
    }
    // `arcTo` rounds the corner (x1, y1) between the current point and
    // (x2, y2): a circle of radius `r` tangent to both legs of the corner.
    const cornerX = x1;
    const cornerY = y1;
    const legToStartX = this.cursorX - cornerX;
    const legToStartY = this.cursorY - cornerY;
    const legToEndX = x2 - cornerX;
    const legToEndY = y2 - cornerY;
    const startLegLength = Math.hypot(legToStartX, legToStartY);
    const endLegLength = Math.hypot(legToEndX, legToEndY);
    const cross = legToStartX * legToEndY - legToStartY * legToEndX;
    if (startLegLength === 0 || endLegLength === 0 || r <= 0 || Math.abs(cross) < 1e-12) {
      // Collinear or degenerate: the spec draws a straight line to the corner.
      this.push(cornerX, cornerY);
      return;
    }

    // Unit directions from the corner along each leg.
    const startDirX = legToStartX / startLegLength;
    const startDirY = legToStartY / startLegLength;
    const endDirX = legToEndX / endLegLength;
    const endDirY = legToEndY / endLegLength;

    // The circle touches each leg `r / tan(angle / 2)` from the corner, and
    // its centre sits on the corner's bisector, `r / sin(angle / 2)` away.
    const cornerAngle = Math.acos(Math.max(-1, Math.min(1, startDirX * endDirX + startDirY * endDirY)));
    const tangentDistance = r / Math.tan(cornerAngle / 2);
    const centreDistance = r / Math.sin(cornerAngle / 2);

    const tangentStartX = cornerX + startDirX * tangentDistance;
    const tangentStartY = cornerY + startDirY * tangentDistance;
    const tangentEndX = cornerX + endDirX * tangentDistance;
    const tangentEndY = cornerY + endDirY * tangentDistance;

    const bisectorX = startDirX + endDirX;
    const bisectorY = startDirY + endDirY;
    const bisectorLength = Math.hypot(bisectorX, bisectorY);
    const centreX = cornerX + (bisectorX / bisectorLength) * centreDistance;
    const centreY = cornerY + (bisectorY / bisectorLength) * centreDistance;

    const startAngle = Math.atan2(tangentStartY - centreY, tangentStartX - centreX);
    const endAngle = Math.atan2(tangentEndY - centreY, tangentEndX - centreX);
    // The tangent arc is always the short way round the centre.
    const clockwiseSweep = (((endAngle - startAngle) % TAU) + TAU) % TAU;
    this.push(tangentStartX, tangentStartY);
    this.arc(centreX, centreY, r, startAngle, endAngle, clockwiseSweep > Math.PI);
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!this.hasCursor()) this.moveTo(cx, cy);
    const x0 = this.cursorX;
    const y0 = this.cursorY;
    // Error of an n-piece polyline is ≤ |B''| / (8n²), and B'' = 2(p0 − 2c + p2).
    const ddx = x0 - 2 * cx + x;
    const ddy = y0 - 2 * cy + y;
    const n = this.curveSegments(2 * Math.hypot(ddx, ddy));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      this.push(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
    }
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.hasCursor()) this.moveTo(c1x, c1y);
    const x0 = this.cursorX;
    const y0 = this.cursorY;
    // B'' is bounded by 6·max of the two second differences of the hull.
    const d1 = Math.hypot(x0 - 2 * c1x + c2x, y0 - 2 * c1y + c2y);
    const d2 = Math.hypot(c1x - 2 * c2x + x, c1y - 2 * c2y + y);
    const n = this.curveSegments(6 * Math.max(d1, d2));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      this.push(a * x0 + b * c1x + c * c2x + d * x, a * y0 + b * c1y + c * c2y + d * y);
    }
  }

  private curveSegments(secondDerivativeBound: number): number {
    const n = Math.ceil(Math.sqrt(secondDerivativeBound / (8 * this.tolerance)));
    return Math.max(1, Math.min(256, Number.isFinite(n) ? n : 1));
  }
}
