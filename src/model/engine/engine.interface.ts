import type { IBackgroundConfig } from '../config/config.interface';
import type { ILayer } from '../layers/layer.interface';
import type { RendererKind } from '../../render/renderer-kind';
import type { ITheme } from '../theme/theme.interface';

export interface IBackgroundStats {
  /** Smoothed frames per second. */
  fps: number;
  /** Particles currently simulated; 0 when the field is off. */
  count: number;
  /** Overlapping pairs resolved on the last step; 0 when collisions are off. */
  contacts: number;
  /** Seconds in the last frame. */
  dt: number;
  running: boolean;
}

export interface IBackground {
  readonly config: Readonly<IBackgroundConfig>;
  /**
   * The resolved colours currently in use. Exposed so a host page can match its
   * own chrome to the canvas — `theme.background` is the colour behind the
   * content — without duplicating the palette table.
   */
  readonly theme: ITheme;
  /**
   * The renderer actually drawing. Usually `config.renderer`; differs when
   * `webgl` was asked for and the canvas fell back to `canvas2d`.
   */
  readonly renderer: RendererKind;
  /** Apply a partial config. Rebuilds only what the change requires. */
  update(patch: Partial<IBackgroundConfig>): void;
  /**
   * Append a layer. Sugar for `update({ layers: [...config.layers, layer] })`,
   * so `config.layers` stays the single record of what is in the stack. Adding
   * a layer already present is a no-op.
   */
  addLayer(layer: ILayer): void;
  /** Remove and dispose a layer. Unknown layers are ignored. */
  removeLayer(layer: ILayer): void;
  pause(): void;
  resume(): void;
  getStats(): IBackgroundStats;
  /** Idempotent. Cancels the frame and detaches every observer and listener. */
  dispose(): void;
}
