import { describe, expect, it } from 'vitest';
import { createPointerState } from '../../engine/scene-context.js';
import type { ISceneContext } from '../../model/engine/scene-context.interface.js';
import type { IParticleFieldOptions } from '../../model/layers/particle-field/particle-field.interface.js';
import type { IDrawGroup, IRenderer } from '../../model/render/renderer.interface.js';
import { resolveTheme } from '../../theme/theme.js';
import { createRng } from '../../util/rng.js';
import { ParticleField } from './particle-field.js';
import type { ParticleStore } from './store.js';

function scene(): ISceneContext {
  return {
    width: 1280,
    height: 720,
    dpr: 1,
    time: 0,
    dt: 0,
    frame: 0,
    pointer: createPointerState(),
    rng: createRng(42),
  };
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
  background: string | null = null;

  beginFrame(background: string | null): void {
    this.background = background;
  }
  drawCircleGroups(_store: ParticleStore, groups: readonly IDrawGroup[]): void {
    this.groups = groups.map((g) => ({ ...g }));
  }
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
  renderer.drawCircleGroups = (store, groups) => {
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
