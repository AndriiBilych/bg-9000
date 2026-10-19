import { defineShape, type IShape } from 'bg-9000';

/**
 * A custom `trace` shape: a plus sign. One path per colour run, same cost as a
 * field of circles. `r` is the circumradius, so the arms reach exactly `r`.
 */
export const plus: IShape = defineShape('plus', {
  trace(path, x, y, r) {
    const t = r * 0.3;
    path.moveTo(x - t, y - r);
    path.lineTo(x + t, y - r);
    path.lineTo(x + t, y - t);
    path.lineTo(x + r, y - t);
    path.lineTo(x + r, y + t);
    path.lineTo(x + t, y + t);
    path.lineTo(x + t, y + r);
    path.lineTo(x - t, y + r);
    path.lineTo(x - t, y + t);
    path.lineTo(x - r, y + t);
    path.lineTo(x - r, y - t);
    path.lineTo(x - t, y - t);
    path.closePath();
  },
});

/**
 * A custom `draw` shape: a face. Two colours and a stroke that is not the
 * outline of the fill cannot come out of one path, so this one paints each
 * particle itself. `fillStyle`/`strokeStyle`/`lineWidth` arrive already set to
 * the particle's variant; the face uses the stroke colour for its features and
 * falls back to the fill when the style has no outline.
 */
export const smiley: IShape = defineShape('smiley', {
  draw(ctx, x, y, r, variant) {
    const ink = variant.stroke ?? variant.fill ?? '#000';

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (variant.fill) ctx.fill();
    if (variant.stroke) ctx.stroke();

    const eye = Math.max(r * 0.12, 0.75);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.25, eye, 0, Math.PI * 2);
    ctx.arc(x + r * 0.35, y - r * 0.25, eye, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(r * 0.1, 0.75);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.1, r * 0.55, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    // Restore the run's fill for the next particle — state is only reset
    // between colour runs, not between particles.
    if (variant.fill) ctx.fillStyle = variant.fill;
  },
});

/**
 * A custom `trace` shape that varies by particle: an arrowhead pointing along
 * the particle's velocity, read from the store. `varies: true` tells the WebGL
 * renderer it cannot trace this once and stamp it — every particle is
 * re-traced each frame, as Canvas2D does anyway. Without the flag every
 * needle would point the way particle 0 happens to be going.
 */
export const needle: IShape = defineShape('needle', {
  varies: true,
  trace(path, x, y, r, i, store) {
    const a = Math.atan2(store.vy[i], store.vx[i]);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    path.moveTo(x + dx * r, y + dy * r);
    path.lineTo(x - dx * r * 0.5 - dy * r * 0.35, y - dy * r * 0.5 + dx * r * 0.35);
    path.lineTo(x - dx * r * 0.5 + dy * r * 0.35, y - dy * r * 0.5 - dx * r * 0.35);
    path.closePath();
  },
});

export const CUSTOM_SHAPES = { plus, smiley, needle } as const;
