import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Surface } from '../../engine/surface';
import { ParticleStore } from '../../layers/particle-field/store';
import type { IDrawGroup } from '../../model/render/renderer.interface';
import { SHAPES, defineShape } from '../../shapes/shapes';
import { WebGLRenderer } from './webgl';
import { fakeGLCanvas, type IFakeGLCanvas } from './webgl.fixture';

interface IHarness extends IFakeGLCanvas {
  r: WebGLRenderer;
  surface: Surface & { revision: number; width: number; height: number; dpr: number };
}

function harness(): IHarness {
  const fake = fakeGLCanvas();
  const surface = {
    width: 100,
    height: 50,
    dpr: 2,
    revision: 1,
    get pixelWidth(): number {
      return surface.width * surface.dpr;
    },
    get pixelHeight(): number {
      return surface.height * surface.dpr;
    },
  } as unknown as IHarness['surface'];
  const r = new WebGLRenderer(fake.canvas, surface);
  // Assigned rather than spread: `lostByExtension` is a live getter.
  return Object.assign(fake, { r, surface });
}

function field(): { store: ParticleStore; groups: IDrawGroup[] } {
  const store = new ParticleStore(8);
  store.add(10, 10, 0, 0, 5, 0);
  store.add(20, 10, 0, 0, 5, 0);
  store.add(30, 10, 0, 0, 5, 1);
  const groups: IDrawGroup[] = [
    { start: 0, end: 2, fill: '#ff0000', stroke: null, lineWidth: 0 },
    { start: 2, end: 3, fill: null, stroke: 'rgb(0, 0, 255)', lineWidth: 1.5 },
  ];
  return { store, groups };
}

/** A fake 2D canvas for the overlay, recording what a layer draws on it. */
function fakeDocument(): { drawn: string[] } {
  const drawn: string[] = [];
  const ctx = new Proxy(
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
  vi.stubGlobal('document', {
    createElement: () => ({ fake: true, width: 0, height: 0, getContext: () => ctx }),
  });
  return { drawn };
}

const count = (log: string[], prefix: string): number => log.filter((l) => l.startsWith(prefix)).length;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WebGLRenderer — construction', () => {
  it('asks for a WebGL2 context with a stencil buffer and antialiasing', () => {
    const h = harness();
    expect(h.contextRequests).toHaveLength(1);
    expect(h.contextRequests[0][0]).toBe('webgl2');
    expect(h.contextRequests[0][1]).toMatchObject({ stencil: true, antialias: true, premultipliedAlpha: true });
    expect(h.r.kind).toBe('webgl');
    // The shape program and the blit program, linked once each.
    expect(count(h.log, 'linkProgram')).toBe(2);
  });

  it('draws nothing and reports it when a shader fails on a context already acquired', () => {
    const fake = fakeGLCanvas();
    const gl = fake.gl as unknown as Record<string, unknown>;
    // The proxy answers every call; override the one that decides success.
    const proxied = new Proxy(gl, {
      get: (target, key: string) => (key === 'getShaderParameter' ? () => false : Reflect.get(target, key)),
    }) as unknown as WebGL2RenderingContext;
    const canvas = { ...fake.canvas, getContext: () => proxied } as unknown as HTMLCanvasElement;
    const surface = { width: 1, height: 1, dpr: 1, revision: 1, pixelWidth: 1, pixelHeight: 1 } as unknown as Surface;
    const r = new WebGLRenderer(canvas, surface);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/draw nothing/);
    fake.log.length = 0;
    r.beginFrame('#fff');
    r.drawShapeGroups(field().store, field().groups, SHAPES.circle);
    expect(fake.log).toEqual([]);
  });

  it('throws when the canvas refuses, so the factory can fall back', () => {
    const fake = fakeGLCanvas();
    fake.refuse = true;
    expect(() => new WebGLRenderer(fake.canvas, {} as Surface)).toThrow(/WebGL2/);
  });
});

describe('WebGLRenderer — frames', () => {
  it('syncs viewport and projection once per surface revision, then clears in premultiplied colour', () => {
    const h = harness();
    h.log.length = 0;
    h.r.beginFrame('rgba(255, 0, 0, 0.5)');
    expect(h.log).toContain('viewport(0,0,200,100)');
    expect(h.log).toContain('clearColor(0.5,0,0,0.5)');
    expect(h.log.at(-1)).toBe(`clear(${0x4000 | 0x0400})`);

    h.log.length = 0;
    h.r.beginFrame('#000');
    expect(count(h.log, 'viewport')).toBe(0);

    h.surface.revision = 2;
    h.surface.width = 300;
    h.log.length = 0;
    h.r.beginFrame('#000');
    expect(h.log).toContain('viewport(0,0,600,100)');
  });

  it('clears to transparent with no background or an unparseable one, reporting the latter once', () => {
    const h = harness();
    h.r.beginFrame(null);
    expect(h.log.at(-3)).toBe('clearColor(0,0,0,0)');
    h.r.beginFrame('oklch(1 0 0)');
    h.r.beginFrame('oklch(1 0 0)');
    expect(h.log.at(-3)).toBe('clearColor(0,0,0,0)');
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/oklch/);
  });
});

describe('WebGLRenderer.drawShapeGroups — instanced', () => {
  it('uploads the store once and issues two stencil passes per painted group', () => {
    const h = harness();
    const { store, groups } = field();
    h.r.beginFrame('#fff');
    h.log.length = 0;
    h.r.drawShapeGroups(store, groups, SHAPES.circle);

    // x, y, radius for the three live particles.
    const uploads = h.log.filter((l) => l.startsWith('bufferSubData'));
    expect(uploads).toHaveLength(3);
    expect(uploads[0]).toBe('bufferSubData(34962,0,f32[8],0,3)');

    // Group 1: fill → count pass + cover, 2 instances. Group 2: stroke → mark + cover, 1 instance.
    const draws = h.log.filter((l) => l.startsWith('drawArraysInstanced'));
    expect(draws).toHaveLength(4);
    expect(draws[0]).toMatch(/,2\)$/);
    expect(draws[1]).toMatch(/,6,2\)$/);
    expect(draws[2]).toMatch(/,1\)$/);
    expect(draws[3]).toMatch(/,6,1\)$/);

    // Winding count for the fill, a plain mark for the stroke, and a cover
    // that zeroes what it paints.
    expect(h.log).toContain(`stencilOpSeparate(${0x0404},${0x1e00},${0x1e00},${0x8507})`);
    expect(h.log).toContain(`stencilOp(${0x1e00},${0x1e00},${0x1e01})`);
    expect(h.log).toContain(`stencilFunc(${0x0205},0,255)`);
    expect(h.log).toContain('stencilOp(0,0,0)');

    // Colours arrive premultiplied; the line width is halved for the shader.
    expect(h.log).toContain('uniform4f(u:u_colour,1,0,0,1)');
    expect(h.log).toContain('uniform4f(u:u_colour,0,0,1,1)');
    expect(h.log).toContain('uniform1f(u:u_halfWidth,0.75)');

    // Instance attributes start at each group's first index (4 bytes a float).
    expect(h.log).toContain('vertexAttribPointer(2,1,5126,false,0,0)');
    expect(h.log).toContain('vertexAttribPointer(2,1,5126,false,0,8)');
  });

  it('traces and uploads a glyph mesh once per shape, not per frame', () => {
    const h = harness();
    const { store, groups } = field();
    let traced = 0;
    const shape = defineShape('probe', {
      trace(path, x, y, r) {
        traced++;
        path.rect(x - r, y - r, r * 2, r * 2);
      },
    });
    h.r.drawShapeGroups(store, groups, shape);
    h.r.drawShapeGroups(store, groups, shape);
    expect(traced).toBe(1);
    const buffersAfter = h.created.buffer;
    h.r.drawShapeGroups(store, groups, SHAPES.star);
    expect(h.created.buffer).toBe(buffersAfter + 3);
    h.r.drawShapeGroups(store, groups, SHAPES.star);
    expect(h.created.buffer).toBe(buffersAfter + 3);
  });

  it('skips groups that paint nothing or lie past the count', () => {
    const h = harness();
    const store = new ParticleStore(4);
    store.add(10, 10, 0, 0, 5, 0);
    const groups: IDrawGroup[] = [
      { start: 0, end: 1, fill: null, stroke: null, lineWidth: 0 },
      { start: 1, end: 3, fill: 'red', stroke: null, lineWidth: 0 },
    ];
    h.r.drawShapeGroups(store, groups, SHAPES.hexagon);
    expect(count(h.log, 'drawArrays')).toBe(0);
  });

  it('draws a draw-only shape as circles and says so once', () => {
    const h = harness();
    const { store, groups } = field();
    const sprite = defineShape('sprite', { draw() {} });
    h.r.drawShapeGroups(store, groups, sprite);
    h.r.drawShapeGroups(store, groups, sprite);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/sprite.*circles/);
    expect(count(h.log, 'drawArraysInstanced')).toBe(8);
  });

  it('throws on a shape with neither contract, like Canvas2D', () => {
    const h = harness();
    const { store, groups } = field();
    expect(() => h.r.drawShapeGroups(store, groups, { name: 'broken' })).toThrow(/broken/);
  });

  it('keeps drawCircleGroups as an alias', () => {
    const h = harness();
    const { store, groups } = field();
    h.r.drawCircleGroups(store, groups);
    expect(count(h.log, 'drawArraysInstanced')).toBe(4);
  });
});

describe('WebGLRenderer.drawShapeGroups — varying shapes', () => {
  it('re-traces every particle each frame with its index and store, without instancing', () => {
    const h = harness();
    const { store, groups } = field();
    const seen: number[] = [];
    const shape = defineShape('spinner', {
      varies: true,
      trace(path, x, y, r, i, s) {
        seen.push(i);
        expect(s).toBe(store);
        path.moveTo(x + r, y);
        path.lineTo(x, y + r);
        path.lineTo(x - r, y);
        path.closePath();
      },
    });
    h.r.drawShapeGroups(store, groups, shape);
    expect(seen).toEqual([0, 1, 2]);
    h.r.drawShapeGroups(store, groups, shape);
    expect(seen).toEqual([0, 1, 2, 0, 1, 2]);

    expect(count(h.log, 'drawArraysInstanced')).toBe(0);
    // Fill + cover for group 1, stroke + cover for group 2.
    expect(count(h.log, 'drawArrays(')).toBe(8);
    // Instance attributes are held constant rather than streamed.
    expect(h.log).toContain('vertexAttrib1f(4,1)');
    expect(count(h.log, 'bufferSubData')).toBe(0);
  });
});

describe('WebGLRenderer — 2D overlay', () => {
  it('lets a 2D layer draw on an offscreen canvas and composites it before the next GL draw', () => {
    const { drawn } = fakeDocument();
    const h = harness();
    const { store, groups } = field();
    h.r.beginFrame('#fff');
    h.r.drawImmediate((ctx) => {
      ctx.fillStyle = 'lime';
      ctx.fillRect(0, 0, 1, 1);
    });
    // Sized to the surface, with the DPR transform, and state saved around the draw.
    expect(drawn).toEqual(['setTransform(2,0,0,2,0,0)', 'save()', 'fillStyle=lime', 'fillRect(0,0,1,1)', 'restore()']);
    expect(count(h.log, 'texImage2D')).toBe(0);

    h.log.length = 0;
    h.r.drawShapeGroups(store, groups, SHAPES.circle);
    const upload = h.log.findIndex((l) => l.startsWith('texImage2D') && l.endsWith('canvas)'));
    expect(upload).toBeGreaterThan(-1);
    expect(h.log).toContain(`pixelStorei(${0x9240},true)`);
    expect(h.log).toContain(`pixelStorei(${0x9241},true)`);
    // The blit lands before the field's first instanced draw.
    const blit = h.log.indexOf('drawArrays(4,0,6)');
    const fieldDraw = h.log.findIndex((l) => l.startsWith('drawArraysInstanced'));
    expect(blit).toBeGreaterThan(upload);
    expect(blit).toBeLessThan(fieldDraw);
    expect(drawn.at(-1)).toBe('clearRect(0,0,100,50)');
  });

  it('flushes at the end of the frame when nothing else draws after a 2D layer', () => {
    fakeDocument();
    const h = harness();
    h.r.beginFrame('#fff');
    h.r.drawImmediate(() => {});
    h.log.length = 0;
    h.r.endFrame();
    expect(h.log.filter((l) => l.startsWith('texImage2D') && l.endsWith('canvas)'))).toHaveLength(1);
    h.log.length = 0;
    h.r.endFrame();
    expect(count(h.log, 'texImage2D')).toBe(0);
  });

  it('reports once and ignores 2D layers when no overlay canvas can be made', () => {
    const h = harness();
    const draw = vi.fn();
    h.r.drawImmediate(draw);
    h.r.drawImmediate(draw);
    expect(draw).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe('WebGLRenderer — GL layers', () => {
  it('hands the callback the context and a frame in a known state', () => {
    const h = harness();
    h.r.beginFrame('#fff');
    h.log.length = 0;
    const seen = vi.fn();
    h.r.drawImmediateGL((gl, frame) => {
      seen(gl === h.gl, frame.width, frame.height, frame.dpr, frame.pixelWidth, frame.generation);
      const expected = [2 / 100, 0, 0, 0, -2 / 50, 0, -1, 1, 1];
      for (let i = 0; i < 9; i++) expect(frame.projection[i]).toBeCloseTo(expected[i], 6);
    });
    expect(seen).toHaveBeenCalledWith(true, 100, 50, 2, 200, 0);
    expect(h.log).toContain('bindVertexArray(null)');
    expect(h.log).toContain(`blendFunc(1,${0x0303})`);
    expect(h.log).toContain(`disable(${0x0b90})`);
  });

  it('caches programs by source and binds a_position to attribute 0', () => {
    const h = harness();
    const links = count(h.log, 'linkProgram');
    let a: WebGLProgram | undefined;
    let b: WebGLProgram | undefined;
    h.r.drawImmediateGL((_, frame) => {
      a = frame.program('void main(){}');
      b = frame.program('void main(){}');
      frame.program('void main(){ }');
    });
    expect(a).toBe(b);
    expect(count(h.log, 'linkProgram')).toBe(links + 2);
    expect(h.log).toContain('bindAttribLocation(program#3,0,"a_position")');
  });

  it('gives frame-sized textures that follow the surface, and copies and blits them', () => {
    const h = harness();
    h.r.beginFrame('#fff');
    let handle!: ReturnType<import('../../model/render/gl-frame.interface').IGLFrame['texture']>;
    h.r.drawImmediateGL((_, frame) => {
      handle = frame.texture();
      frame.copy(handle);
      frame.blit(handle, 0.9);
    });
    expect(handle.width).toBe(200);
    expect(handle.height).toBe(100);
    expect(h.log).toContain(`copyTexSubImage2D(${0x0de1},0,0,0,0,0,200,100)`);
    expect(h.log).toContain('uniform1f(u:u_alpha,0.9)');
    expect(h.log).toContain('drawArrays(4,0,6)');

    const before = handle.texture;
    h.surface.revision = 2;
    h.surface.width = 10;
    h.r.beginFrame('#fff');
    expect(handle.width).toBe(20);
    expect(handle.texture).not.toBe(before);

    handle.dispose();
    handle.dispose();
    expect(count(h.log, `deleteTexture(${(handle.texture as { tag: string }).tag})`)).toBe(1);
  });
});

describe('WebGLRenderer — context loss', () => {
  it('stops drawing when the context is lost and rebuilds everything on restore', () => {
    const h = harness();
    const { store, groups } = field();
    let handle!: ReturnType<import('../../model/render/gl-frame.interface').IGLFrame['texture']>;
    let generation = -1;
    h.r.drawImmediateGL((_, frame) => {
      handle = frame.texture();
    });
    h.r.drawShapeGroups(store, groups, SHAPES.circle);
    const before = handle.texture;

    h.loseContext();
    h.log.length = 0;
    h.r.beginFrame('#fff');
    h.r.drawShapeGroups(store, groups, SHAPES.circle);
    h.r.drawImmediateGL(() => {
      generation = 99;
    });
    h.r.endFrame();
    expect(h.log).toEqual([]);
    expect(generation).toBe(-1);

    h.restoreContext();
    expect(count(h.log, 'linkProgram')).toBe(2);
    expect(handle.texture).not.toBe(before);
    h.r.beginFrame('#fff');
    h.r.drawImmediateGL((_, frame) => {
      generation = frame.generation;
    });
    expect(generation).toBe(1);
    // Viewport re-applied, meshes re-traced and re-uploaded.
    expect(h.log).toContain('viewport(0,0,200,100)');
    const buffers = h.created.buffer;
    h.r.drawShapeGroups(store, groups, SHAPES.circle);
    expect(h.created.buffer).toBe(buffers + 3);
  });

  it('keeps the context of a canvas still in the document, for whoever creates the next background', () => {
    const h = harness();
    (h.canvas as unknown as { isConnected: boolean }).isConnected = true;
    h.r.dispose();
    expect(h.lostByExtension).toBe(0);
    expect(count(h.log, 'deleteProgram')).toBeGreaterThanOrEqual(2);
  });

  it('releases the context and its listeners on dispose once the canvas has left the document', () => {
    const h = harness();
    const listeners = (h.canvas as unknown as { listenerCount(): number }).listenerCount;
    expect(listeners()).toBe(2);
    h.r.dispose();
    expect(listeners()).toBe(0);
    expect(h.log).toContain('getExtension("WEBGL_lose_context")');
    expect(h.lostByExtension).toBe(1);
    expect(count(h.log, 'deleteProgram')).toBeGreaterThanOrEqual(2);
    h.r.dispose();
    expect(h.lostByExtension).toBe(1);
    // Quiet afterwards.
    h.log.length = 0;
    h.r.beginFrame('#fff');
    expect(h.log).toEqual([]);
  });
});
