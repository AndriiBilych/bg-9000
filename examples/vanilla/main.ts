import {
  PALETTE_NAMES,
  PRESETS,
  PRESET_NAMES,
  STYLE_NAMES,
  createBackground,
  type Amount,
  type CircleStyle,
  type IBackgroundConfig,
  type PaletteName,
  type PresetName,
  type Size,
} from 'bg-9000';

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

const canvas = el<HTMLCanvasElement>('bg');

const preset = el<HTMLSelectElement>('preset');
const amount = el<HTMLSelectElement>('amount');
const size = el<HTMLSelectElement>('size');
const style = el<HTMLSelectElement>('style');
const palette = el<HTMLSelectElement>('palette');
const speed = el<HTMLInputElement>('speed');
const drag = el<HTMLInputElement>('drag');
const restitution = el<HTMLInputElement>('restitution');
const collisions = el<HTMLInputElement>('collisions');

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

const bg = createBackground(canvas, {
  amount: 'moderate',
  size: 'medium',
  style: 'see-through',
  palette: 'mint',
  speed: 1,
});

options(preset, ['—', ...PRESET_NAMES], '—');
options(style, STYLE_NAMES, bg.config.style);
options(palette, PALETTE_NAMES, bg.config.palette);

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

  bg.update({
    amount: amount.value as Amount,
    size: size.value as Size,
    style: style.value as CircleStyle,
    palette: palette.value as PaletteName,
    speed: Number(speed.value),
    drag: Number(drag.value),
    restitution: Number(restitution.value),
    collisions: collisions.checked,
  });

  paintSwatches();
}

/** Pull the controls back into line after a preset has moved several at once. */
function sync(config: Readonly<IBackgroundConfig>): void {
  amount.value = config.amount;
  size.value = config.size;
  style.value = config.style;
  palette.value = config.palette;
  speed.value = String(config.speed);
  drag.value = String(config.drag);
  restitution.value = String(config.restitution);
  collisions.checked = config.collisions;
}

for (const control of [amount, size, style, palette, speed, drag, restitution, collisions]) {
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
  countOut.textContent = String(stats.count);
  contactsOut.textContent = bg.config.collisions ? String(stats.contacts) : 'off';
  dprOut.textContent = String(Math.min(window.devicePixelRatio || 1, bg.config.maxDpr));
}, 250);

push();
