import { DEFAULT_CONFIG, normaliseConfig } from '../config/config.js';
import { ParticleField } from '../layers/particle-field/particle-field.js';
import type { IBackgroundConfig } from '../model/config/config.interface.js';
import type { IBackground, IBackgroundStats } from '../model/engine/engine.interface.js';
import type { ISceneContext } from '../model/engine/scene-context.interface.js';
import type { ILayer } from '../model/layers/layer.interface.js';
import type { IRenderer } from '../model/render/renderer.interface.js';
import type { ITheme } from '../model/theme/theme.interface.js';
import { Canvas2DRenderer } from '../render/canvas2d.js';
import { resolveTheme } from '../theme/theme.js';
import { createRng } from '../util/rng.js';
import { Clock } from './clock.js';
import { createPointerState } from './scene-context.js';
import { Surface } from './surface.js';

export function createBackground(
  canvas: HTMLCanvasElement,
  patch?: Partial<IBackgroundConfig>,
): IBackground {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('bg-9000: createBackground expects an HTMLCanvasElement.');
  }

  let config = normaliseConfig(patch, DEFAULT_CONFIG);
  let theme: ITheme = resolveTheme(config.palette, config.style);

  const clock = new Clock(0.05);
  const pointer = createPointerState();

  const ctx: ISceneContext = {
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
  // must already be initialised rather than sitting in the dead zone.
  let initialised = false;
  let running = false;
  let disposed = false;
  let raf = 0;
  let fps = 0;

  const layers: ILayer[] = [];

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

  const renderer: IRenderer = new Canvas2DRenderer(surface);

  const field = new ParticleField({
    amount: config.amount,
    size: config.size,
    speed: config.speed,
    drag: config.drag,
    maxCount: config.maxCount,
    restitution: config.restitution,
    collisions: config.collisions,
    theme,
  });
  layers.push(field);

  for (const layer of layers) layer.init(ctx);
  initialised = true;

  // --- frame loop ---------------------------------------------------------

  function renderFrame(): void {
    if (disposed) return;
    renderer.beginFrame(theme.background);
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
    get config(): Readonly<IBackgroundConfig> {
      return config;
    },

    get theme(): ITheme {
      return theme;
    },

    update(next: Partial<IBackgroundConfig>): void {
      if (disposed) return;
      const previous = config;
      config = normaliseConfig(next, config);

      if (config.seed !== previous.seed) {
        ctx.rng = createRng(config.seed);
      }

      if (config.palette !== previous.palette || config.style !== previous.style) {
        theme = resolveTheme(config.palette, config.style);
      }

      field.configure(
        {
          amount: config.amount,
          size: config.size,
          speed: config.speed,
          drag: config.drag,
          maxCount: config.maxCount,
          restitution: config.restitution,
          collisions: config.collisions,
          theme,
        },
        ctx,
      );

      if (!running) renderFrame();
    },

    pause: stop,
    resume: start,

    getStats(): IBackgroundStats {
      return { fps, count: field.count, contacts: field.contactCount, dt: ctx.dt, running };
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
