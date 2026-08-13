export { createBackground } from './engine/engine.js';
export type { Background, BackgroundStats } from './engine/engine.js';

export { DEFAULT_CONFIG, normaliseConfig } from './config/config.js';
export type { BackgroundConfig, CircleStyle, PaletteName } from './config/config.js';

export type { Amount, Size } from './util/scalars.js';
export { AMOUNT_DENSITY, SIZE_RADIUS, MAX_AREA_COVERAGE, resolveCount } from './util/scalars.js';

export { createRng } from './util/rng.js';
export type { Rng } from './util/rng.js';

// Extension seams — exported so consumers can supply their own behaviour.
export type { Layer } from './layers/layer.js';
export type { Force, Constraint } from './forces/force.js';
export type { Renderer, DrawGroup } from './render/renderer.js';
export type { SceneContext, PointerState } from './engine/scene-context.js';
export { ParticleStore } from './layers/particle-field/store.js';
