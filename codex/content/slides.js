// content/slides.js
// Codex Content tab, Slides sub-tab: the authored-deck library + editor.
//
// Layout model (auto-hide sidebar, like the Lessons focus-mode side reveal):
//   - The editor region fills the whole window below the Codex chrome at all
//     times (position:fixed, in slides.css). No Back bar.
//   - A left sidebar holds the deck list + "New presentation". With no deck open
//     it stays pinned visible; pick one and it recedes, the editor owns the
//     space. Push the cursor to the left edge and it slides back in over the
//     editor; the moment the cursor leaves it, it hides again (no close button).
//
// This sub-tab owns ONLY our authored decks (engine tag DECK_ENGINE); the Google
// Slides embed (`slide` type) is untouched and renders in Lessons, not here.
// Backend is reached ONLY through the codex-api slides facade. Every string goes
// through t(). No inline JS in markup; events are delegated.
import { slides as api, ai as aiApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { createCodexStore } from './slides/adapters/codexStore.js';
import { createLibrary } from './slides/adapters/library.js';
import { newDeck } from './slides/js/core/deck.js';
import * as editor from './slides/js/app.js';
import { makeWorkerAi } from './slides/js/ai/aiService.js';
import * as registry from './slides/js/layouts/registry.js';
import { parsePptx } from './slides/js/import/pptx.js';
import { classifyAll } from './slides/js/import/classify.js';
import { buildDeck } from './slides/js/import/build.js';

// Engine tag that marks a presentation row as one of OUR authored decks, so the
// list shows only these (not the legacy decks sharing the backend table).
const DECK_ENGINE = 'codex-deck';
// How close (px) the cursor must get to an edge to reveal hidden chrome. Narrow,
// "the very edge", matching the Lessons focus mode (its zones are 6px).
const EDGE_ZONE = 6; // left edge -> deck-list sidebar
const TOP_ZONE = 6;  // top edge  -> Codex topbar + sub-tab row

// The template library service (4c.1). One per sub-tab session; injected into the
// editor as ctx.library so the vendored core never imports the facade itself.
const _library = createLibrary({});

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _decks = [];
let _openSlug = null;         // slug of the deck currently open in the editor
let _editorHandles = null;    // active editor mount handles ({ app, unmount }), or null
let _deckOpen = false;        // true while a deck is open (sidebar auto-hides)
let _saveTimer = null;
let _topChromeTimer = null;   // focus-mode hide timer for the Codex topbar reveal
let _cleanup = [];

// ── Pure rules (exported for tests) ─────────────────────────────────────────
// Selection by slug: keep the current one if it survives the list, else the
// first, else nothing.
export function resolveDeckSelection(list, currentSlug) {
  if (!list || !list.length) return null;
  if (currentSlug != null && list.some((d) => d.slug === currentSlug)) return currentSlug;
  return list[0].slug;
}

// Keep only our authored decks. list_presentations returns every row; we show
// the ones tagged with our engine.
export function ourDecks(presentations) {
  return (presentations || []).filter((p) => p.engine === DECK_ENGINE);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _slugify(s) {
  return (s || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function _fmtDate(ts) {
  if (!ts) return '';
  if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR'); }
  const ms = ts < 1e12 ? ts * 1000 : ts;
  try { return new Date(ms).toLocaleDateString('pt-BR'); } catch (_) { return ''; }
}

function _deckBySlug(slug) { return _decks.find((d) => d.slug === slug) || null; }
function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

// ── Rendering ────────────────────────────────────────────────────────────────
function _render() {
  _viewEl.innerHTML =
    '<div class="cdx-slides-shell" id="cdx-slides-shell">' +
      // Thin left hot-strip; a faint chevron hints the reveal while a deck is open.
      '<div class="cdx-slides-edge" id="cdx-slides-edge" aria-hidden="true"></div>' +
      '<aside class="cdx-slides-sidebar is-open" id="cdx-slides-sidebar">' +
        '<div class="cdx-slides-side-head">' +
          '<h2 class="cdx-slides-side-title">' + _esc(t('content.sub_slides')) + '</h2>' +
          '<div class="cdx-slides-side-actions" style="display:inline-flex;gap:6px">' +
            '<button class="cdx-btn cdx-btn-sm" data-act="import" title="' + _esc(t('slides.import')) + '">' + _esc(t('slides.import')) + '</button>' +
            '<button class="cdx-btn cdx-btn-primary cdx-btn-sm" data-act="new">' + _esc(t('slides.new')) + '</button>' +
          '</div>' +
          '<input type="file" id="cdx-slides-import-file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" style="display:none">' +
        '</div>' +
        '<div class="cdx-slides-side-list" id="cdx-slides-list"></div>' +
      '</aside>' +
      '<div class="cdx-slides-region" id="cdx-slides-region"></div>' +
    '</div>';
  _renderList();
}

function _renderList() {
  const list = _q('#cdx-slides-list');
  if (!list) return;
  if (!_decks.length) {
    list.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.empty')) + '</div>';
    return;
  }
  list.innerHTML = _decks.map((d) => {
    const active = d.slug === _openSlug ? ' is-active' : '';
    const title = _esc(d.title || t('slides.untitled'));
    const sub = _fmtDate(d.updated_at || d.updated || d.created_at);
    return '<div class="cdx-slides-row' + active + '" data-slug="' + _esc(d.slug) + '" role="button" tabindex="0">' +
      '<div class="cdx-slides-row-info">' +
        '<div class="cdx-slides-row-title">' + title + '</div>' +
        (sub ? '<div class="cdx-slides-row-sub">' + _esc(t('slides.modified')) + ' ' + _esc(sub) + '</div>' : '') +
      '</div>' +
      '<button class="cdx-slides-row-del" data-act="del" data-slug="' + _esc(d.slug) + '" ' +
        'title="' + _esc(t('slides.delete')) + '" aria-label="' + _esc(t('slides.delete')) + '">&times;</button>' +
    '</div>';
  }).join('');
}

function _showPlaceholder() {
  _teardownEditor();
  _openSlug = null;
  _writeDeckParam(null);
  const region = _q('#cdx-slides-region');
  if (region) {
    region.innerHTML = '<div class="cdx-slides-placeholder">' + _esc(t('slides.placeholder')) + '</div>';
  }
  _setDeckOpen(false);
  _renderList();
}

// Mirror the open deck into the URL (?...&deck=<slug>) without navigating, so a
// reload (e.g. the topbar language toggle calls location.reload()) reopens the
// same presentation instead of dropping back to the list. Uses replaceState so
// it adds no history entry.
function _writeDeckParam(slug) {
  try {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set('deck', slug);
    else url.searchParams.delete('deck');
    window.history.replaceState(null, '', url);
  } catch (_) { /* ignore */ }
}
function _readDeckParam() {
  try { return new URL(window.location.href).searchParams.get('deck') || null; }
  catch (_) { return null; }
}

// ── Sidebar visibility ───────────────────────────────────────────────────────
function _setDeckOpen(on) {
  _deckOpen = on;
  const shell = _q('#cdx-slides-shell');
  const side = _q('#cdx-slides-sidebar');
  if (shell) shell.classList.toggle('deck-open', on);
  // Focus mode: an open deck recedes the Codex topbar + sub-tab row (both live in
  // .bs-topbar) so the editor reclaims that vertical space; the top edge slides
  // them back. Mirrors the Lessons focus mode.
  document.body.classList.toggle('cdx-slides-focus', on);
  if (!on) {
    document.body.classList.remove('cdx-slides-focus--top');
    if (_topChromeTimer) { clearTimeout(_topChromeTimer); _topChromeTimer = null; }
  }
  // No deck open => sidebar pinned visible. Deck open => start hidden (reveals on
  // left-edge hover, hides on mouseleave).
  if (side) side.classList.toggle('is-open', !on);
}

function _showSidebar() { const s = _q('#cdx-slides-sidebar'); if (s) s.classList.add('is-open'); }
function _hideSidebar() { if (!_deckOpen) return; const s = _q('#cdx-slides-sidebar'); if (s) s.classList.remove('is-open'); }

// Top-edge reveal of the receded Codex chrome. Shown while the cursor is within
// the revealed band (~104px: topbar 65 + sub-tab row 31 + slack), hidden shortly
// after it leaves, so it never collapses out from under a click on the bar.
function _showTopChrome() {
  document.body.classList.add('cdx-slides-focus--top');
  if (_topChromeTimer) { clearTimeout(_topChromeTimer); _topChromeTimer = null; }
}
function _scheduleHideTopChrome(clientY) {
  if (clientY <= 104) return;
  if (_topChromeTimer) return;
  _topChromeTimer = setTimeout(() => {
    document.body.classList.remove('cdx-slides-focus--top');
    _topChromeTimer = null;
  }, 450);
}

// ── Data ────────────────────────────────────────────────────────────────────
async function _loadDecks() {
  const list = _q('#cdx-slides-list');
  if (list) list.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.loading')) + '</div>';
  try {
    const res = await api.list();
    _decks = ourDecks(res && res.presentations);
    _renderList();
  } catch (e) {
    if (list) list.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.error_loading')) + '</div>';
  }
}

async function _deleteDeck(slug) {
  const d = _deckBySlug(slug);
  const name = (d && d.title) || t('slides.untitled');
  // eslint-disable-next-line no-alert -- lightweight guard; modal parity is a follow-up
  if (!window.confirm(t('slides.confirm_delete').replace('{name}', name))) return;
  try {
    await api.remove({ slug });
    await _loadDecks();
    if (_openSlug === slug) _showPlaceholder();  // deleted the open deck -> back to placeholder
  } catch (e) {
    const list = _q('#cdx-slides-list');
    if (list) list.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.error_loading')) + '</div>';
  }
}

async function _createDeck() {
  const title = t('slides.new_default_title');
  const slug = _slugify(title) + '-' + String(Date.now()).slice(-6);
  try {
    await api.register({ slug, title, engine: DECK_ENGINE });
    await _loadDecks();
    _openDeck(slug, /* fresh */ true);
  } catch (e) {
    const list = _q('#cdx-slides-list');
    if (list) list.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.error_loading')) + '</div>';
  }
}

// Open the OS file picker for a .pptx (the hidden input lives in the side head).
function _pickPptx() {
  const inp = _q('#cdx-slides-import-file');
  if (inp) { inp.value = ''; inp.click(); }
}

// Show a transient status line in the editor region while the import runs.
function _importStatus(msg) {
  const region = _q('#cdx-slides-region');
  if (region) region.innerHTML = '<div class="cdx-slides-placeholder">' + _esc(msg) + '</div>';
}

// _importDeck, parse a .pptx, classify each slide (heuristics + live-AI
// fallback via aiApi.chat / OpenRouter), rebuild as our deck JSON, register it,
// then open it in the editor for review/editing. Text-first: image slots are left
// empty for Élder to fill. All persistence stays on the frozen Worker contract.
async function _importDeck(file) {
  if (!file) return;
  const title = (file.name || '').replace(/\.pptx$/i, '').trim() || t('slides.import_default_title');
  _importStatus(t('slides.importing'));
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { slides } = parsePptx(bytes);
    if (!slides.length) { _importStatus(t('slides.import_empty')); return; }

    const layoutIds = registry.list().map((l) => l.id);
    const classified = await classifyAll(slides, { ai: aiApi.chat, layoutIds });
    const deck = buildDeck(classified, { title });

    const slug = _slugify(title) + '-' + String(Date.now()).slice(-6);
    await api.register({ slug, title, engine: DECK_ENGINE });
    await _loadDecks();
    await _openDeck(slug, /* fresh */ false, deck);
  } catch (e) {
    if (window.bsLog) window.bsLog('Slides import: ' + ((e && e.message) || e), 'error');
    _importStatus(t('slides.import_error'));
  }
}

// ── Editor (the copied, CSS-scoped Slides component) ─────────────────────────
// initialDeck (optional): a deck object to seed the store with (e.g. a freshly
// imported pptx). When given, it is treated like a fresh deck, set + persisted.
async function _openDeck(slug, fresh, initialDeck) {
  const store = createCodexStore({ slug });
  const seeded = !!initialDeck;

  if (initialDeck) {
    store.setDeck(initialDeck);
  } else if (fresh) {
    store.setDeck(newDeck());
  } else {
    await store.load();
    if (!store.getDeck()) store.setDeck(newDeck());
  }

  // Debounced autosave on any later deck change (the R2 path).
  store.on('change', () => {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { store.save().catch(() => {}); }, 800);
  });
  // Persist the initial deck (fresh OR imported) so it survives a reload.
  if (fresh || seeded) { try { await store.save(); } catch (_) { /* surfaced on next edit */ } }

  _teardownEditor();
  const region = _q('#cdx-slides-region');
  region.innerHTML = '<div class="cdx-slides-stage cdx-deck-editor" id="cdx-slides-stage"></div>';
  // Geometry is 100% CSS (slides.css, position:fixed region); the editor handles
  // its own canvas fit + window-resize internally. No sizing JS here.
  _editorHandles = editor.mount(_q('#cdx-slides-stage'), { store, aiService: makeWorkerAi(aiApi.chat), library: _library });
  _openSlug = slug;
  _writeDeckParam(slug);
  _setDeckOpen(true);
  _renderList();
}

function _teardownEditor() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  if (_editorHandles) {
    // mount() returns { app, unmount }; call its own teardown (closes the
    // BroadcastChannel, removes the resize + keydown listeners, clears the DOM).
    try { _editorHandles.unmount(); } catch (_) { /* ignore */ }
    _editorHandles = null;
  }
}

// ── Tab contract ────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _render();

  const onClick = (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.getAttribute('data-act');
      if (a === 'new') return _createDeck();
      if (a === 'import') return _pickPptx();
      if (a === 'del') { e.stopPropagation(); return _deleteDeck(act.getAttribute('data-slug')); }
    }
    const row = e.target.closest('.cdx-slides-row[data-slug]');
    if (row) return _openDeck(row.getAttribute('data-slug'), false);
  };
  _viewEl.addEventListener('click', onClick);
  _cleanup.push(() => _viewEl.removeEventListener('click', onClick));

  // The .pptx file picker (hidden input in the side head) -> import pipeline.
  const fileInput = _q('#cdx-slides-import-file');
  if (fileInput) {
    const onFile = (e) => { const f = e.target.files && e.target.files[0]; if (f) _importDeck(f); };
    fileInput.addEventListener('change', onFile);
    _cleanup.push(() => fileInput.removeEventListener('change', onFile));
  }

  // Edge reveal (mirrors lessons.js focus mode): while a deck is open, the cursor
  // reaching the left edge slides the sidebar in. It hides again as soon as the
  // cursor is no longer over it. Both directions are driven from a single
  // mousemove against the sidebar's real right edge, so a fast pointer exit can
  // never leave it stuck open; mouseleave is a redundant safety net.
  const onMove = (e) => {
    if (!_deckOpen) return;
    // top edge: slide the Codex topbar + sub-tab row back in
    if (e.clientY <= TOP_ZONE) _showTopChrome();
    else _scheduleHideTopChrome(e.clientY);
    // left edge: reveal the deck-list sidebar
    const side = _q('#cdx-slides-sidebar');
    if (!side) return;
    if (e.clientX <= EDGE_ZONE) { _showSidebar(); return; }
    if (side.classList.contains('is-open') && e.clientX > side.getBoundingClientRect().right) {
      _hideSidebar();
    }
  };
  document.addEventListener('mousemove', onMove);
  _cleanup.push(() => document.removeEventListener('mousemove', onMove));

  const side = _q('#cdx-slides-sidebar');
  if (side) {
    const onLeave = () => _hideSidebar();
    side.addEventListener('mouseleave', onLeave);
    _cleanup.push(() => side.removeEventListener('mouseleave', onLeave));
  }

  // Restore the deck named in the URL (?deck=<slug>) if it still exists, so a
  // reload (language toggle, refresh) reopens it; otherwise show the list.
  _loadDecks().then(() => {
    const wanted = _readDeckParam();
    if (wanted && _deckBySlug(wanted)) _openDeck(wanted, false);
    else _showPlaceholder();
  });
}

export function unmount() {
  _teardownEditor();
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  // Leave no focus-mode residue on the shared shell when the tab is torn down.
  document.body.classList.remove('cdx-slides-focus', 'cdx-slides-focus--top');
  if (_topChromeTimer) { clearTimeout(_topChromeTimer); _topChromeTimer = null; }
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _decks = [];
  _openSlug = null;
  _deckOpen = false;
}
