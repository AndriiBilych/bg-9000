import { describe, expect, it } from 'vitest';
import { isColour } from './colour.js';

describe('isColour', () => {
  it('accepts hex at every length', () => {
    for (const hex of ['#abc', '#abcd', '#0D1B2A', '#0d1b2aff']) {
      expect(isColour(hex)).toBe(true);
    }
  });

  it('accepts the colour functions in comma and space syntax', () => {
    for (const colour of [
      'rgb(13, 27, 42)',
      'rgb(13 27 42)',
      'rgba(13, 27, 42, 0.5)',
      'rgb(13 27 42 / 50%)',
      'hsl(210, 53%, 11%)',
      'hsl(210deg 53% 11%)',
      'hsla(210, 53%, 11%, 0.5)',
    ]) {
      expect(isColour(colour)).toBe(true);
    }
  });

  it('accepts a keyword', () => {
    for (const keyword of ['red', 'rebeccapurple', 'transparent', 'currentColor']) {
      expect(isColour(keyword)).toBe(true);
    }
  });

  it('ignores surrounding whitespace', () => {
    expect(isColour('  #0D1B2A  ')).toBe(true);
  });

  it('rejects anything that is not a colour-shaped string', () => {
    for (const junk of [
      '',
      '   ',
      '#ab',
      '#abcde',
      '#gggggg',
      'not-a-colour',
      'rgb()',
      'rgb(1, 2, 3',
      0x0d1b2a,
      null,
      undefined,
      { background: '#fff' },
      ['#fff'],
    ]) {
      expect(isColour(junk)).toBe(false);
    }
  });

  /**
   * Documented, not accidental: rejecting this would mean shipping the CSS
   * named-colour list, and the canvas ignores an unrecognised fillStyle anyway.
   */
  it('lets a well-formed but meaningless keyword through', () => {
    expect(isColour('notacolour')).toBe(true);
  });
});
