/**
 * The 2D overlay: how a layer written against `CanvasRenderingContext2D`
 * draws on a canvas that holds a WebGL context.
 *
 * A second canvas, never attached to the document, the same size in device
 * pixels and carrying the same DPR transform, so a layer's `render` cannot
 * tell the difference. The renderer uploads it as a texture and composites
 * it before its next GL draw, then clears it. Created lazily: a page with no
 * 2D layers never pays for it.
 */
export class Overlay2D {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Something was drawn since the last flush. */
  dirty = false;

  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor() {
    if (typeof document === 'undefined') {
      throw new Error('bg-9000: the 2D overlay needs a document to create a canvas.');
    }
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('bg-9000: could not acquire a 2D context for the overlay.');
    this.ctx = ctx;
  }

  /** Match the surface. Resizing clears the canvas, which is what we want. */
  resize(width: number, height: number, dpr: number): void {
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = false;
  }

  /** Same contract as `Canvas2DRenderer.drawImmediate`. */
  draw(fn: (ctx: CanvasRenderingContext2D) => void): void {
    const ctx = this.ctx;
    this.dirty = true;
    ctx.save();
    try {
      fn(ctx);
    } finally {
      ctx.restore();
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.dirty = false;
  }
}
