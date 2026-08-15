import type { IBackgroundConfig } from '../model/config/config.interface.js';
import { normaliseConfig } from './config.js';

/**
 * Named starting points.
 *
 * A preset is only ever a partial config — never a separate code path — so
 * anything a preset can express, a caller can express by hand, and every preset
 * stays overridable field by field.
 */
export type PresetName = 'whisper' | 'bubbles' | 'dust' | 'nebula' | 'hearth';

export const PRESETS: Readonly<Record<PresetName, Readonly<Partial<IBackgroundConfig>>>> = {
  /** Sparse, large, barely moving. The one that sits under text. */
  whisper: {
    amount: 'low',
    size: 'large',
    style: 'see-through',
    palette: 'mint',
    collisions: false,
    speed: 0.5,
  },
  /** Mid-size and knocking about; collisions are the point of this one. */
  bubbles: {
    amount: 'moderate',
    size: 'medium',
    style: 'full',
    palette: 'blossom',
    collisions: true,
    speed: 1,
  },
  /** Fine texture at a distance. Too many circles to collide cheaply. */
  dust: {
    amount: 'alot',
    size: 'small',
    style: 'dot',
    palette: 'midnight',
    collisions: false,
    speed: 1.4,
  },
  /** Slow, dark, graphic. */
  nebula: {
    amount: 'moderate',
    size: 'large',
    style: 'dot',
    palette: 'dusk',
    collisions: true,
    speed: 0.6,
  },
  /** Warm and quiet, with a little drag so nothing races. */
  hearth: {
    amount: 'low',
    size: 'medium',
    style: 'full',
    palette: 'ember',
    collisions: true,
    speed: 0.8,
    drag: 0.15,
  },
};

export const PRESET_NAMES: readonly PresetName[] = Object.keys(PRESETS) as PresetName[];

export function isPresetName(value: unknown): value is PresetName {
  return typeof value === 'string' && Object.hasOwn(PRESETS, value);
}

/**
 * A preset with optional per-field overrides, normalised into a full config.
 *
 * ```ts
 * createBackground(canvas, resolvePreset('dust', { palette: 'ember' }));
 * ```
 */
export function resolvePreset(
  name: PresetName,
  overrides?: Partial<IBackgroundConfig>,
): IBackgroundConfig {
  return normaliseConfig({ ...PRESETS[name], ...(overrides ?? {}) });
}
