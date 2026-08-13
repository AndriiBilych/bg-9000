# bg-9000

Framework-agnostic animated canvas backgrounds. No React, no Angular, no DOM
framework of any kind — just a canvas element and a config object.

> **Status: v0.1 / M1.** A field of drifting circles with amount and size
> options. Colour lands in M2, collisions in M3.

## Usage

```ts
import { createBackground } from 'bg-9000';

const bg = createBackground(document.querySelector('canvas')!, {
  amount: 'moderate',   // 'low' | 'moderate' | 'alot'
  size: 'medium',       // 'small' | 'medium' | 'large'
  speed: 1,
});

bg.update({ amount: 'alot' });   // live; rebuilds only what changed
bg.pause();
bg.resume();
bg.dispose();                    // idempotent
```

The canvas needs a size. For a full-viewport background:

```css
canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;
}
```

`z-index: -1` puts the canvas behind page content, which also puts it behind an
opaque `body` background — if your page sets one, the background will be
invisible. Either leave `body` transparent or give the canvas `z-index: 0` and
your content `position: relative; z-index: 1`.

`pointer-events: none` is deliberate and permanent. When interaction arrives it
will listen on `window`, so the canvas never intercepts a click meant for your
own content.

## Options

| Option | Type | Default | |
|---|---|---|---|
| `amount` | `'low' \| 'moderate' \| 'alot'` | `'moderate'` | Density, not a fixed count — scales with viewport area |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | Radius range: 3–8, 10–22, 26–48 px |
| `speed` | `number` | `1` | Multiplier on drift velocity |
| `drag` | `number` | `0` | Velocity damping; 0 skips the force entirely |
| `restitution` | `number` | `1` | Velocity retained on a wall bounce |
| `maxCount` | `number` | `1200` | Hard ceiling regardless of density |
| `maxDpr` | `number` | `2` | Device pixel ratio cap |
| `seed` | `number?` | — | Fixed seed reproduces a layout exactly |
| `collisions` | `boolean` | `true` | *M3 — accepted but inert* |
| `style` | `'see-through' \| 'dot' \| 'full'` | `'see-through'` | *M2 — accepted but inert* |
| `palette` | `PaletteName` | `'mint'` | *M2 — accepted but inert* |

Amount is expressed as one circle per N square CSS pixels rather than a fixed
count, because a count that reads well on a monitor suffocates a phone.

| Amount | px² per circle | 1920×1080 | 390×844 |
|---|---|---|---|
| `low` | 28,000 | 74 | 12 |
| `moderate` | 12,000 | 173 | 27 |
| `alot` | 4,500 | 461 | 73 |

A coverage guard caps the count wherever the circles would occupy more than 45%
of the canvas, so `large` + `alot` sheds circles rather than spawning a field
that starts deeply overlapped.

## Architecture

```
forces → integrate → constraints → render
```

- **`Layer`** is the extension seam. The unit of extension is the *effect*, not
  the particle — a field of circles and a set of sinusoidal lines share the
  engine but no data model.
- **`Force`** contributes acceleration and composes by summation.
  **`Constraint`** corrects position after integration. Walls and contacts are
  constraints; springy walls let fast particles escape the viewport.
- **`ParticleStore`** is structure-of-arrays over typed arrays. Nothing
  allocates per frame, and the buffers are transferable to a worker later.
- **`Renderer`** is batch-shaped (`drawCircleGroups`, never `drawCircle`). A
  per-primitive interface cannot be implemented efficiently on WebGL.

Particles are laid out sorted by colour at spawn and never reordered, so each
colour is a contiguous index range. Rendering draws one path containing many
sub-arcs per colour: three fill calls for 460 circles rather than 460.

## Development

```bash
npm run dev        # playground at localhost:5173
npm test           # vitest
npm run build      # dist/ — ESM, CJS, and .d.ts
npm run typecheck
```

Visual check, with the dev server running:

```bash
node scripts/screenshot.mjs out.png
```

It reports frame rate, particle count, whether the canvas has lit pixels, and
whether successive frames differ — a frozen field and a working one look
identical in a still.
