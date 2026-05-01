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
//              cache-busting the src
//   - Pause/Play: GIFs have no JS playback API. Pause draws the current
//                 frame onto a canvas overlay (that's actually paused)
//                 and hides the img; Play reloads the img to restart the
//                 animation. Pause-and-resume is therefore approximate:
//                 unpausing always restarts from frame 1.
//   - Loop is omitted (GIFs always loop natively; nothing to toggle).

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=1.2';
import { ICON_RESTART, ICON_PLAY, ICON_PAUSE } from '../../engine/pill-icons.js';

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

    let pausedCanvas = null;

    function isPaused() { return pausedCanvas !== null; }

    function pause() {
      if (pausedCanvas || !img.complete || !img.naturalWidth) return;
      const c = document.createElement('canvas');
      c.className = 'gif-embed-img gif-embed-img--paused';
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      try {
        c.getContext('2d').drawImage(img, 0, 0);
      } catch (_) {
        // Cross-origin or tainted canvas; bail out silently.
        return;
      }
      img.style.display = 'none';
      root.appendChild(c);
      pausedCanvas = c;
    }

    function play() {
      if (!pausedCanvas) return;
      pausedCanvas.remove();
      pausedCanvas = null;
      img.style.display = '';
      // Force reload to restart animation from frame 1 (Chrome/Firefox
      // sometimes resume mid-loop otherwise).
      const base = src.split('?')[0];
      img.src = base + '?t=' + Date.now();
    }

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    pillHandle = attachPanelPills(container, {
      pills: [{
        kind: 'actions',
        buttons: [
          {
            icon: ICON_RESTART,
            ariaLabel: 'Reiniciar',
            onClick: () => {
              if (pausedCanvas) { pausedCanvas.remove(); pausedCanvas = null; img.style.display = ''; }
              const base = src.split('?')[0];
              img.src = base + '?t=' + Date.now();
            },
          },
          {
            icon: ICON_PLAY,
            iconActive: ICON_PAUSE,
            ariaLabel: 'Tocar',
            ariaLabelActive: 'Pausar',
            isActive: () => !isPaused(),
            onClick: () => { if (isPaused()) play(); else pause(); },
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
