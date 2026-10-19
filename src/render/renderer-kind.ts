/**
 * The renderers.
 *
 * `canvas2d` is the default and what every existing caller gets. `webgl` is
 * opt-in: the same field, the same shapes and the same layers, drawn through
 * WebGL2 with one instanced call per colour run. A renderer is chosen once, at
 * creation — a canvas can only ever hold one kind of context, so there is no
 * switching later without a new canvas.
 */
export type RendererKind = 'canvas2d' | 'webgl';

export const RENDERER_KINDS: readonly RendererKind[] = Object.freeze(['canvas2d', 'webgl']);

export const DEFAULT_RENDERER: RendererKind = 'canvas2d';

export function isRendererKind(value: unknown): value is RendererKind {
  return value === 'canvas2d' || value === 'webgl';
}
