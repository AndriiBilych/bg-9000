# bg-9000

Framework-agnostic animated canvas backgrounds. No React, no Angular, no DOM
framework of any kind — just a canvas element and a config object.

> **Status: v0.1** A field of drifting, colliding shapes with amount,
> size, style, palette and shape options — plus custom shapes and custom
> layers on the same engine.

## Usage

```ts
import { createBackground } from 'bg-9000';

const bg = createBackground(document.querySelector('canvas')!, {
  amount: 'moderate',        // 'low' | 'moderate' | 'alot'
  size: 'medium',            // 'small' | 'medium' | 'large'
  style: 'see-through',      // 'see-through' | 'dot' | 'full'
  palette: 'mint',           // 'midnight' | 'blossom' | 'mint' | 'dusk' | 'ember'
  shape: 'circle',           // 'circle' | 'square' | 'triangle' | 'hexagon' | 'star' | 'heart'
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
| `palette` | `PaletteName \| ICustomPalette` | `'mint'` | Background, fills and outlines as a set, or custom three colours |
| `shape` | `ShapeName \| IShape` | `'circle'` | What each particle looks like — a built-in, or [custom](#shapes) |
| `collisions` | `boolean` | `true` | Particle-to-particle contact; off removes the stage entirely |
| `particles` | `boolean` | `true` | The built-in field itself; off removes the layer, leaving only [custom layers](#custom-layers) |
| `layers` | `ILayer[]` | `[]` | [Custom layers](#custom-layers), in draw order |
| `pointer` | `boolean` | `true` | Track the pointer on `window` and publish it to layers; off attaches nothing |

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

### Custom colours

`palette` also takes three colours, one per role:

```ts
createBackground(canvas, {
  palette: { background: '#0B0B10', fill: '#243447', outline: '#8FD6E8' },
  style: 'full',
});
```

Any CSS colour the canvas accepts will do — hex, `rgb()`, `hsl()`, or a keyword.
All three fields are required, because a palette is only correct as a unit; a
partial or malformed one falls back to the palette already in use rather than
mixing half a scheme with half of the default.

One fill and one outline means a custom field is flat where a stock one varies
across three. It still resolves to three colour runs internally, matching every
stock palette, so switching to and from a custom palette is a repaint and the
field never jumps — it costs two draw calls a frame that paint the same colour,
which is the same trade already made for style.

`bg.theme.palette` reads `'custom'`, and `bg.config.palette` gives the colours
back. Passing an unchanged custom palette is free: `normaliseConfig` returns the
previous object, so nothing re-resolves. Driving the three colours from a colour
picker on every input event is fine.

## Shapes

`shape` picks what each particle of the field looks like. Six are built in —
`circle`, `square`, `triangle`, `hexagon`, `star`, `heart` — and all of them
cost exactly what circles cost: one path per colour run, three fills a frame.
Switching shape is a repaint; nothing moves.

```ts
createBackground(canvas, { shape: 'star', palette: 'dusk', style: 'dot' });
bg.update({ shape: 'heart' });
```

### Custom shapes

A shape is a name and one of two functions. `defineShape` builds one:

```ts
import { defineShape } from 'bg-9000';

// trace: add the outline to a path the renderer has already opened. The
// renderer fills and strokes once per colour run, so this is as cheap as
// a circle. Begin with moveTo, close the outline, touch nothing else.
const plus = defineShape('plus', {
  trace(path, x, y, r) {
    const t = r * 0.3;
    path.moveTo(x - t, y - r); path.lineTo(x + t, y - r); path.lineTo(x + t, y - t);
    path.lineTo(x + r, y - t); path.lineTo(x + r, y + t); path.lineTo(x + t, y + t);
    path.lineTo(x + t, y + r); path.lineTo(x - t, y + r); path.lineTo(x - t, y + t);
    path.lineTo(x - r, y + t); path.lineTo(x - r, y - t); path.lineTo(x - t, y - t);
    path.closePath();
  },
});

// draw: paint the particle yourself. fillStyle, strokeStyle and lineWidth
// arrive set to the particle's colour variant. One fill per particle rather
// than per run — the escape hatch for sprites, text, gradients, or a glyph
// that needs more than one colour.
const rocket = defineShape('rocket', {
  draw(ctx, x, y, r) {
    ctx.font = `${r * 2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚀', x, y);
  },
});

createBackground(canvas, { shape: plus });
```

`path` is a `CanvasPath` — the interface `CanvasRenderingContext2D` and
`Path2D` share — so a `trace` written against one works against the other.
`(x, y)` is the centre and `r` the **circumradius**: the glyph must fit inside
the circle of radius `r`. Contacts and wall bounces resolve against that circle,
which is why a square looks a touch smaller than a circle of the same `size`
(its corners reach `r`; its edges do not) and why a star's points touch a
neighbour slightly before its body does. Honest polygon contact would mean a
physics engine, not a background.

Both functions also receive the particle's index and the `ParticleStore`, so a
shape can orient itself along `vx`/`vy` or hash the index into a stable
rotation. When a shape offers both, `trace` is used.

## Custom layers

The field is one `ILayer`; the engine runs a stack of them. Anything that is
not "N things at N positions" — a sine wave, a gradient wash, a constellation
that reacts to the pointer — is a layer, and gets the engine for free: the
DPR-capped surface, the clamped clock, pause/resume, tab-visibility
throttling, resize, a seeded RNG, the palette, and the background paint.

```ts
import { createBackground, defineLayer } from 'bg-9000';

const waves = defineLayer('waves', {
  placement: 'below',                  // under the circles; 'above' is the default
  render(ctx, scene) {                 // a CanvasRenderingContext2D, in CSS pixels
    ctx.strokeStyle = scene.theme.variants[0].stroke ?? '#fff';
    ctx.beginPath();
    for (let x = 0; x <= scene.width; x += 4) {
      ctx.lineTo(x, scene.height / 2 + Math.sin(x / 60 + scene.time) * 20);
    }
    ctx.stroke();
  },
});

const bg = createBackground(canvas, { layers: [waves] });

bg.addLayer(other);                    // sugar for update({ layers: [...config.layers, other] })
bg.removeLayer(waves);                 // disposes it
bg.update({ particles: false });       // your layers alone, on the engine
```

Every hook on `defineLayer` is optional: `init`, `update` (advance by
`scene.dt`, no drawing), `render` (draw, no mutation), `resize`, `dispose`.
Context state is saved and restored around `render`, so a layer cannot leak a
`fillStyle` into the field's draw calls and does not have to tidy up.

`scene` is everything a layer is allowed to know about the frame:

| | |
|---|---|
| `width`, `height`, `dpr` | CSS pixels; the DPR transform is already applied |
| `time`, `dt`, `frame` | seconds since start (excluding pauses), seconds since last frame (clamped), frame count |
| `theme` | the resolved palette — `background`, and `variants[]` of `{ fill, stroke, lineWidth }` |
| `config` | the normalised config, so a layer can honour the shared vocabulary: `amount` as "how many of my thing", `speed` as a multiplier |
| `pointer` | `{ x, y, down, active }` in canvas CSS pixels — see below |
| `rng` | seeded; the same seed gives the same layout |

`config.layers` is the single record of what is in the stack. The engine diffs
it by identity on every `update`: a layer that appears is initialised, one that
disappears is disposed, one that stays is left alone. Sending the same instance
every call costs nothing. A layer that leaves and comes back is initialised
again, so `init` must be safe to call after `dispose`.

The `amount`, `size`, `speed`, `style`, `palette`, `shape` and `collisions`
options describe the built-in field and nothing else. A custom layer is free to
read them from `scene.config` — the playground's waves layer turns `amount`
into a wave count — but the engine never interprets them on its behalf.

### A second field

The built-in field is exported as a factory, so "small stars over large
circles, each with its own theme and its own contact stage" is composition:

```ts
import { createBackground, createParticleField, resolveTheme } from 'bg-9000';

createBackground(canvas, {
  size: 'large', style: 'see-through',
  layers: [
    createParticleField({
      amount: 'alot', size: 'small', speed: 1.5, drag: 0, maxCount: 600,
      restitution: 1, collisions: false, shape: 'star',
      theme: resolveTheme('dusk', 'dot'),
    }),
  ],
});
```

### The full `ILayer`

`defineLayer` is sugar. A class implementing `ILayer` directly gets the
`IRenderer` rather than the context, and uses `renderer.drawImmediate(fn)` for
direct drawing — an optional member, so a backend that cannot offer a 2D
context simply omits it and the layer draws nothing there.

### Pointer

The canvas has `pointer-events: none` so that it never steals a click from the
page, which means it never receives a pointer event either. The engine listens
on `window` instead — passive listeners, nothing prevented or stopped — maps
the position into the canvas's box in CSS pixels, and publishes it as
`scene.pointer` before every `update`. `active` is "inside the canvas box";
`down` is a held button or touch.

```ts
update(scene) {
  if (scene.pointer.active) this.target = scene.pointer.x;
}
```

`pointer: false` attaches no listeners at all, and the state reads as a
stationary, inactive cursor at the origin. The built-in field does not read the
pointer; a pointer force is a four-line `IForce` and is left to the caller.

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

### Collisions and custom graphics

Collisions belong to a layer's data model, not to the canvas. There is no
global physics world, and two layers never collide with one another: the first
sentence of `ILayer`'s contract is that layers share no data model. Three
cases follow from that.

- **A custom shape in the built-in field** collides exactly as circles do,
  against its circumradius. Want circles and squares knocking about together?
  That is one field, because one field is one store — give it a shape whose
  `trace` branches on the particle index.
- **A custom layer that wants its own physics** assembles the same parts the
  field does, over its own store. `ParticleStore`, `CircleCollisions`,
  `BoundaryBounce`, `Drag` and `spawnField` are all exported:

  ```ts
  const store = new ParticleStore(200);
  const contacts = new CircleCollisions(200, 0.9);
  const walls = new BoundaryBounce(1);
  // in update(scene): forces → integrate → contacts.resolve(store, scene) → walls.resolve(store, scene)
  ```

  Or skip the assembly and take a whole field: `createParticleField`.
- **Cross-layer collisions** — waves deflecting circles — are a non-goal.

## Architecture

```
forces → integrate → constraints → render
```

- **`ILayer`** is the extension seam. The unit of extension is the *effect*, not
  the particle — a field of circles and a set of sinusoidal lines share the
  engine but no data model. The engine runs a stack: your `'below'` layers,
  the built-in field, your `'above'` layers. `defineLayer` wraps a plain
  object into one; `createParticleField` hands you the built-in as one.
- **`IShape`** is the one place geometry lives. `trace` adds an outline to a
  batched path; `draw` paints a particle itself. The store, spawn, forces and
  collisions never know which glyph is in use.
- **`IForce`** contributes acceleration and composes by summation.
  **`IConstraint`** corrects position after integration. Walls and contacts are
  constraints; springy walls let fast particles escape the viewport. Contacts
  resolve before walls, so the boundary always has the last word on position.
- **`ParticleStore`** is structure-of-arrays over typed arrays. Nothing
  allocates per frame, and the buffers are transferable to a worker later.
- **`IRenderer`** is batch-shaped (`drawShapeGroups`, never `drawShape`). A
  per-primitive interface cannot be implemented efficiently on WebGL. A
  tracing shape keeps that batch — one path per colour run — and a drawing
  shape is the stated exception; a renderer that cannot draw a shape throws.
  The one optional member, `drawImmediate`, hands custom layers the 2D context
  with state saved and restored around them. `drawCircleGroups` remains as a
  deprecated alias for `drawShapeGroups(…, SHAPES.circle)` until 0.2.
- **`ISceneContext`** is built once by the engine and mutated in place. Test
  fixtures should use `createSceneContext()` rather than a literal, so that a
  new field on it is never a change they have to make.

Particles are laid out sorted by colour at spawn and never reordered, so each
colour is a contiguous index range. Rendering draws one path containing many
sub-paths per colour: three fill calls for 460 particles rather than 460.

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
