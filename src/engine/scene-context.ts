import { DEFAULT_CONFIG } from '../config/config';
import type { IPointerState, ISceneContext } from '../model/engine/scene-context.interface';
import { resolveTheme } from '../theme/theme';
import { createRng } from '../util/rng';

export function createPointerState(): IPointerState {
  return { x: 0, y: 0, down: false, active: false };
}

/** Put a pointer state back to how it reads when nothing is tracking it. */
export function resetPointerState(pointer: IPointerState): void {
  pointer.x = 0;
  pointer.y = 0;
  pointer.down = false;
  pointer.active = false;
}

/**
 * A scene context with every field filled in, for tests of a layer, force or
 * constraint. A hand-written literal is a compile error the next time a field
 * is added.
 */
export function createSceneContext(patch: Partial<ISceneContext> = {}): ISceneContext {
  const config = patch.config ?? DEFAULT_CONFIG;
  return {
    width: 1280,
    height: 720,
    dpr: 1,
    time: 0,
    dt: 0,
    frame: 0,
    pointer: createPointerState(),
    rng: createRng(config.seed),
    theme: resolveTheme(config.palette, config.style),
    config,
    ...patch,
  };
}
