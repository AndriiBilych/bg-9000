import { defineLayer, parseColour, type IGLTexture, type ILayer } from 'bg-9000';

/**
 * Persistence trails: last frame, faded, under this one.
 *
 * Two layers share one piece of state. `below` sits under the swarm and draws
 * the previous frame back, pulled toward the background by `fade`; `above`
 * sits over the swarm and copies the finished frame out for next time. The
 * engine paints the background between frames, so without `below` every
 * frame would start clean — with it, a moving particle leaves the last few
 * dozen positions of itself behind, each a little dimmer. That is the comet.
 *
 * On WebGL the copy is `frame.copy` into a `frame.texture()` and the fade is
 * a small fragment shader. On Canvas2D the same two steps are `drawImage`
 * into an offscreen canvas and back with `globalAlpha`. Both hooks live on
 * each layer, so the page's renderer select compares like for like.
 */
export interface ITrails {
  readonly below: ILayer;
  readonly above: ILayer;
  /** Fraction of the previous frame kept. 0 is no trail; 0.97 is a long one. */
  fade: number;
}

/**
 * Fading in 8 bits has a trap: once the difference between a pixel and the
 * background is small, `diff × fade` rounds back to `diff` and the ghost
 * never leaves. So besides fading, the shader walks every channel one step
 * toward the background each frame, which guarantees the ghost reaches it.
 */
const FADE_FRAGMENT = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_frame;
uniform vec3 u_background;
uniform float u_fade;
out vec4 o_colour;
void main() {
  vec3 d = (texture(u_frame, v_uv).rgb - u_background) * u_fade;
  d -= sign(d) * min(abs(d), 1.0 / 255.0);
  o_colour = vec4(u_background + d, 1.0);
}
`;

export function createTrails(fade = 0.9): ITrails {
  // --- GL state ---
  let texture: IGLTexture | null = null;
  /** Size and generation the texture held a frame at; anything else is blank. */
  let held: { width: number; height: number; generation: number } | null = null;

  // --- 2D state ---
  let offscreen: HTMLCanvasElement | null = null;
  let offscreenCtx: CanvasRenderingContext2D | null = null;
  let heldSize: { width: number; height: number } | null = null;

  const trails: ITrails = {
    fade,

    below: defineLayer('trails-below', {
      placement: 'below',

      renderGL(gl, scene, frame) {
        if (!texture || !held) return;
        if (held.width !== frame.pixelWidth || held.height !== frame.pixelHeight) return;
        if (held.generation !== frame.generation) return;

        const program = frame.program(FADE_FRAGMENT);
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture.texture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_frame'), 0);
        const [r, g, b] = parseColour(scene.theme.background) ?? [0, 0, 0, 1];
        gl.uniform3f(gl.getUniformLocation(program, 'u_background'), r, g, b);
        gl.uniform1f(gl.getUniformLocation(program, 'u_fade'), trails.fade);
        frame.quad();
      },

      render(ctx, scene) {
        if (!offscreen || !heldSize) return;
        if (heldSize.width !== ctx.canvas.width || heldSize.height !== ctx.canvas.height) return;
        ctx.globalAlpha = trails.fade;
        ctx.drawImage(offscreen, 0, 0, scene.width, scene.height);
      },
    }),

    above: defineLayer('trails-above', {
      placement: 'above',

      renderGL(_gl, _scene, frame) {
        texture ??= frame.texture();
        frame.copy(texture);
        held = { width: texture.width, height: texture.height, generation: frame.generation };
      },

      render(ctx) {
        const { width, height } = ctx.canvas;
        if (!offscreen) {
          offscreen = document.createElement('canvas');
          offscreenCtx = offscreen.getContext('2d');
        }
        if (!offscreenCtx) return;
        if (offscreen.width !== width || offscreen.height !== height) {
          offscreen.width = width;
          offscreen.height = height;
        }
        // Device pixels to device pixels: no transform on either side.
        offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
        offscreenCtx.clearRect(0, 0, width, height);
        offscreenCtx.drawImage(ctx.canvas, 0, 0);
        heldSize = { width, height };
      },

      dispose() {
        texture?.dispose();
        texture = null;
        held = null;
        offscreen = null;
        offscreenCtx = null;
        heldSize = null;
      },
    }),
  };

  return trails;
}
