// content/slides.js
// Codex Content tab, Slides sub-tab: the authored-deck library.
// Master-detail, modeled on items.js: a list of presentations on the left, an
// info card on the right, and an "Editar" action that mounts the full deck
// editor (the self-contained Slides component copied under ./slides/, its CSS
// scoped to .cdx-deck-editor) bound to a codexStore. This sub-tab owns ONLY our
// authored decks (engine tag DECK_ENGINE); the Google Slides embed (`slide`
// type) is untouched and renders in Lessons, not here.
//
// The list is filtered by engine tag so it shows only our authored decks, not
// the legacy presentations that share the same backend table.
//
// Backend is reached ONLY through the codex-api slides facade. Every string
// goes through t(). No inline JS in markup; events are delegated.
import { slides as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { createCodexStore } from './slides/adapters/codexStore.js';
import { newDeck } from './slides/js/core/deck.js';
import * as editor from './slides/js/app.js';

// Engine tag that marks a presentation row as one of OUR authored decks, so the
// list shows only these (not the legacy decks sharing the backend table).
const DECK_ENGINE = 'codex-deck';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _decks = [];
let _selectedSlug = null;     // master-detail: slug shown in the info card
let _editorHandles = null;    // active editor mount handles ({ app, unmount }), or null
let _saveTimer = null;
let _cleanup = [];

// ── Pure rules (exported for tests) ─────────────────────────────────────────
// Master-detail selection, keyed by slug: keep the current selection if it
// survives the visible list, else fall back to the first deck, else nothing.
export function resolveDeckSelection(list, currentSlug) {
  if (!list || !list.length) return null;
  if (currentSlug != null && list.some((d) => d.slug === currentSlug)) return currentSlug;
  return list[0].slug;
}

// Keep only our authored decks (exported for tests). list_presentations returns
// every presentation row; we show the ones tagged with our engine.
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
  // Accept an ISO date string, epoch seconds, or epoch millis.
  if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR'); }
  const ms = ts < 1e12 ? ts * 1000 : ts;
  try { return new Date(ms).toLocaleDateString('pt-BR'); } catch (_) { return ''; }
}

function _deckBySlug(slug) { return _decks.find((d) => d.slug === slug) || null; }
function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

// ── Rendering (master-detail list view) ─────────────────────────────────────
function _render() {
  _viewEl.innerHTML =
    '<div class="cdx-slides">' +
      '<div class="cdx-slides-list">' +
        '<div class="cdx-slides-toolbar">' +
          '<h2 class="cdx-title">' + _esc(t('content.sub_slides')) + '</h2>' +
          '<button class="cdx-btn cdx-btn-primary" data-act="new">' + _esc(t('slides.new')) + '</button>' +
        '</div>' +
        '<div class="cdx-slides-rows" id="cdx-slides-rows"></div>' +
      '</div>' +
      '<div class="cdx-slides-detail" id="cdx-slides-detail"></div>' +
    '</div>';
  _renderRows();
  _renderDetail();
}

function _renderRows() {
  const box = _q('#cdx-slides-rows');
  if (!box) return;
  if (!_decks.length) {
    box.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.empty')) + '</div>';
    return;
  }
  box.innerHTML = _decks.map((d) => {
    const sel = d.slug === _selectedSlug ? ' cdx-sel' : '';
    const title = _esc(d.title || t('slides.untitled'));
    const sub = _fmtDate(d.updated_at || d.updated || d.created_at);
    return '<div class="cdx-item-row' + sel + '" data-slug="' + _esc(d.slug) + '">' +
      '<div><div class="cdx-row-title">' + title + '</div>' +
      (sub ? '<div class="cdx-row-sub">' + _esc(t('slides.modified')) + ' ' + _esc(sub) + '</div>' : '') +
      '</div></div>';
  }).join('');
}

function _renderDetail() {
  const pane = _q('#cdx-slides-detail');
  if (!pane) return;
  const d = _deckBySlug(_selectedSlug);
  if (!d) {
    pane.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.select_prompt')) + '</div>';
    return;
  }
  const count = (typeof d.slide_count === 'number') ? d.slide_count : null;
  pane.innerHTML =
    '<div class="cdx-slides-card">' +
      '<h3 class="cdx-slides-card-title">' + _esc(d.title || t('slides.untitled')) + '</h3>' +
      '<dl class="cdx-slides-meta">' +
        (count != null
          ? '<div><dt>' + _esc(t('slides.slide_count')) + '</dt><dd>' + count + '</dd></div>'
          : '') +
        '<div><dt>' + _esc(t('slides.modified')) + '</dt><dd>' +
          _esc(_fmtDate(d.updated_at || d.updated || d.created_at) || '-') + '</dd></div>' +
      '</dl>' +
      '<button class="cdx-btn cdx-btn-primary" data-act="edit" data-slug="' + _esc(d.slug) + '">' +
        _esc(t('slides.edit')) + '</button>' +
    '</div>';
}

// ── Data ────────────────────────────────────────────────────────────────────
async function _loadDecks() {
  const box = _q('#cdx-slides-rows');
  if (box) box.innerHTML = '<div class="cdx-loading">' + _esc(t('slides.loading')) + '</div>';
  try {
    const res = await api.list();
    _decks = ourDecks(res && res.presentations);
    _selectedSlug = resolveDeckSelection(_decks, _selectedSlug);
    _renderRows();
    _renderDetail();
  } catch (e) {
    if (box) box.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.error_loading')) + '</div>';
  }
}

async function _createDeck() {
  const title = t('slides.new_default_title');
  const slug = _slugify(title) + '-' + String(Date.now()).slice(-6);
  try {
    await api.register({ slug, title, engine: DECK_ENGINE });
    await _loadDecks();
    _selectedSlug = slug;
    _renderRows();
    _renderDetail();
    _openEditor(slug, /* fresh */ true);
  } catch (e) {
    const box = _q('#cdx-slides-rows');
    if (box) box.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.error_loading')) + '</div>';
  }
}

// ── Editor (the copied, CSS-scoped Slides component) ─────────────────────────
async function _openEditor(slug, fresh) {
  const store = createCodexStore({ slug });

  // Put a deck in place first.
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
  _viewEl.innerHTML =
    '<div class="cdx-slides-editor">' +
      '<div class="cdx-slides-editorbar">' +
        '<button class="cdx-btn" data-act="back">' + _esc(t('slides.back')) + '</button>' +
      '</div>' +
      '<div class="cdx-slides-stage cdx-deck-editor" id="cdx-slides-stage"></div>' +
    '</div>';
  _editorHandles = editor.mount(_q('#cdx-slides-stage'), { store });
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

function _backToList() {
  _teardownEditor();
  _render();
  _loadDecks();
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
      if (a === 'edit') return _openEditor(act.getAttribute('data-slug'), false);
      if (a === 'back') return _backToList();
    }
    const row = e.target.closest('.cdx-item-row[data-slug]');
    if (row) {
      _selectedSlug = row.getAttribute('data-slug');
      _renderRows();
      _renderDetail();
    }
  };
  _viewEl.addEventListener('click', onClick);
  _cleanup.push(() => _viewEl.removeEventListener('click', onClick));

  _loadDecks();
}

export function unmount() {
  _teardownEditor();
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _decks = [];
  _selectedSlug = null;
}
