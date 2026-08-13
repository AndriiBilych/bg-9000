import type { Rng } from '../util/rng.js';

/**
 * Normalised pointer state, in CSS pixels relative to the canvas.
 *
 * Nothing writes to this yet — interaction lands in a later version. It exists
 * now so that layers written today already read the pointer from the place it
 * will eventually live, rather than being rewritten when it arrives.
 */
export interface PointerState {
  x: number;
  y: number;
  /** A button (or touch) is currently held. */
  down: boolean;
  /** The pointer is over the surface at all. */
  active: boolean;
}

/** Everything a layer is allowed to know about the frame it is drawing. */
export interface SceneContext {
  /** Canvas size in CSS pixels — never device pixels. */
  width: number;
  height: number;
  /** Device pixel ratio actually in use, after capping. */
  dpr: number;
  /** Seconds since the engine started, excluding paused time. */
  time: number;
  /** Seconds since the previous frame, clamped. */
  dt: number;
  /** Frames rendered since start. */
  frame: number;
  pointer: Readonly<PointerState>;
  rng: Rng;
}

export function createPointerState(): PointerState {
  return { x: 0, y: 0, down: false, active: false };
}
