import { describe, expect, it, vi } from 'vitest';
import { createSceneContext } from '../engine/scene-context';
import type { IRenderer } from '../model/render/renderer.interface';
import { defineLayer } from './custom-layer';

function immediateRenderer(): IRenderer & { ctx: CanvasRenderingContext2D } {
  const ctx = {} as CanvasRenderingContext2D;
  return {
    kind: 'fake',
    ctx,
    beginFrame() {},
    drawShapeGroups() {},
    drawCircleGroups() {},
    drawImmediate(draw) {
      draw(ctx);
    },
    endFrame() {},
    dispose() {},
  };
}

function batchOnlyRenderer(): IRenderer {
  return {
    kind: 'batch',
    beginFrame() {},
    drawShapeGroups() {},
    drawCircleGroups() {},
    endFrame() {},
    dispose() {},
  };
}

describe('defineLayer', () => {
  it('produces a complete, frozen ILayer from an empty definition', () => {
    const layer = defineLayer('empty', {});
    const scene = createSceneContext();
    expect(layer.name).toBe('empty');
    expect(layer.placement).toBeUndefined();
    expect(Object.isFrozen(layer)).toBe(true);
    expect(() => {
      layer.init(scene);
      layer.update(scene);
      layer.render(immediateRenderer(), scene);
      layer.resize(scene, 1, 1);
      layer.dispose();
    }).not.toThrow();
  });

  it('forwards every hook, with the definition as `this`', () => {
    const def = {
      placement: 'below' as const,
      init: vi.fn(),
      update: vi.fn(),
      render: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    const layer = defineLayer('full', def);
    const scene = createSceneContext();
    const renderer = immediateRenderer();

    layer.init(scene);
    layer.update(scene);
    layer.render(renderer, scene);
    layer.resize(scene, 640, 480);
    layer.dispose();

    expect(layer.placement).toBe('below');
    expect(def.init).toHaveBeenCalledWith(scene);
    expect(def.update).toHaveBeenCalledWith(scene);
    expect(def.render).toHaveBeenCalledWith(renderer.ctx, scene);
    expect(def.render.mock.instances[0]).toBe(def);
    expect(def.resize).toHaveBeenCalledWith(scene, 640, 480);
    expect(def.dispose).toHaveBeenCalledTimes(1);
  });

  it('draws nothing, without error, on a renderer that has no immediate mode', () => {
    const render = vi.fn();
    const layer = defineLayer('x', { render });
    layer.render(batchOnlyRenderer(), createSceneContext());
    expect(render).not.toHaveBeenCalled();
  });

  it('does not call drawImmediate at all when there is nothing to render', () => {
    const renderer = immediateRenderer();
    const spy = vi.spyOn(renderer, 'drawImmediate');
    defineLayer('x', { update() {} }).render(renderer, createSceneContext());
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an unusable name or definition', () => {
    expect(() => defineLayer('', {})).toThrow(TypeError);
    // @ts-expect-error — runtime guard.
    expect(() => defineLayer('x', null)).toThrow(TypeError);
  });
});
