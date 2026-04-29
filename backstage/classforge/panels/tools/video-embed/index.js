// tools/video-embed/index.js
//
// Phase 3AA. video-embed: drops an HTML5 <video> tag full-bleed. Plays
// muted+autoplay+loop+playsinline by default so the panel reads as a
// passive demo the teacher can leave running. config.src points to the
// file (relative to the panel HTML, or absolute). config.controls toggles
// the native UI (off by default for projector mode).

import { registerTool } from '../../engine/registry.js';

let mounted = null;

registerTool({
  id: 'video-embed',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const src = (typeof cfg.src === 'string' && cfg.src) ? cfg.src : '';
    const controls = !!cfg.controls;

    const root = document.createElement('div');
    root.className = 'video-embed-root';

    const video = document.createElement('video');
    video.className = 'video-embed-video';
    video.setAttribute('src', src);
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.setAttribute('playsinline', '');
    if (controls) video.setAttribute('controls', '');

    root.appendChild(video);
    container.appendChild(root);
    mounted = { root, video };
  },
  unmount() {
    if (!mounted) return;
    try { mounted.video.pause(); } catch (_) { /* ignore */ }
    if (typeof mounted.root.remove === 'function') mounted.root.remove();
    mounted = null;
  },
});
