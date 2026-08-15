import type { IPointerState } from '../model/engine/scene-context.interface.js';

export function createPointerState(): IPointerState {
  return { x: 0, y: 0, down: false, active: false };
}
