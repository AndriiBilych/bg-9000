import type { Surface } from '../engine/surface';
import type { ParticleStore } from '../layers/particle-field/store';
import type { IDrawGroup, IRenderer } from '../model/render/renderer.interface';
import type { IShape } from '../model/shapes/shape.interface';
import { SHAPES } from '../shapes/shapes';

export class Canvas2DRenderer implements IRenderer {
  readonly kind = 'canvas2d';

  private readonly ctx: CanvasRenderingContext2D;
  /** The surface revision whose DPR transform is currently applied. */
  private synced = -1;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly surface: Surface,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('bg-9000: could not acquire a 2D context for the canvas.');
    this.ctx = ctx;
  }

  /**
   * Assigning the canvas size resets the context, transform included, so the
   * DPR transform is re-applied whenever the surface has changed since the
   * last frame — which is also what makes the first frame right.
   */
  private sync(): void {
    if (this.synced === this.surface.revision) return;
    this.synced = this.surface.revision;
    const { dpr } = this.surface;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  beginFrame(background: string | null): void {
    this.sync();
    const { width, height } = this.surface;
    const ctx = this.ctx;
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

    const ctx = this.ctx;
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
    const ctx = this.ctx;
    ctx.save();
    try {
      draw(ctx);
    } finally {
      ctx.restore();
    }
  }

  endFrame(): void {
    // Nothing to flush for Canvas2D; the WebGL renderer composites here.
  }

  dispose(): void {
    // The canvas owns the context; nothing else to release.
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
