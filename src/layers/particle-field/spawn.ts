import type {
  ISpawnOptions,
  ISpawnResult,
} from '../../model/layers/particle-field/spawn.interface.js';
import { SIZE_RADIUS, resolveCount } from '../../util/scalars.js';
import type { ParticleStore } from './store.js';

/** Base drift range in CSS pixels per second, before the speed multiplier. */
const DRIFT_MIN = 10;
const DRIFT_MAX = 34;

/**
 * Fill the store with a fresh field.
 *
 * Particles are written in ascending colour order so that each colour is a
 * contiguous index range. Rendering can then draw one path per colour without
 * sorting anything per frame, and since nothing ever reorders the store, that
 * invariant holds for the lifetime of the field.
 */
export function spawnField(store: ParticleStore, options: ISpawnOptions): ISpawnResult {
  const { amount, size, speed, maxCount, width, height, rng } = options;
  const colourCount = Math.max(1, options.colourCount);

  const count = Math.min(
    resolveCount(amount, size, width, height, maxCount),
    store.capacity,
  );

  const [minRadius, maxRadius] = SIZE_RADIUS[size];

  const colourBounds = new Int32Array(colourCount + 1);
  for (let c = 0; c <= colourCount; c++) {
    colourBounds[c] = Math.round((c * count) / colourCount);
  }

  store.clear();

  for (let c = 0; c < colourCount; c++) {
    for (let i = colourBounds[c]; i < colourBounds[c + 1]; i++) {
      const radius = rng.range(minRadius, maxRadius);

      // Spawn fully inside the viewport so the boundary constraint has nothing
      // to correct on the first frame.
      const spanX = Math.max(width - radius * 2, 0);
      const spanY = Math.max(height - radius * 2, 0);
      const x = spanX > 0 ? radius + rng.next() * spanX : width * 0.5;
      const y = spanY > 0 ? radius + rng.next() * spanY : height * 0.5;

      const angle = rng.next() * Math.PI * 2;
      const drift = rng.range(DRIFT_MIN, DRIFT_MAX) * speed;

      store.add(x, y, Math.cos(angle) * drift, Math.sin(angle) * drift, radius, c);
    }
  }

  return { count: store.count, colourBounds };
}
