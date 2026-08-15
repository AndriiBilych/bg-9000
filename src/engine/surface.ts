/**
 * Owns the canvas element's backing-store size and the device-pixel transform.
 *
 * Layers draw in CSS pixels and never think about DPR; the transform set here
 * is what makes that true. Capping DPR at 2 is an optimization for mainly phones, 
 * where a 3x ratio triples fill cost for a difference
 * almost nobody can see on a soft-edged background.
 */
export class Surface {
  readonly ctx: CanvasRenderingContext2D;

  /** CSS pixels. */
  width = 0;
  height = 0;
  /** Effective ratio after capping. */
  dpr = 1;

  private readonly observer: ResizeObserver;
  private disposed = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly maxDpr: number,
    // Every value the callback needs is passed in rather than read back off
    // `this`: the constructor measures synchronously, so a caller holding the
    // result in a `const` cannot dereference that binding yet.
    private readonly onResize: (
      width: number,
      height: number,
      dpr: number,
      prevWidth: number,
      prevHeight: number,
    ) => void,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('bg-9000: could not acquire a 2D context for the canvas.');
    this.ctx = ctx;

    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(canvas);
    this.measure();
  }

  /** Re-read the element box and resize the backing store if it changed. */
  measure(): void {
    if (this.disposed) return;

    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth));
    const height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight));
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), this.maxDpr);

    if (width === this.width && height === this.height && dpr === this.dpr) return;

    const prevWidth = this.width;
    const prevHeight = this.height;

    this.width = width;
    this.height = height;
    this.dpr = dpr;

    // Assigning width/height resets the context state, so the transform has to
    // be re-applied after, not before.
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.onResize(width, height, dpr, prevWidth, prevHeight);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
  }
}
