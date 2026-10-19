import type { Surface } from '../engine/surface';
import type { ParticleStore } from '../layers/particle-field/store';
import type { IDrawGroup, IRenderer } from '../model/render/renderer.interface';
import type { IShape } from '../model/shapes/shape.interface';
import { SHAPES } from '../shapes/shapes';

export class Canvas2DRenderer implements IRenderer {
  readonly kind = 'canvas2d';

  constructor(private readonly surface: Surface) {}

  beginFrame(background: string | null): void {
    const { ctx, width, height } = this.surface;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }

  /**
   * A tracing shape becomes one path per group holding many sub-paths, so a
   * field of 460 particles costs three fill calls rather than 460. A drawing
   * shape is handed the context with the group's colours applied and paints
   * each particle itself.
   */
  drawShapeGroups(store: ParticleStore, groups: readonly IDrawGroup[], shape: IShape): void {
    const { trace, draw } = shape;
    if (!trace && !draw) {
      throw new TypeError(`bg-9000: shape "${shape.name}" has neither trace nor draw.`);
    }

    const ctx = this.surface.ctx;
    const { x, y, radius } = store;

    for (const group of groups) {
      const end = Math.min(group.end, store.count);
      if (end <= group.start) continue;
      if (!group.fill && !group.stroke) continue;

      if (trace) {
        ctx.beginPath();
        for (let i = group.start; i < end; i++) {
          trace(ctx, x[i], y[i], radius[i], i, store);
        }
        paint(ctx, group);
      } else {
        // Saved per run, not per particle: a shape that sets a font or an
        // alpha once keeps it for the run.
        ctx.save();
        if (group.fill) ctx.fillStyle = group.fill;
        if (group.stroke) ctx.strokeStyle = group.stroke;
        ctx.lineWidth = group.lineWidth;
        for (let i = group.start; i < end; i++) {
          draw!(ctx, x[i], y[i], radius[i], group, i, store);
        }
        ctx.restore();
      }
    }
  }

  /** @deprecated Use `drawShapeGroups` with `SHAPES.circle`. */
  drawCircleGroups(store: ParticleStore, groups: readonly IDrawGroup[]): void {
    this.drawShapeGroups(store, groups, SHAPES.circle);
  }

  /**
   * Saved and restored around the callback so that a layer cannot leak state
   * into the field's draw calls — and `finally` so that a layer that throws
   * does not leave the transform and styles wherever it left them.
   */
  drawImmediate(draw: (ctx: CanvasRenderingContext2D) => void): void {
    const ctx = this.surface.ctx;
    ctx.save();
    try {
      draw(ctx);
    } finally {
      ctx.restore();
    }
  }

  endFrame(): void {
    // Nothing to flush for Canvas2D; a WebGL backend would submit here.
  }

  dispose(): void {
    // The surface owns the context and canvas; nothing else to release.
  }
}

/** Fill and/or stroke the current path in the group's colours. */
function paint(ctx: CanvasRenderingContext2D, group: IDrawGroup): void {
  if (group.fill) {
    ctx.fillStyle = group.fill;
    ctx.fill();
  }
  if (group.stroke) {
    ctx.lineWidth = group.lineWidth;
    ctx.strokeStyle = group.stroke;
    ctx.stroke();
  }
}
