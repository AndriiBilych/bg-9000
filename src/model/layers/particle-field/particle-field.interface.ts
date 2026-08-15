import type { ITheme } from '../../theme/theme.interface.js';
import type { Amount, Size } from '../../../util/scalars.js';

export interface IParticleFieldOptions {
  amount: Amount;
  size: Size;
  speed: number;
  drag: number;
  maxCount: number;
  restitution: number;
  collisions: boolean;
  /** Already resolved. The field never looks a colour up itself. */
  theme: ITheme;
}
