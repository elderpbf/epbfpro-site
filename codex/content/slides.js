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
import { slides as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { createCodexStore } from './slides/adapters/codexStore.js';
import { newDeck } from './slides/js/core/deck.js';
import * as editor from './slides/js/app.js';

// Engine tag that marks a presentation row as one of OUR authored decks, so the
// list shows only these (not the legacy decks sharing the backend table).
const DECK_ENGINE = 'codex-deck';
// How close (px) the cursor must get to the left edge to reveal the sidebar.
const EDGE_ZONE = 16;

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _decks = [];
let _openSlug = null;         // slug of the deck currently open in the editor
let _editorHandles = null;    // active editor mount handles ({ app, unmount }), or null
let _deckOpen = false;        // true while a deck is open (sidebar auto-hides)
let _saveTimer = null;
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
          '<button class="cdx-btn cdx-btn-primary cdx-btn-sm" data-act="new">' + _esc(t('slides.new')) + '</button>' +
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
  // No deck open => sidebar pinned visible. Deck open => start hidden (reveals on
  // left-edge hover, hides on mouseleave).
  if (side) side.classList.toggle('is-open', !on);
}

function _showSidebar() { const s = _q('#cdx-slides-sidebar'); if (s) s.classList.add('is-open'); }
function _hideSidebar() { if (!_deckOpen) return; const s = _q('#cdx-slides-sidebar'); if (s) s.classList.remove('is-open'); }

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

// ── Editor (the copied, CSS-scoped Slides component) ─────────────────────────
async function _openDeck(slug, fresh) {
  const store = createCodexStore({ slug });

  if (fresh) {
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
  // Persist the initial deck for a fresh presentation so it survives a reload.
  if (fresh) { try { await store.save(); } catch (_) { /* surfaced on next edit */ } }

  _teardownEditor();
  const region = _q('#cdx-slides-region');
  region.innerHTML = '<div class="cdx-slides-stage cdx-deck-editor" id="cdx-slides-stage"></div>';
  // Geometry is 100% CSS (slides.css, position:fixed region); the editor handles
  // its own canvas fit + window-resize internally. No sizing JS here.
  _editorHandles = editor.mount(_q('#cdx-slides-stage'), { store });
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
      if (a === 'del') { e.stopPropagation(); return _deleteDeck(act.getAttribute('data-slug')); }
    }
    const row = e.target.closest('.cdx-slides-row[data-slug]');
    if (row) return _openDeck(row.getAttribute('data-slug'), false);
  };
  _viewEl.addEventListener('click', onClick);
  _cleanup.push(() => _viewEl.removeEventListener('click', onClick));

  // Edge reveal (mirrors lessons.js focus mode): while a deck is open, the cursor
  // reaching the left edge slides the sidebar in. It hides again as soon as the
  // cursor is no longer over it. Both directions are driven from a single
  // mousemove against the sidebar's real right edge, so a fast pointer exit can
  // never leave it stuck open; mouseleave is a redundant safety net.
  const onMove = (e) => {
    if (!_deckOpen) return;
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
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _decks = [];
  _openSlug = null;
  _deckOpen = false;
}
