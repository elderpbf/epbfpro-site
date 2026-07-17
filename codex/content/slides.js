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
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.bsLog (debug pill, backstage/js/debug.js), window.BS_GOOGLE (Google Picker bridge)
import { slides as api, ai as aiApi, appConfig } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { openMenu, closeMenu } from '../js/menu.js';
import { createCodexStore } from './slides/adapters/codexStore.js';
import { createLibrary } from './slides/adapters/library.js';
import { createSharedSlides } from './slides/adapters/sharedSlides.js';
import { createSlideClip } from './slides/adapters/slideClip.js';
import { glyphSvg } from '../js/glyphs.js';
import { createImageStore } from './slides/adapters/imageStore.js';
import { createDrivePicker } from './slides/adapters/drivePicker.js';

// The Google Picker API key is a referrer-restricted browser key kept OUT of this public
// repo: the Worker serves it (get_client_config, sourced from a Doppler/Worker secret) and
// the client fetches it once per session. Empty (secret unset or the call fails) -> the
// gallery's Drive option stays disabled; the rest of the gallery is unaffected.
let _pickerKey = '';
let _pickerKeyPromise = null;
function ensurePickerKey() {
  if (!_pickerKeyPromise) {
    _pickerKeyPromise = appConfig.get()
      .then((r) => { _pickerKey = (r && r.config && r.config.googlePickerApiKey) || ''; })
      .catch((e) => { _pickerKey = ''; notice.internal(e); });
  }
  return _pickerKeyPromise;
}
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
let _flushSave = null;        // fires the pending debounced save NOW (see _teardownEditor)
let _topChromeTimer = null;   // focus-mode hide timer for the Codex topbar reveal
let _cleanup = [];

// ── Pure rules (exported for tests) ─────────────────────────────────────────
// Keep only our authored decks. list_presentations returns every row; we show
// the ones tagged with our engine.
export function ourDecks(presentations) {
  return (presentations || []).filter((p) => p.engine === DECK_ENGINE);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
import { esc as _esc } from '../js/dom.js';

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

// Deck titles must be unique among our decks (Élder 2026-07-17: "não podemos ter
// apresentações com nomes iguais"). A collision gets " (1)", " (2)", … appended.
// PURE + exported so it is unit-testable without the DOM: `want` against `taken` (a list of
// existing titles). Case-insensitive + trimmed.
export function uniqueTitle(want, taken) {
  const base = (want || '').trim();
  const set = new Set((taken || []).map((s) => (s || '').trim().toLowerCase()));
  if (!base || !set.has(base.toLowerCase())) return base;
  for (let n = 1; ; n++) {
    const cand = base + ' (' + n + ')';
    if (!set.has(cand.toLowerCase())) return cand;
  }
}

// Module wrapper: resolve the default title + build the taken list from the loaded decks.
// `exceptSlug` drops one deck, so renaming a deck never collides with its OWN current title.
function _uniqueTitle(base, exceptSlug) {
  const want = (base || '').trim() || t('slides.new_default_title');
  return uniqueTitle(want, _decks.filter((d) => d.slug !== exceptSlug).map((d) => d.title || ''));
}

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
      // A GEAR, not a pencil (Élder 2026-07-17): it never edited anything, it opens the
      // deck's options (renomear / duplicar / excluir), and a pencil promised editing.
      '<button class="cdx-slides-row-menu" data-act="menu" data-slug="' + _esc(d.slug) + '" ' +
        'title="' + _esc(t('slides.deck_opts')) + '" aria-label="' + _esc(t('slides.deck_opts')) + '" aria-haspopup="menu">' +
        glyphSvg('settings', { size: 15 }) + '</button>' +
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

// The Codex topbar (.bs-topbar) is sticky with a CONTENT-driven height (it varies with
// the sub-tab strip mode and the tab set), so the deck-list shell can't assume a fixed
// offset, the old hardcoded 96px overshot and left a gap above the sidebar. Measure the
// real bar bottom and pin --cdx-chrome-h to it so the sidebar sits flush under the topbar
// and stays correct as the bar changes. Skipped in focus mode, where the bar is receded
// and the shell is top:0 anyway (so the value isn't used).
function _syncChromeH() {
  if (document.body.classList.contains('cdx-slides-focus')) return;
  const bar = document.querySelector('.bs-topbar:not(.bs-topbar--presentation)');
  if (!bar) return;
  const h = Math.round(bar.getBoundingClientRect().bottom);
  if (h > 0) document.documentElement.style.setProperty('--cdx-chrome-h', h + 'px');
}

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
    notice.internal(e);
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
    notice.internal(e);
    const list = _q('#cdx-slides-list');
    if (list) list.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.error_loading')) + '</div>';
  }
}

// The per-row gear opens the deck's options. `btn` is the trigger, the menu anchors to it.
function _openDeckMenu(btn) {
  const slug = btn.getAttribute('data-slug');
  openMenu(btn, [
    { label: t('slides.rename'), onClick: () => _renameDeck(slug) },
    { label: t('slides.duplicate'), onClick: () => _duplicateDeck(slug) },
    { label: t('slides.delete'), danger: true, onClick: () => _deleteDeck(slug) },
  ]);
}

// Duplicate a deck: a new presentation row + a copy of the source's deck JSON.
//
// The copy is BYTE-FOR-BYTE, which is the point: a shared slide is stored as {id, ref}, so
// the duplicate keeps pointing at the same library entries and the two decks stay in sync
// on exactly the slides that were shared. That IS the "linked variant" of
// architecture/slides.md §10 (jurista vs advogado), for free, with "destacar" as the way to
// diverge on the few that differ. A copy that re-materialised the refs would silently break it.
//
// Image URLs are copied as-is, so both decks point at the SOURCE slug's R2 objects. That is
// how the deck JSON already works (origin-less /r2/ paths, re-absolutized on load) and it
// is why this does not re-upload anything; deleting the source could orphan the copy's
// images, which is worth knowing before deck deletion ever starts reaping R2.
async function _duplicateDeck(slug) {
  // The copy is made from the last SAVED json, so land any pending autosave first AND wait
  // for it: the gear is one mouse trip away from an edit, which is well inside the 800ms
  // window, and getDeck would otherwise race it and copy the pre-edit deck.
  await _flushPendingSave();
  const d = _deckBySlug(slug);
  // Unique, so duplicating twice gives "X (cópia)" then "X (cópia) (1)", never two identical.
  const title = _uniqueTitle(((d && d.title) || t('slides.untitled')) + ' ' + t('slides.copy_suffix'));
  const newSlug = _slugify(title) + '-' + String(Date.now()).slice(-6);
  try {
    await api.register({ slug: newSlug, title, engine: DECK_ENGINE });
    // A deck with no saved JSON yet (registered, never opened) makes the frozen load action
    // reject "not found"; treat that as an empty duplicate rather than a failed one.
    let data = null;
    try {
      const res = await api.getDeck({ slug });
      data = (res && res.data) || null;
    } catch (e) {
      if (!/not\s*found/i.test((e && e.message) || String(e))) throw e;
    }
    if (data) await api.saveDeck({ slug: newSlug, data });
    await _loadDecks();
    _openDeck(newSlug, /* fresh */ !data);
  } catch (e) {
    notice.internal(e);
  }
}

// Rename a deck: re-register the same slug with the new title (the *_presentation
// action is an upsert, so this only changes the D1 title, leaving deck JSON, R2
// images and the open editor untouched), then refresh the sidebar.
async function _renameDeck(slug) {
  const d = _deckBySlug(slug);
  const current = (d && d.title) || '';
  // eslint-disable-next-line no-alert -- lightweight guard; modal parity is a follow-up (mirrors _deleteDeck)
  const next = window.prompt(t('slides.rename_prompt'), current);
  if (next == null) return;                          // cancelled
  const typed = next.trim();
  if (!typed || typed === current) return;           // empty or unchanged -> no-op
  const title = _uniqueTitle(typed, slug);           // no two decks share a name (self excluded)
  try {
    await api.register({ slug, title, engine: DECK_ENGINE });
    await _loadDecks();                              // re-renders the sidebar; the open deck stays open
  } catch (e) {
    notice.internal(e);
    const list = _q('#cdx-slides-list');
    if (list) list.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.error_loading')) + '</div>';
  }
}

// Create a new deck. It is ALWAYS a full newDeck() (canvas + theme + logo + the 3 starter
// slides), whichever caller asks:
//   open:true  (default) -> the sidebar "+ nova apresentação": open it in the editor.
//   open:false           -> the editor's "share to a NEW deck": stay on the current slide,
//                           just register + persist the skeleton, and RETURN the row so the
//                           caller can send a slide into a deck that is already real.
// `title` is auto-named (and uniquified) when absent. The old share path registered a BARE
// ROW and let _clip._append write a skeleton-less {slides:[…]} into it; with no canvas/theme
// and none of the defaults it opened blank and off-screen (Élder 2026-07-17: "ela abre
// quebrada, a lista de slides está vazia, a visualização em branco e quase toda fora da tela").
async function _createDeck(title, { open = true } = {}) {
  const finalTitle = _uniqueTitle(title);
  const slug = _slugify(finalTitle) + '-' + String(Date.now()).slice(-6);
  const deck = newDeck();
  deck.title = finalTitle;
  try {
    await api.register({ slug, title: finalTitle, engine: DECK_ENGINE });
    if (open) {
      await _loadDecks();
      _openDeck(slug, /* fresh */ false, deck); // seeds the store AND persists the skeleton
      return { slug, title: finalTitle };
    }
    // Not opening: persist the skeleton HERE, so the deck is a real deck before the caller's
    // send appends a slide to it (otherwise _append starts from {slides:[]} and it is broken).
    await api.saveDeck({ slug, data: deck });
    await _loadDecks();
    return { slug, title: finalTitle };
  } catch (e) {
    notice.internal(e);
    if (!open) return null;
    const list = _q('#cdx-slides-list');
    if (list) list.innerHTML = '<div class="cdx-empty">' + _esc(t('slides.error_loading')) + '</div>';
    return null;
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
  // FIRST, before this function touches any module state: land whatever the deck being
  // left still has in flight. An edit made inside the autosave's 800ms window used to be
  // thrown away by _teardownEditor's clearTimeout when the user clicked another deck.
  _flushPendingSave();
  // Shared slides (track-35 C): resolve `{id, ref}` link stubs into content on load and
  // collapse them back (writing any edit through to the library) on save. Per OPEN DECK,
  // not per session: its dirty-tracking is about THIS deck's links, and a stale map from
  // a previously opened deck would make the first save skip a real write-back.
  const shared = createSharedSlides({ library: _library, message: t('slides.shr_broken') });
  const store = createCodexStore({ slug, hydrate: shared.hydrate, dehydrate: shared.dehydrate });
  const seeded = !!initialDeck;

  if (initialDeck) {
    store.setDeck(initialDeck);
  } else if (fresh) {
    store.setDeck(newDeck());
  } else {
    await store.load();
    if (!store.getDeck()) store.setDeck(newDeck());
  }

  // Debounced autosave on any later deck change (the R2 path). On a successful save we
  // ping the presenter window over the deck channel so it can toast "saved" (notes edited
  // in the presenter view round-trip here to be persisted; the ping confirms the REAL save).
  const _save = () => store.save()
    .then(() => { const a = _editorHandles && _editorHandles.app; if (a && a.channel) a.channel.postMessage({ type: 'saved' }); })
    .catch((e) => notice.internal(e));
  store.on('change', () => {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_save, 800);
  });
  // Closing this deck must FIRE the pending save, not cancel it, and only _save knows which
  // store/slug it belongs to. Assigned AFTER the flush at the top of _openDeck, never before:
  // _saveTimer is module-wide, so overwriting the handle while the PREVIOUS deck's timer is
  // still pending would flush that timer through THIS deck's save.
  _flushSave = () => { if (!_saveTimer) return null; clearTimeout(_saveTimer); _saveTimer = null; return _save(); };
  // Persist the initial deck (fresh OR imported) so it survives a reload.
  if (fresh || seeded) { try { await store.save(); } catch (_) { /* surfaced on next edit */ } }

  _teardownEditor();
  const region = _q('#cdx-slides-region');
  region.innerHTML = '<div class="cdx-slides-stage cdx-deck-editor" id="cdx-slides-stage"></div>';
  // Geometry is 100% CSS (slides.css, position:fixed region); the editor handles
  // its own canvas fit + window-resize internally. No sizing JS here.
  // Gallery storage: upload to R2 via the facade for this deck's slug; the adapter
  // falls back to a data URL when there's no slug yet or the upload fails.
  const imageStore = createImageStore({ facade: api, getSlug: () => slug });
  // Drive import reuses the BS_GOOGLE OAuth token (drive.readonly already granted); it is
  // inert until GOOGLE_PICKER_API_KEY is set, so the option simply stays disabled till then.
  ensurePickerKey(); // fetch the Picker key once per session (non-blocking; resolves before the gallery is opened)
  const drivePicker = createDrivePicker({ getApiKey: () => _pickerKey, getToken: () => (window.BS_GOOGLE ? window.BS_GOOGLE.requestToken() : null) });
  // The slide clipboard (track-35 C): Ctrl+C here, Ctrl+V in any deck, and the paste asks
  // solto-or-vinculado. onOpenDeck: when a linked paste has to turn the SOURCE slides into
  // refs and the source is the deck ON SCREEN, the editor does it in memory. Writing that
  // deck's JSON through the facade instead would be clobbered by its own next autosave.
  const clip = createSlideClip({
    facade: api,
    library: _library,
    onOpenDeck: (srcSlug, entries) => {
      const a = _editorHandles && _editorHandles.app;
      if (!a || srcSlug !== _openSlug) return false;
      return a.linkOpenSource(entries);
    },
  });
  const deckTitle = (d) => (d && d.title) || '';
  _editorHandles = editor.mount(_q('#cdx-slides-stage'), {
    store, aiService: makeWorkerAi(aiApi.chat), library: _library, imageStore, drivePicker, clip,
    slug, deckTitle: deckTitle(_deckBySlug(slug)),
    // Resolve an origin slug to its CURRENT title for the +slide Biblioteca sections, so a
    // renamed deck renames its section instead of freezing the name it had when shared.
    deckTitleOf: (s2) => deckTitle(_deckBySlug(s2)),
    // The "share to which deck?" picker: the live list, and the door to a new one without
    // leaving the slide you are on.
    deckList: () => _decks.map((d) => ({ slug: d.slug, title: d.title || '' })),
    createDeck: (title, opts) => _createDeck(title, opts),
    notify: toast.ok,
  });
  _openSlug = slug;
  _writeDeckParam(slug);
  _setDeckOpen(true);
  _renderList();
}

// Fire the open deck's pending debounced save instead of dropping it. Returns the save's
// promise (or null when nothing was pending) so a caller that READS the saved json right
// after can await it; the deck-switch callers deliberately do not, because the save closes
// over its own store + slug and completes correctly while the next deck opens, and awaiting
// would freeze the UI on every switch. Errors reach the debug pill through _save's catch.
function _flushPendingSave() {
  const flush = _flushSave;
  return flush ? flush() : null;
}

function _teardownEditor() {
  _flushPendingSave();
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

  // Pin the shell offset to the real topbar height (now + after layout settles + on
  // resize) so the deck-list sidebar sits flush under the Codex topbar, no stale gap.
  _syncChromeH();
  requestAnimationFrame(_syncChromeH);
  const onResize = () => _syncChromeH();
  window.addEventListener('resize', onResize);
  _cleanup.push(() => window.removeEventListener('resize', onResize));

  const onClick = (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.getAttribute('data-act');
      if (a === 'new') return _createDeck();
      if (a === 'import') return _pickPptx();
      if (a === 'menu') { e.stopPropagation(); return _openDeckMenu(act); }
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
  closeMenu();
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
