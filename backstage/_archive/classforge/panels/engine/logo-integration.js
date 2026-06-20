// engine/logo-integration.js
//
// Persistent logo overlay for Panels v2 decks. A single fixed <div> at top-left
// of the viewport renders the deck's selected logo over panel content but
// below chrome (topbar at z >= 9900, side menu at z >= 940). Topbar and side
// menu reveals naturally cover the logo.
//
// Storage:
//   bs_pn_logo_library  -- global. Array of { id, name, dataUrl, width, height }.
//   bs_pn_logo_<slug>   -- per-deck. { enabled, logoId, offsetTop, offsetLeft, size }.
//
// Uploaded images are downscaled via canvas (max 512px on longest side, PNG
// to preserve transparency) before being stored, so a typical logo lands well
// under 100 KB even when the source is multi-megabyte. The ~5 MB origin
// budget then comfortably holds a couple dozen logos.
//
// The overlay element is appended to document.body once (lazy) and reused
// across panel navigations and transient overlays.
//
// Settings UI: returns one section [{ id, title, content, onInit, onOpen }]
// with a file input, library list, "Mostrar logo" toggle, top + left offsets,
// and size.
//
// Example usage (inside a presentation module script):
//
//   import { attachLogo } from '../../engine/logo-integration.js';
//   const sections = [
//     ...attachSettings(runtime, { slug }),
//     ...attachThumbnail(runtime, { slug, ... }),
//     ...attachLogo(runtime, { slug }),
//   ];
//   attachTopbar(runtime, { sections });

const LIBRARY_KEY = 'bs_pn_logo_library';
const SLUG_KEY_PREFIX = 'bs_pn_logo_';
const OVERLAY_ID = 'pn-logo-overlay';

const MAX_DIMENSION = 512;

// opacity is stored as 0-100 (slider value) and applied via CSS as
// state.opacity / 100. Default 100 = fully visible.
const DEFAULTS = { enabled: false, logoId: null, offsetTop: 24, offsetLeft: 24, size: 80, opacity: 100 };

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

// Library writes can hit the localStorage quota for large data URLs; let
// the QuotaExceededError propagate so the caller can surface a message.
function writeJsonStrict(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Per-slug state writes are tiny (a handful of numbers) and cannot fill
// origin storage on their own; swallow IO errors so the UI stays responsive.
function writeJsonSafe(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function getLibrary() {
  const lib = readJson(LIBRARY_KEY, []);
  return Array.isArray(lib) ? lib : [];
}

function setLibrary(lib) {
  writeJsonStrict(LIBRARY_KEY, lib);
}

function addToLibrary(entry) {
  const lib = getLibrary();
  lib.push(entry);
  setLibrary(lib);
  return lib;
}

function removeFromLibrary(id) {
  const lib = getLibrary().filter((e) => e.id !== id);
  setLibrary(lib);
  return lib;
}

function slugKey(slug) { return SLUG_KEY_PREFIX + slug; }

function getSlugState(slug) {
  const stored = readJson(slugKey(slug), {}) || {};
  const out = { ...DEFAULTS, ...stored };
  // Migrate legacy single `offset` to per-axis fields.
  if (typeof stored.offset === 'number') {
    if (typeof stored.offsetTop !== 'number') out.offsetTop = stored.offset;
    if (typeof stored.offsetLeft !== 'number') out.offsetLeft = stored.offset;
  }
  return out;
}

function setSlugState(slug, state) {
  const { offset, ...clean } = state;
  void offset;
  writeJsonSafe(slugKey(slug), clean);
}

function findLogo(id) {
  if (!id) return null;
  return getLibrary().find((e) => e.id === id) || null;
}

function ensureOverlay() {
  let el = document.getElementById(OVERLAY_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = OVERLAY_ID;
  el.className = 'pn-logo-overlay';
  el.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  el.appendChild(img);
  document.body.appendChild(el);
  return el;
}

function renderOverlay(slug) {
  const state = getSlugState(slug);
  const overlay = ensureOverlay();
  const img = overlay.querySelector('img');
  const logo = state.enabled ? findLogo(state.logoId) : null;
  if (!logo) {
    overlay.style.display = 'none';
    img.removeAttribute('src');
    return;
  }
  overlay.style.display = '';
  overlay.style.top = state.offsetTop + 'px';
  overlay.style.left = state.offsetLeft + 'px';
  overlay.style.height = state.size + 'px';
  overlay.style.opacity = String((Number(state.opacity) || 0) / 100);
  if (img.getAttribute('src') !== logo.dataUrl) img.src = logo.dataUrl;
}

function decodeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => resolve(probe);
    probe.onerror = () => reject(new Error('image decode failed'));
    probe.src = dataUrl;
  });
}

// Downscale via canvas to keep stored data URLs small. PNG output preserves
// transparency for logos with alpha channels.
function downscaleImage(image, maxDim) {
  const srcW = image.naturalWidth || image.width || 0;
  const srcH = image.naturalHeight || image.height || 0;
  const longest = Math.max(srcW, srcH);
  if (!longest) throw new Error('image has zero dimension');
  const scale = longest > maxDim ? maxDim / longest : 1;
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) { reject(new Error('not an image')); return; }
      decodeImage(dataUrl).then((img) => {
        try { resolve(downscaleImage(img, MAX_DIMENSION)); }
        catch (e) { reject(e); }
      }, reject);
    };
    reader.readAsDataURL(file);
  });
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function buildLogoSection(slug) {
  const ids = {
    file:          'pn-logo-file',
    library:       'pn-logo-library',
    toggle:        'pn-logo-toggle',
    offsetTop:     'pn-logo-offset-top',
    offsetTopVal:  'pn-logo-offset-top-val',
    offsetLeft:    'pn-logo-offset-left',
    offsetLeftVal: 'pn-logo-offset-left-val',
    size:          'pn-logo-size',
    sizeVal:       'pn-logo-size-val',
    opacity:       'pn-logo-opacity',
    opacityVal:    'pn-logo-opacity-val',
    error:         'pn-logo-error',
  };

  const content =
    '<p class="bs-hint" style="margin-bottom:0.75rem">Logo persistente no canto superior esquerdo de todos os painéis.</p>' +
    '<div class="pn-logo-section">' +
      '<div class="bs-field">' +
        '<label for="' + ids.file + '">Adicionar à biblioteca</label>' +
        '<input type="file" id="' + ids.file + '" accept="image/*">' +
      '</div>' +
      '<p class="bs-form-error" id="' + ids.error + '"></p>' +
      '<div class="pn-logo-library" id="' + ids.library + '"></div>' +
      '<label class="pn-logo-toggle-row">' +
        '<input type="checkbox" id="' + ids.toggle + '">' +
        '<span>Mostrar logo</span>' +
      '</label>' +
      '<div class="bs-field">' +
        '<label for="' + ids.offsetTop + '">Distância do topo: <output id="' + ids.offsetTopVal + '">24</output> px</label>' +
        '<input type="range" id="' + ids.offsetTop + '" min="0" max="200" step="1">' +
      '</div>' +
      '<div class="bs-field">' +
        '<label for="' + ids.offsetLeft + '">Distância da esquerda: <output id="' + ids.offsetLeftVal + '">24</output> px</label>' +
        '<input type="range" id="' + ids.offsetLeft + '" min="0" max="200" step="1">' +
      '</div>' +
      '<div class="bs-field">' +
        '<label for="' + ids.size + '">Altura do logo: <output id="' + ids.sizeVal + '">80</output> px</label>' +
        '<input type="range" id="' + ids.size + '" min="20" max="300" step="1">' +
      '</div>' +
      '<div class="bs-field">' +
        '<label for="' + ids.opacity + '">Opacidade: <output id="' + ids.opacityVal + '">100</output>%</label>' +
        '<input type="range" id="' + ids.opacity + '" min="0" max="100" step="1">' +
      '</div>' +
    '</div>';

  function renderLibrary() {
    const list = document.getElementById(ids.library);
    if (!list) return;
    const lib = getLibrary();
    const state = getSlugState(slug);
    if (lib.length === 0) {
      list.innerHTML = '<p class="bs-hint" style="margin:0.5rem 0">Biblioteca vazia. Faça upload de uma imagem para começar.</p>';
      return;
    }
    list.innerHTML = lib.map((e) => {
      const active = e.id === state.logoId ? ' pn-logo-library__item--active' : '';
      return (
        '<div class="pn-logo-library__item' + active + '" data-logo-id="' + escHtml(e.id) + '">' +
          '<img class="pn-logo-library__thumb" src="' + escHtml(e.dataUrl) + '" alt="">' +
          '<div class="pn-logo-library__name" title="' + escHtml(e.name) + '">' + escHtml(e.name) + '</div>' +
          '<div class="pn-logo-library__actions">' +
            '<button class="bs-toggle-btn pn-logo-use" type="button" data-action="use">' +
              (e.id === state.logoId ? 'Em uso' : 'Usar') +
            '</button>' +
            '<button class="bs-toggle-btn pn-logo-delete" type="button" data-action="delete">Excluir</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function syncControls() {
    const state = getSlugState(slug);
    const toggle        = document.getElementById(ids.toggle);
    const offsetTop     = document.getElementById(ids.offsetTop);
    const offsetTopVal  = document.getElementById(ids.offsetTopVal);
    const offsetLeft    = document.getElementById(ids.offsetLeft);
    const offsetLeftVal = document.getElementById(ids.offsetLeftVal);
    const size          = document.getElementById(ids.size);
    const sizeVal       = document.getElementById(ids.sizeVal);
    const opacity       = document.getElementById(ids.opacity);
    const opacityVal    = document.getElementById(ids.opacityVal);
    if (toggle) toggle.checked = !!state.enabled;
    if (offsetTop)     offsetTop.value     = String(state.offsetTop);
    if (offsetTopVal)  offsetTopVal.textContent  = String(state.offsetTop);
    if (offsetLeft)    offsetLeft.value    = String(state.offsetLeft);
    if (offsetLeftVal) offsetLeftVal.textContent = String(state.offsetLeft);
    if (size)          size.value          = String(state.size);
    if (sizeVal)       sizeVal.textContent       = String(state.size);
    if (opacity)       opacity.value       = String(state.opacity);
    if (opacityVal)    opacityVal.textContent    = String(state.opacity);
  }

  function update(patch) {
    const next = { ...getSlugState(slug), ...patch };
    setSlugState(slug, next);
    renderOverlay(slug);
    renderLibrary();
  }

  function handleFile(file) {
    const err = document.getElementById(ids.error);
    if (err) err.textContent = '';
    if (!file) return;
    readImageFile(file).then(({ dataUrl, width, height }) => {
      const id = 'logo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const name = (file.name || 'logo').replace(/\.[^.]+$/, '') || 'logo';
      try {
        addToLibrary({ id, name, dataUrl, width, height });
      } catch (e) {
        if (err) err.textContent = 'Falha ao salvar (origem cheia?). Remova um logo antes de adicionar outro.';
        console.warn('[logo-integration] addToLibrary failed', e);
        return;
      }
      update({ enabled: true, logoId: id });
    }).catch((e) => {
      if (err) err.textContent = 'Não foi possível ler a imagem.';
      console.warn('[logo-integration] readImageFile failed', e);
    });
  }

  function bindRangeInput(input, valueEl, key, min, max) {
    if (!input) return;
    input.addEventListener('input', () => {
      const n = parseInt(input.value, 10);
      if (!Number.isFinite(n)) return;
      const clamped = Math.max(min, Math.min(max, n));
      if (valueEl) valueEl.textContent = String(clamped);
      update({ [key]: clamped });
    });
  }

  function bind() {
    const file = document.getElementById(ids.file);
    const toggle = document.getElementById(ids.toggle);
    const list = document.getElementById(ids.library);

    if (file) {
      file.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        handleFile(f);
        file.value = '';
      });
    }
    if (toggle) {
      toggle.addEventListener('change', () => update({ enabled: !!toggle.checked }));
    }
    bindRangeInput(document.getElementById(ids.offsetTop),  document.getElementById(ids.offsetTopVal),  'offsetTop', 0, 200);
    bindRangeInput(document.getElementById(ids.offsetLeft), document.getElementById(ids.offsetLeftVal), 'offsetLeft', 0, 200);
    bindRangeInput(document.getElementById(ids.size),       document.getElementById(ids.sizeVal),       'size', 20, 300);
    bindRangeInput(document.getElementById(ids.opacity),    document.getElementById(ids.opacityVal),    'opacity', 0, 100);

    if (list) {
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const item = btn.closest('[data-logo-id]');
        if (!item) return;
        const id = item.getAttribute('data-logo-id');
        const action = btn.getAttribute('data-action');
        if (action === 'use') {
          update({ enabled: true, logoId: id });
        } else if (action === 'delete') {
          removeFromLibrary(id);
          const state = getSlugState(slug);
          if (state.logoId === id) update({ logoId: null, enabled: false });
          else { renderOverlay(slug); renderLibrary(); }
        }
      });
    }
  }

  return {
    id: 'pn-logo',
    title: 'Logo',
    content,
    onInit: () => { bind(); syncControls(); renderLibrary(); },
    onOpen: () => { syncControls(); renderLibrary(); },
  };
}

export function attachLogo(runtime, options = {}) {
  const slug = options.slug || 'default';
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  renderOverlay(slug);

  // Cross-window sync: when the main deck mutates the library or the per-slug
  // state, the presenter mirror (separate document, same origin) re-renders
  // its own overlay. The storage event also fires for any other tab on the
  // same origin, which is fine -- they all converge on the same state.
  window.addEventListener('storage', (e) => {
    if (e.key === LIBRARY_KEY || e.key === slugKey(slug)) renderOverlay(slug);
  });

  return [buildLogoSection(slug)];
}
