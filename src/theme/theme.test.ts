import { describe, expect, it } from 'vitest';
import { normaliseConfig } from '../config/config.js';
import { PRESETS, PRESET_NAMES, resolvePreset } from '../config/presets.js';
import type { ICustomPalette } from '../model/theme/palettes.interface.js';
import {
  CUSTOM_VARIANTS,
  PALETTES,
  PALETTE_NAMES,
  expandCustomPalette,
  isCustomPalette,
} from './palettes.js';
import { STYLES, STYLE_NAMES } from './styles.js';
import { resolveTheme, variantCount } from './theme.js';

const CUSTOM: ICustomPalette = {
  background: '#0B0B10',
  fill: '#243447',
  outline: '#8FD6E8',
};

describe('palettes', () => {
  it('carries a background, fills and outlines for all five schemes', () => {
    expect(PALETTE_NAMES).toEqual(['midnight', 'blossom', 'mint', 'dusk', 'ember']);

    for (const name of PALETTE_NAMES) {
      const palette = PALETTES[name];
      expect(palette.name).toBe(name);
      expect(palette.background).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(palette.fills.length).toBeGreaterThan(0);
      expect(palette.outlines.length).toBeGreaterThan(0);
      for (const colour of [...palette.fills, ...palette.outlines]) {
        expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe('resolveTheme', () => {
  it('paints only what the style asks for', () => {
    const seeThrough = resolveTheme('mint', 'see-through');
    const dot = resolveTheme('mint', 'dot');
    const full = resolveTheme('mint', 'full');

    for (const v of seeThrough.variants) {
      expect(v.fill).toBeNull();
      expect(v.stroke).not.toBeNull();
    }
    for (const v of dot.variants) {
      expect(v.fill).not.toBeNull();
      // null, not a transparent colour: a transparent stroke still costs a
      // full stroke() pass over the path.
      expect(v.stroke).toBeNull();
    }
    for (const v of full.variants) {
      expect(v.fill).not.toBeNull();
      expect(v.stroke).not.toBeNull();
    }
  });

  it('takes every colour from the requested palette', () => {
    const theme = resolveTheme('ember', 'full');
    const palette = PALETTES.ember;

    expect(theme.background).toBe(palette.background);
    for (const v of theme.variants) {
      expect(palette.fills).toContain(v.fill);
      expect(palette.outlines).toContain(v.stroke);
    }
  });

  it('cycles the shorter array so every variant is fully coloured', () => {
    const theme = resolveTheme('midnight', 'full');
    const { fills, outlines } = PALETTES.midnight;

    expect(theme.variants.length).toBe(3);
    expect(theme.variants.map((v) => v.fill)).toEqual([...fills]);
    expect(theme.variants.map((v) => v.stroke)).toEqual([
      outlines[0],
      outlines[1],
      outlines[0],
    ]);
  });

  /**
   * The invariant that makes a style toggle a repaint rather than a respawn:
   * colour-run count depends on the palette alone.
   */
  it('gives one palette the same variant count under every style', () => {
    for (const palette of PALETTE_NAMES) {
      const counts = STYLE_NAMES.map((style) => resolveTheme(palette, style).variants.length);
      expect(new Set(counts).size).toBe(1);
      expect(counts[0]).toBe(variantCount(PALETTES[palette]));
    }
  });

  /**
   * And every palette in the library agrees — stock or custom — so a palette
   * swap is a repaint too. This is the assertion that keeps the respawn branch
   * in ParticleField.configure unreachable; break it and the field jumps.
   */
  it('gives every palette the same variant count, custom included', () => {
    const counts = PALETTE_NAMES.map((name) => variantCount(PALETTES[name]));
    expect(new Set(counts)).toEqual(new Set([3]));
    expect(CUSTOM_VARIANTS).toBe(counts[0]);
    expect(variantCount(expandCustomPalette(CUSTOM))).toBe(counts[0]);
  });

  it('carries the style line width, and none for a style with no outline', () => {
    expect(resolveTheme('dusk', 'see-through').variants[0].lineWidth).toBe(
      STYLES['see-through'].lineWidth,
    );
    expect(resolveTheme('dusk', 'dot').variants[0].stroke).toBeNull();
  });

  it('resolves each combination once and hands back the same object', () => {
    expect(resolveTheme('blossom', 'dot')).toBe(resolveTheme('blossom', 'dot'));
    expect(resolveTheme('blossom', 'dot')).not.toBe(resolveTheme('blossom', 'full'));
  });
});

describe('config validation', () => {
  it('falls back rather than throwing on an unknown palette or style', () => {
    const config = normaliseConfig({
      palette: 'chartreuse' as never,
      style: 'glowy' as never,
    });

    expect(config.palette).toBe('mint');
    expect(config.style).toBe('see-through');
  });

  it('accepts every real palette and style', () => {
    for (const palette of PALETTE_NAMES) {
      expect(normaliseConfig({ palette }).palette).toBe(palette);
    }
    for (const style of STYLE_NAMES) {
      expect(normaliseConfig({ style }).style).toBe(style);
    }
  });
});

describe('presets', () => {
  it('names only real palettes and styles', () => {
    for (const name of PRESET_NAMES) {
      const preset = PRESETS[name];
      const resolved = resolvePreset(name);
      expect(resolved.palette).toBe(preset.palette);
      expect(resolved.style).toBe(preset.style);
    }
  });

  it('lets overrides win over the preset', () => {
    const resolved = resolvePreset('dust', { palette: 'ember' });
    expect(resolved.palette).toBe('ember');
    expect(resolved.size).toBe(PRESETS.dust.size);
  });
});

describe('custom palettes', () => {
  it('accepts three colours, one per role', () => {
    expect(isCustomPalette(CUSTOM)).toBe(true);
  });

  it('demands all three: half a scheme is not a scheme', () => {
    expect(isCustomPalette({ background: '#0B0B10', fill: '#243447' })).toBe(false);
    expect(isCustomPalette({ ...CUSTOM, outline: 'not-a-colour' })).toBe(false);
    expect(isCustomPalette({ ...CUSTOM, background: 42 })).toBe(false);
    expect(isCustomPalette(null)).toBe(false);
    expect(isCustomPalette('mint')).toBe(false);
  });

  it('paints the caller colours under every style', () => {
    const theme = resolveTheme(CUSTOM, 'full');

    expect(theme.palette).toBe('custom');
    expect(theme.background).toBe(CUSTOM.background);
    for (const v of theme.variants) {
      expect(v.fill).toBe(CUSTOM.fill);
      expect(v.stroke).toBe(CUSTOM.outline);
    }

    expect(resolveTheme(CUSTOM, 'dot').variants[0].stroke).toBeNull();
    expect(resolveTheme(CUSTOM, 'see-through').variants[0].fill).toBeNull();
  });

  it('makes as many colour runs as a stock palette, so a swap never respawns', () => {
    for (const style of STYLE_NAMES) {
      expect(resolveTheme(CUSTOM, style).variants.length).toBe(
        resolveTheme('mint', style).variants.length,
      );
    }
  });

  it('resolves fresh rather than growing the stock cache', () => {
    expect(resolveTheme(CUSTOM, 'full')).not.toBe(resolveTheme(CUSTOM, 'full'));
    expect(resolveTheme('mint', 'full')).toBe(resolveTheme('mint', 'full'));
  });
});

describe('custom palette config', () => {
  it('carries a valid custom palette through', () => {
    const config = normaliseConfig({ palette: CUSTOM });
    expect(config.palette).toEqual(CUSTOM);
  });

  it('trims the colours it stores', () => {
    const config = normaliseConfig({ palette: { ...CUSTOM, fill: '  #243447  ' } });
    expect(config.palette).toEqual(CUSTOM);
  });

  it('falls back to the base when any one colour is bad', () => {
    for (const bad of [
      { ...CUSTOM, fill: 'not-a-colour' },
      { ...CUSTOM, background: '' },
      { background: '#0B0B10', fill: '#243447' },
    ]) {
      expect(normaliseConfig({ palette: bad as never }).palette).toBe('mint');
    }
  });

  /**
   * The identity that keeps a colour picker cheap: the engine re-resolves on
   * `config.palette !== previous.palette`, so an unchanged custom palette must
   * come back as the same object however many literals get pushed at it.
   */
  it('hands back the previous object when the colours have not moved', () => {
    const base = normaliseConfig({ palette: CUSTOM });
    const again = normaliseConfig({ palette: { ...CUSTOM } }, base);

    expect(again.palette).toBe(base.palette);
    expect(normaliseConfig({ palette: { ...CUSTOM, fill: '#000000' } }, base).palette).not.toBe(
      base.palette,
    );
  });

  it('lets a stock name replace a custom palette and back again', () => {
    const custom = normaliseConfig({ palette: CUSTOM });
    const named = normaliseConfig({ palette: 'ember' }, custom);
    expect(named.palette).toBe('ember');
    expect(normaliseConfig({ palette: CUSTOM }, named).palette).toEqual(CUSTOM);
  });
});
