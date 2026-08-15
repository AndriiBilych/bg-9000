import type { Surface } from '../engine/surface.js';
import type { ParticleStore } from '../layers/particle-field/store.js';
import type { IDrawGroup, IRenderer } from '../model/render/renderer.interface.js';

const TAU = Math.PI * 2;

export class Canvas2DRenderer implements IRenderer {
  readonly kind = 'canvas2d';

  constructor(private readonly surface: Surface) {}

  beginFrame(background: string | null): void {
    const { ctx, width, height } = this.surface;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }

  /**
   * Each group becomes a single path holding many sub-arcs, so a field of 460
   * circles costs three fill calls rather than 460. `moveTo` before each `arc`
   * is what keeps the sub-paths from being joined by a connecting line.
   */
  drawCircleGroups(store: ParticleStore, groups: readonly IDrawGroup[]): void {
    const ctx = this.surface.ctx;
    const { x, y, radius } = store;

    for (const group of groups) {
      const end = Math.min(group.end, store.count);
      if (end <= group.start) continue;
      if (!group.fill && !group.stroke) continue;

      ctx.beginPath();
      for (let i = group.start; i < end; i++) {
        ctx.moveTo(x[i] + radius[i], y[i]);
        ctx.arc(x[i], y[i], radius[i], 0, TAU);
      }

      if (group.fill) {
        ctx.fillStyle = group.fill;
        ctx.fill();
      }
      if (group.stroke) {
        ctx.lineWidth = group.lineWidth;
        ctx.strokeStyle = group.stroke;
        ctx.stroke();
      }
    }
  }

  endFrame(): void {
    // Nothing to flush for Canvas2D; a WebGL backend would submit here.
  }

  dispose(): void {
    // The surface owns the context and canvas; nothing else to release.
  }
}
