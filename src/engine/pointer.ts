import type { IPointerState } from '../model/engine/scene-context.interface';
import { resetPointerState } from './scene-context';

/**
 * Tracks the pointer on behalf of every layer.
 *
 * The canvas has `pointer-events: none`, so it never receives a pointer event
 * itself; `window` is the only place to listen. Every listener is passive.
 * Coordinates are mapped into the canvas's box in CSS pixels, the space layers
 * draw in.
 */
export class PointerTracker {
  private attached = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: IPointerState,
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('pointermove', this.onMove, opts);
    window.addEventListener('pointerdown', this.onDown, opts);
    window.addEventListener('pointerup', this.onUp, opts);
    window.addEventListener('pointercancel', this.onUp, opts);
    window.addEventListener('pointerout', this.onOut, opts);
    window.addEventListener('blur', this.onBlur);
  }

  /** Remove every listener and put the state back to inert. */
  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('pointerout', this.onOut);
    window.removeEventListener('blur', this.onBlur);
    resetPointerState(this.state);
  }

  private place(event: PointerEvent): void {
    // Not cached from the resize observer: scrolling moves the box without
    // resizing it.
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.state.x = x;
    this.state.y = y;
    this.state.active = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
  }

  private readonly onMove = (event: PointerEvent): void => {
    this.place(event);
  };

  private readonly onDown = (event: PointerEvent): void => {
    this.place(event);
    this.state.down = true;
  };

  private readonly onUp = (event: PointerEvent): void => {
    this.place(event);
    this.state.down = false;
  };

  // `pointerout` with no related target is the pointer leaving the document.
  private readonly onOut = (event: PointerEvent): void => {
    if (event.relatedTarget === null) this.state.active = false;
  };

  private readonly onBlur = (): void => {
    this.state.down = false;
    this.state.active = false;
  };
}
