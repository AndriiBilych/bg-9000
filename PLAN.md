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

**Status:** M1 complete. M2 next.

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
- `Layer` interface — the seam that later holds sine lines and pulse rings
- `Renderer` interface, batch-shaped so a WebGL backend stays possible
- Structure-of-arrays particle store on typed arrays
- `SceneContext.pointer`, stubbed inert — so layers written now already read from the right place

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

```
bg-9000/
├─ package.json · tsconfig.json · vite.config.ts · vitest.config.ts
├─ scripts/screenshot.mjs        Playwright visual check
├─ src/
│  ├─ index.ts                   public barrel
│  ├─ engine/
│  │  ├─ engine.ts               createBackground(), loop, lifecycle, dispose
│  │  ├─ clock.ts                dt, clamping, elapsed
│  │  ├─ surface.ts              DPR cap, ResizeObserver, canvas sizing
│  │  └─ scene-context.ts        SceneContext (size, time, pointer stub)
│  ├─ layers/
│  │  ├─ layer.ts                Layer interface
│  │  └─ particle-field/
│  │     ├─ particle-field.ts    the Layer implementation
│  │     ├─ store.ts             SoA ParticleStore (typed arrays)
│  │     ├─ spawn.ts             amount/size resolution + seeding
│  │     └─ collision.ts         uniform-grid broadphase + impulse resolve  [M3]
│  ├─ forces/
│  │  ├─ force.ts                Force + Constraint interfaces
│  │  ├─ drag.ts
│  │  └─ boundary-bounce.ts
│  ├─ render/
│  │  ├─ renderer.ts             batched Renderer interface
│  │  └─ canvas2d.ts             Canvas2D backend
│  ├─ theme/                                                                [M2]
│  │  ├─ theme.ts                Theme types, resolveTheme()
│  │  ├─ palettes.ts             the five colour schemes
│  │  └─ styles.ts               see-through | dot | full
│  ├─ config/
│  │  ├─ config.ts               public config types + defaults + validation
│  │  └─ presets.ts              named presets                              [M2]
│  └─ util/
│     ├─ rng.ts                  seeded PRNG
│     └─ scalars.ts              enum → number resolution
└─ examples/vanilla/             dev playground with live controls + FPS meter
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
> with sprite support; the `Renderer` interface is what keeps that door open.

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
- `surface`, `clock`, `Layer`, `SceneContext`, simulation pipeline
- SoA store, spawn from amount/size, Canvas2D backend
- `examples/vanilla` playground with live controls and an FPS meter

**Delivered.** Circles drifting and bouncing correctly, no collisions, no colour.
Build is 4.88 kB gzipped; 16 tests pass.

> **Deviation from the original plan.** The single force accumulator was split
> into `Force` (contributes acceleration, composes by summation) and
> `Constraint` (corrects position after integration). Boundary bouncing is not a
> force — expressing it as one makes it a spring, and springy walls let fast
> particles escape the viewport entirely. Collisions in M3 are a constraint too,
> so the split pays for itself immediately. Same amount of code; it just stops
> the pipeline lying about what wall handling is.

### 2. Colour

- Theme types, `resolveTheme()`, the five palettes, the three styles
- Per-particle colour index; grouped-path rendering
- All controls wired in the playground

**Output:** 15 style × palette combinations reviewable side by side.

### 3. Collisions

- Uniform grid, half-neighbourhood sweep, impulse resolve
- Toggle, and the coverage guard on spawn

**Output:** stable collisions at every amount × size combination.

### 4. Hardening

- The outstanding rows of the engine-hardening table
- Vitest: scalar resolution, theme resolution, collision separation and energy
  bounds, `dispose()` leaves nothing attached
- README with the API and a palette reference

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

  private bg?: Background;

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
