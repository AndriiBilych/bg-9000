import { describe, expect, it } from 'vitest';
import { defineLayer } from '../layers/custom-layer';
import { defineShape } from '../shapes/shapes';
import { DEFAULT_CONFIG, isLayer, normaliseConfig, normaliseLayers } from './config';

describe('normaliseConfig', () => {
  it('defaults to canvas2d and accepts only the known renderers', () => {
    expect(normaliseConfig(undefined).renderer).toBe('canvas2d');
    expect(normaliseConfig({ renderer: 'webgl' }).renderer).toBe('webgl');
    expect(normaliseConfig({ renderer: 'webgpu' as never }).renderer).toBe('canvas2d');
    expect(normaliseConfig({ renderer: 'canvas2d' }, normaliseConfig({ renderer: 'webgl' })).renderer).toBe('canvas2d');
    expect(normaliseConfig({}, normaliseConfig({ renderer: 'webgl' })).renderer).toBe('webgl');
  });

  it('defaults to circles, the field on, the pointer on, and no layers', () => {
    const config = normaliseConfig(undefined);
    expect(config.shape).toBe('circle');
    expect(config.particles).toBe(true);
    expect(config.pointer).toBe(true);
    expect(config.layers).toEqual([]);
    expect(Object.isFrozen(config.layers)).toBe(true);
  });

  /**
   * The contract with every existing caller: nothing they could have passed
   * before resolves differently now.
   */
  it('leaves every pre-existing field exactly as before', () => {
    const config = normaliseConfig({
      amount: 'alot',
      size: 'small',
      style: 'dot',
      palette: 'ember',
      collisions: false,
      speed: 1.4,
      drag: 0.2,
      restitution: 0.5,
      maxCount: 300,
      maxDpr: 1,
      seed: 7,
    });
    expect(config).toMatchObject({
      amount: 'alot',
      size: 'small',
      style: 'dot',
      palette: 'ember',
      collisions: false,
      speed: 1.4,
      drag: 0.2,
      restitution: 0.5,
      maxCount: 300,
      maxDpr: 1,
      seed: 7,
    });
  });

  it('accepts a built-in shape name or a defined shape, and falls back otherwise', () => {
    const custom = defineShape('custom', { trace: () => {} });
    expect(normaliseConfig({ shape: 'star' }).shape).toBe('star');
    expect(normaliseConfig({ shape: custom }).shape).toBe(custom);
    // @ts-expect-error — a typo falls back rather than throwing.
    expect(normaliseConfig({ shape: 'blob' }).shape).toBe('circle');
    // @ts-expect-error — and so does the wrong type.
    expect(normaliseConfig({ shape: 42 }, { ...DEFAULT_CONFIG, shape: 'heart' }).shape).toBe('heart');
  });

  it('treats the new booleans as opt-outs: only an actual boolean changes them', () => {
    expect(normaliseConfig({ particles: false }).particles).toBe(false);
    expect(normaliseConfig({ pointer: false }).pointer).toBe(false);
    // @ts-expect-error — a non-boolean keeps the base value.
    expect(normaliseConfig({ particles: 'no' }).particles).toBe(true);
    expect(normaliseConfig({ pointer: undefined }).pointer).toBe(true);
  });

  it('carries layers through and drops anything that is not one', () => {
    const a = defineLayer('a', {});
    const b = defineLayer('b', {});
    // @ts-expect-error — junk in the list is filtered, not thrown on.
    const config = normaliseConfig({ layers: [a, 'nope', null, { name: 'half', init() {} }, b, a] });
    expect(config.layers).toEqual([a, b]);
    expect(Object.isFrozen(config.layers)).toBe(true);
  });

  /**
   * Identity stability, same as for a custom palette: the engine diffs the
   * list by identity, so a caller rebuilding the array each call must not
   * cause a re-init of every layer.
   */
  it('returns the previous list when the contents have not changed', () => {
    const a = defineLayer('a', {});
    const first = normaliseConfig({ layers: [a] });
    const second = normaliseConfig({ layers: [a] }, first);
    expect(second.layers).toBe(first.layers);

    const third = normaliseConfig({ layers: [] }, first);
    expect(third.layers).not.toBe(first.layers);
    expect(third.layers).toEqual([]);

    const fourth = normaliseConfig({ speed: 2 }, first);
    expect(fourth.layers).toBe(first.layers);
  });

  it('keeps a custom shape by identity across an unrelated update', () => {
    const custom = defineShape('custom', { draw: () => {} });
    const first = normaliseConfig({ shape: custom });
    const second = normaliseConfig({ speed: 3 }, first);
    expect(second.shape).toBe(custom);
  });
});

describe('isLayer / normaliseLayers', () => {
  it('requires the full lifecycle', () => {
    expect(isLayer(defineLayer('x', {}))).toBe(true);
    expect(isLayer({ name: 'x', init() {}, update() {}, render() {}, resize() {} })).toBe(false);
    expect(isLayer(null)).toBe(false);
    expect(isLayer('layer')).toBe(false);
  });

  it('falls back to the previous list for a non-array', () => {
    const base = Object.freeze([defineLayer('x', {})]);
    expect(normaliseLayers(undefined, base)).toBe(base);
    expect(normaliseLayers('x', base)).toBe(base);
  });
});
