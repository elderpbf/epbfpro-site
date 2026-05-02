// tools/tokenizer-embed/index.js
//
// Phase 3A. tokenizer-embed: drops a full-size iframe pointing at
// https://tiktokenizer.vercel.app/ into the slot. Uses the third-party
// tokenizer instead of building one in-house. No registry of tokens,
// no encoder, no composition; consumers wanting programmatic token data
// will need a different tool (deferred until 3B/3C scope is revisited).
//
// Bottom-edge zoom pill (- / % / +) provided by engine/panel-pills.js.
// Hover the bottom 16px of the tool to reveal it. Scales only the iframe
// content via CSS transform; the Backstage topbar lives outside the
// tool's container and is unaffected. Zoom level persists via localStorage.

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=2.0';

const DEFAULT_URL = 'https://tiktokenizer.vercel.app/';
const ZOOM_KEY = 'tok-embed:zoom';
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

let mounted = null;
let pillHandle = null;

function loadZoom() {
  try {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY));
    if (isFinite(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) return v;
  } catch (_) { /* localStorage may be unavailable */ }
  return 1.0;
}

function saveZoom(v) {
  try { localStorage.setItem(ZOOM_KEY, String(v)); } catch (_) { /* ignore */ }
}

function clampZoom(v) {
  const n = Math.round(v * 100) / 100;
  if (n < ZOOM_MIN) return ZOOM_MIN;
  if (n > ZOOM_MAX) return ZOOM_MAX;
  return n;
}

registerTool({
  id: 'tokenizer-embed',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const url = (typeof cfg.url === 'string' && cfg.url) ? cfg.url : DEFAULT_URL;

    const root = document.createElement('div');
    root.className = 'tok-embed-root';

    const frame = document.createElement('iframe');
    frame.className = 'tok-embed-frame';
    frame.setAttribute('src', url);
    frame.setAttribute('title', 'tiktokenizer');
    frame.setAttribute('loading', 'eager');
    frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    root.appendChild(frame);

    let zoom = clampZoom(loadZoom());
    root.style.setProperty('--tok-embed-zoom', String(zoom));

    function applyZoom(v) {
      zoom = clampZoom(v);
      saveZoom(zoom);
      root.style.setProperty('--tok-embed-zoom', String(zoom));
    }

    // Anchor pills to the slot (container) not the inner root so bottom
    // positioning is relative to the slot boundary (viewport bottom), not the
    // root element which sits 48px inside the tool-fullbleed slot padding.
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    pillHandle = attachPanelPills(container, {
      pills: [{
        kind: 'stepper',
        value: zoom,
        min: ZOOM_MIN,
        max: ZOOM_MAX,
        step: ZOOM_STEP,
        format: (v) => Math.round(v * 100) + '%',
        onChange: (v) => applyZoom(v),
        resetTo: 1.0,
        ariaLabelMinus: 'Diminuir zoom',
        ariaLabelPlus:  'Aumentar zoom',
        ariaLabelLabel: 'Resetar zoom',
      }],
    });

    container.appendChild(root);
    mounted = root;
  },
  unmount() {
    if (pillHandle) { pillHandle.destroy(); pillHandle = null; }
    if (!mounted) return;
    if (typeof mounted.remove === 'function') mounted.remove();
    mounted = null;
  },
});
