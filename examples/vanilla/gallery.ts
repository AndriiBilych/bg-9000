import { PALETTE_NAMES, STYLE_NAMES, createBackground, type IBackground } from 'bg-9000';

const sheet = document.getElementById('sheet');
if (!sheet) throw new Error('gallery: #sheet is missing');

const instances: IBackground[] = [];

for (const palette of PALETTE_NAMES) {
  for (const style of STYLE_NAMES) {
    const tile = document.createElement('figure');
    tile.className = 'tile';

    const canvas = document.createElement('canvas');
    const caption = document.createElement('figcaption');
    caption.textContent = `${palette} · ${style}`;

    tile.append(canvas, caption);
    sheet.append(tile);

    // Amount is a density, so a thumbnail this size resolves to roughly a dozen
    // circles at `alot` — which is what makes the tiles readable rather than a
    // scaled-down blur of a full field.
    instances.push(
      createBackground(canvas, {
        palette,
        style,
        amount: 'alot',
        size: 'medium',
        speed: 0.7,
        seed: 1234,
      }),
    );
  }
}

// Fifteen loops is fifteen rAF callbacks; releasing them on navigation keeps a
// back-forward-cache restore from resuming a page nobody is looking at.
window.addEventListener('pagehide', () => {
  for (const bg of instances) bg.dispose();
});
