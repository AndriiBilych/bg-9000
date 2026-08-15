import type { Amount, Size } from '../../../util/scalars.js';
import type { IRng } from '../../util/rng.interface.js';

export interface ISpawnOptions {
  amount: Amount;
  size: Size;
  speed: number;
  maxCount: number;
  width: number;
  height: number;
  /** How many distinct colours the palette offers. */
  colourCount: number;
  rng: IRng;
}

export interface ISpawnResult {
  count: number;
  /**
   * Index boundaries between colour runs; length is `colourCount + 1`.
   * Colour c occupies `[bounds[c], bounds[c + 1])`.
   */
  colourBounds: Int32Array;
}
