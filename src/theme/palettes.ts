/**
 * The colour schemes.
 *
 * A palette is three things travelling together — the canvas background, the
 * circle fills, and the circle outlines — because they are only ever correct
 * relative to one another. Letting a caller mix a background from one scheme
 * with outlines from another is the fastest route to something illegible, so
 * the unit of choice is the whole palette.
 */
import type { IPalette } from '../model/theme/palettes.interface.js';

export type PaletteName = 'midnight' | 'blossom' | 'mint' | 'dusk' | 'ember';

export const PALETTES: Readonly<Record<PaletteName, IPalette>> = {
  midnight: {
    name: 'midnight',
    background: '#0D1B2A',
    fills: ['#1B3A5C', '#255D78', '#2E7D8F'],
    outlines: ['#7DD3D8', '#A0E7E5'],
  },
  blossom: {
    name: 'blossom',
    background: '#FDF2F4',
    fills: ['#F9C8D0', '#F7B2C4', '#EFD3E0'],
    outlines: ['#E08FA8', '#D1789A'],
  },
  mint: {
    name: 'mint',
    background: '#F2FAF6',
    fills: ['#C7ECD9', '#A8E0C8', '#D9F2E6'],
    outlines: ['#5FB894', '#7FC9AA'],
  },
  dusk: {
    name: 'dusk',
    background: '#151226',
    fills: ['#2E2450', '#413066', '#57407F'],
    outlines: ['#B9A5F0', '#D3C4FF'],
  },
  ember: {
    name: 'ember',
    background: '#1A1114',
    fills: ['#4A2328', '#6B3239', '#8C4249'],
    outlines: ['#F2A68F', '#FFC9A8'],
  },
};

export const PALETTE_NAMES: readonly PaletteName[] = Object.keys(PALETTES) as PaletteName[];

/** Chosen to sit on the portfolio site's light page. */
export const DEFAULT_PALETTE: PaletteName = 'mint';

export function isPaletteName(value: unknown): value is PaletteName {
  return typeof value === 'string' && Object.hasOwn(PALETTES, value);
}
