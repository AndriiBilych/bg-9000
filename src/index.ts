export { createBackground } from './engine/engine';

export { DEFAULT_CONFIG, normaliseConfig, normaliseLayers, isLayer } from './config/config';
export type { CircleStyle, ICustomPalette, PaletteName, RendererKind, ShapeName } from './config/config';

// --- renderers ------------------------------------------------------------
// `canvas2d` by default; `webgl` on request, falling back to `canvas2d` where
// WebGL2 is missing. `parseColour` is what the WebGL renderer reads CSS colours
// with, exported for a GL layer that wants the palette as numbers.

export { RENDERER_KINDS, DEFAULT_RENDERER, isRendererKind } from './render/renderer-kind';
export { parseColour } from './theme/colour-parse';
export type { RGBA } from './theme/colour-parse';

export { PRESETS, PRESET_NAMES, isPresetName, resolvePreset } from './config/presets';
export type { PresetName } from './config/presets';

export { resolveTheme, variantCount } from './theme/theme';
export {
  PALETTES,
  PALETTE_NAMES,
  DEFAULT_PALETTE,
  CUSTOM_VARIANTS,
  isPaletteName,
  isCustomPalette,
  expandCustomPalette,
  normalisePalette,
} from './theme/palettes';
export type { PaletteId } from './theme/palettes';
export { isColour } from './theme/colour';
export { STYLES, STYLE_NAMES, DEFAULT_STYLE, isCircleStyle } from './theme/styles';

export type { Amount, Size } from './util/scalars';
export { AMOUNT_DENSITY, SIZE_RADIUS, MAX_AREA_COVERAGE, resolveCount } from './util/scalars';

export { createRng } from './util/rng';

// --- shapes ---------------------------------------------------------------
// What each particle of the built-in field looks like. Six built-ins, or
// `defineShape` for custom ones.

export {
  SHAPES,
  SHAPE_NAMES,
  DEFAULT_SHAPE,
  defineShape,
  isShapeName,
  isShape,
  normaliseShape,
  resolveShape,
} from './shapes/shapes';

// --- layers ---------------------------------------------------------------
// Custom effects. `defineLayer` for one written against the 2D
// context; `createParticleField` for another field with its own shape, theme
// and contact stage; the pieces below to assemble a simulation by hand.

export { defineLayer } from './layers/custom-layer';
export { createParticleField } from './layers/particle-field/particle-field';
export { createSceneContext, createPointerState } from './engine/scene-context';

export { ParticleStore } from './layers/particle-field/store';
export { CircleCollisions } from './layers/particle-field/collision';
export { BoundaryBounce } from './forces/boundary-bounce';
export { Drag } from './forces/drag';
export { spawnField } from './layers/particle-field/spawn';

// --- model ----------------------------------------------------------------
// Every interface lives under src/model, mirroring the structure of the code
// that implements it. Consumers implementing their own layer, force or
// renderer take these.

export type { IBackground, IBackgroundStats } from './model/engine/engine.interface';
export type { ISceneContext, IPointerState } from './model/engine/scene-context.interface';
export type { IBackgroundConfig } from './model/config/config.interface';
export type { ILayer, LayerPlacement } from './model/layers/layer.interface';
export type { ILayerDefinition } from './model/layers/custom-layer.interface';
export type { IShape, IShapeDefinition } from './model/shapes/shape.interface';
export type { IParticleFieldOptions } from './model/layers/particle-field/particle-field.interface';
export type {
  ISpawnOptions,
  ISpawnResult,
} from './model/layers/particle-field/spawn.interface';
export type { IForce, IConstraint } from './model/forces/force.interface';
export type { IRenderer, IDrawGroup } from './model/render/renderer.interface';
export type { IGLFrame, IGLTexture } from './model/render/gl-frame.interface';
export type { IPalette } from './model/theme/palettes.interface';
export type { IStyleSpec } from './model/theme/styles.interface';
export type { ITheme, IColourVariant } from './model/theme/theme.interface';
export type { IRng } from './model/util/rng.interface';
