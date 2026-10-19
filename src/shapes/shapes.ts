/**
 * The glyphs.
 *
 * Every built-in is a `trace`, so a field of any of them costs the same three
 * path fills as a field of circles. All are drawn inside the circle of radius
 * `r` — the circumradius the collision and boundary stages resolve against —
 * which is why a square here looks a touch smaller than a circle of the same
 * size: its corners reach `r`, its edges do not.
 */
import type { IShape, IShapeDefinition } from '../model/shapes/shape.interface';

export type ShapeName = 'circle' | 'square' | 'triangle' | 'hexagon' | 'star' | 'heart';

const TAU = Math.PI * 2;

/** A regular polygon with its first vertex at `startAngle`, traced clockwise. */
function polygon(path: CanvasPath, x: number, y: number, r: number, sides: number, startAngle: number): void {
  path.moveTo(x + Math.cos(startAngle) * r, y + Math.sin(startAngle) * r);
  for (let k = 1; k < sides; k++) {
    const a = startAngle + (k * TAU) / sides;
    path.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  path.closePath();
}

/**
 * Build a shape from a definition.
 *
 * A definition with neither contract is a programming error rather than a typo
 * in a colour name, so it throws — there is no sensible fallback for "draw
 * nothing, forever".
 */
export function defineShape(name: string, definition: IShapeDefinition): IShape {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('bg-9000: defineShape needs a name.');
  }
  const trace = typeof definition?.trace === 'function' ? definition.trace : undefined;
  const draw = typeof definition?.draw === 'function' ? definition.draw : undefined;
  if (!trace && !draw) {
    throw new TypeError(`bg-9000: shape "${name}" needs a trace or a draw function.`);
  }

  const shape: { -readonly [K in keyof IShape]: IShape[K] } = { name };
  if (trace) shape.trace = trace;
  if (draw) shape.draw = draw;
  if (definition.varies) shape.varies = true;
  return Object.freeze(shape);
}

export const SHAPES: Readonly<Record<ShapeName, IShape>> = {
  // The `moveTo` before each `arc` keeps sub-paths from being joined by a line.
  circle: defineShape('circle', {
    trace(path, x, y, r) {
      path.moveTo(x + r, y);
      path.arc(x, y, r, 0, TAU);
    },
  }),

  // Axis-aligned; corners on the circumradius, so the half-side is r/√2.
  square: defineShape('square', {
    trace(path, x, y, r) {
      const h = r * Math.SQRT1_2;
      path.moveTo(x - h, y - h);
      path.lineTo(x + h, y - h);
      path.lineTo(x + h, y + h);
      path.lineTo(x - h, y + h);
      path.closePath();
    },
  }),

  // Equilateral, apex up.
  triangle: defineShape('triangle', {
    trace(path, x, y, r) {
      polygon(path, x, y, r, 3, -Math.PI / 2);
    },
  }),

  // Flat-topped.
  hexagon: defineShape('hexagon', {
    trace(path, x, y, r) {
      polygon(path, x, y, r, 6, 0);
    },
  }),

  // Five points, apex up. The inner radius sets how "fat" the star is; 0.45
  // keeps a 3 px star readable instead of collapsing into a smudge.
  star: defineShape('star', {
    trace(path, x, y, r) {
      const inner = r * 0.45;
      const start = -Math.PI / 2;
      path.moveTo(x + Math.cos(start) * r, y + Math.sin(start) * r);
      for (let k = 1; k < 10; k++) {
        const a = start + (k * TAU) / 10;
        const radius = k % 2 === 0 ? r : inner;
        path.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
      }
      path.closePath();
    },
  }),

  // Two cubic lobes meeting at a notch, the tip on the circumradius below.
  // The control points sit outside `r`; the curve they bound does not — its
  // reach is exactly `r` at the tip and just under at the lobes' shoulders.
  heart: defineShape('heart', {
    trace(path, x, y, r) {
      const w = r * 0.85; // half-width at the shoulders
      const top = y - r * 0.95; // lobe control height
      const notch = y - r * 0.25;
      const mid = y + r * 0.2;
      const lead = y + r * 0.5; // where the sides turn in toward the tip
      const tip = y + r;
      path.moveTo(x, notch);
      path.bezierCurveTo(x, top, x - w, top, x - w, notch);
      path.bezierCurveTo(x - w, mid, x, lead, x, tip);
      path.bezierCurveTo(x, lead, x + w, mid, x + w, notch);
      path.bezierCurveTo(x + w, top, x, top, x, notch);
      path.closePath();
    },
  }),
};

export const SHAPE_NAMES: readonly ShapeName[] = Object.keys(SHAPES) as ShapeName[];

export const DEFAULT_SHAPE: ShapeName = 'circle';

export function isShapeName(value: unknown): value is ShapeName {
  return typeof value === 'string' && Object.hasOwn(SHAPES, value);
}

/** A custom shape: a name plus at least one of the two contracts. */
export function isShape(value: unknown): value is IShape {
  if (typeof value !== 'object' || value === null) return false;
  const { name, trace, draw } = value as Partial<IShape>;
  if (typeof name !== 'string' || name.length === 0) return false;
  return typeof trace === 'function' || typeof draw === 'function';
}

/** Coerce whatever arrived in `config.shape` into a name or a valid shape. */
export function normaliseShape(value: unknown, fallback: ShapeName | IShape): ShapeName | IShape {
  if (isShapeName(value)) return value;
  if (isShape(value)) return value;
  return fallback;
}

/** A name becomes its built-in; a shape is returned as is. */
export function resolveShape(shape: ShapeName | IShape | undefined): IShape {
  if (shape === undefined) return SHAPES[DEFAULT_SHAPE];
  return typeof shape === 'string' ? SHAPES[shape] : shape;
}
