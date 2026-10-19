import type { ShapeName } from '../../../shapes/shapes';
import type { Amount, Size } from '../../../util/scalars';
import type { IShape } from '../../shapes/shape.interface';
import type { ITheme } from '../../theme/theme.interface';

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
  /** A built-in name or a custom shape. Defaults to `'circle'`. */
  shape?: ShapeName | IShape;
}
