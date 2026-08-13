/**
 * Visual check for the playground.
 *
 *   npm run dev              # in one terminal
 *   node scripts/screenshot.mjs out.png
 *
 * Beyond the image, this reports whether the canvas actually has lit pixels —
 * a frozen or blank field looks identical to a working one in a still if you
 * only eyeball it, and the alpha sample catches "nothing was drawn at all".
 */
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'shot.png';
const url = process.argv[3] ?? 'http://localhost:5173/';
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

const report = await page.evaluate(() => {
  const canvas = document.getElementById('bg');
  const text = (id) => document.getElementById(id)?.textContent ?? null;

  let painted = null;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    let sampled = 0;
    for (let i = 3; i < data.length; i += 4 * 97) {
      sampled++;
      if (data[i] > 0) lit++;
    }
    painted = { sampled, lit, ratio: +(lit / sampled).toFixed(4) };
  }

  return {
    fps: text('fps'),
    circles: text('count'),
    dpr: text('dpr'),
    canvas: canvas
      ? { backingW: canvas.width, backingH: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight }
      : null,
    painted,
  };
});

// Sample twice to prove the field is moving, not a static first frame.
const firstFrame = await page.evaluate(() => {
  const c = document.getElementById('bg');
  return c.getContext('2d').getImageData(0, 0, 200, 200).data.join(',');
});
await page.waitForTimeout(400);
const secondFrame = await page.evaluate(() => {
  const c = document.getElementById('bg');
  return c.getContext('2d').getImageData(0, 0, 200, 200).data.join(',');
});
report.animating = firstFrame !== secondFrame;

await page.screenshot({ path: out });
await browser.close();

console.log(JSON.stringify({ report, errors }, null, 2));
