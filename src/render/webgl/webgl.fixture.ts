/**
 * A WebGL2 context that remembers instead of draws, for the renderer tests.
 *
 * Every call is logged by name with its arguments; GL objects are plain
 * tagged records so a log line can say which buffer was bound; the enum
 * values are the real ones so a line reads like the spec. Context loss is
 * simulated by dispatching the two events on the fake canvas.
 */

type Listener = (event: Event) => void;

export const GL = {
  TRIANGLES: 0x0004,
  ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88e4,
  STREAM_DRAW: 0x88e0,
  FLOAT: 0x1406,
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  COLOR_BUFFER_BIT: 0x4000,
  STENCIL_BUFFER_BIT: 0x0400,
  BLEND: 0x0be2,
  ONE: 1,
  ONE_MINUS_SRC_ALPHA: 0x0303,
  STENCIL_TEST: 0x0b90,
  DEPTH_TEST: 0x0b71,
  SCISSOR_TEST: 0x0c11,
  CULL_FACE: 0x0b44,
  FRAMEBUFFER: 0x8d40,
  TEXTURE_2D: 0x0de1,
  TEXTURE0: 0x84c0,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  LINEAR: 0x2601,
  CLAMP_TO_EDGE: 0x812f,
  UNPACK_FLIP_Y_WEBGL: 0x9240,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
  ALWAYS: 0x0207,
  NOTEQUAL: 0x0205,
  KEEP: 0x1e00,
  REPLACE: 0x1e01,
  ZERO: 0,
  INCR_WRAP: 0x8507,
  DECR_WRAP: 0x8508,
  FRONT: 0x0404,
  BACK: 0x0405,
} as const;

export interface IFakeGL {
  gl: WebGL2RenderingContext;
  log: string[];
  /** Calls to `loseContext` on the WEBGL_lose_context extension. */
  lostByExtension: number;
  /** Every object created, by kind. */
  created: Record<string, number>;
}

export interface IFakeGLCanvas extends IFakeGL {
  canvas: HTMLCanvasElement;
  /** Fires `webglcontextlost` / `webglcontextrestored` on the canvas. */
  loseContext(): void;
  restoreContext(): void;
  /** What `getContext` was asked for. */
  contextRequests: Array<[string, unknown]>;
  /** `getContext` returns null after this is set. */
  refuse: boolean;
  width: number;
  height: number;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') return String(+value.toFixed(3));
  if (typeof value === 'string') return value.length > 24 ? `"${value.slice(0, 12)}…"` : `"${value}"`;
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Float32Array) return `f32[${value.length}]`;
  if (typeof value === 'object' && 'tag' in (value as object)) return (value as { tag: string }).tag;
  if (typeof value === 'object' && 'fake' in (value as object)) return 'canvas';
  return typeof value;
}

export function fakeGL(): IFakeGL {
  const log: string[] = [];
  const created: Record<string, number> = {};
  const result: IFakeGL = { gl: null as unknown as WebGL2RenderingContext, log, lostByExtension: 0, created };
  let lost = false;

  const make = (kind: string): { tag: string } => {
    created[kind] = (created[kind] ?? 0) + 1;
    return { tag: `${kind}#${created[kind]}` };
  };

  const special: Record<string, (...args: unknown[]) => unknown> = {
    createShader: () => make('shader'),
    createProgram: () => make('program'),
    createBuffer: () => make('buffer'),
    createTexture: () => make('texture'),
    createVertexArray: () => make('vao'),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getUniformLocation: (_p, name) => ({ tag: `u:${String(name)}` }),
    isContextLost: () => lost,
    getExtension: (name) =>
      name === 'WEBGL_lose_context'
        ? {
            loseContext: () => {
              result.lostByExtension++;
              lost = true;
            },
          }
        : null,
  };

  result.gl = new Proxy({} as WebGL2RenderingContext, {
    get(_, key: string) {
      if (key in GL) return GL[key as keyof typeof GL];
      return (...args: unknown[]) => {
        log.push(`${key}(${args.map(describe).join(',')})`);
        return special[key]?.(...args);
      };
    },
  });
  return result;
}

/** A canvas whose `getContext('webgl2')` returns a fake context. */
export function fakeGLCanvas(): IFakeGLCanvas {
  const fake = fakeGL();
  const listeners = new Map<string, Set<Listener>>();
  const contextRequests: Array<[string, unknown]> = [];
  const canvas = {
    fake: true,
    width: 0,
    height: 0,
    isConnected: false,
    getContext(kind: string, attrs: unknown) {
      contextRequests.push([kind, attrs]);
      if (result.refuse) return null;
      return kind === 'webgl2' ? fake.gl : null;
    },
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    listenerCount(): number {
      let n = 0;
      for (const set of listeners.values()) n += set.size;
      return n;
    },
  };
  const fire = (type: string): void => {
    for (const fn of listeners.get(type) ?? []) fn({ type, preventDefault() {} } as unknown as Event);
  };
  const result: IFakeGLCanvas = {
    gl: fake.gl,
    log: fake.log,
    created: fake.created,
    get lostByExtension() {
      return fake.lostByExtension;
    },
    canvas: canvas as unknown as HTMLCanvasElement,
    contextRequests,
    refuse: false,
    width: 0,
    height: 0,
    loseContext: () => fire('webglcontextlost'),
    restoreContext: () => fire('webglcontextrestored'),
  };
  return result;
}
