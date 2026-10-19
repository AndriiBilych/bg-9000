/**
 * CSS colour → numbers, for a renderer that cannot hand a string to the GPU.
 *
 * Canvas2D parses colours for free; WebGL wants four floats. This is a pure
 * parser — no DOM, same answer in a test as in a browser — covering what a
 * palette, a colour picker or a hand-typed hex produces: `#rgb[a]`,
 * `#rrggbb[aa]`, `rgb[a]()` and `hsl[a]()` in both the comma and the
 * space-and-slash syntax, `transparent`, and the CSS named colours. What it
 * does not know (`oklch()`, `color-mix()`, system colours) comes back `null`;
 * the WebGL renderer reports that once and skips the paint, which is the same
 * outcome as Canvas2D ignoring a `fillStyle` it cannot parse.
 *
 * Results are straight (not premultiplied) RGBA in `[0, 1]`.
 */

export type RGBA = readonly [r: number, g: number, b: number, a: number];

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(rgba?|hsla?)\(\s*([^()]+?)\s*\)$/i;

// Packed as 0xRRGGBB; the name list is the CSS Color 4 set.
const NAMED: Readonly<Record<string, number>> = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4,
  azure: 0xf0ffff, beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000,
  blanchedalmond: 0xffebcd, blue: 0x0000ff, blueviolet: 0x8a2be2, brown: 0xa52a2a,
  burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00, chocolate: 0xd2691e,
  coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c,
  cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9, darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f, darkorange: 0xff8c00, darkorchid: 0x9932cc,
  darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f, darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f, darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1, darkviolet: 0x9400d3,
  deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969,
  dodgerblue: 0x1e90ff, firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22,
  fuchsia: 0xff00ff, gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff, gold: 0xffd700,
  goldenrod: 0xdaa520, gray: 0x808080, green: 0x008000, greenyellow: 0xadff2f,
  grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4, indianred: 0xcd5c5c,
  indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6,
  lightcoral: 0xf08080, lightcyan: 0xe0ffff, lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90, lightgrey: 0xd3d3d3, lightpink: 0xffb6c1, lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa, lightslategray: 0x778899, lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0, lime: 0x00ff00, limegreen: 0x32cd32,
  linen: 0xfaf0e6, magenta: 0xff00ff, maroon: 0x800000, mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd, mediumorchid: 0xba55d3, mediumpurple: 0x9370db, mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc, mediumvioletred: 0xc71585,
  midnightblue: 0x191970, mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5,
  navajowhite: 0xffdead, navy: 0x000080, oldlace: 0xfdf5e6, olive: 0x808000,
  olivedrab: 0x6b8e23, orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa, palegreen: 0x98fb98, paleturquoise: 0xafeeee, palevioletred: 0xdb7093,
  papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f, pink: 0xffc0cb,
  plum: 0xdda0dd, powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399,
  red: 0xff0000, rosybrown: 0xbc8f8f, royalblue: 0x4169e1, saddlebrown: 0x8b4513,
  salmon: 0xfa8072, sandybrown: 0xf4a460, seagreen: 0x2e8b57, seashell: 0xfff5ee,
  sienna: 0xa0522d, silver: 0xc0c0c0, skyblue: 0x87ceeb, slateblue: 0x6a5acd,
  slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa, springgreen: 0x00ff7f,
  steelblue: 0x4682b4, tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8,
  tomato: 0xff6347, turquoise: 0x40e0d0, violet: 0xee82ee, wheat: 0xf5deb3,
  white: 0xffffff, whitesmoke: 0xf5f5f5, yellow: 0xffff00, yellowgreen: 0x9acd32,
};

const cache = new Map<string, RGBA | null>();

/** Parse a CSS colour. `null` for anything this parser does not understand. */
export function parseColour(value: string): RGBA | null {
  const hit = cache.get(value);
  if (hit !== undefined) return hit;
  const parsed = parse(value);
  cache.set(value, parsed);
  return parsed;
}

function parse(value: string): RGBA | null {
  if (typeof value !== 'string') return null;
  const colour = value.trim().toLowerCase();
  if (colour === '') return null;

  if (colour === 'transparent') return [0, 0, 0, 0];

  const hex = HEX.exec(colour);
  if (hex) return fromHex(hex[1]);

  const fn = FUNCTIONAL.exec(colour);
  if (fn) {
    const args = splitArgs(fn[2]);
    if (!args) return null;
    return fn[1].startsWith('rgb') ? fromRgb(args) : fromHsl(args);
  }

  if (Object.hasOwn(NAMED, colour)) {
    const named = NAMED[colour];
    return [((named >> 16) & 0xff) / 255, ((named >> 8) & 0xff) / 255, (named & 0xff) / 255, 1];
  }

  return null;
}

function fromHex(digits: string): RGBA {
  // Short forms double each digit: #abc is #aabbcc.
  const full =
    digits.length <= 4
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  const packed = parseInt(full, 16);
  if (full.length === 8) {
    return [
      ((packed >>> 24) & 0xff) / 255,
      ((packed >>> 16) & 0xff) / 255,
      ((packed >>> 8) & 0xff) / 255,
      (packed & 0xff) / 255,
    ];
  }
  return [((packed >> 16) & 0xff) / 255, ((packed >> 8) & 0xff) / 255, (packed & 0xff) / 255, 1];
}

/**
 * Split `a, b, c[, alpha]` or `a b c[ / alpha]` into three or four tokens.
 * Anything else — two values, five, a trailing comma — is rejected.
 */
function splitArgs(body: string): string[] | null {
  const tokens = body.includes(',')
    ? body.split(',').map((t) => t.trim())
    : body
        .replace('/', ' ')
        .split(/\s+/)
        .filter((t) => t.length > 0);
  if (tokens.length !== 3 && tokens.length !== 4) return null;
  if (tokens.some((t) => t === '')) return null;
  return tokens;
}

/** A channel as a number or a percentage of `scale`; `null` if malformed. */
function channel(token: string, scale: number): number | null {
  if (token === 'none') return 0;
  if (token.endsWith('%')) {
    const pct = Number(token.slice(0, -1));
    return Number.isFinite(pct) ? (pct / 100) * scale : null;
  }
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

function alpha(token: string | undefined): number | null {
  if (token === undefined) return 1;
  const value = channel(token, 1);
  return value === null ? null : clamp01(value);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function fromRgb(args: string[]): RGBA | null {
  const r = channel(args[0], 255);
  const g = channel(args[1], 255);
  const b = channel(args[2], 255);
  const a = alpha(args[3]);
  if (r === null || g === null || b === null || a === null) return null;
  return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255), a];
}

/** Degrees from a hue token, which may carry `deg`, `rad`, `grad` or `turn`. */
function hue(token: string): number | null {
  if (token === 'none') return 0;
  const match = /^(-?[\d.]+(?:e[-+]?\d+)?)(deg|rad|grad|turn)?$/.exec(token);
  if (!match) return null;
  const [, magnitude, unit] = match;
  const value = Number(magnitude);
  if (!Number.isFinite(value)) return null;
  switch (unit) {
    case 'rad':
      return (value * 180) / Math.PI;
    case 'grad':
      return value * 0.9;
    case 'turn':
      return value * 360;
    default:
      return value;
  }
}

function fromHsl(args: string[]): RGBA | null {
  const h = hue(args[0]);
  const s = channel(args[1], 1);
  const l = channel(args[2], 1);
  const a = alpha(args[3]);
  if (h === null || s === null || l === null || a === null) return null;

  // The CSS Color 4 reference algorithm, which evaluates each channel at a
  // fixed offset around the hue circle: red at 0, green at 8, blue at 4.
  const saturation = clamp01(s);
  const lightness = clamp01(l);
  const hueTurns = (((h % 360) + 360) % 360) / 30; // 0–12, one per 30°
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channelAt = (offset: number): number => {
    const k = (offset + hueTurns) % 12;
    return lightness - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channelAt(0), channelAt(8), channelAt(4), a];
}
