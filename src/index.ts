export { createBackground } from './engine/engine.js';

export { DEFAULT_CONFIG, normaliseConfig } from './config/config.js';
export type { CircleStyle, PaletteName } from './config/config.js';

export { PRESETS, PRESET_NAMES, isPresetName, resolvePreset } from './config/presets.js';
export type { PresetName } from './config/presets.js';

export { resolveTheme, variantCount } from './theme/theme.js';
export { PALETTES, PALETTE_NAMES, DEFAULT_PALETTE, isPaletteName } from './theme/palettes.js';
export { STYLES, STYLE_NAMES, DEFAULT_STYLE, isCircleStyle } from './theme/styles.js';

export type { Amount, Size } from './util/scalars.js';
export { AMOUNT_DENSITY, SIZE_RADIUS, MAX_AREA_COVERAGE, resolveCount } from './util/scalars.js';

export { createRng } from './util/rng.js';

export { ParticleStore } from './layers/particle-field/store.js';
export { CircleCollisions } from './layers/particle-field/collision.js';

// --- model ----------------------------------------------------------------
// Every interface lives under src/model, mirroring the structure of the code
// that implements it. Consumers implementing their own layer, force or
// renderer take these.

export type { IBackground, IBackgroundStats } from './model/engine/engine.interface.js';
export type { ISceneContext, IPointerState } from './model/engine/scene-context.interface.js';
export type { IBackgroundConfig } from './model/config/config.interface.js';
export type { ILayer } from './model/layers/layer.interface.js';
export type { IParticleFieldOptions } from './model/layers/particle-field/particle-field.interface.js';
export type {
  ISpawnOptions,
  ISpawnResult,
} from './model/layers/particle-field/spawn.interface.js';
export type { IForce, IConstraint } from './model/forces/force.interface.js';
export type { IRenderer, IDrawGroup } from './model/render/renderer.interface.js';
export type { IPalette } from './model/theme/palettes.interface.js';
export type { IStyleSpec } from './model/theme/styles.interface.js';
export type { ITheme, IColourVariant } from './model/theme/theme.interface.js';
export type { IRng } from './model/util/rng.interface.js';
