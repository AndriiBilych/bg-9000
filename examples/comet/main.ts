import { createBackground, isPaletteName, isRendererKind } from 'bg-9000';
import { Swarm } from './swarm';
import { createTrails } from './trails';

/**
 * Presentation only: no controls. `?renderer=canvas2d` and `?palette=dusk`
 * are honoured for anyone comparing, but nothing on the page sets them.
 */
const params = new URLSearchParams(location.search);
const renderer = params.get('renderer');
const palette = params.get('palette');

const canvas = document.getElementById('sky');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('comets: #sky is missing');

const swarm = new Swarm({ count: 3000, speed: 1 });
const trails = createTrails(0.9);

/**
 * The built-in field is off; the stack is the trail's two layers around the
 * swarm. Style is `see-through` so the palette's outline colours — the bright
 * ones on a dark palette — are what the swarm takes for its dots.
 */
const bg = createBackground(canvas, {
  renderer: isRendererKind(renderer) ? renderer : 'webgl',
  palette: isPaletteName(palette) ? palette : 'midnight',
  style: 'see-through',
  particles: false,
  layers: [trails.below, swarm, trails.above],
});

document.body.style.background = bg.theme.background;
