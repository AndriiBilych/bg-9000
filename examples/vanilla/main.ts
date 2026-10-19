import {
  PALETTE_NAMES,
  PRESETS,
  PRESET_NAMES,
  RENDERER_KINDS,
  SHAPE_NAMES,
  STYLE_NAMES,
  createBackground,
  isCustomPalette,
  isRendererKind,
  isShapeName,
  type Amount,
  type CircleStyle,
  type IBackground,
  type IBackgroundConfig,
  type ICustomPalette,
  type IShape,
  type PaletteName,
  type PresetName,
  type RendererKind,
  type ShapeName,
  type Size,
} from 'bg-9000';
import { CUSTOM_SHAPES } from './shapes';
import { waves } from './waves';

/** The palette select carries the stock names plus one entry for a custom palette. */
const CUSTOM = 'custom';

/** The shape select carries the built-ins plus the two defined in shapes.ts. */
const CUSTOM_SHAPE_NAMES = Object.keys(CUSTOM_SHAPES) as Array<keyof typeof CUSTOM_SHAPES>;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`playground: #${id} is missing`);
  return node as T;
}

/** Options come from the library's own lists, so the panel cannot drift. */
function options(select: HTMLSelectElement, values: readonly string[], selected: string): void {
  select.replaceChildren(
    ...values.map((value) => new Option(value.replace('-', ' '), value, false, value === selected)),
  );
}

let canvas = el<HTMLCanvasElement>('bg');

const rendererSelect = el<HTMLSelectElement>('renderer');
const preset = el<HTMLSelectElement>('preset');
const amount = el<HTMLSelectElement>('amount');
const size = el<HTMLSelectElement>('size');
const style = el<HTMLSelectElement>('style');
const palette = el<HTMLSelectElement>('palette');
const shape = el<HTMLSelectElement>('shape');
const custom = el('custom');
const customBackground = el<HTMLInputElement>('customBackground');
const customFill = el<HTMLInputElement>('customFill');
const customOutline = el<HTMLInputElement>('customOutline');
const speed = el<HTMLInputElement>('speed');
const drag = el<HTMLInputElement>('drag');
const restitution = el<HTMLInputElement>('restitution');
const collisions = el<HTMLInputElement>('collisions');
const particles = el<HTMLInputElement>('particles');
const wavesOn = el<HTMLInputElement>('waves');
const pointerOn = el<HTMLInputElement>('pointer');

const speedOut = el<HTMLOutputElement>('speedOut');
const dragOut = el<HTMLOutputElement>('dragOut');
const restOut = el<HTMLOutputElement>('restOut');

const reseed = el<HTMLButtonElement>('reseed');
const toggle = el<HTMLButtonElement>('toggle');

const swatches = el('swatches');
const fpsOut = el('fps');
const countOut = el('count');
const contactsOut = el('contacts');
const dprOut = el('dpr');
const activeOut = el('active');

/** `?renderer=webgl` picks the renderer on load. */
const requested = new URLSearchParams(location.search).get('renderer');

let bg: IBackground = createBackground(canvas, {
  amount: 'moderate',
  size: 'medium',
  style: 'see-through',
  palette: 'mint',
  speed: 1,
  renderer: isRendererKind(requested) ? requested : 'canvas2d',
});

options(rendererSelect, RENDERER_KINDS, bg.config.renderer);
options(preset, ['—', ...PRESET_NAMES], '—');
options(style, STYLE_NAMES, bg.config.style);
options(palette, [...PALETTE_NAMES, CUSTOM], 'mint');
options(shape, [...SHAPE_NAMES, ...CUSTOM_SHAPE_NAMES], bg.config.shape as string);

/**
 * The palette to send: a stock name, or the three pickers read as a set.
 *
 * A fresh object literal on every drag frame is fine — `normaliseConfig` hands
 * back the previous one when the colours have not moved, so an unchanged
 * palette never re-resolves a theme.
 */
function readPalette(): PaletteName | ICustomPalette {
  if (palette.value !== CUSTOM) return palette.value as PaletteName;
  return {
    background: customBackground.value,
    fill: customFill.value,
    outline: customOutline.value,
  };
}

/** The shape to send: a built-in name, or one of the two custom objects. */
function readShape(): ShapeName | IShape {
  if (isShapeName(shape.value)) return shape.value;
  return CUSTOM_SHAPES[shape.value as keyof typeof CUSTOM_SHAPES];
}

function paintSwatches(): void {
  const { theme } = bg;
  // Deduplicated: a style using the shorter of the palette's two arrays repeats
  // a colour across variants, and two identical chips say nothing.
  const colours = [
    ...new Set(
      [theme.background, ...theme.variants.flatMap((v) => [v.fill, v.stroke])].filter(
        (c): c is string => c !== null,
      ),
    ),
  ];

  swatches.replaceChildren(
    ...colours.map((colour) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = colour;
      chip.title = colour;
      return chip;
    }),
  );
}

function push(): void {
  speedOut.value = Number(speed.value).toFixed(1);
  dragOut.value = Number(drag.value).toFixed(2);
  restOut.value = Number(restitution.value).toFixed(2);
  custom.hidden = palette.value !== CUSTOM;

  bg.update({
    amount: amount.value as Amount,
    size: size.value as Size,
    style: style.value as CircleStyle,
    palette: readPalette(),
    shape: readShape(),
    speed: Number(speed.value),
    drag: Number(drag.value),
    restitution: Number(restitution.value),
    collisions: collisions.checked,
    particles: particles.checked,
    pointer: pointerOn.checked,
    // The layer list is diffed by identity, so sending the same `waves`
    // instance every time costs nothing; it is initialised once when it first
    // appears and disposed when it drops out.
    layers: wavesOn.checked ? [waves] : [],
  });

  paintSwatches();
}

/** Pull the controls back into line after a preset has moved several at once. */
function sync(config: Readonly<IBackgroundConfig>): void {
  amount.value = config.amount;
  size.value = config.size;
  style.value = config.style;
  if (isCustomPalette(config.palette)) {
    palette.value = CUSTOM;
    customBackground.value = config.palette.background;
    customFill.value = config.palette.fill;
    customOutline.value = config.palette.outline;
  } else {
    palette.value = config.palette;
  }
  shape.value = typeof config.shape === 'string' ? config.shape : config.shape.name;
  speed.value = String(config.speed);
  drag.value = String(config.drag);
  restitution.value = String(config.restitution);
  collisions.checked = config.collisions;
  particles.checked = config.particles;
  pointerOn.checked = config.pointer;
  wavesOn.checked = config.layers.includes(waves);
}

for (const control of [
  amount,
  size,
  style,
  palette,
  customBackground,
  customFill,
  customOutline,
  shape,
  speed,
  drag,
  restitution,
  collisions,
  particles,
  wavesOn,
  pointerOn,
]) {
  control.addEventListener('input', () => {
    preset.value = '—';
    push();
  });
}

preset.addEventListener('input', () => {
  if (preset.value === '—') return;
  bg.update(PRESETS[preset.value as PresetName]);
  // Programmatic assignment fires no input event, so writing the controls back
  // does not bounce through the listeners above and clear the preset name.
  sync(bg.config);
  push();
});

/**
 * A canvas keeps the first kind of context it hands out, so changing renderer
 * means a new element: dispose the background, swap the canvas, and start
 * again from the same config. Layers are reused — `init` after `dispose` is
 * part of their contract.
 */
rendererSelect.addEventListener('input', () => {
  const renderer = rendererSelect.value as RendererKind;
  const config = bg.config;
  bg.dispose();
  const fresh = document.createElement('canvas');
  fresh.id = canvas.id;
  canvas.replaceWith(fresh);
  canvas = fresh;
  bg = createBackground(canvas, { ...config, renderer });
  rendererSelect.value = bg.renderer;
  const url = new URL(location.href);
  url.searchParams.set('renderer', bg.renderer);
  history.replaceState(null, '', url);
  toggle.textContent = 'Pause';
  paintSwatches();
});

reseed.addEventListener('click', () => {
  bg.update({ seed: (Math.random() * 0xffffffff) >>> 0 });
});

toggle.addEventListener('click', () => {
  const { running } = bg.getStats();
  if (running) bg.pause();
  else bg.resume();
  toggle.textContent = running ? 'Resume' : 'Pause';
});

// Polling on an interval rather than per frame: reading stats 60 times a second
// only to format them into the DOM would be its own performance problem.
setInterval(() => {
  const stats = bg.getStats();
  fpsOut.textContent = stats.running ? stats.fps.toFixed(0) : '–';
  countOut.textContent = bg.config.particles ? String(stats.count) : 'off';
  contactsOut.textContent = bg.config.collisions && bg.config.particles ? String(stats.contacts) : 'off';
  dprOut.textContent = String(Math.min(window.devicePixelRatio || 1, bg.config.maxDpr));
  activeOut.textContent = bg.renderer;
}, 250);

push();
