import type { Surface } from '../../engine/surface';
import type { ParticleStore } from '../../layers/particle-field/store';
import type { IGLFrame, IGLTexture } from '../../model/render/gl-frame.interface';
import type { IDrawGroup, IRenderer } from '../../model/render/renderer.interface';
import type { IShape } from '../../model/shapes/shape.interface';
import { SHAPES } from '../../shapes/shapes';
import { parseColour, type RGBA } from '../../theme/colour-parse';
import { createBuffer, createProgram, createTexture, staticBuffer } from './gl-util';
import { Overlay2D } from './overlay';
import { PathRecorder } from './path-recorder';
import {
  ATTR_CENTRE_X,
  ATTR_CENTRE_Y,
  ATTR_NORMAL,
  ATTR_POSITION,
  ATTR_RADIUS,
  BLIT_FRAGMENT,
  QUAD_VERTEX,
  SHAPE_FRAGMENT,
  SHAPE_VERTEX,
} from './shaders';
import {
  FloatSink,
  buildGlyphMesh,
  pushCoverQuad,
  tessellateFill,
  tessellateStroke,
} from './tessellate';

/**
 * Chord tolerance for a glyph traced at unit radius. It is stamped at up to
 * ~100 device pixels (`large` at DPR 2), where this is a fifth of a pixel.
 */
const UNIT_TOLERANCE = 0.002;

/** Chord tolerance, in CSS pixels, for a shape re-traced per particle. */
const DYNAMIC_TOLERANCE = 0.15;

const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** The minimum `MAX_VERTEX_ATTRIBS` WebGL guarantees. */
const MAX_ATTRIBUTES = 16;

/** A glyph's meshes, resident on the GPU. */
interface IGpuMesh {
  fill: WebGLBuffer;
  fillVertices: number;
  stroke: WebGLBuffer;
  strokeVertices: number;
  cover: WebGLBuffer;
  coverVertices: number;
}

interface ITrackedTexture extends IGLTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
  disposed: boolean;
}

/**
 * The WebGL2 renderer.
 *
 * The field is drawn with one instanced call per colour run and per pass:
 * `store.x`, `store.y` and `store.radius` go up as instance attributes, the
 * glyph is a unit mesh traced once through `PathRecorder`, and the vertex
 * shader places every copy. Fills and strokes are resolved through the
 * stencil buffer (see `tessellate.ts`), so any outline a `trace` can draw,
 * this can fill — concave, curved, several subpaths, self-crossing.
 *
 * What it cannot do, it degrades rather than drops. A `draw`-only shape has
 * no outline to trace and is drawn as a circle, once reported. A 2D layer
 * is composited through an offscreen overlay. A colour the parser does not
 * know is reported once and not painted. A lost context stops drawing until
 * the browser restores it, and every resource — the renderer's and those a
 * layer made through `IGLFrame` — is rebuilt when it does.
 */
export class WebGLRenderer implements IRenderer {
  readonly kind = 'webgl';

  readonly gl: WebGL2RenderingContext;

  private lost = false;
  private disposed = false;
  /** Surface revision whose viewport and projection are applied. */
  private synced = -1;
  private generation = 0;

  // --- resources, all rebuilt on context restore ---------------------------
  private shapeProgram!: WebGLProgram;
  private uProj!: WebGLUniformLocation | null;
  private uHalfWidth!: WebGLUniformLocation | null;
  private uColour!: WebGLUniformLocation | null;
  private blitProgram!: WebGLProgram;
  private uBlitTexture!: WebGLUniformLocation | null;
  private uBlitAlpha!: WebGLUniformLocation | null;
  private vao!: WebGLVertexArrayObject;
  private quadBuffer!: WebGLBuffer;
  private instanceX!: WebGLBuffer;
  private instanceY!: WebGLBuffer;
  private instanceR!: WebGLBuffer;
  private instanceCapacity = 0;
  private dynamicFill!: WebGLBuffer;
  private dynamicStroke!: WebGLBuffer;
  private dynamicCover!: WebGLBuffer;
  private overlayTexture: WebGLTexture | null = null;
  private meshes = new WeakMap<IShape, IGpuMesh>();
  private readonly programs = new Map<string, WebGLProgram>();
  private readonly textures = new Set<ITrackedTexture>();

  // --- CPU scratch -----------------------------------------------------------
  private readonly unitRecorder = new PathRecorder(UNIT_TOLERANCE);
  private readonly dynamicRecorder = new PathRecorder(DYNAMIC_TOLERANCE);
  private readonly fillSink = new FloatSink(4096);
  private readonly strokeSink = new FloatSink(8192);
  private readonly coverSink = new FloatSink(1024);
  private readonly projection = new Float32Array(9);
  private overlay: Overlay2D | null = null;
  private overlayFailed = false;
  private readonly warnedShapes = new WeakSet<IShape>();
  private readonly warnedColours = new Set<string>();

  private readonly frame: IGLFrame & {
    width: number;
    height: number;
    dpr: number;
    pixelWidth: number;
    pixelHeight: number;
    generation: number;
  };

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly surface: Surface,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      stencil: true,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('bg-9000: could not acquire a WebGL2 context for the canvas.');
    this.gl = gl;

    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);

    this.frame = {
      width: 0,
      height: 0,
      dpr: 1,
      pixelWidth: 0,
      pixelHeight: 0,
      projection: this.projection,
      generation: 0,
      program: (fragment, vertex) => this.program(fragment, vertex),
      quad: () => this.quad(),
      texture: () => this.createTrackedTexture(),
      copy: (target) => this.copy(target),
      blit: (source, alpha) => this.blit(source, alpha ?? 1),
    };

    this.build();
  }

  // --- lifecycle -------------------------------------------------------------

  private readonly onContextLost = (event: Event): void => {
    // Without preventDefault the browser never attempts a restore.
    event.preventDefault();
    this.lost = true;
  };

  private readonly onContextRestored = (): void => {
    this.lost = false;
    this.generation++;
    this.frame.generation = this.generation;
    this.synced = -1;
    this.programs.clear();
    this.meshes = new WeakMap();
    this.overlayTexture = null;
    this.instanceCapacity = 0;
    if (!this.build()) return;
    for (const tracked of this.textures) {
      tracked.texture = createTexture(this.gl, tracked.width, tracked.height);
    }
  };

  /**
   * Create every resource, or report and go quiet.
   *
   * By the time a shader can fail to compile the canvas has already handed out
   * its WebGL2 context, and a canvas gives out one kind for life — there is
   * no 2D fallback left to take. A renderer that draws nothing and says why
   * is the least bad outcome; a throw from inside `createBackground` would
   * take the host page's script down with it.
   */
  private build(): boolean {
    try {
      this.createResources();
      return true;
    } catch (error) {
      this.lost = true;
      console.error('bg-9000: the WebGL renderer could not set itself up and will draw nothing.', error);
      return false;
    }
  }

  private createResources(): void {
    const gl = this.gl;
    this.shapeProgram = createProgram(gl, SHAPE_VERTEX, SHAPE_FRAGMENT);
    this.uProj = gl.getUniformLocation(this.shapeProgram, 'u_proj');
    this.uHalfWidth = gl.getUniformLocation(this.shapeProgram, 'u_halfWidth');
    this.uColour = gl.getUniformLocation(this.shapeProgram, 'u_colour');

    this.blitProgram = this.program(BLIT_FRAGMENT);
    this.uBlitTexture = gl.getUniformLocation(this.blitProgram, 'u_texture');
    this.uBlitAlpha = gl.getUniformLocation(this.blitProgram, 'u_alpha');

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('bg-9000: could not create a vertex array.');
    this.vao = vao;

    this.quadBuffer = staticBuffer(gl, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    this.instanceX = createBuffer(gl);
    this.instanceY = createBuffer(gl);
    this.instanceR = createBuffer(gl);
    this.dynamicFill = createBuffer(gl);
    this.dynamicStroke = createBuffer(gl);
    this.dynamicCover = createBuffer(gl);
  }

  /**
   * Viewport, projection, overlay and frame-sized textures follow the surface.
   * Checked at the top of every frame rather than through a callback, so the
   * renderer needs no wiring into the surface and the first frame is right.
   */
  private sync(): void {
    if (this.synced === this.surface.revision) return;
    this.synced = this.surface.revision;

    const { width, height, dpr, pixelWidth, pixelHeight } = this.surface;
    const gl = this.gl;
    gl.viewport(0, 0, pixelWidth, pixelHeight);

    // CSS pixels → clip space: x from [0, width] to [-1, 1], y from
    // [0, height] to [1, -1] so that y runs down, as on the 2D context.
    const projection = this.projection;
    projection[0] = 2 / width;
    projection[4] = -2 / height;
    projection[6] = -1;
    projection[7] = 1;
    projection[8] = 1;

    const frame = this.frame;
    frame.width = width;
    frame.height = height;
    frame.dpr = dpr;
    frame.pixelWidth = pixelWidth;
    frame.pixelHeight = pixelHeight;

    this.overlay?.resize(width, height, dpr);
    for (const tracked of this.textures) {
      if (tracked.width === pixelWidth && tracked.height === pixelHeight) continue;
      gl.deleteTexture(tracked.texture);
      tracked.width = pixelWidth;
      tracked.height = pixelHeight;
      tracked.texture = createTexture(gl, pixelWidth, pixelHeight);
    }
  }

  /**
   * The state every immediate GL callback starts from, and every blit.
   *
   * Attribute arrays on the default vertex array are disabled too: a layer
   * that enabled one and then deleted its buffer would otherwise make the
   * next full-screen quad an invalid draw, and a blank overlay is a hard
   * thing to debug from inside a layer that did nothing wrong on its own.
   */
  private baseline(): void {
    const gl = this.gl;
    gl.bindVertexArray(null);
    for (let i = 1; i < MAX_ATTRIBUTES; i++) gl.disableVertexAttribArray(i);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.surface.pixelWidth, this.surface.pixelHeight);
    gl.useProgram(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0xff);
    gl.activeTexture(gl.TEXTURE0);
  }

  // --- IRenderer -------------------------------------------------------------

  beginFrame(background: string | null): void {
    if (this.lost || this.disposed) return;
    this.sync();
    const gl = this.gl;
    const [r, g, b, a] = background ? this.colour(background) : TRANSPARENT;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0xff);
    gl.clearColor(r * a, g * a, b * a, a);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  drawShapeGroups(store: ParticleStore, groups: readonly IDrawGroup[], shape: IShape): void {
    if (!shape.trace && !shape.draw) {
      throw new TypeError(`bg-9000: shape "${shape.name}" has neither trace nor draw.`);
    }
    if (this.lost || this.disposed) return;

    if (!shape.trace) {
      // A `draw` paints with the 2D API, which has no GL equivalent. Falling
      // back to a circle keeps the field visible, which beats an exception in
      // the frame loop; the report says why the shape is not what was asked.
      if (!this.warnedShapes.has(shape)) {
        this.warnedShapes.add(shape);
        console.error(
          `bg-9000: shape "${shape.name}" only has a draw function, which the WebGL renderer cannot run; drawing circles instead. Give it a trace, or use renderer: 'canvas2d'.`,
        );
      }
      shape = SHAPES.circle;
    }

    this.flushOverlay();

    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.shapeProgram);
    gl.uniformMatrix3fv(this.uProj, false, this.projection);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.stencilMask(0xff);

    if (shape.varies) {
      this.drawVarying(store, groups, shape);
    } else {
      this.uploadInstances(store);
      this.drawInstanced(store, groups, this.mesh(shape));
    }

    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(null);
  }

  /** @deprecated Use `drawShapeGroups` with `SHAPES.circle`. */
  drawCircleGroups(store: ParticleStore, groups: readonly IDrawGroup[]): void {
    this.drawShapeGroups(store, groups, SHAPES.circle);
  }

  drawImmediate(draw: (ctx: CanvasRenderingContext2D) => void): void {
    if (this.lost || this.disposed) return;
    if (!this.overlay) {
      if (this.overlayFailed) return;
      try {
        this.overlay = new Overlay2D();
      } catch (error) {
        this.overlayFailed = true;
        console.error('bg-9000: 2D layers cannot be drawn on this WebGL canvas.', error);
        return;
      }
      const { width, height, dpr } = this.surface;
      this.overlay.resize(width, height, dpr);
    }
    this.overlay.draw(draw);
  }

  drawImmediateGL(draw: (gl: WebGL2RenderingContext, frame: IGLFrame) => void): void {
    if (this.lost || this.disposed) return;
    this.flushOverlay();
    this.baseline();
    draw(this.gl, this.frame);
  }

  endFrame(): void {
    if (this.lost || this.disposed) return;
    this.flushOverlay();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const { gl, canvas } = this;
    canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored, false);
    for (const tracked of this.textures) gl.deleteTexture(tracked.texture);
    this.textures.clear();
    for (const program of this.programs.values()) gl.deleteProgram(program);
    this.programs.clear();
    gl.deleteProgram(this.shapeProgram);
    gl.deleteVertexArray(this.vao);
    for (const buffer of [
      this.quadBuffer,
      this.instanceX,
      this.instanceY,
      this.instanceR,
      this.dynamicFill,
      this.dynamicStroke,
      this.dynamicCover,
    ]) {
      gl.deleteBuffer(buffer);
    }
    if (this.overlayTexture) gl.deleteTexture(this.overlayTexture);
    this.overlayTexture = null;
    // Browsers cap live contexts per page, so a canvas being swapped out
    // should not hold a slot until it is collected. But a lost context is
    // sticky — the same canvas would hand it back, dead, to the next
    // `createBackground` — so a canvas still in the document (React's strict
    // mode, hot reload) keeps its context for whoever comes next.
    if (canvas.isConnected === false) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }

  // --- the field ---------------------------------------------------------------

  private colour(css: string): RGBA {
    const parsed = parseColour(css);
    if (parsed) return parsed;
    if (!this.warnedColours.has(css)) {
      this.warnedColours.add(css);
      console.error(`bg-9000: the WebGL renderer cannot parse the colour "${css}"; it will not be painted.`);
    }
    return TRANSPARENT;
  }

  private setColour(rgba: RGBA): void {
    const [r, g, b, a] = rgba;
    this.gl.uniform4f(this.uColour, r * a, g * a, b * a, a);
  }

  /** The unit mesh for a shape, traced and uploaded on first use. */
  private mesh(shape: IShape): IGpuMesh {
    const hit = this.meshes.get(shape);
    if (hit) return hit;

    const recorder = this.unitRecorder;
    recorder.reset();
    // Traced as particle 0 of no store: a shape without `varies` has
    // promised not to look.
    shape.trace!(recorder, 0, 0, 1, 0, null as unknown as ParticleStore);
    const built = buildGlyphMesh(recorder.subpaths);

    const gl = this.gl;
    const mesh: IGpuMesh = {
      fill: staticBuffer(gl, built.fill),
      fillVertices: built.fillVertices,
      stroke: staticBuffer(gl, built.stroke),
      strokeVertices: built.strokeVertices,
      cover: staticBuffer(gl, built.cover),
      coverVertices: built.coverVertices,
    };
    this.meshes.set(shape, mesh);
    return mesh;
  }

  /** Push the store's positions and radii into the instance buffers. */
  private uploadInstances(store: ParticleStore): void {
    const gl = this.gl;
    const { count, capacity } = store;

    if (capacity > this.instanceCapacity) {
      this.instanceCapacity = capacity;
      for (const buffer of [this.instanceX, this.instanceY, this.instanceR]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, capacity * 4, gl.STREAM_DRAW);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceX);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, store.x, 0, count);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceY);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, store.y, 0, count);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceR);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, store.radius, 0, count);
  }

  /** Point the three instance attributes at the group's index range. */
  private bindInstances(start: number): void {
    const gl = this.gl;
    const offset = start * 4;
    for (const [location, buffer] of [
      [ATTR_CENTRE_X, this.instanceX],
      [ATTR_CENTRE_Y, this.instanceY],
      [ATTR_RADIUS, this.instanceR],
    ] as const) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 1, gl.FLOAT, false, 0, offset);
      gl.vertexAttribDivisor(location, 1);
    }
  }

  /** Constant instance attributes: the mesh is already in CSS pixels. */
  private bindNoInstances(): void {
    const gl = this.gl;
    gl.disableVertexAttribArray(ATTR_CENTRE_X);
    gl.disableVertexAttribArray(ATTR_CENTRE_Y);
    gl.disableVertexAttribArray(ATTR_RADIUS);
    gl.vertexAttrib1f(ATTR_CENTRE_X, 0);
    gl.vertexAttrib1f(ATTR_CENTRE_Y, 0);
    gl.vertexAttrib1f(ATTR_RADIUS, 1);
  }

  /** Position-only layout, normals held at zero. */
  private bindFillLayout(buffer: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(ATTR_POSITION);
    gl.vertexAttribPointer(ATTR_POSITION, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(ATTR_POSITION, 0);
    gl.disableVertexAttribArray(ATTR_NORMAL);
    gl.vertexAttrib2f(ATTR_NORMAL, 0, 0);
  }

  /** Position-and-normal layout, for strokes and cover quads. */
  private bindStrokeLayout(buffer: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(ATTR_POSITION);
    gl.vertexAttribPointer(ATTR_POSITION, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(ATTR_POSITION, 0);
    gl.enableVertexAttribArray(ATTR_NORMAL);
    gl.vertexAttribPointer(ATTR_NORMAL, 2, gl.FLOAT, false, 16, 8);
    gl.vertexAttribDivisor(ATTR_NORMAL, 0);
  }

  /**
   * The two stencil passes of a fill: count windings, then paint where the
   * count is not zero — and zero the count on the way out, so the next pass
   * starts clean without a clear.
   */
  private stencilFill(): void {
    const gl = this.gl;
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
  }

  /** A stroke marks rather than counts: overlaps within it must not cancel. */
  private stencilStroke(): void {
    const gl = this.gl;
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
  }

  private stencilCover(): void {
    const gl = this.gl;
    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
    gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
  }

  private drawInstanced(store: ParticleStore, groups: readonly IDrawGroup[], mesh: IGpuMesh): void {
    const gl = this.gl;

    for (const group of groups) {
      const end = Math.min(group.end, store.count);
      const instances = end - group.start;
      if (instances <= 0) continue;
      if (!group.fill && !group.stroke) continue;

      const halfWidth = group.stroke ? group.lineWidth / 2 : 0;
      gl.uniform1f(this.uHalfWidth, halfWidth);
      this.bindInstances(group.start);

      if (group.fill && mesh.fillVertices > 0) {
        this.bindFillLayout(mesh.fill);
        this.stencilFill();
        gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.fillVertices, instances);

        this.bindStrokeLayout(mesh.cover);
        this.stencilCover();
        this.setColour(this.colour(group.fill));
        gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.coverVertices, instances);
      }

      if (group.stroke && halfWidth > 0 && mesh.strokeVertices > 0) {
        this.bindStrokeLayout(mesh.stroke);
        this.stencilStroke();
        gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.strokeVertices, instances);

        this.bindStrokeLayout(mesh.cover);
        this.stencilCover();
        this.setColour(this.colour(group.stroke));
        gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.coverVertices, instances);
      }
    }
  }

  /**
   * A shape that varies by particle is re-traced every frame in CSS pixels,
   * as Canvas2D would do, and drawn without instancing — still one pass per
   * group, just with more vertices in it.
   */
  private drawVarying(store: ParticleStore, groups: readonly IDrawGroup[], shape: IShape): void {
    const gl = this.gl;
    const recorder = this.dynamicRecorder;
    const { fillSink, strokeSink, coverSink } = this;
    const { x, y, radius } = store;
    const trace = shape.trace!;

    this.bindNoInstances();

    for (const group of groups) {
      const end = Math.min(group.end, store.count);
      if (end <= group.start) continue;
      if (!group.fill && !group.stroke) continue;

      const halfWidth = group.stroke ? group.lineWidth / 2 : 0;
      fillSink.reset();
      strokeSink.reset();
      coverSink.reset();

      for (let i = group.start; i < end; i++) {
        recorder.reset();
        trace(recorder, x[i], y[i], radius[i], i, store);
        if (group.fill) tessellateFill(recorder.subpaths, fillSink);
        if (halfWidth > 0) tessellateStroke(recorder.subpaths, strokeSink);
        // The cover follows the particle's circumradius, which the glyph has
        // promised to stay inside, rather than its exact bounds.
        const reach = radius[i];
        pushCoverQuad(coverSink, x[i] - reach, y[i] - reach, x[i] + reach, y[i] + reach);
      }

      gl.uniform1f(this.uHalfWidth, halfWidth);
      const coverVertices = coverSink.length / 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicCover);
      gl.bufferData(gl.ARRAY_BUFFER, coverSink.data.subarray(0, coverSink.length), gl.STREAM_DRAW);

      if (group.fill && fillSink.length > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicFill);
        gl.bufferData(gl.ARRAY_BUFFER, fillSink.data.subarray(0, fillSink.length), gl.STREAM_DRAW);
        this.bindFillLayout(this.dynamicFill);
        this.stencilFill();
        gl.drawArrays(gl.TRIANGLES, 0, fillSink.length / 2);

        this.bindStrokeLayout(this.dynamicCover);
        this.stencilCover();
        this.setColour(this.colour(group.fill));
        gl.drawArrays(gl.TRIANGLES, 0, coverVertices);
      }

      if (group.stroke && halfWidth > 0 && strokeSink.length > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicStroke);
        gl.bufferData(gl.ARRAY_BUFFER, strokeSink.data.subarray(0, strokeSink.length), gl.STREAM_DRAW);
        this.bindStrokeLayout(this.dynamicStroke);
        this.stencilStroke();
        gl.drawArrays(gl.TRIANGLES, 0, strokeSink.length / 4);

        this.bindStrokeLayout(this.dynamicCover);
        this.stencilCover();
        this.setColour(this.colour(group.stroke));
        gl.drawArrays(gl.TRIANGLES, 0, coverVertices);
      }
    }
  }

  // --- the overlay -------------------------------------------------------------

  /** Composite whatever 2D layers drew since the last GL draw, in order. */
  private flushOverlay(): void {
    const overlay = this.overlay;
    if (!overlay || !overlay.dirty) return;
    const gl = this.gl;

    if (!this.overlayTexture) {
      this.overlayTexture = createTexture(gl, 1, 1);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlay.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    overlay.clear();

    this.baseline();
    this.drawTexture(this.overlayTexture, 1);
  }

  // --- IGLFrame ------------------------------------------------------------------

  private program(fragment: string, vertex: string = QUAD_VERTEX): WebGLProgram {
    const key = `${vertex}\u0000${fragment}`;
    const hit = this.programs.get(key);
    if (hit) return hit;
    const program = createProgram(this.gl, vertex, fragment, { a_position: 0 });
    this.programs.set(key, program);
    return program;
  }

  private quad(): void {
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private createTrackedTexture(): IGLTexture {
    const { pixelWidth, pixelHeight } = this.surface;
    const gl = this.gl;
    const tracked: ITrackedTexture = {
      texture: createTexture(gl, pixelWidth, pixelHeight),
      width: pixelWidth,
      height: pixelHeight,
      disposed: false,
      dispose: () => {
        if (tracked.disposed) return;
        tracked.disposed = true;
        this.textures.delete(tracked);
        if (!this.disposed) gl.deleteTexture(tracked.texture);
      },
    };
    this.textures.add(tracked);
    return tracked;
  }

  private copy(target: IGLTexture): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, target.width, target.height);
  }

  private blit(source: IGLTexture, alpha: number): void {
    this.baseline();
    this.drawTexture(source.texture, alpha);
  }

  private drawTexture(texture: WebGLTexture, alpha: number): void {
    const gl = this.gl;
    gl.useProgram(this.blitProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.uBlitTexture, 0);
    gl.uniform1f(this.uBlitAlpha, alpha);
    this.quad();
  }
}
