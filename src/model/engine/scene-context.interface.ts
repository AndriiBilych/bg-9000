import type { IBackgroundConfig } from '../config/config.interface';
import type { ITheme } from '../theme/theme.interface';
import type { IRng } from '../util/rng.interface';

/**
 * Pointer state, in CSS pixels relative to the canvas.
 *
 * Written by the engine before every `update`, from passive listeners on
 * `window` — the canvas itself has `pointer-events: none` and never sees an
 * event. With `pointer: false` in the config nothing writes to it, and a layer
 * consulting these fields sees a stationary, inactive cursor at the origin.
 */
export interface IPointerState {
  x: number;
  y: number;
  /** A button (or touch) is currently held. */
  down: boolean;
  /** The pointer is over the canvas's box. */
  active: boolean;
}

/**
 * Everything a layer is allowed to know about the frame it is drawing.
 *
 * One instance exists per background. The engine creates it and mutates it in
 * place each frame; layers, forces and constraints only ever read it. Test
 * fixtures should go through `createSceneContext` rather than building a
 * literal, so that a new field here is not a change they have to make.
 */
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
  /**
   * The resolved colours in use, so a custom layer can paint in the palette
   * without a back-reference to the background that owns it.
   */
  theme: ITheme;
  /**
   * The normalised config, so a custom layer can honour the shared vocabulary:
   * `amount` as "how many of my thing", `speed` as a multiplier, and so on.
   * Replaced (never mutated) on every `update`.
   */
  config: Readonly<IBackgroundConfig>;
}
