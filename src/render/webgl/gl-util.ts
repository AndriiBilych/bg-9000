/**
 * The few GL chores every program needs, with errors that name the shader.
 * A shader that fails to compile is a programming error, so these throw.
 */

function compile(gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`bg-9000: could not create a ${label} shader.`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`bg-9000: ${label} shader failed to compile:\n${log}`);
  }
  return shader;
}

/**
 * Compile and link. Attribute bindings are applied before linking so a
 * program written without `layout(location = …)` still lands where the
 * renderer expects it.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  bindings: Readonly<Record<string, number>> = {},
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex, 'vertex');
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment, 'fragment');
  const program = gl.createProgram();
  if (!program) throw new Error('bg-9000: could not create a GL program.');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  for (const [name, location] of Object.entries(bindings)) gl.bindAttribLocation(program, location, name);
  gl.linkProgram(program);
  // Shaders are only needed until link; the program keeps what it needs.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`bg-9000: GL program failed to link:\n${log}`);
  }
  return program;
}

export function createBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('bg-9000: could not create a GL buffer.');
  return buffer;
}

/** Upload static vertex data into a fresh buffer. */
export function staticBuffer(gl: WebGL2RenderingContext, data: Float32Array): WebGLBuffer {
  const buffer = createBuffer(gl);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

/** An empty RGBA texture of the given size, linear, clamped. */
export function createTexture(gl: WebGL2RenderingContext, width: number, height: number): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('bg-9000: could not create a GL texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return texture;
}
