import { DEFAULT_CONFIG, normaliseConfig } from '../config/config';
import { ParticleField } from '../layers/particle-field/particle-field';
import type { IBackgroundConfig } from '../model/config/config.interface';
import type { IBackground, IBackgroundStats } from '../model/engine/engine.interface';
import type { ISceneContext } from '../model/engine/scene-context.interface';
import type { ILayer } from '../model/layers/layer.interface';
import type { IParticleFieldOptions } from '../model/layers/particle-field/particle-field.interface';
import type { IRenderer } from '../model/render/renderer.interface';
import type { ITheme } from '../model/theme/theme.interface';
import { createRenderer } from '../render/create-renderer';
import type { RendererKind } from '../render/renderer-kind';
import { resolveTheme } from '../theme/theme';
import { createRng } from '../util/rng';
import { Clock } from './clock';
import { PointerTracker } from './pointer';
import { createPointerState } from './scene-context';
import { Surface } from './surface';

function fieldOptions(config: IBackgroundConfig, theme: ITheme): IParticleFieldOptions {
  return {
    amount: config.amount,
    size: config.size,
    speed: config.speed,
    drag: config.drag,
    maxCount: config.maxCount,
    restitution: config.restitution,
    collisions: config.collisions,
    shape: config.shape,
    theme,
  };
}

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
    theme,
    config,
  };

  // Declared ahead of `new Surface(...)`: the Surface constructor measures
  // immediately and invokes this callback synchronously, so anything it touches
  // must already be initialised rather than sitting in the dead zone.
  let initialised = false;
  let running = false;
  let disposed = false;
  let raf = 0;
  let fps = 0;

  /** The stack in draw order. Only layers in it receive update/render/resize. */
  let stack: ILayer[] = [];

  const surface = new Surface(canvas, config.maxDpr, (width, height, dpr, prevWidth, prevHeight) => {
    ctx.width = width;
    ctx.height = height;
    ctx.dpr = dpr;
    if (!initialised) return;
    for (const layer of stack) layer.resize(ctx, prevWidth, prevHeight);
    // Even while running: resizing the canvas just wipes it, and the next
    // frame may come after the browser paints. A host whose viewport resizes
    // every frame (a phone's bars sliding, an in-app browser's chrome
    // collapsing) would otherwise flash blank until the resizing stopped.
    renderFrame();
  });

  ctx.width = surface.width;
  ctx.height = surface.height;
  ctx.dpr = surface.dpr;

  const renderer: IRenderer = createRenderer(config.renderer, canvas, surface);
  const rendererKind = renderer.kind as RendererKind;
  const tracker = new PointerTracker(canvas, pointer);

  const field = new ParticleField(fieldOptions(config, theme));

  // --- layer stack ----------------------------------------------------------

  function desiredStack(): ILayer[] {
    const next: ILayer[] = [];
    for (const layer of config.layers) if (layer.placement === 'below') next.push(layer);
    if (config.particles) next.push(field);
    for (const layer of config.layers) if (layer.placement !== 'below') next.push(layer);
    return next;
  }

  /**
   * Diffed by identity: new layers are initialised, departed ones disposed,
   * moved ones left alone. The built-in field is just another entry, which is
   * what makes `particles: false` remove it rather than branch around it.
   */
  function syncStack(): void {
    const next = desiredStack();
    for (const layer of next) if (!stack.includes(layer)) layer.init(ctx);
    for (const layer of stack) if (!next.includes(layer)) layer.dispose();
    stack = next;
  }

  syncStack();
  initialised = true;

  if (config.pointer) tracker.attach();

  // --- frame loop ---------------------------------------------------------

  function renderFrame(): void {
    if (disposed) return;
    renderer.beginFrame(theme.background);
    for (const layer of stack) layer.render(renderer, ctx);
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

    for (const layer of stack) layer.update(ctx);
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

  function update(next: Partial<IBackgroundConfig>): void {
    if (disposed) return;
    const previous = config;
    config = normaliseConfig(next, config);

    if (config.renderer !== previous.renderer) {
      // A canvas holds one kind of context for life; the only way to change
      // renderer is a new canvas and a new background.
      console.error(
        `bg-9000: renderer cannot change after creation (asked for "${config.renderer}", staying on "${previous.renderer}").`,
      );
      config = { ...config, renderer: previous.renderer };
    }
    ctx.config = config;

    if (config.seed !== previous.seed) {
      ctx.rng = createRng(config.seed);
    }

    if (config.palette !== previous.palette || config.style !== previous.style) {
      theme = resolveTheme(config.palette, config.style);
      ctx.theme = theme;
    }

    // Configured even while out of the stack, so switching it back on finds
    // it up to date.
    field.configure(fieldOptions(config, theme), ctx);

    if (config.layers !== previous.layers || config.particles !== previous.particles) {
      syncStack();
    }

    if (config.pointer !== previous.pointer) {
      if (config.pointer) tracker.attach();
      else tracker.detach();
    }

    if (!running) renderFrame();
  }

  return {
    get config(): Readonly<IBackgroundConfig> {
      return config;
    },

    get theme(): ITheme {
      return theme;
    },

    renderer: rendererKind,

    update,

    addLayer(layer: ILayer): void {
      if (disposed || config.layers.includes(layer)) return;
      update({ layers: [...config.layers, layer] });
    },

    removeLayer(layer: ILayer): void {
      if (disposed || !config.layers.includes(layer)) return;
      update({ layers: config.layers.filter((l) => l !== layer) });
    },

    pause: stop,
    resume: start,

    getStats(): IBackgroundStats {
      const active = config.particles;
      return {
        fps,
        count: active ? field.count : 0,
        contacts: active ? field.contactCount : 0,
        dt: ctx.dt,
        running,
      };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      tracker.detach();
      for (const layer of stack) layer.dispose();
      stack = [];
      renderer.dispose();
      surface.dispose();
    },
  };
}
