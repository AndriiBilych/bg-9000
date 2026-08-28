/**
 * Is this string something the canvas will accept as a colour?
 *
 * Deliberately permissive. The library's rule is that a background never takes
 * a page down over a typo, so this is a filter that catches obvious rubbish —
 * numbers, empty strings, objects — and lets anything colour-shaped through.
 * Being exact would mean shipping the CSS named-colour list to reject
 * `notacolour`, which costs more than the failure is worth: an unrecognised
 * `fillStyle` is silently ignored by the canvas, so the circles paint in the
 * previous colour rather than breaking.
 */

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The argument list is not parsed: comma and space syntax, percentages, `deg`
// units and a slash-separated alpha are all legal, and enumerating them adds
// no safety a wrong-but-well-formed colour would not slip past anyway.
const FUNCTIONAL = /^(?:rgb|rgba|hsl|hsla)\(\s*[^()]+\)$/i;

/** `red`, `rebeccapurple`, `transparent`, `currentColor`. */
const KEYWORD = /^[a-z]+$/i;

export function isColour(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const colour = value.trim();
  if (colour === '') return false;
  return HEX.test(colour) || FUNCTIONAL.test(colour) || KEYWORD.test(colour);
}
