// content/slides.js
// Codex Content tab, Slides sub-tab: the authored-deck manager.
//
// Native render (not a deferred-global wrapper): there is no window-global deck
// grid to mount, so the surface is rebuilt clean here — cdx-, facade-only,
// i18n. It lists the decks registered in D1 via the frozen `list_presentations`
// action and renders them as Codex cards.
//
// Ownership: the deck RENDERER now lives in Codex (slides/engine/, moved from
// classforge/html-slides) so Slides carries no dependency on classforge, which
// is slated for eventual retirement. Opening a deck additionally needs its
// INSTANCE (the per-deck HTML page + its chrome) migrated into Codex; that is a
// separate, content-heavy step (tracked, not done here). Until a deck's slug is
// in MIGRATED_DECKS, its "Apresentar" action is shown disabled rather than
// linking back into classforge.
//
// Globals: none (the engine is loaded by deck pages, not by this admin grid).
import { slides as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _cleanup = [];

// Slugs whose deck INSTANCE has been migrated into codex/slides/decks/<slug>/.
// Empty until the deck-instance migration lands; gates the openable state so the
// grid never links into classforge. Add a slug here when its page moves to Codex.
const MIGRATED_DECKS = new Set();

// Engines the Codex renderer supports. The legacy panels/reveal engines are NOT
// ported (dropped, per the migration decision); decks on them show as legacy.
const SUPPORTED_ENGINES = new Set(['html-slides']);

const ENGINE_LABELS = {
  'html-slides': 'HTML Slides',
  'panels': 'Panels',
  'reveal': 'Reveal',
  'reveal-legacy': 'Reveal',
};

// ── Pure rules (exported for tests) ───────────────────────────────────────────

// Normalize the list_presentations payload into the card model. Accepts either
// the raw worker response ({ presentations: [...] }) or a bare array. Mirrors
// the legacy grid's normalization: the frozen 'panels-legacy' engine string is
// folded to 'html-slides' (Phase 6 rename), and updated_at is sliced to a date.
export function mapDecks(raw) {
  const rows = Array.isArray(raw) ? raw : (raw && raw.presentations) || [];
  return rows.map((p) => {
    let engine = p.engine || 'html-slides';
    if (engine === 'panels-legacy') engine = 'html-slides';
    return {
      slug: p.slug || '',
      engine,
      title: p.title || '',
      thumbnail: p.thumbnail || '',
      modified: (p.updated_at || p.modified || '').slice(0, 10),
    };
  });
}

// The Codex-owned route for a deck, or null if its engine is not supported by
// the Codex renderer. The grid runs at /codex/?tab=content&sub=slides, so deck
// pages live one level down at /codex/slides/decks/<slug>/.
export function deckHref(deck) {
  if (!deck || !SUPPORTED_ENGINES.has(deck.engine) || !deck.slug) return null;
  return 'slides/decks/' + encodeURIComponent(deck.slug) + '/';
}

// Whether the deck can be opened from Codex right now: a supported engine AND
// its instance already migrated. (deckHref encodes engine support; this adds the
// instance-migrated gate so we never point at a not-yet-migrated page.)
export function canOpen(deck, migrated) {
  const set = migrated || MIGRATED_DECKS;
  return deckHref(deck) != null && !!deck && set.has(deck.slug);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _initial(title) {
  return (title || '?').trim().charAt(0).toUpperCase() || '?';
}

function _engineLabel(engine) {
  return ENGINE_LABELS[engine] || engine;
}

// ── Render ──────────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-slides">' +
      '<div class="cdx-slides-head">' +
        '<h1 class="cdx-slides-title">' + _esc(t('slides.title')) + '</h1>' +
        '<button type="button" class="cdx-btn" id="cdx-slides-refresh">' + _esc(t('slides.refresh')) + '</button>' +
      '</div>' +
      '<div class="cdx-slides-body" id="cdx-slides-body">' +
        '<div class="cdx-empty">' + _esc(t('slides.loading')) + '</div>' +
      '</div>' +
    '</div>';

  const refresh = _viewEl.querySelector('#cdx-slides-refresh');
  const onRefresh = () => _load();
  refresh.addEventListener('click', onRefresh);
  _cleanup.push(() => refresh.removeEventListener('click', onRefresh));
}

function _body() { return _viewEl && _viewEl.querySelector('#cdx-slides-body'); }

function _renderEmpty(msgKey) {
  const body = _body();
  if (body) body.innerHTML = '<div class="cdx-empty">' + _esc(t(msgKey)) + '</div>';
}

function _renderDecks(decks) {
  const body = _body();
  if (!body) return;
  if (!decks.length) { _renderEmpty('slides.empty'); return; }

  const grid = document.createElement('div');
  grid.className = 'cdx-slides-grid';
  decks.forEach((deck) => grid.appendChild(_buildCard(deck)));
  body.innerHTML = '';
  body.appendChild(grid);
}

function _buildCard(deck) {
  const card = document.createElement('div');
  card.className = 'cdx-slide-card';

  // Thumbnail (image when present, else themed initial fallback).
  const thumb = document.createElement('div');
  thumb.className = 'cdx-slide-thumb';
  if (deck.thumbnail) {
    const img = document.createElement('img');
    img.src = deck.thumbnail;
    img.alt = deck.title || '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.remove();
      thumb.classList.add('cdx-slide-thumb--fallback');
      thumb.textContent = _initial(deck.title);
    });
    thumb.appendChild(img);
  } else {
    thumb.classList.add('cdx-slide-thumb--fallback');
    thumb.textContent = _initial(deck.title);
  }
  const badge = document.createElement('span');
  badge.className = 'cdx-slide-engine';
  badge.textContent = _engineLabel(deck.engine);
  thumb.appendChild(badge);
  card.appendChild(thumb);

  // Body: title + modified meta.
  const bodyEl = document.createElement('div');
  bodyEl.className = 'cdx-slide-body';
  const title = document.createElement('h3');
  title.className = 'cdx-slide-name';
  title.textContent = deck.title || t('slides.untitled');
  bodyEl.appendChild(title);
  if (deck.modified) {
    const meta = document.createElement('p');
    meta.className = 'cdx-slide-meta';
    meta.textContent = t('slides.modified') + ': ' + deck.modified;
    bodyEl.appendChild(meta);
  }

  // Actions: open the Codex-owned renderer, gated on instance migration.
  const actions = document.createElement('div');
  actions.className = 'cdx-slide-actions';
  const supported = deckHref(deck) != null;
  if (supported) {
    const present = document.createElement('a');
    present.className = 'cdx-btn cdx-btn-primary';
    present.textContent = t('slides.present');
    if (canOpen(deck)) {
      present.href = deckHref(deck);
    } else {
      present.classList.add('is-disabled');
      present.setAttribute('aria-disabled', 'true');
      present.title = t('slides.open_pending');
      present.addEventListener('click', (e) => e.preventDefault());
    }
    actions.appendChild(present);
  } else {
    const legacy = document.createElement('span');
    legacy.className = 'cdx-slide-legacy';
    legacy.textContent = t('slides.engine_legacy');
    actions.appendChild(legacy);
  }
  bodyEl.appendChild(actions);
  card.appendChild(bodyEl);

  return card;
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function _load() {
  _renderEmpty('slides.loading');
  try {
    const decks = mapDecks(await api.list());
    _renderDecks(decks);
  } catch (_) {
    _renderEmpty('slides.error');
  }
}

// ── Tab contract ──────────────────────────────────────────────────────────────
export function mount(viewEl) {
  _viewEl = viewEl;
  _cleanup = [];
  _renderShell();
  _load();
}

export function unmount() {
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
