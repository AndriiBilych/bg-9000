/**
 * Visual check for the examples.
 *
 *   npm run dev              # in one terminal
 *   node scripts/screenshot.mjs out.png [url] [settleMs]
 *
 * Beyond the image, this reports whether the canvas actually has lit pixels —
 * a frozen or blank field looks identical to a working one in a still if you
 * only eyeball it, and the alpha sample catches "nothing was drawn at all".
 * Works on either renderer, and on any example: it takes `#bg` if present,
 * otherwise the first canvas on the page.
 */
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'shot.png';
const url = process.argv[3] ?? 'http://localhost:5173/vanilla/';
const settleMs = Number(process.argv[4] ?? 1800);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(settleMs);

/**
 * Read the canvas's pixels from inside a frame. A WebGL drawing buffer is
 * cleared once it is composited, so the read waits for a rAF callback queued
 * after the engine's: same frame, engine already drawn, nothing presented yet.
 * `getContext` with the kind the canvas already holds returns that context;
 * with any other kind it returns null, which is how the kind is detected.
 */
async function sample(full) {
  return page.evaluate(async (full) => {
    const canvas = document.getElementById('bg') ?? document.querySelector('canvas');
    if (!canvas) return null;
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const w = full ? canvas.width : Math.min(200, canvas.width);
    const h = full ? canvas.height : Math.min(200, canvas.height);
    const gl = canvas.getContext('webgl2');
    let data;
    if (gl) {
      data = new Uint8Array(w * h * 4);
      gl.readPixels(0, canvas.height - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
      data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    }

    let lit = 0;
    let sampled = 0;
    let hash = 0;
    for (let i = 3; i < data.length; i += 4 * 97) {
      sampled++;
      if (data[i] > 0) lit++;
    }
    for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]) | 0;

    return {
      kind: gl ? 'webgl' : '2d',
      painted: { sampled, lit, ratio: +(lit / sampled).toFixed(4) },
      hash,
    };
  }, full);
}

const report = await page.evaluate(() => {
  const canvas = document.getElementById('bg') ?? document.querySelector('canvas');
  const text = (id) => document.getElementById(id)?.textContent ?? null;
  return {
    fps: text('fps'),
    circles: text('count'),
    dpr: text('dpr'),
    canvas: canvas
      ? { backingW: canvas.width, backingH: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight }
      : null,
  };
});

const whole = await sample(true);
report.context = whole?.kind ?? null;
report.painted = whole?.painted ?? null;

// Sample twice to prove the field is moving, not a static first frame.
const first = await sample(false);
await page.waitForTimeout(400);
const second = await sample(false);
report.animating = first !== null && second !== null && first.hash !== second.hash;

await page.screenshot({ path: out });
await browser.close();

console.log(JSON.stringify({ report, errors }, null, 2));
