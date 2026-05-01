// tools/slides-embed/index.js
//
// Phase 3AA. slides-embed: drops a full-bleed iframe pointing at a Google
// Slides URL (publish-to-web /d/e/<id>/embed or shared edit /d/<id>/embed).
//
// Optional slide picker pill: if config.slideIds is provided (array of
// objectIds like ['id.gabc123', ...] -- WITH the 'id.' prefix used by the
// Slides URL ?slide= param), a hidden bottom pill auto-reveals on hover
// and lets the presenter jump to slide N. Without slideIds the panel
// renders a plain iframe (no pill chrome).
//
// The pill is provided by engine/panel-pills.js: a 'stepper' kind with
// arrows ('←'/'→'), an editable label ("Slide N de M") that accepts
// type+Enter, and the same auto-hide/anchor behavior as zoom and font pills.
// See engine/panel-pills.js for the pill catalog and config options.

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=1.2';

const DEFAULT_URL = 'https://docs.google.com/presentation/d/e/REPLACE_WITH_PUBLISHED_ID/embed?start=false&loop=false&delayms=60000';

let mounted = null;
let pillHandle = null;

// Replace the existing slide=... param (whether in query string or hash) with
// the new slide ID. Published URLs (/pubembed) carry it as a query param;
// /embed URLs carry it as a hash fragment. We strip whatever is there and
// re-add in the appropriate position.
function withSlide(originalUrl, newSlideId) {
  let url = originalUrl;
  url = url.replace(/([?&])slide=[^&#]*/, '$1');
  url = url.replace(/#slide=[^&]*/, '');
  if (url.indexOf('/pubembed') !== -1) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'slide=' + encodeURIComponent(newSlideId);
  } else {
    url += '#slide=' + encodeURIComponent(newSlideId);
  }
  return url;
}

registerTool({
  id: 'slides-embed',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const url = (typeof cfg.url === 'string' && cfg.url) ? cfg.url : DEFAULT_URL;

    const root = document.createElement('div');
    root.className = 'slides-embed-root';

    const frame = document.createElement('iframe');
    frame.className = 'slides-embed-frame';
    frame.setAttribute('src', url);
    frame.setAttribute('title', 'Google Slides');
    frame.setAttribute('frameborder', '0');
    frame.setAttribute('allowfullscreen', 'true');
    frame.setAttribute('allow', 'autoplay');
    frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    root.appendChild(frame);

    container.appendChild(root);
    mounted = root;

    if (Array.isArray(cfg.slideIds) && cfg.slideIds.length > 0) {
      const slideIds = cfg.slideIds;
      const total = slideIds.length;
      let current = 1;

      // Anchor pills to the slot (container) so the bar sits flush with the
      // viewport bottom regardless of layout padding (see panel-pills header).
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

      pillHandle = attachPanelPills(container, {
        pills: [{
          kind: 'stepper',
          value: current,
          min: 1,
          max: total,
          step: 1,
          format: (v) => 'Slide ' + v + ' de ' + total,
          editable: true,
          symbolMinus: '←',
          symbolPlus:  '→',
          ariaLabelMinus: 'Slide anterior',
          ariaLabelPlus:  'Próximo slide',
          ariaLabelLabel: 'Número do slide',
          onChange: (v) => {
            current = v;
            frame.src = withSlide(url, slideIds[v - 1]);
          },
        }],
      });
    }
  },
  unmount() {
    if (pillHandle) { pillHandle.destroy(); pillHandle = null; }
    if (!mounted) return;
    if (typeof mounted.remove === 'function') mounted.remove();
    mounted = null;
  },
});
