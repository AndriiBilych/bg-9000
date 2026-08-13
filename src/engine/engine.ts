import { DEFAULT_CONFIG, normaliseConfig, type BackgroundConfig } from '../config/config.js';
import type { Layer } from '../layers/layer.js';
import { ParticleField } from '../layers/particle-field/particle-field.js';
import { Canvas2DRenderer } from '../render/canvas2d.js';
import type { Renderer } from '../render/renderer.js';
import { createRng } from '../util/rng.js';
import { Clock } from './clock.js';
import { createPointerState, type SceneContext } from './scene-context.js';
import { Surface } from './surface.js';

export interface BackgroundStats {
  /** Smoothed frames per second. */
  fps: number;
  /** Particles currently simulated. */
  count: number;
  /** Seconds in the last frame. */
  dt: number;
  running: boolean;
}

export interface Background {
  readonly config: Readonly<BackgroundConfig>;
  /** Apply a partial config. Rebuilds only what the change requires. */
  update(patch: Partial<BackgroundConfig>): void;
  pause(): void;
  resume(): void;
  getStats(): BackgroundStats;
  /** Idempotent. Cancels the frame and detaches every observer and listener. */
  dispose(): void;
}

export function createBackground(
  canvas: HTMLCanvasElement,
  patch?: Partial<BackgroundConfig>,
): Background {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('bg-9000: createBackground expects an HTMLCanvasElement.');
  }

  let config = normaliseConfig(patch, DEFAULT_CONFIG);

  const clock = new Clock(0.05);
  const pointer = createPointerState();

  const ctx: SceneContext = {
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    dt: 0,
    frame: 0,
    pointer,
    rng: createRng(config.seed),
  };

  // Declared ahead of `new Surface(...)`: the Surface constructor measures
  // immediately and invokes this callback synchronously, so anything it touches
  // must already be initialised rather than sitting in the temporal dead zone.
  let initialised = false;
  let running = false;
  let disposed = false;
  let raf = 0;
  let fps = 0;

  const layers: Layer[] = [];

  const surface = new Surface(canvas, config.maxDpr, (width, height, dpr, prevWidth, prevHeight) => {
    ctx.width = width;
    ctx.height = height;
    ctx.dpr = dpr;
    if (!initialised) return;
    for (const layer of layers) layer.resize(ctx, prevWidth, prevHeight);
    if (!running) renderFrame();
  });

  ctx.width = surface.width;
  ctx.height = surface.height;
  ctx.dpr = surface.dpr;

  const renderer: Renderer = new Canvas2DRenderer(surface);

  const field = new ParticleField({
    amount: config.amount,
    size: config.size,
    speed: config.speed,
    drag: config.drag,
    maxCount: config.maxCount,
    restitution: config.restitution,
  });
  layers.push(field);

  for (const layer of layers) layer.init(ctx);
  initialised = true;

  // --- frame loop ---------------------------------------------------------

  function renderFrame(): void {
    if (disposed) return;
    renderer.beginFrame(null);
    for (const layer of layers) layer.render(renderer, ctx);
    renderer.endFrame();
  }

  const step = (nowMs: number): void => {
    raf = requestAnimationFrame(step);

    clock.tick(nowMs);
    ctx.dt = clock.dt;
    ctx.time = clock.elapsed;
    ctx.frame = clock.frame;

    if (clock.dt > 0) {
      // Exponential smoothing; a raw per-frame figure is unreadable.
      fps += (1 / clock.dt - fps) * 0.1;
    }

    for (const layer of layers) layer.update(ctx);
    renderFrame();
  };

  function start(): void {
    if (running || disposed) return;
    running = true;
    clock.resync();
    raf = requestAnimationFrame(step);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // A hidden tab already throttles rAF, but stopping outright avoids burning
  // any budget at all and keeps the clock from carrying the gap on return.
  const onVisibility = (): void => {
    if (document.hidden) stop();
    else start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderFrame();
  start();

  // --- public surface -----------------------------------------------------

  return {
    get config(): Readonly<BackgroundConfig> {
      return config;
    },

    update(next: Partial<BackgroundConfig>): void {
      if (disposed) return;
      const previous = config;
      config = normaliseConfig(next, config);

      if (config.seed !== previous.seed) {
        ctx.rng = createRng(config.seed);
      }

      field.configure(
        {
          amount: config.amount,
          size: config.size,
          speed: config.speed,
          drag: config.drag,
          maxCount: config.maxCount,
          restitution: config.restitution,
        },
        ctx,
      );

      if (!running) renderFrame();
    },

    pause: stop,
    resume: start,

    getStats(): BackgroundStats {
      return { fps, count: field.count, dt: ctx.dt, running };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const layer of layers) layer.dispose();
      renderer.dispose();
      surface.dispose();
    },
  };
}
