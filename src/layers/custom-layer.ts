import type { ISceneContext } from '../model/engine/scene-context.interface';
import type { ILayerDefinition } from '../model/layers/custom-layer.interface';
import type { ILayer } from '../model/layers/layer.interface';
import type { IGLFrame } from '../model/render/gl-frame.interface';

/**
 * Turn a definition written against the 2D context (or the GL one) into an
 * `ILayer`.
 *
 * Drawing goes through the renderer's optional immediate-mode members. On a
 * GL renderer `renderGL` is preferred and `render` is the fallback, composited
 * through the overlay; on a 2D renderer `render` is the only route. A layer
 * with nothing the renderer can honour still has `update` run and draws nothing.
 */
export function defineLayer(name: string, definition: ILayerDefinition): ILayer {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('bg-9000: defineLayer needs a name.');
  }
  if (typeof definition !== 'object' || definition === null) {
    throw new TypeError(`bg-9000: layer "${name}" needs a definition object.`);
  }

  const { init, update, render, renderGL, resize, dispose } = definition;
  let scene: ISceneContext | null = null;

  // Bound once so that `render` allocates no closure per frame.
  const paint = (ctx: CanvasRenderingContext2D): void => {
    if (render && scene) render.call(definition, ctx, scene);
  };
  const paintGL = (gl: WebGL2RenderingContext, frame: IGLFrame): void => {
    if (renderGL && scene) renderGL.call(definition, gl, scene, frame);
  };

  const layer: ILayer = {
    name,
    init(ctx) {
      init?.call(definition, ctx);
    },
    update(ctx) {
      update?.call(definition, ctx);
    },
    render(renderer, ctx) {
      if (renderGL && renderer.drawImmediateGL) {
        scene = ctx;
        renderer.drawImmediateGL(paintGL);
        scene = null;
      } else if (render && renderer.drawImmediate) {
        scene = ctx;
        renderer.drawImmediate(paint);
        scene = null;
      }
    },
    resize(ctx, prevWidth, prevHeight) {
      resize?.call(definition, ctx, prevWidth, prevHeight);
    },
    dispose() {
      dispose?.call(definition);
    },
  };

  if (definition.placement === 'below' || definition.placement === 'above') {
    (layer as { placement?: typeof definition.placement }).placement = definition.placement;
  }

  return Object.freeze(layer);
}
