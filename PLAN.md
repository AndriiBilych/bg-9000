# bg-9000 — v0.1 implementation plan

A framework-agnostic canvas background library, built here and consumed by
`portfolio-website` through yalc.

| | |
|---|---|
| Package | `bg-9000` |
| Stack | TypeScript · Vite · Vitest |
| Framework deps | none |
| Renderer | Canvas2D |
| v0.1 layer | `ParticleField` |
| Milestones | 5 |

**Status:** M1–M3 complete. M4 next.

---

## Scope

One preset — drifting circles — with the four configurable axes, plus the
architectural seams that make everything else additive later. The seams cost
almost nothing now and are expensive to retrofit, which is the only reason they
appear in a v0.1.

### In v0.1

- **Amount** — `low` / `moderate` / `alot`, resolved by viewport area, not fixed counts
- **Size** — `small` / `medium` / `large`, radius ranges with jitter
- **Collisions** — circle-to-circle, togglable, zero cost when off
- **Style** — `see-through` / `dot` / `full`
- **Palettes** — five schemes, each carrying canvas background, circle fill, circle outline

### Built now because retrofitting is expensive

- Two-phase simulation pipeline (see the note under M1 — this diverged from the original plan)
- `ILayer` interface — the seam that later holds sine lines and pulse rings
- `IRenderer` interface, batch-shaped so a WebGL backend stays possible
- Structure-of-arrays particle store on typed arrays
- `ISceneContext.pointer`, stubbed inert — so layers written now already read from the right place

### Deferred

- Pointer interaction: waves, grab, attract, repel
- Other shapes, and custom PNG/SVG sprites
- Other layer types (sine lines, pulse, wave grid)
- WebGL backend; worker + OffscreenCanvas
- A published Angular wrapper package

---

## Repository layout

Files are small and each maps to one concept. The `engine` knows nothing about
circles; `particle-field` knows nothing about the DOM.

Interfaces live apart from the code that implements them, under `src/model`,
in files named `*.interface.ts` and named with an `I` prefix. The tree there
mirrors the tree beside it, so `IRenderer` is at
`model/render/renderer.interface.ts` and its implementation is at
`render/canvas2d.ts`.

```
bg-9000/
├─ package.json · tsconfig.json · vite.config.ts · vitest.config.ts
├─ scripts/screenshot.mjs        Playwright visual check
├─ src/
│  ├─ index.ts                   public barrel
│  ├─ model/                     every interface, mirroring the layout below
│  │  ├─ engine/
│  │  │  ├─ engine.interface.ts          IBackground, IBackgroundStats
│  │  │  └─ scene-context.interface.ts   ISceneContext, IPointerState
│  │  ├─ config/config.interface.ts      IBackgroundConfig
│  │  ├─ layers/
│  │  │  ├─ layer.interface.ts           ILayer
│  │  │  └─ particle-field/
│  │  │     ├─ particle-field.interface.ts  IParticleFieldOptions
│  │  │     └─ spawn.interface.ts           ISpawnOptions, ISpawnResult
│  │  ├─ forces/force.interface.ts       IForce, IConstraint
│  │  ├─ render/renderer.interface.ts    IRenderer, IDrawGroup
│  │  ├─ theme/
│  │  │  ├─ theme.interface.ts           ITheme, IColourVariant
│  │  │  ├─ palettes.interface.ts        IPalette
│  │  │  └─ styles.interface.ts          IStyleSpec
│  │  └─ util/rng.interface.ts           IRng
│  ├─ engine/
│  │  ├─ engine.ts               createBackground(), loop, lifecycle, dispose
│  │  ├─ clock.ts                dt, clamping, elapsed
│  │  ├─ surface.ts              DPR cap, ResizeObserver, canvas sizing
│  │  └─ scene-context.ts        createPointerState()
│  ├─ layers/particle-field/
│  │  ├─ particle-field.ts       the ILayer implementation
│  │  ├─ store.ts                SoA ParticleStore (typed arrays)
│  │  ├─ spawn.ts                amount/size resolution + seeding
│  │  └─ collision.ts            uniform-grid broadphase + impulse resolve
│  ├─ forces/
│  │  ├─ drag.ts
│  │  └─ boundary-bounce.ts
│  ├─ render/canvas2d.ts         Canvas2D backend
│  ├─ theme/
│  │  ├─ theme.ts                resolveTheme(), variantCount()
│  │  ├─ palettes.ts             the five colour schemes
│  │  └─ styles.ts               see-through | dot | full
│  ├─ config/
│  │  ├─ config.ts               defaults + validation
│  │  └─ presets.ts              named presets
│  └─ util/
│     ├─ rng.ts                  seeded PRNG
│     └─ scalars.ts              enum → number resolution
└─ examples/vanilla/             dev playground with live controls + FPS meter
   └─ gallery.html               contact sheet: every palette × every style
```

---

## Public API

Imperative and lifecycle-explicit, so every framework wrapper is thin. The
library never touches the document beyond the canvas it is handed.

```ts
import { createBackground } from 'bg-9000';

const bg = createBackground(canvas, {
  amount:     'moderate',      // 'low' | 'moderate' | 'alot'
  size:       'medium',        // 'small' | 'medium' | 'large'
  collisions: true,
  style:      'see-through',   // 'see-through' | 'dot' | 'full'
  palette:    'mint',
  speed:      1,
  seed:       undefined,       // number → reproducible layout
});

bg.update({ amount: 'alot' });  // live, no teardown
bg.pause();
bg.resume();
bg.dispose();                   // idempotent
```

---

## Resolving the options

### Amount — density, not count

Fixed counts look sparse on a monitor and suffocating on a phone, so amount is
one circle per *N* square CSS pixels of canvas.

| Amount | px² per circle | 1920×1080 | 390×844 |
|---|---|---|---|
| `low` | 28,000 | 74 | 12 |
| `moderate` | 12,000 | 173 | 27 |
| `alot` | 4,500 | 461 | 73 |

A hard ceiling of `maxCount: 1200` guards pathological viewports, and the
adaptive-quality pass in M4 can lower it at runtime.

### Size — radius ranges in CSS pixels

| Size | Radius | Reads as |
|---|---|---|
| `small` | 3 – 8 | fine dust, texture at a distance |
| `medium` | 10 – 22 | the default; individual circles legible |
| `large` | 26 – 48 | bold, sparse, graphic |

> **Guard rail.** `large` + `alot` + collisions is a genuine failure mode —
> circles spawn overlapped and the solver fights itself into jitter. Spawn
> computes total circle area first, and if it exceeds **45% of canvas area** it
> scales the count down rather than shipping something that misbehaves. At
> 1920×1080 this takes `large` + `alot` from 461 down to 210.

---

## Colour

### Style presets

| Style | Fill | Outline |
|---|---|---|
| `see-through` | none | palette outline colour |
| `dot` | palette fill colour | none |
| `full` | palette fill colour | palette outline colour |

### Palettes

Each palette carries a canvas background plus arrays of fill and outline
colours; every circle draws a stable index into those arrays, which gives a
field its variation for free. Colours resolve once when the theme is set —
never per frame.

| Palette | Background | Fills | Outlines |
|---|---|---|---|
| `midnight` — dark, cool | `#0D1B2A` | `#1B3A5C` `#255D78` `#2E7D8F` | `#7DD3D8` `#A0E7E5` |
| `blossom` — light, pastel | `#FDF2F4` | `#F9C8D0` `#F7B2C4` `#EFD3E0` | `#E08FA8` `#D1789A` |
| `mint` — light, pastel | `#F2FAF6` | `#C7ECD9` `#A8E0C8` `#D9F2E6` | `#5FB894` `#7FC9AA` |
| `dusk` — dark, violet | `#151226` | `#2E2450` `#413066` `#57407F` | `#B9A5F0` `#D3C4FF` |
| `ember` — dark, warm | `#1A1114` | `#4A2328` `#6B3239` `#8C4249` | `#F2A68F` `#FFC9A8` |

`mint` is the default, chosen to sit on the portfolio site's light page.

---

## Collisions

Naïve pair testing is 106,000 checks per frame at `alot`. A uniform grid brings
that to roughly 9 neighbour checks per circle.

- **Broadphase** — uniform spatial hash, cell size `2 × maxRadius`. Rebuilt each
  frame by counting sort into two `Int32Array`s (`cellStart`, `cellItems`), so
  the grid allocates nothing after construction.
- **Half-neighbourhood sweep** — each cell tests itself plus four of its eight
  neighbours, so no pair is examined twice.
- **Narrowphase** — squared-distance test against `(r₁ + r₂)²`; no square roots
  until a pair actually overlaps.
- **Resolve** — positional correction splitting the overlap along the contact
  normal, then an elastic impulse with **mass ∝ r²**, so large circles shoulder
  small ones aside instead of everything behaving identically.
- **Off** — `collisions: false` skips grid construction entirely. Not a branch
  inside a loop; the whole stage is absent.

---

## Rendering

The interface is batch-shaped from the start — `drawCircleGroups(store, groups)`,
never `drawCircle(x, y, r)`. A per-element interface cannot be implemented
efficiently on WebGL, and that is the one decision here that would be
unrecoverable later.

Inside the Canvas2D backend, circles are grouped by colour index and each group
is drawn as a *single* path holding many sub-arcs:

```ts
for (const group of colourGroups) {
  ctx.beginPath();
  for (let i = group.start; i < group.end; i++) {
    ctx.moveTo(x[i] + radius[i], y[i]);
    ctx.arc(x[i], y[i], radius[i], 0, TAU);
  }
  ctx.fillStyle = group.fill;     ctx.fill();
  ctx.strokeStyle = group.stroke; ctx.stroke();
}
```

Three fill calls for 460 circles rather than 460. That is the whole optimisation
v0.1 needs.

> A pre-rasterised sprite atlas was considered and rejected for v0.1. It earns
> its keep at thousands of elements and for custom images — neither is true at
> this scale, where grouped paths are simpler and fast enough. The atlas arrives
> with sprite support; the `IRenderer` interface is what keeps that door open.

---

## Engine hardening

| Concern | Handling | Milestone |
|---|---|---|
| HiDPI cost | DPR capped at 2 — the single largest mobile win | M1 ✅ |
| Tab restore | `dt` clamped to 50 ms; velocities are px/second, never px/frame | M1 ✅ |
| Hidden tab | `visibilitychange` → hard pause | M1 ✅ |
| Resize | `ResizeObserver` on the canvas; positions rescale proportionally | M1 ✅ |
| Teardown | `dispose()` cancels the frame and detaches every observer and listener | M1 ✅ |
| Scrolled past | `IntersectionObserver` → pause when off screen | M4 |
| Accessibility | `prefers-reduced-motion` → one static frame, no loop | M4 |
| Weak hardware | rolling frame-time average; sheds count, then DPR, when over budget | M4 |

---

## Milestones

### 1. Engine skeleton ✅

- Repo scaffold: TypeScript strict, Vite lib mode, Vitest
- `surface`, `clock`, `ILayer`, `ISceneContext`, simulation pipeline
- SoA store, spawn from amount/size, Canvas2D backend
- `examples/vanilla` playground with live controls and an FPS meter

**Delivered.** Circles drifting and bouncing correctly, no collisions, no colour.
Build is 4.88 kB gzipped; 16 tests pass.

> **Deviation from the original plan.** The single force accumulator was split
> into `IForce` (contributes acceleration, composes by summation) and
> `IConstraint` (corrects position after integration). Boundary bouncing is not a
> force — expressing it as one makes it a spring, and springy walls let fast
> particles escape the viewport entirely. Collisions in M3 are a constraint too,
> so the split pays for itself immediately. Same amount of code; it just stops
> the pipeline lying about what wall handling is.

### 2. Colour ✅

- Theme types, `resolveTheme()`, the five palettes, the three styles
- Per-particle colour index; grouped-path rendering
- Named presets: `whisper`, `bubbles`, `dust`, `nebula`, `hearth`
- All controls wired in the playground, plus a contact-sheet page

**Delivered.** All fifteen combinations render live and side by side at
`/gallery.html`. Build is 6.35 kB gzipped; 33 tests pass.

> **Decision: variant count comes from the palette, never the style.**
> `see-through` only needs the outlines and `dot` only the fills, so resolving a
> variant per *used* array would have been the obvious move. It also would have
> made the number of colour runs depend on the style — and since a run is fixed
> at spawn, toggling style would have respawned the field. A repaint that makes
> every circle jump is not a repaint. Holding the count at the palette's widest
> array costs one duplicated path call per frame for the styles that use the
> shorter one, and buys a style toggle that only changes colours.

### 3. Collisions ✅

- Uniform grid, half-neighbourhood sweep, impulse resolve
- Toggle, and the coverage guard on spawn (the guard itself landed in M1)

**Delivered.** No visible interpenetration at `alot` + `large`, where the same
field with contacts off overlaps constantly. Build is 7.92 kB gzipped; 47 tests
pass.

> **The broadphase fails silently, so it is tested against brute force.** A
> missed pair is not a crash — it is one circle quietly sliding through
> another, at a rate low enough to look like a rendering artefact. The grid is
> therefore checked against an all-pairs sweep over a real field at every size,
> asserting the counts match exactly: too few means a missed contact, too many
> means a pair visited twice and given a double impulse. Comparing the two at
> all needs the resolve suppressed — the solver moves circles as it sweeps, so
> pairs found late in a frame are not the pairs a snapshot taken beforehand
> would list. Setting `invMass` to zero makes contact resolution a no-op while
> detection still runs.

> **Cells are `2 × maxRadius` and never smaller.** The first draft derived the
> cell width as `width / cols` after rounding `cols` up, which makes cells
> *narrower* than the radius bound and quietly breaks the guarantee the whole
> half-neighbourhood argument rests on. Larger cells are merely slower; smaller
> ones lose contacts.

### 4. Hardening

- The outstanding rows of the engine-hardening table
- Vitest: `dispose()` leaves nothing attached (scalar resolution, theme
  resolution, and collision separation and energy bounds are already covered)
- README with the API and a palette reference — mostly written as M2 and M3
  landed; M4 adds whatever hardening changes

**Output:** v0.1.0, ready to publish.

### 5. Integrate into the portfolio

- `npm run build` → `yalc publish` → `yalc add bg-9000` in the site
- Rewrite `BackgroundComponent` as a thin adapter
- Delete the leftover `mousemove` logging; make content panels translucent

**Output:** the site running on the library.

---

## Integration, in detail

### The yalc loop

```bash
# once
npm i -g yalc

# in D:\Projects\bg-9000
npm run build
yalc publish

# in D:\Projects\portfolio-website
yalc add bg-9000
npm install

# thereafter, one command republishes into every consumer
npm run build && yalc push
```

Add `.yalc/` and `yalc.lock` to the site's `.gitignore`. The `file:.yalc/bg-9000`
dependency yalc writes into `package.json` must be swapped for a real version
before anything is deployed.

### The Angular adapter

Roughly forty lines, living in the site — not a published package.
`afterNextRender` keeps it SSR-safe, which the site's current
`{ provide: Window, useValue: window }` is not.

```ts
@Component({
  selector: 'app-background',
  standalone: true,
  template: `<canvas #cv class="canvas"></canvas>
             <div class="content"><ng-content/></div>`,
  styleUrl: './background.component.scss',
})
export class BackgroundComponent {
  private readonly cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  readonly amount = input<Amount>('moderate');
  readonly size = input<Size>('medium');
  readonly style = input<CircleStyle>('see-through');
  readonly palette = input<PaletteName>('mint');
  readonly collisions = input(true);

  private bg?: IBackground;

  constructor() {
    const zone = inject(NgZone);
    afterNextRender(() => {
      zone.runOutsideAngular(() => {
        this.bg = createBackground(this.cv().nativeElement, { /* ...inputs */ });
      });
    });
    effect(() => this.bg?.update({ /* ...inputs */ }));
    inject(DestroyRef).onDestroy(() => this.bg?.dispose());
  }
}
```

### Site changes that come with it

- `app.component.ts` — delete the `mousemove` / `click` logging block
- `background.component.scss` — `position: fixed; inset: 0; pointer-events: none; z-index: -1;`
- `app.component.scss` — make `.left-side` / `.right-side` translucent so the
  background shows through
- Zone.js **stays for now**; the loop runs inside `NgZone.runOutsideAngular()`.
  Going zoneless is deferred to the Angular 22 upgrade, which is the next task
  after this one.

Keeping `pointer-events: none` permanently and listening on `window` later is
what lets interaction arrive without the canvas ever intercepting a click meant
for the site's own content.
