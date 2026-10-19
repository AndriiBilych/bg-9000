import { describe, expect, it } from 'vitest';
import { createSceneContext } from '../../engine/scene-context';
import type { ISceneContext } from '../../model/engine/scene-context.interface';
import type { IParticleFieldOptions } from '../../model/layers/particle-field/particle-field.interface';
import type { IDrawGroup, IRenderer } from '../../model/render/renderer.interface';
import type { IShape } from '../../model/shapes/shape.interface';
import { defineShape } from '../../shapes/shapes';
import { resolveTheme } from '../../theme/theme';
import { createRng } from '../../util/rng';
import { ParticleField } from './particle-field';
import type { ParticleStore } from './store';

function scene(): ISceneContext {
  return createSceneContext({ width: 1280, height: 720, rng: createRng(42) });
}

function options(patch: Partial<IParticleFieldOptions> = {}): IParticleFieldOptions {
  return {
    amount: 'moderate',
    size: 'medium',
    speed: 1,
    drag: 0,
    maxCount: 1200,
    restitution: 1,
    collisions: false,
    theme: resolveTheme('mint', 'see-through'),
    ...patch,
  };
}

/** Captures what the field asked to be drawn, without touching a canvas. */
class RecordingRenderer implements IRenderer {
  readonly kind = 'recording';
  groups: IDrawGroup[] = [];
  shape: string | null = null;
  background: string | null = null;

  beginFrame(background: string | null): void {
    this.background = background;
  }
  drawShapeGroups(_store: ParticleStore, groups: readonly IDrawGroup[], shape: IShape): void {
    this.groups = groups.map((g) => ({ ...g }));
    this.shape = shape.name;
  }
  drawCircleGroups(): void {}
  endFrame(): void {}
  dispose(): void {}
}

function draw(field: ParticleField, ctx: ISceneContext): IDrawGroup[] {
  const renderer = new RecordingRenderer();
  field.render(renderer, ctx);
  return renderer.groups;
}

function positions(field: ParticleField, ctx: ISceneContext): number[] {
  // The store is private; reading it back through the renderer is also the only
  // path the real engine has, so this tests what actually ships.
  const renderer = new RecordingRenderer();
  const captured: number[] = [];
  renderer.drawShapeGroups = (store, groups) => {
    for (const group of groups) {
      for (let i = group.start; i < group.end; i++) captured.push(store.x[i], store.y[i]);
    }
  };
  field.render(renderer, ctx);
  return captured;
}

describe('ParticleField colouring', () => {
  it('draws one group per palette variant, in the theme colours', () => {
    const ctx = scene();
    const field = new ParticleField(options({ theme: resolveTheme('midnight', 'full') }));
    field.init(ctx);

    const groups = draw(field, ctx);
    expect(groups.length).toBe(3);
    expect(groups.map((g) => g.fill)).toEqual(['#1B3A5C', '#255D78', '#2E7D8F']);
    for (const group of groups) expect(group.stroke).not.toBeNull();
  });

  it('covers every particle exactly once, in contiguous runs', () => {
    const ctx = scene();
    const field = new ParticleField(options());
    field.init(ctx);

    const groups = draw(field, ctx);
    expect(groups[0].start).toBe(0);
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i].start).toBe(groups[i - 1].end);
    }
    expect(groups[groups.length - 1].end).toBe(field.count);
  });

  /**
   * The point of holding variant count at the palette's widest array: switching
   * style is a repaint, so the field must not jump.
   */
  it('changes style without moving a single circle', () => {
    const ctx = scene();
    const field = new ParticleField(options());
    field.init(ctx);

    const before = positions(field, ctx);
    field.configure(options({ theme: resolveTheme('mint', 'dot') }), ctx);

    expect(positions(field, ctx)).toEqual(before);
    const groups = draw(field, ctx);
    for (const group of groups) {
      expect(group.fill).not.toBeNull();
      expect(group.stroke).toBeNull();
    }
  });

  it('changes palette without moving a single circle', () => {
    const ctx = scene();
    const field = new ParticleField(options());
    field.init(ctx);

    const before = positions(field, ctx);
    field.configure(options({ theme: resolveTheme('ember', 'see-through') }), ctx);

    expect(positions(field, ctx)).toEqual(before);
    expect(draw(field, ctx)[0].stroke).toBe('#F2A68F');
  });

  /**
   * A custom palette carries one fill and one outline, and is padded out to the
   * stock variant count precisely so that this holds. If it ever resolved to a
   * different number of runs, `configure` would respawn and the field would
   * jump on every switch into a custom theme.
   */
  it('changes to a custom palette without moving a single circle', () => {
    const ctx = scene();
    const field = new ParticleField(options());
    field.init(ctx);

    const before = positions(field, ctx);
    const custom = { background: '#0B0B10', fill: '#243447', outline: '#8FD6E8' };
    field.configure(options({ theme: resolveTheme(custom, 'full') }), ctx);

    expect(positions(field, ctx)).toEqual(before);
    for (const group of draw(field, ctx)) {
      expect(group.fill).toBe(custom.fill);
      expect(group.stroke).toBe(custom.outline);
    }
  });

  it('resolves contacts only when collisions are on', () => {
    const ctx = scene();
    ctx.dt = 1 / 60;

    const off = new ParticleField(options({ amount: 'alot', size: 'large' }));
    off.init(ctx);
    off.update(ctx);
    expect(off.contactCount).toBe(0);

    const on = new ParticleField(options({ amount: 'alot', size: 'large', collisions: true }));
    on.init(ctx);
    on.update(ctx);
    expect(on.contactCount).toBeGreaterThan(0);
  });

  it('adds and removes the contact stage live, without a respawn', () => {
    const ctx = scene();
    ctx.dt = 1 / 60;

    const field = new ParticleField(options({ amount: 'alot', size: 'large' }));
    field.init(ctx);
    const count = field.count;

    field.configure(options({ amount: 'alot', size: 'large', collisions: true }), ctx);
    field.update(ctx);
    expect(field.count).toBe(count);
    expect(field.contactCount).toBeGreaterThan(0);

    field.configure(options({ amount: 'alot', size: 'large', collisions: false }), ctx);
    field.update(ctx);
    expect(field.contactCount).toBe(0);
  });

  it('still respawns when the change is structural', () => {
    const ctx = scene();
    const field = new ParticleField(options({ amount: 'low' }));
    field.init(ctx);
    const before = field.count;

    field.configure(options({ amount: 'alot' }), ctx);
    expect(field.count).toBeGreaterThan(before);
  });
});

describe('ParticleField shapes', () => {
  function shapeDrawn(field: ParticleField, ctx: ISceneContext): string | null {
    const renderer = new RecordingRenderer();
    field.render(renderer, ctx);
    return renderer.shape;
  }

  it('draws circles when no shape is given', () => {
    const ctx = scene();
    const field = new ParticleField(options());
    field.init(ctx);
    expect(shapeDrawn(field, ctx)).toBe('circle');
  });

  it('resolves a built-in name and passes a custom shape through', () => {
    const ctx = scene();
    const named = new ParticleField(options({ shape: 'star' }));
    named.init(ctx);
    expect(shapeDrawn(named, ctx)).toBe('star');

    const custom = defineShape('plus', { trace: (p, x, y) => p.moveTo(x, y) });
    const own = new ParticleField(options({ shape: custom }));
    own.init(ctx);
    expect(shapeDrawn(own, ctx)).toBe('plus');
  });

  it('changes shape without moving a single particle or touching the groups', () => {
    const ctx = scene();
    const field = new ParticleField(options());
    field.init(ctx);
    const before = positions(field, ctx);
    const groups = draw(field, ctx);

    field.configure(options({ shape: 'heart' }), ctx);

    expect(shapeDrawn(field, ctx)).toBe('heart');
    expect(positions(field, ctx)).toEqual(before);
    expect(draw(field, ctx)).toEqual(groups);
  });
});
