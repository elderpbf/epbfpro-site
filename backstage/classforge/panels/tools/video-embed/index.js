// tools/video-embed/index.js
//
// Phase 3AA. video-embed: drops an HTML5 <video> tag full-bleed. Plays
// muted+autoplay+loop+playsinline by default so the panel reads as a
// passive demo the teacher can leave running. config.src points to the
// file (relative to the panel HTML, or absolute). config.controls toggles
// the native UI (off by default for projector mode).
//
// Bottom-edge action pill (engine/panel-pills.js, kind: 'actions') with:
//   - Restart: rewinds to 0 and plays
//   - Play/Pause: toggles play state; icon swaps to reflect current state
//   - Loop: toggles video.loop; lights up when active

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=1.6';
import { ICON_RESTART, ICON_PLAY, ICON_PAUSE, ICON_LOOP } from '../../engine/pill-icons.js';

let mounted = null;
let pillHandle = null;

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

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    pillHandle = attachPanelPills(container, {
      pills: [{
        kind: 'actions',
        buttons: [
          {
            icon: ICON_RESTART,
            ariaLabel: 'Reiniciar',
            onClick: () => { video.currentTime = 0; video.play().catch(() => {}); },
          },
          {
            icon: ICON_PLAY,
            iconActive: ICON_PAUSE,
            ariaLabel: 'Tocar',
            ariaLabelActive: 'Pausar',
            isActive: () => !video.paused,
            onClick: () => {
              if (video.paused) video.play().catch(() => {});
              else video.pause();
            },
          },
          {
            icon: ICON_LOOP,
            ariaLabel: 'Loop',
            isActive: () => video.loop,
            onClick: () => { video.loop = !video.loop; },
          },
        ],
      }],
    });

    // Refresh toggle states when the video changes state on its own
    // (e.g. natural pause at end when loop is off).
    const onState = () => { if (pillHandle) pillHandle.refresh(0); };
    video.addEventListener('play', onState);
    video.addEventListener('pause', onState);
    video.addEventListener('ended', onState);
    mounted.onState = onState;
  },
  unmount() {
    if (pillHandle) { pillHandle.destroy(); pillHandle = null; }
    if (!mounted) return;
    if (mounted.onState) {
      mounted.video.removeEventListener('play', mounted.onState);
      mounted.video.removeEventListener('pause', mounted.onState);
      mounted.video.removeEventListener('ended', mounted.onState);
    }
    try { mounted.video.pause(); } catch (_) { /* ignore */ }
    if (typeof mounted.root.remove === 'function') mounted.root.remove();
    mounted = null;
  },
});
