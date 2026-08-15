import type { PaletteName } from '../../theme/palettes.js';
import type { CircleStyle } from '../../theme/styles.js';
import type { Amount, Size } from '../../util/scalars.js';

export interface IBackgroundConfig {
  amount: Amount;
  size: Size;
  /** Circle-to-circle contact. Off removes the stage from the pipeline. */
  collisions: boolean;
  /** Fill, outline, or both. */
  style: CircleStyle;
  /** Background, fills and outlines, chosen as a set. */
  palette: PaletteName;
  /** Multiplier on drift velocity. */
  speed: number;
  /** Velocity damping. 0 disables the force entirely. */
  drag: number;
  /** Fraction of velocity retained on a wall bounce. */
  restitution: number;
  /** Hard ceiling on particle count, whatever the density says. */
  maxCount: number;
  /** Device pixel ratio ceiling. 2 is plenty for a soft background. */
  maxDpr: number;
  /** Fixed seed reproduces a layout exactly; omit for a random one. */
  seed?: number;
}
