import { createBackground, type Amount, type Size } from 'bg-9000';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`playground: #${id} is missing`);
  return node as T;
}

const canvas = el<HTMLCanvasElement>('bg');

const amount = el<HTMLSelectElement>('amount');
const size = el<HTMLSelectElement>('size');
const speed = el<HTMLInputElement>('speed');
const drag = el<HTMLInputElement>('drag');
const restitution = el<HTMLInputElement>('restitution');

const speedOut = el<HTMLOutputElement>('speedOut');
const dragOut = el<HTMLOutputElement>('dragOut');
const restOut = el<HTMLOutputElement>('restOut');

const reseed = el<HTMLButtonElement>('reseed');
const toggle = el<HTMLButtonElement>('toggle');

const fpsOut = el('fps');
const countOut = el('count');
const dprOut = el('dpr');

const bg = createBackground(canvas, {
  amount: 'moderate',
  size: 'medium',
  speed: 1,
});

function push(): void {
  speedOut.value = Number(speed.value).toFixed(1);
  dragOut.value = Number(drag.value).toFixed(2);
  restOut.value = Number(restitution.value).toFixed(2);

  bg.update({
    amount: amount.value as Amount,
    size: size.value as Size,
    speed: Number(speed.value),
    drag: Number(drag.value),
    restitution: Number(restitution.value),
  });
}

for (const control of [amount, size, speed, drag, restitution]) {
  control.addEventListener('input', push);
}

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
  dprOut.textContent = String(Math.min(window.devicePixelRatio || 1, bg.config.maxDpr));
}, 250);

push();
