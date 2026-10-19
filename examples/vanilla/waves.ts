import { defineLayer, type ILayer } from 'bg-9000';

/**
 * A custom layer: a few sine waves under the field, in the palette's colours.
 *
 * Everything it needs comes from the scene. `amount` becomes how many waves,
 * `speed` how fast they travel, `theme` what colour they are — so it follows
 * the rest of the playground around without a single control of its own. The
 * pointer bulges the waves where it hovers, which is the whole of the
 * interactivity API: read `scene.pointer`.
 */
const WAVES_BY_AMOUNT = { low: 2, moderate: 4, alot: 7 } as const;

export const waves: ILayer = defineLayer('waves', {
  placement: 'below',

  render(ctx, scene) {
    const { width, height, time, theme, pointer, config } = scene;
    const count = WAVES_BY_AMOUNT[config.amount];
    const phase = time * config.speed;

    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.55;

    for (let w = 0; w < count; w++) {
      const variant = theme.variants[w % theme.variants.length];
      ctx.strokeStyle = variant.stroke ?? variant.fill ?? '#fff';

      const baseline = (height * (w + 1)) / (count + 1);
      const wavelength = 180 + w * 40;
      const amplitude = 12 + w * 3;

      ctx.beginPath();
      for (let x = 0; x <= width; x += 4) {
        let y = baseline + Math.sin(x / wavelength + phase * 0.8 + w) * amplitude;
        if (pointer.active) {
          // A soft bulge toward the pointer, falling off over ~160 px.
          const dx = x - pointer.x;
          const pull = Math.exp(-(dx * dx) / (2 * 160 * 160));
          y += (pointer.y - baseline) * pull * (pointer.down ? 0.6 : 0.3);
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },
});
