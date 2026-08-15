# bg-9000

Framework-agnostic animated canvas backgrounds. No React, no Angular, no DOM
framework of any kind — just a canvas element and a config object.

> **Status: v0.1 / M3.** A field of drifting, colliding circles with amount,
> size, style and palette options. M4 is hardening.

## Usage

```ts
import { createBackground } from 'bg-9000';

const bg = createBackground(document.querySelector('canvas')!, {
  amount: 'moderate',        // 'low' | 'moderate' | 'alot'
  size: 'medium',            // 'small' | 'medium' | 'large'
  style: 'see-through',      // 'see-through' | 'dot' | 'full'
  palette: 'mint',           // 'midnight' | 'blossom' | 'mint' | 'dusk' | 'ember'
  collisions: true,
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
| `style` | `'see-through' \| 'dot' \| 'full'` | `'see-through'` | Outline only, fill only, or both |
| `palette` | `PaletteName` | `'mint'` | Background, fills and outlines as a set |
| `collisions` | `boolean` | `true` | Circle-to-circle contact; off removes the stage entirely |

Unknown values fall back to the default rather than throwing: a background is
decoration, and taking a page down over a typo in a colour name is the wrong
trade.

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

## Colour

A palette is a background, a set of fills and a set of outlines, chosen as one
unit — they are only ever correct relative to one another. A style decides which
of the fill and the outline get painted.

| Palette | Background | Fills | Outlines |
|---|---|---|---|
| `midnight` — dark, cool | `#0D1B2A` | `#1B3A5C` `#255D78` `#2E7D8F` | `#7DD3D8` `#A0E7E5` |
| `blossom` — light, pastel | `#FDF2F4` | `#F9C8D0` `#F7B2C4` `#EFD3E0` | `#E08FA8` `#D1789A` |
| `mint` — light, pastel | `#F2FAF6` | `#C7ECD9` `#A8E0C8` `#D9F2E6` | `#5FB894` `#7FC9AA` |
| `dusk` — dark, violet | `#151226` | `#2E2450` `#413066` `#57407F` | `#B9A5F0` `#D3C4FF` |
| `ember` — dark, warm | `#1A1114` | `#4A2328` `#6B3239` `#8C4249` | `#F2A68F` `#FFC9A8` |

The canvas is painted with the palette background every frame, so the page
behind it never shows through. `bg.theme` exposes the resolved colours if your
own chrome needs to match them.

Each circle takes a stable colour index at spawn, which is what gives a field
its variation for free. The number of colour variants comes from the palette
alone, never the style — so changing either one is a repaint, and the field
never jumps.

```ts
import { PALETTES, resolveTheme, resolvePreset } from 'bg-9000';

resolveTheme('dusk', 'full').variants;   // [{ fill, stroke, lineWidth }, …]
createBackground(canvas, resolvePreset('dust', { palette: 'ember' }));
```

Presets are plain partial configs — `whisper`, `bubbles`, `dust`, `nebula`,
`hearth` — so anything they express is overridable field by field.

## Collisions

Testing every pair is 106,000 checks per frame at `alot`. Circles are bucketed
into a uniform grid instead, with cells `2 × maxRadius` across — wide enough
that two circles can only touch if their centres share a cell or sit in
neighbouring ones. Each cell then tests itself plus four of its eight
neighbours; the other four see the same pairs from the opposite side. That is
roughly nine neighbour checks per circle rather than one per other circle.

The grid is rebuilt every frame by counting sort into two `Int32Array`s, and
allocates nothing after the first sizing. Contacts resolve with a positional
correction along the contact normal followed by an elastic impulse, both
weighted by inverse mass — and mass is `r²`, so a large circle shoulders a
small one aside instead of the two behaving identically. `restitution` applies
to circle contacts as well as walls.

`collisions: false` removes the stage from the pipeline rather than branching
inside it, so the grid is never built and the cost really is zero.

## Architecture

```
forces → integrate → constraints → render
```

- **`ILayer`** is the extension seam. The unit of extension is the *effect*, not
  the particle — a field of circles and a set of sinusoidal lines share the
  engine but no data model.
- **`IForce`** contributes acceleration and composes by summation.
  **`IConstraint`** corrects position after integration. Walls and contacts are
  constraints; springy walls let fast particles escape the viewport. Contacts
  resolve before walls, so the boundary always has the last word on position.
- **`ParticleStore`** is structure-of-arrays over typed arrays. Nothing
  allocates per frame, and the buffers are transferable to a worker later.
- **`IRenderer`** is batch-shaped (`drawCircleGroups`, never `drawCircle`). A
  per-primitive interface cannot be implemented efficiently on WebGL.

Particles are laid out sorted by colour at spawn and never reordered, so each
colour is a contiguous index range. Rendering draws one path containing many
sub-arcs per colour: three fill calls for 460 circles rather than 460.

Every interface lives under `src/model`, in a tree mirroring the code that
implements it — `IRenderer` at `model/render/renderer.interface.ts`, its
Canvas2D implementation at `render/canvas2d.ts`. All of them are exported from
the package root.

## Development

```bash
npm run dev        # playground at localhost:5173, contact sheet at /gallery.html
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
