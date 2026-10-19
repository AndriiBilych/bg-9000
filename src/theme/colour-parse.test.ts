import { describe, expect, it } from 'vitest';
import { parseColour } from './colour-parse';

const near = (actual: ReturnType<typeof parseColour>, expected: number[]): void => {
  expect(actual).not.toBeNull();
  for (let i = 0; i < 4; i++) expect(actual![i]).toBeCloseTo(expected[i], 3);
};

describe('parseColour', () => {
  it('reads every hex length', () => {
    near(parseColour('#fff'), [1, 1, 1, 1]);
    near(parseColour('#F00'), [1, 0, 0, 1]);
    near(parseColour('#0f08'), [0, 1, 0, 0x88 / 255]);
    near(parseColour('#0D1B2A'), [13 / 255, 27 / 255, 42 / 255, 1]);
    near(parseColour('#0d1b2a80'), [13 / 255, 27 / 255, 42 / 255, 128 / 255]);
  });

  it('reads rgb() in comma and space syntax, with percentages and alpha', () => {
    near(parseColour('rgb(255, 0, 0)'), [1, 0, 0, 1]);
    near(parseColour('rgba(255, 0, 0, 0.5)'), [1, 0, 0, 0.5]);
    near(parseColour('rgb(100% 50% 0%)'), [1, 0.5, 0, 1]);
    near(parseColour('rgb(255 0 0 / 25%)'), [1, 0, 0, 0.25]);
    near(parseColour('rgb(300, -5, 0)'), [1, 0, 0, 1]);
  });

  it('reads hsl() with every angle unit', () => {
    near(parseColour('hsl(0, 100%, 50%)'), [1, 0, 0, 1]);
    near(parseColour('hsl(120deg 100% 50%)'), [0, 1, 0, 1]);
    near(parseColour('hsl(0.5turn 100% 50% / 0.5)'), [0, 1, 1, 0.5]);
    near(parseColour('hsla(240, 100%, 50%, 1)'), [0, 0, 1, 1]);
    near(parseColour('hsl(0 0% 50%)'), [0.5, 0.5, 0.5, 1]);
  });

  it('knows the named colours and transparent, case-insensitively', () => {
    near(parseColour('rebeccapurple'), [0x66 / 255, 0x33 / 255, 0x99 / 255, 1]);
    near(parseColour('White'), [1, 1, 1, 1]);
    near(parseColour('transparent'), [0, 0, 0, 0]);
    near(parseColour('  black '), [0, 0, 0, 1]);
  });

  it('returns null for what it cannot parse, never throws', () => {
    expect(parseColour('')).toBeNull();
    expect(parseColour('notacolour')).toBeNull();
    expect(parseColour('constructor')).toBeNull();
    expect(parseColour('#ggg')).toBeNull();
    expect(parseColour('rgb(1, 2)')).toBeNull();
    expect(parseColour('rgb(1, 2, 3, 4, 5)')).toBeNull();
    expect(parseColour('oklch(70% 0.1 200)')).toBeNull();
    expect(parseColour(undefined as unknown as string)).toBeNull();
  });

  it('caches by string', () => {
    expect(parseColour('#abc')).toBe(parseColour('#abc'));
  });
});
