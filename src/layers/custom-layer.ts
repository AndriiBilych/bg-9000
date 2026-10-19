import type { ISceneContext } from '../model/engine/scene-context.interface';
import type { ILayerDefinition } from '../model/layers/custom-layer.interface';
import type { ILayer } from '../model/layers/layer.interface';

/**
 * Turn a definition written against the 2D context into an `ILayer`.
 *
 * Drawing goes through the renderer's optional `drawImmediate`; on a backend
 * without it `update` still runs and `render` is a no-op.
 */
export function defineLayer(name: string, definition: ILayerDefinition): ILayer {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('bg-9000: defineLayer needs a name.');
  }
  if (typeof definition !== 'object' || definition === null) {
    throw new TypeError(`bg-9000: layer "${name}" needs a definition object.`);
  }

  const { init, update, render, resize, dispose } = definition;
  let scene: ISceneContext | null = null;

  // Bound once so that `render` allocates no closure per frame.
  const paint = (ctx: CanvasRenderingContext2D): void => {
    if (render && scene) render.call(definition, ctx, scene);
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
      if (!render || !renderer.drawImmediate) return;
      scene = ctx;
      renderer.drawImmediate(paint);
      scene = null;
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
