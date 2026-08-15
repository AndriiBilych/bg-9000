/** How a circle is painted, independent of which colours it is painted in. */
export interface IStyleSpec {
  readonly usesFill: boolean;
  readonly usesOutline: boolean;
  /** CSS pixels. The surface transform means this is never device pixels. */
  readonly lineWidth: number;
}
