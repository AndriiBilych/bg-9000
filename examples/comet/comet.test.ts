import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackground } from 'bg-9000';
import { fakeGL, type IFakeGL } from '../../src/render/webgl/webgl.fixture';
import { Swarm } from './swarm';
import { createTrails } from './trails';

/**
 * The example against both renderers, in the same fake DOM the engine tests
 * use: a canvas that hands out a recording 2D context or a recording WebGL2
 * one, a frame scheduler driven by hand, and pointer events fed in directly.
 * Pixels cannot be checked here; that every call the example makes is one the
 * renderer accepts, on both renderers, across a palette change and a
 * dispose-and-reuse, can.
 */

type Listener = (event: unknown) => void;

class FakeCanvas {
  width = 0;
  height = 0;
  drawn: string[] = [];
  webgl: IFakeGL = fakeGL();
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, fn: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  getContext(kind: string): unknown {
    if (kind === 'webgl2') return this.webgl.gl;
    const drawn = this.drawn;
    return new Proxy(
      { canvas: this },
      {
        get: (target, key: string) =>
          key === 'canvas'
            ? target.canvas
            : (...args: unknown[]) => {
                drawn.push(`${key}(${args.map(String).join(',')})`);
              },
        set: () => true,
      },
    );
  }
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
  }
  get clientWidth(): number {
    return 800;
  }
  get clientHeight(): number {
    return 600;
  }
}

const listeners = new Map<string, Set<Listener>>();
let frames: Array<(now: number) => void> = [];

function tick(now: number): void {
  const due = frames;
  frames = [];
  for (const fn of due) fn(now);
}

function fire(type: string, event: unknown): void {
  for (const fn of listeners.get(type) ?? []) fn(event);
}

beforeEach(() => {
  listeners.clear();
  frames = [];
  const on = (type: string, fn: Listener): void => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  };
  const off = (type: string, fn: Listener): void => {
    listeners.get(type)?.delete(fn);
  };
  vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
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
  vi.stubGlobal('window', { devicePixelRatio: 2, addEventListener: on, removeEventListener: off });
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: on,
    removeEventListener: off,
    createElement: () => new FakeCanvas(),
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('comets', () => {
  for (const renderer of ['webgl', 'canvas2d'] as const) {
    it(`runs on ${renderer}: swarm, vortex and trails, through a palette change and a reuse`, () => {
      const canvas = new FakeCanvas();
      const swarm = new Swarm({ count: 3000, speed: 1 });
      const trails = createTrails(0.9);
      const bg = createBackground(canvas as unknown as HTMLCanvasElement, {
        renderer,
        palette: 'midnight',
        style: 'see-through',
        particles: false,
        layers: [trails.below, swarm, trails.above],
      });
      expect(bg.renderer).toBe(renderer);
      expect(swarm.count).toBe(3000);

      fire('pointermove', { clientX: 400, clientY: 300 });
      fire('pointerdown', { clientX: 400, clientY: 300 });
      tick(0);
      tick(16);
      tick(33);
      tick(50);

      if (renderer === 'webgl') {
        const log = canvas.webgl.log;
        // The frame is copied out once per render: the initial one and four ticks.
        expect(log.filter((l) => l.startsWith('copyTexSubImage2D'))).toHaveLength(5);
        // …and drawn back faded from the second render on.
        expect(log.filter((l) => l.startsWith('uniform1f(u:u_fade'))).toHaveLength(4);
        expect(log.some((l) => l.startsWith('drawArraysInstanced'))).toBe(true);
        expect(canvas.drawn).toEqual([]);
      } else {
        expect(canvas.drawn.filter((l) => l.startsWith('arc(')).length).toBeGreaterThan(3000 * 4);
        expect(canvas.drawn.some((l) => l.startsWith('drawImage('))).toBe(true);
      }

      swarm.configure({ count: 500, speed: 2 });
      expect(swarm.count).toBe(500);
      bg.update({ palette: 'ember' });
      tick(66);
      expect(console.error).not.toHaveBeenCalled();
      bg.dispose();

      // The same layer instances on a fresh background: init after dispose.
      const again = createBackground(new FakeCanvas() as unknown as HTMLCanvasElement, {
        renderer,
        particles: false,
        layers: [trails.below, swarm, trails.above],
      });
      tick(80);
      expect(swarm.count).toBe(500);
      expect(console.error).not.toHaveBeenCalled();
      again.dispose();
    });
  }
});
