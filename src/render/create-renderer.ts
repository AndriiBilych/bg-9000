import type { Surface } from '../engine/surface';
import type { IRenderer } from '../model/render/renderer.interface';
import { Canvas2DRenderer } from './canvas2d';
import type { RendererKind } from './renderer-kind';
import { WebGLRenderer } from './webgl/webgl';

/**
 * Stand up the requested renderer, or the one the canvas can actually give.
 *
 * `webgl` fails for ordinary reasons — no WebGL2, a blocklisted GPU, a canvas
 * that already handed out a 2D context — and a background is not worth
 * taking the page down over any of them. It is reported on the console,
 * because silently drawing through the other renderer is the kind of thing
 * that costs an afternoon, and then Canvas2D takes over. `canvas2d` has no
 * fallback; if a canvas cannot give a 2D context, nothing here can help.
 */
export function createRenderer(kind: RendererKind, canvas: HTMLCanvasElement, surface: Surface): IRenderer {
  if (kind === 'webgl') {
    try {
      return new WebGLRenderer(canvas, surface);
    } catch (error) {
      console.error('bg-9000: WebGL renderer unavailable; falling back to canvas2d.', error);
    }
  }
  return new Canvas2DRenderer(canvas, surface);
}
