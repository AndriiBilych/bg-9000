import type { IBackgroundConfig } from '../config/config.interface.js';
import type { ITheme } from '../theme/theme.interface.js';

export interface IBackgroundStats {
  /** Smoothed frames per second. */
  fps: number;
  /** Particles currently simulated. */
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
  /** Apply a partial config. Rebuilds only what the change requires. */
  update(patch: Partial<IBackgroundConfig>): void;
  pause(): void;
  resume(): void;
  getStats(): IBackgroundStats;
  /** Idempotent. Cancels the frame and detaches every observer and listener. */
  dispose(): void;
}
