// tools/gif-embed/index.js
//
// Phase 3AA. gif-embed: drops an <img> with an animated GIF, full-bleed.
// Tests sizing, scaling artefacts, and load weight. GIFs above ~20MB are
// noticeably slow to first-paint even on broadband; if that finding holds
// at staging, production "GIF-like" panels should use video-embed with an
// MP4 instead (autoplay+loop+muted reads the same to the audience but
// loads in a fraction of the bytes).

import { registerTool } from '../../engine/registry.js';

let mounted = null;

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
    mounted = root;
  },
  unmount() {
    if (!mounted) return;
    if (typeof mounted.remove === 'function') mounted.remove();
    mounted = null;
  },
});
