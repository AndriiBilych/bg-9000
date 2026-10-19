import { describe, expect, it, vi } from 'vitest';
import { createSceneContext } from '../engine/scene-context';
import type { IGLFrame } from '../model/render/gl-frame.interface';
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

/** A renderer with both escape hatches, like the WebGL renderer. */
function dualRenderer(): IRenderer & { ctx: CanvasRenderingContext2D; gl: WebGL2RenderingContext; frame: IGLFrame } {
  const ctx = {} as CanvasRenderingContext2D;
  const gl = {} as WebGL2RenderingContext;
  const frame = {} as IGLFrame;
  return {
    kind: 'dual',
    ctx,
    gl,
    frame,
    beginFrame() {},
    drawShapeGroups() {},
    drawCircleGroups() {},
    drawImmediate(draw) {
      draw(ctx);
    },
    drawImmediateGL(draw) {
      draw(gl, frame);
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

  it('prefers renderGL where the renderer offers GL, and falls back to render where it does not', () => {
    const render = vi.fn();
    const renderGL = vi.fn();
    const def = { render, renderGL };
    const layer = defineLayer('x', def);
    const scene = createSceneContext();

    const dual = dualRenderer();
    layer.render(dual, scene);
    expect(renderGL).toHaveBeenCalledWith(dual.gl, scene, dual.frame);
    expect(renderGL.mock.instances[0]).toBe(def);
    expect(render).not.toHaveBeenCalled();

    const twoD = immediateRenderer();
    layer.render(twoD, scene);
    expect(render).toHaveBeenCalledWith(twoD.ctx, scene);
    expect(renderGL).toHaveBeenCalledTimes(1);
  });

  it('uses render through the GL renderer’s overlay when there is no renderGL', () => {
    const render = vi.fn();
    const layer = defineLayer('x', { render });
    const dual = dualRenderer();
    const spy = vi.spyOn(dual, 'drawImmediateGL');
    layer.render(dual, createSceneContext());
    expect(render).toHaveBeenCalledWith(dual.ctx, expect.anything());
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an unusable name or definition', () => {
    expect(() => defineLayer('', {})).toThrow(TypeError);
    // @ts-expect-error — runtime guard.
    expect(() => defineLayer('x', null)).toThrow(TypeError);
  });
});
