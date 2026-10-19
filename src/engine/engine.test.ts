import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISceneContext } from '../model/engine/scene-context.interface';
import type { ILayer } from '../model/layers/layer.interface';
import type { IRenderer } from '../model/render/renderer.interface';
import { defineLayer } from '../layers/custom-layer';
import { defineShape } from '../shapes/shapes';
import { fakeGL, type IFakeGL } from '../render/webgl/webgl.fixture';
import { createBackground } from './engine';

/**
 * Just enough DOM for the engine to stand up: a canvas with a context that
 * records what is drawn, a resize observer that never fires, a frame scheduler
 * driven by hand, and a window that remembers its listeners so pointer events
 * can be fed in directly.
 */

type Listener = (event: unknown) => void;

class FakeCanvasElement {
  width = 0;
  height = 0;
  rect = { left: 10, top: 20, width: 800, height: 600 };
  drawn: string[] = [];
  /** Kinds of context asked for, in order. */
  requested: string[] = [];
  /**
   * A fake WebGL2 context. When present, `getContext('webgl2')` hands it out;
   * when null the canvas has no WebGL2, as a browser without it would.
   */
  webgl: IFakeGL | null = null;
  isConnected = false;
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, fn: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }

  getContext(kind = '2d'): unknown {
    this.requested.push(kind);
    if (kind === 'webgl2') return this.webgl?.gl ?? null;
    if (kind !== '2d') return null;
    const drawn = this.drawn;
    return new Proxy(
      {},
      {
        get: (_, key: string) => (...args: unknown[]) => {
          drawn.push(args.length ? `${key}(${args.join(',')})` : `${key}()`);
        },
        set: (_, key: string, value) => {
          drawn.push(`${key}=${String(value)}`);
          return true;
        },
      },
    );
  }

  getBoundingClientRect(): DOMRect {
    return this.rect as DOMRect;
  }

  get clientWidth(): number {
    return this.rect.width;
  }
  get clientHeight(): number {
    return this.rect.height;
  }
}

const listeners = new Map<string, Set<Listener>>();
function on(type: string, fn: Listener): void {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(fn);
}
function off(type: string, fn: Listener): void {
  listeners.get(type)?.delete(fn);
}
function fire(type: string, event: unknown): void {
  for (const fn of listeners.get(type) ?? []) fn(event);
}
function listenerCount(): number {
  let n = 0;
  for (const set of listeners.values()) n += set.size;
  return n;
}

let frames: Array<(now: number) => void> = [];
function tick(now: number): void {
  const due = frames;
  frames = [];
  for (const fn of due) fn(now);
}

beforeEach(() => {
  listeners.clear();
  frames = [];
  vi.stubGlobal('HTMLCanvasElement', FakeCanvasElement);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (fn: (now: number) => void): number => {
    frames.push(fn);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('window', { devicePixelRatio: 1, addEventListener: on, removeEventListener: off });
  vi.stubGlobal('document', { hidden: false, addEventListener: on, removeEventListener: off });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function canvas(): HTMLCanvasElement {
  return new FakeCanvasElement() as unknown as HTMLCanvasElement;
}

function glCanvas(): { el: HTMLCanvasElement; fake: FakeCanvasElement; gl: IFakeGL } {
  const fake = new FakeCanvasElement();
  fake.webgl = fakeGL();
  return { el: fake as unknown as HTMLCanvasElement, fake, gl: fake.webgl };
}

/** A layer that records its lifecycle and what it saw. */
function probe(name: string, placement?: 'below' | 'above'): ILayer & { log: string[]; scene: ISceneContext | null } {
  const layer = {
    name,
    placement,
    log: [] as string[],
    scene: null as ISceneContext | null,
    init(ctx: ISceneContext) {
      this.scene = ctx;
      this.log.push('init');
    },
    update() {
      this.log.push('update');
    },
    render(renderer: IRenderer, ctx: ISceneContext) {
      this.scene = ctx;
      this.log.push('render');
      order.push(name);
      // Leaves a marker in the canvas log so draw order can be checked.
      renderer.drawImmediate?.((c) => c.fillText(name, 0, 0));
    },
    resize() {
      this.log.push('resize');
    },
    dispose() {
      this.log.push('dispose');
    },
  };
  return layer;
}
let order: string[] = [];

describe('createBackground — unchanged behaviour', () => {
  it('draws the field as circles with the defaults, and nothing else', () => {
    const el = canvas();
    const bg = createBackground(el);
    const drawn = (el as unknown as FakeCanvasElement).drawn;

    expect(bg.config.shape).toBe('circle');
    expect(bg.config.particles).toBe(true);
    expect(drawn.some((d) => d.startsWith('arc('))).toBe(true);
    expect(bg.getStats().count).toBeGreaterThan(0);
    bg.dispose();
  });

  it('detaches every window and document listener on dispose', () => {
    const bg = createBackground(canvas());
    expect(listenerCount()).toBeGreaterThan(1);
    bg.dispose();
    expect(listenerCount()).toBe(0);
  });

  /**
   * `IBackground.dispose` is documented idempotent. The guard matters for
   * layers: without it a second call would `dispose` each of them again.
   */
  it('treats a second dispose as a no-op rather than disposing layers twice', () => {
    const layer = probe('p');
    const bg = createBackground(canvas(), { layers: [layer] });
    bg.dispose();
    expect(() => bg.dispose()).not.toThrow();
    expect(layer.log.filter((l) => l === 'dispose')).toHaveLength(1);
    expect(listenerCount()).toBe(0);
  });
});

describe('createBackground — shapes', () => {
  it('traces a built-in shape instead of arcs', () => {
    const el = canvas();
    const bg = createBackground(el, { shape: 'square' });
    const drawn = (el as unknown as FakeCanvasElement).drawn;
    expect(drawn.some((d) => d.startsWith('arc('))).toBe(false);
    expect(drawn.some((d) => d.startsWith('lineTo('))).toBe(true);
    bg.dispose();
  });

  it('switches shape live without respawning', () => {
    const el = canvas();
    const bg = createBackground(el, { seed: 1 });
    const count = bg.getStats().count;
    const drawn = (el as unknown as FakeCanvasElement).drawn;
    drawn.length = 0;

    const custom = defineShape('probe', { trace: (p, x, y) => p.rect(x, y, 1, 1) });
    bg.update({ shape: custom });
    bg.pause();
    bg.update({ shape: custom }); // forces a render while paused
    expect(bg.config.shape).toBe(custom);
    expect(bg.getStats().count).toBe(count);
    expect(drawn.some((d) => d.startsWith('rect('))).toBe(true);
    bg.dispose();
  });
});

describe('createBackground — layers', () => {
  beforeEach(() => {
    order = [];
  });

  it('initialises layers given at creation and orders them around the field', () => {
    const below = probe('below', 'below');
    const above = probe('above');
    const el = canvas();
    const bg = createBackground(el, { layers: [above, below] });

    expect(below.log[0]).toBe('init');
    expect(above.log[0]).toBe('init');

    const drawn = (el as unknown as FakeCanvasElement).drawn;
    drawn.length = 0;
    order = [];
    bg.pause();
    bg.update({ speed: 2 }); // renders while paused
    const firstArc = drawn.findIndex((d) => d.startsWith('arc('));
    expect(firstArc).toBeGreaterThan(-1);
    expect(order).toEqual(['below', 'above']);
    // 'below' rendered before the field's arcs, 'above' after.
    expect(drawn.indexOf('fillText(below,0,0)')).toBeLessThan(firstArc);
    expect(drawn.indexOf('fillText(above,0,0)')).toBeGreaterThan(firstArc);
    bg.dispose();
    expect(below.log.at(-1)).toBe('dispose');
    expect(above.log.at(-1)).toBe('dispose');
  });

  it('hands layers a scene with the theme and config on it, kept in sync', () => {
    const layer = probe('p');
    const bg = createBackground(canvas(), { layers: [layer], palette: 'dusk' });
    expect(layer.scene?.theme).toBe(bg.theme);
    expect(layer.scene?.config).toBe(bg.config);

    bg.update({ palette: 'ember', amount: 'low' });
    expect(layer.scene?.theme).toBe(bg.theme);
    expect(layer.scene?.theme.palette).toBe('ember');
    expect(layer.scene?.config.amount).toBe('low');
    bg.dispose();
  });

  it('updates and renders layers every frame, resizes them with the surface', () => {
    const layer = probe('p');
    const bg = createBackground(canvas(), { layers: [layer] });
    tick(0);
    tick(16);
    expect(layer.log.filter((l) => l === 'update')).toHaveLength(2);
    expect(layer.log.filter((l) => l === 'render').length).toBeGreaterThanOrEqual(3);
    bg.dispose();
  });

  it('diffs the list on update: new layers init, dropped layers dispose, kept ones are untouched', () => {
    const a = probe('a');
    const b = probe('b');
    const c = probe('c');
    const bg = createBackground(canvas(), { layers: [a, b] });
    const aInits = a.log.filter((l) => l === 'init').length;

    bg.update({ layers: [a, c] });
    expect(a.log.filter((l) => l === 'init')).toHaveLength(aInits);
    expect(a.log).not.toContain('dispose');
    expect(b.log.at(-1)).toBe('dispose');
    expect(c.log[0]).toBe('init');

    // Same contents again: nothing happens to anyone.
    const cLen = c.log.length;
    bg.update({ layers: [a, c] });
    expect(c.log.filter((l) => l === 'init')).toHaveLength(1);
    expect(c.log.length).toBeGreaterThanOrEqual(cLen);
    bg.dispose();
  });

  it('addLayer and removeLayer are sugar over config.layers', () => {
    const a = probe('a');
    const b = probe('b');
    const bg = createBackground(canvas(), { layers: [a] });

    bg.addLayer(b);
    expect(bg.config.layers).toEqual([a, b]);
    expect(b.log[0]).toBe('init');

    bg.addLayer(b); // already present
    expect(bg.config.layers).toEqual([a, b]);
    expect(b.log.filter((l) => l === 'init')).toHaveLength(1);

    bg.removeLayer(a);
    expect(bg.config.layers).toEqual([b]);
    expect(a.log.at(-1)).toBe('dispose');

    bg.removeLayer(a); // already gone
    expect(a.log.filter((l) => l === 'dispose')).toHaveLength(1);
    bg.dispose();
  });

  it('a removed layer that comes back is initialised again', () => {
    const a = probe('a');
    const bg = createBackground(canvas(), { layers: [a] });
    bg.removeLayer(a);
    bg.addLayer(a);
    expect(a.log.filter((l) => l === 'init')).toHaveLength(2);
    bg.dispose();
  });

  it('works with defineLayer end to end, drawing through the real renderer', () => {
    const el = canvas();
    const render = vi.fn((ctx: CanvasRenderingContext2D, _scene: ISceneContext) => {
      ctx.fillRect(1, 2, 3, 4);
    });
    const bg = createBackground(el, { layers: [defineLayer('w', { render })] });
    expect(render).toHaveBeenCalled();
    expect(render.mock.calls[0][1].width).toBe(800);
    const drawn = (el as unknown as FakeCanvasElement).drawn;
    const i = drawn.indexOf('fillRect(1,2,3,4)');
    expect(i).toBeGreaterThan(-1);
    expect(drawn[i - 1]).toBe('save()');
    expect(drawn[i + 1]).toBe('restore()');
    bg.dispose();
  });
});

describe('createBackground — particles toggle', () => {
  it('particles: false leaves only custom layers in the stack', () => {
    const el = canvas();
    const layer = probe('p');
    const bg = createBackground(el, { particles: false, layers: [layer] });
    const drawn = (el as unknown as FakeCanvasElement).drawn;

    expect(drawn.some((d) => d.startsWith('arc('))).toBe(false);
    expect(layer.log).toContain('render');
    expect(bg.getStats()).toMatchObject({ count: 0, contacts: 0 });
    // The background is still painted, so the page behind never shows through.
    expect(drawn.some((d) => d.startsWith('fillRect('))).toBe(true);
    bg.dispose();
  });

  it('toggles the field live in both directions', () => {
    const el = canvas();
    const bg = createBackground(el, { seed: 3 });
    const drawn = (el as unknown as FakeCanvasElement).drawn;
    const count = bg.getStats().count;
    bg.pause();

    drawn.length = 0;
    bg.update({ particles: false });
    expect(drawn.some((d) => d.startsWith('arc('))).toBe(false);
    expect(bg.getStats().count).toBe(0);

    drawn.length = 0;
    bg.update({ particles: true });
    expect(drawn.some((d) => d.startsWith('arc('))).toBe(true);
    expect(bg.getStats().count).toBe(count);
    bg.dispose();
  });
});

describe('createBackground — pointer', () => {
  it('publishes window pointer events in canvas CSS pixels', () => {
    const layer = probe('p');
    const bg = createBackground(canvas(), { layers: [layer] });
    const pointer = layer.scene!.pointer;
    expect(pointer).toEqual({ x: 0, y: 0, down: false, active: false });

    fire('pointermove', { clientX: 110, clientY: 220 });
    expect(pointer).toEqual({ x: 100, y: 200, down: false, active: true });

    fire('pointerdown', { clientX: 110, clientY: 220 });
    expect(pointer.down).toBe(true);
    fire('pointerup', { clientX: 110, clientY: 220 });
    expect(pointer.down).toBe(false);

    // Outside the canvas box: still reported, but not active.
    fire('pointermove', { clientX: 5, clientY: 5 });
    expect(pointer).toMatchObject({ x: -5, y: -15, active: false });

    fire('pointermove', { clientX: 110, clientY: 220 });
    fire('pointerout', { relatedTarget: null });
    expect(pointer.active).toBe(false);

    fire('pointerdown', { clientX: 110, clientY: 220 });
    fire('blur', {});
    expect(pointer).toMatchObject({ down: false, active: false });
    bg.dispose();
  });

  it('pointer: false attaches nothing and reads inert; toggling live attaches and detaches', () => {
    const layer = probe('p');
    const bg = createBackground(canvas(), { layers: [layer], pointer: false });
    const before = listenerCount();
    fire('pointermove', { clientX: 110, clientY: 220 });
    expect(layer.scene!.pointer).toEqual({ x: 0, y: 0, down: false, active: false });

    bg.update({ pointer: true });
    expect(listenerCount()).toBeGreaterThan(before);
    fire('pointermove', { clientX: 110, clientY: 220 });
    expect(layer.scene!.pointer.active).toBe(true);

    bg.update({ pointer: false });
    expect(listenerCount()).toBe(before);
    expect(layer.scene!.pointer).toEqual({ x: 0, y: 0, down: false, active: false });
    bg.dispose();
  });
});

describe('createBackground — renderer option', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to canvas2d and never asks the canvas for anything else', () => {
    const { el, fake } = glCanvas();
    const bg = createBackground(el);
    expect(bg.config.renderer).toBe('canvas2d');
    expect(bg.renderer).toBe('canvas2d');
    expect(fake.requested).toEqual(['2d']);
    expect(console.error).not.toHaveBeenCalled();
    bg.dispose();
  });

  it('draws the field through WebGL when asked and the canvas agrees', () => {
    const { el, fake, gl } = glCanvas();
    const bg = createBackground(el, { renderer: 'webgl', seed: 1 });
    expect(bg.renderer).toBe('webgl');
    expect(bg.config.renderer).toBe('webgl');
    expect(fake.requested).toEqual(['webgl2']);
    expect(fake.drawn).toEqual([]);
    expect(gl.log.some((l) => l.startsWith('drawArraysInstanced'))).toBe(true);
    expect(bg.getStats().count).toBeGreaterThan(0);
    expect(console.error).not.toHaveBeenCalled();

    // Pause, clear, update: still renders through GL, still no 2D.
    bg.pause();
    gl.log.length = 0;
    bg.update({ shape: 'star', palette: 'dusk' });
    expect(gl.log.some((l) => l.startsWith('drawArraysInstanced'))).toBe(true);
    expect(fake.drawn).toEqual([]);

    bg.dispose();
    expect(gl.log).toContain('getExtension("WEBGL_lose_context")');
  });

  it('falls back to canvas2d with an error on the console when WebGL2 is unavailable', () => {
    const el = canvas();
    const bg = createBackground(el, { renderer: 'webgl' });
    expect(bg.renderer).toBe('canvas2d');
    // The config keeps what was asked for; `renderer` says what happened.
    expect(bg.config.renderer).toBe('webgl');
    expect((el as unknown as FakeCanvasElement).requested).toEqual(['webgl2', '2d']);
    expect((el as unknown as FakeCanvasElement).drawn.some((d) => d.startsWith('arc('))).toBe(true);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/falling back to canvas2d/);
    bg.dispose();
  });

  it('refuses to change renderer after creation, with an error on the console', () => {
    const { el } = glCanvas();
    const bg = createBackground(el, { renderer: 'webgl' });
    bg.update({ renderer: 'canvas2d', amount: 'low' });
    expect(bg.config.renderer).toBe('webgl');
    expect(bg.config.amount).toBe('low');
    expect(bg.renderer).toBe('webgl');
    expect(console.error).toHaveBeenCalledTimes(1);
    // Sending the same value again is fine and quiet.
    bg.update({ renderer: 'webgl' });
    expect(console.error).toHaveBeenCalledTimes(1);
    bg.dispose();
  });

  it('runs a layer’s renderGL on WebGL and composites its render through the overlay otherwise', () => {
    const overlay: string[] = [];
    const overlayCtx = new Proxy(
      {},
      {
        get: (_, key: string) => (...args: unknown[]) => {
          overlay.push(args.length ? `${key}(${args.join(',')})` : `${key}()`);
        },
        set: () => true,
      },
    );
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: on,
      removeEventListener: off,
      createElement: () => ({ fake: true, width: 0, height: 0, getContext: () => overlayCtx }),
    });

    const { el, gl } = glCanvas();
    const render = vi.fn((ctx: CanvasRenderingContext2D) => ctx.fillRect(1, 2, 3, 4));
    const renderGL = vi.fn();
    const both = defineLayer('both', { render, renderGL });
    const twoD = defineLayer('2d', { render: (ctx) => ctx.fillRect(5, 6, 7, 8) });
    const bg = createBackground(el, { renderer: 'webgl', layers: [both, twoD] });

    // `both` chose GL; only `twoD` went through the overlay.
    expect(renderGL).toHaveBeenCalled();
    expect(renderGL.mock.calls[0][0]).toBe(gl.gl);
    expect(renderGL.mock.calls[0][1].width).toBe(800);
    expect(renderGL.mock.calls[0][2].pixelWidth).toBe(800);
    expect(render).not.toHaveBeenCalled();
    expect(overlay).toContain('fillRect(5,6,7,8)');
    expect(overlay).not.toContain('fillRect(1,2,3,4)');
    // …and was uploaded and composited.
    expect(gl.log.some((l) => l.startsWith('texImage2D') && l.endsWith('canvas)'))).toBe(true);
    bg.dispose();
  });

  it('ignores renderGL on canvas2d and uses render', () => {
    const el = canvas();
    const render = vi.fn();
    const renderGL = vi.fn();
    const bg = createBackground(el, { layers: [defineLayer('l', { render, renderGL })] });
    expect(render).toHaveBeenCalled();
    expect(renderGL).not.toHaveBeenCalled();
    bg.dispose();
  });
});
