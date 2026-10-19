/**
 * The shaders. Every source starts with `#version 300 es` on its first byte —
 * WebGL2 rejects a leading newline — which is why the template literals open
 * without one.
 */

/** Attribute locations the shape program is linked with. */
export const ATTR_POSITION = 0;
export const ATTR_NORMAL = 1;
export const ATTR_CENTRE_X = 2;
export const ATTR_CENTRE_Y = 3;
export const ATTR_RADIUS = 4;

/**
 * One vertex shader for fills, strokes and cover quads. A vertex is a unit-
 * space position plus a normal; the position is scaled by the instance's
 * radius and the normal by half the line width, so one mesh serves every
 * particle and outlines keep a constant pixel width.
 */
export const SHAPE_VERTEX = `#version 300 es
precision highp float;
layout(location = ${ATTR_POSITION}) in vec2 a_pos;
layout(location = ${ATTR_NORMAL}) in vec2 a_norm;
layout(location = ${ATTR_CENTRE_X}) in float a_cx;
layout(location = ${ATTR_CENTRE_Y}) in float a_cy;
layout(location = ${ATTR_RADIUS}) in float a_r;
uniform mat3 u_proj;
uniform float u_halfWidth;
void main() {
  vec2 p = vec2(a_cx, a_cy) + a_pos * a_r + a_norm * u_halfWidth;
  gl_Position = vec4((u_proj * vec3(p, 1.0)).xy, 0.0, 1.0);
}
`;

/** Flat colour, premultiplied on the CPU. */
export const SHAPE_FRAGMENT = `#version 300 es
precision mediump float;
uniform vec4 u_colour;
out vec4 o_colour;
void main() {
  o_colour = u_colour;
}
`;

/**
 * The default vertex shader for GL layers and the blit: a full-screen quad
 * with `v_uv` in [0, 1], origin bottom-left.
 */
export const QUAD_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/** Draw a (premultiplied) texture over the quad, scaled by `u_alpha`. */
export const BLIT_FRAGMENT = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_alpha;
out vec4 o_colour;
void main() {
  o_colour = texture(u_texture, v_uv) * u_alpha;
}
`;
