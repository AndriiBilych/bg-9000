/**
 * A renderer-owned texture the size of the drawing buffer.
 *
 * The handle is stable; the `WebGLTexture` behind it is not. It is reallocated
 * (and its contents dropped) when the canvas is resized or the context is
 * restored after a loss, so read `texture` every frame rather than caching it.
 */
export interface IGLTexture {
  readonly texture: WebGLTexture;
  /** Device pixels. */
  readonly width: number;
  readonly height: number;
  /** Release it. Safe to call twice. */
  dispose(): void;
}

/**
 * Everything a GL layer gets besides the raw context.
 *
 * Handed to `drawImmediateGL` callbacks and `renderGL` hooks. The helpers
 * exist so that a layer that wants a full-screen shader, or a copy of the
 * frame drawn so far, does not have to own programs, quads and textures
 * itself — every resource made here is cached, rebuilt after a context loss,
 * and released with the renderer.
 *
 * One instance exists per renderer and it is mutated in place each frame;
 * treat it as read-only.
 */
export interface IGLFrame {
  /** Canvas size in CSS pixels, matching `ISceneContext.width/height`. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /** Drawing-buffer size in device pixels. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /**
   * Column-major `mat3` taking CSS pixels (y down, like the 2D context) to
   * clip space, so a GL layer can draw in the same coordinates as a 2D one.
   */
  readonly projection: Float32Array;
  /**
   * Increments every time the context is restored after a loss. A layer that
   * owns GL resources of its own compares it with what it saw last frame and
   * rebuilds when it moved. Resources made through this frame rebuild
   * themselves.
   */
  readonly generation: number;

  /**
   * Compile and link a program, cached by source. The default vertex shader
   * draws a full-screen quad (pair with `quad()`) and exposes `v_uv` in
   * `[0, 1]` with the origin bottom-left, GL's convention and the orientation
   * of every texture from `texture()`/`copy()`. Throws on a compile error —
   * a broken shader is a programming error, not a typo in a colour name.
   */
  program(fragment: string, vertex?: string): WebGLProgram;

  /**
   * Draw a full-screen quad with the current program. Expects attribute 0 to
   * be `a_position` in clip space, which the default vertex shader declares.
   */
  quad(): void;

  /** A texture the size of the drawing buffer, kept that size for you. */
  texture(): IGLTexture;

  /** Copy everything drawn so far this frame into `target`. */
  copy(target: IGLTexture): void;

  /**
   * Draw `source` over the whole canvas, scaled by `alpha`, with premultiplied
   * blending. Covers the one thing a post-effect always needs.
   */
  blit(source: IGLTexture, alpha?: number): void;
}
