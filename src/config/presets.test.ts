import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, normaliseConfig } from './config';
import { PRESETS, PRESET_NAMES, isPresetName, resolvePreset } from './presets';

describe('presets', () => {
  it('are all partial configs of the built-in field, with no shape or layer of their own', () => {
    for (const name of PRESET_NAMES) {
      const preset = PRESETS[name];
      expect(preset).not.toHaveProperty('shape');
      expect(preset).not.toHaveProperty('layers');
      expect(preset).not.toHaveProperty('particles');
    }
  });

  /**
   * Regression guard for the options added in M4: a preset written before
   * `shape`, `particles`, `pointer` and `layers` existed must resolve to the
   * same field it always did, with the new options at their defaults.
   */
  it('resolve to the field they always did, with the new options defaulted', () => {
    for (const name of PRESET_NAMES) {
      const config = resolvePreset(name);
      expect(config).toMatchObject(PRESETS[name]);
      expect(config.shape).toBe(DEFAULT_CONFIG.shape);
      expect(config.particles).toBe(DEFAULT_CONFIG.particles);
      expect(config.pointer).toBe(DEFAULT_CONFIG.pointer);
      expect(config.layers).toBe(DEFAULT_CONFIG.layers);
    }
  });
});

describe('resolvePreset', () => {
  it('is the preset normalised over the defaults', () => {
    for (const name of PRESET_NAMES) {
      expect(resolvePreset(name)).toEqual(normaliseConfig(PRESETS[name]));
    }
  });

  it('applies overrides on top of the preset, field by field', () => {
    const config = resolvePreset('dust', { palette: 'ember', shape: 'star' });
    expect(config).toMatchObject({ ...PRESETS.dust, palette: 'ember', shape: 'star' });
  });
});

describe('isPresetName', () => {
  it('accepts the five names and nothing else', () => {
    for (const name of PRESET_NAMES) expect(isPresetName(name)).toBe(true);
    expect(isPresetName('custom')).toBe(false);
    expect(isPresetName('toString')).toBe(false);
    expect(isPresetName(undefined)).toBe(false);
  });
});
