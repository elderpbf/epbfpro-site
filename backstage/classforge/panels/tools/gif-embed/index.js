// tools/gif-embed/index.js
//
// Phase 3AA. gif-embed: drops an <img> with an animated GIF, full-bleed.
// Tests sizing, scaling artefacts, and load weight. GIFs above ~20MB are
// noticeably slow to first-paint even on broadband; if that finding holds
// at staging, production "GIF-like" panels should use video-embed with an
// MP4 instead (autoplay+loop+muted reads the same to the audience but
// loads in a fraction of the bytes).
//
// Bottom-edge action pill (engine/panel-pills.js, kind: 'actions'):
//   - Restart: forces the browser to reload the GIF from frame 1 by
//              cache-busting the src.
//   - Loop toggle: omitted -- GIFs always loop natively; nothing to toggle.
//
// Note: pause was removed. The canvas drawImage approach silently fails for
// cross-origin GIFs (tainted canvas), so pause never actually worked. The
// 2-button design (restart only) is correct for cross-origin GIF sources.

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=1.6';
import { ICON_RESTART } from '../../engine/pill-icons.js';

let mounted = null;
let pillHandle = null;

registerTool({
  id: 'gif-embed',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const src = (typeof cfg.src === 'string' && cfg.src) ? cfg.src : '';
    const alt = (typeof cfg.alt === 'string' && cfg.alt) ? cfg.alt : '';

    const root = document.createElement('div');
    root.className = 'gif-embed-root';

    const img = document.createElement('img');
    img.className = 'gif-embed-img';
    img.setAttribute('src', src);
    img.setAttribute('alt', alt);

    root.appendChild(img);
    container.appendChild(root);
    mounted = { root, img };

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    pillHandle = attachPanelPills(container, {
      pills: [{
        kind: 'actions',
        buttons: [
          {
            icon: ICON_RESTART,
            ariaLabel: 'Reiniciar',
            onClick: () => {
              const base = src.split('?')[0];
              img.src = base + '?t=' + Date.now();
            },
          },
        ],
      }],
    });
  },
  unmount() {
    if (pillHandle) { pillHandle.destroy(); pillHandle = null; }
    if (!mounted) return;
    if (typeof mounted.root.remove === 'function') mounted.root.remove();
    mounted = null;
  },
});
