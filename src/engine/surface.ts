/**
 * Owns the canvas element's backing-store size and the device pixel ratio.
 *
 * Layers draw in CSS pixels and never think about DPR; the surface measures,
 * and each renderer applies that measurement in its own terms — a transform
 * on the 2D context, a viewport and projection on the GL one. Capping DPR at
 * 2 is an optimization mainly for phones, where a 3x ratio triples fill cost
 * for a difference almost nobody can see on a soft-edged background.
 *
 * The surface holds no context. A canvas can carry only one kind, so the
 * renderer that needs it acquires it, and `revision` is how a renderer tells
 * that the backing store changed under it since it last looked.
 */
export class Surface {
  /** CSS pixels. */
  width = 0;
  height = 0;
  /** Effective ratio after capping. */
  dpr = 1;
  /** Bumped on every change to the backing store. Starts at 1 once measured. */
  revision = 0;

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
    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(canvas);
    this.measure();
  }

  /** Backing-store size in device pixels. */
  get pixelWidth(): number {
    return Math.round(this.width * this.dpr);
  }

  get pixelHeight(): number {
    return Math.round(this.height * this.dpr);
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
    this.revision++;

    // Assigning width/height resets a 2D context's state and resizes a GL
    // drawing buffer; either way the renderer re-syncs on the next frame.
    this.canvas.width = this.pixelWidth;
    this.canvas.height = this.pixelHeight;

    this.onResize(width, height, dpr, prevWidth, prevHeight);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
  }
}
