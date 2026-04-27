// tools/tokenizer-embed/index.js
//
// Phase 3A. tokenizer-embed: drops a full-size iframe pointing at
// https://tiktokenizer.vercel.app/ into the slot. Uses the third-party
// tokenizer instead of building one in-house. No registry of tokens,
// no encoder, no composition; consumers wanting programmatic token data
// will need a different tool (deferred until 3B/3C scope is revisited).
//
// A small floating zoom control (- / % / +) overlays the bottom-right of
// the iframe and scales only the iframe content via CSS transform. The
// Backstage topbar lives outside the tool's container and is unaffected.
// Zoom level persists across reloads via localStorage.

import { registerTool } from '../../engine/registry.js';

const DEFAULT_URL = 'https://tiktokenizer.vercel.app/';
const ZOOM_KEY = 'tok-embed:zoom';
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

let mounted = null;

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

function buildZoomControls(host, getZoom, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'tok-embed-zoom';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'tok-embed-zoom__btn';
  minus.setAttribute('aria-label', 'Diminuir zoom');
  minus.textContent = '−';

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'tok-embed-zoom__label';
  reset.setAttribute('aria-label', 'Resetar zoom');

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'tok-embed-zoom__btn';
  plus.setAttribute('aria-label', 'Aumentar zoom');
  plus.textContent = '+';

  function refresh() { reset.textContent = Math.round(getZoom() * 100) + '%'; }

  minus.addEventListener('click', () => onChange(clampZoom(getZoom() - ZOOM_STEP)));
  plus.addEventListener('click',  () => onChange(clampZoom(getZoom() + ZOOM_STEP)));
  reset.addEventListener('click', () => onChange(1.0));

  wrap.appendChild(minus);
  wrap.appendChild(reset);
  wrap.appendChild(plus);
  host.appendChild(wrap);

  refresh();
  return { refresh };
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
      controls.refresh();
    }

    const controls = buildZoomControls(root, () => zoom, applyZoom);

    container.appendChild(root);
    mounted = root;
  },
  unmount() {
    if (!mounted) return;
    if (typeof mounted.remove === 'function') mounted.remove();
    mounted = null;
  },
});
