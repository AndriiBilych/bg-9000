import type { IRng } from '../util/rng.interface.js';

/**
 * Normalised pointer state, in CSS pixels relative to the canvas.
 *
 * Inert: nothing writes to it, so a layer consulting these fields sees a
 * stationary, inactive cursor at the origin.
 */
export interface IPointerState {
  x: number;
  y: number;
  /** A button (or touch) is currently held. */
  down: boolean;
  /** The pointer is over the surface at all. */
  active: boolean;
}

/** Everything a layer is allowed to know about the frame it is drawing. */
export interface ISceneContext {
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
  pointer: Readonly<IPointerState>;
  rng: IRng;
}
