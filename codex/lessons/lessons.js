// lessons/lessons.js
// Codex Lessons (Aula) tab: the in-class content-run surface. Native port of the
// legacy ClassVault (classvault.js): cdx- styling, facade-only backend, every
// string via t(). Two panes inside #codex-view: a left sidebar navigator and a
// main content view.
//
// Provides: sidebar + reading-controls, focus mode (F key + edge hot-zones), presets
// loader, Labs section, Perguntas live card, context-menu + inline editing (item-form.js),
// and a bottom-bar breadcrumb.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.BS_GOOGLE     (../backstage/js/bs-google.js)
import { lessons as api, content as contentApi, cohorts as cohortsApi, presets as presetsApi, cp as cpApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { iconHtml as typeIconHtml, glyphSvg } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import * as itemForm from '../content/item-form.js';
import { renderItem } from '../js/item-render.js';
import { findItem as findLabItem, getAllItems as labItems } from '../js/labs-registry.js';
import { mountInContainer as mountDriveFile } from '../js/drive-viewer.js';
import { mountPresetLoader } from '../js/preset-loader.js';
import {
  classifyVault, LESSON_SECTION_ORDER, rendererStrategy,
  crumbActions, supportsTextResize, makeTextScale,
  driveFolderEmbedUrl, toVideoEmbedUrl, driveItemCanCopyText,
  groupItemsByType, zoneClassFor,
  makeFavorites, makeSectionOrder, makeContentWidth, groupDriveByFolder, LLM_LAUNCHERS,
} from './lesson-model.js';
import { mountReorder } from '../js/pointer-reorder.js';
import { mountRail } from '../js/list-rail.js';

// ── Module state ─────────────────────────────────────────────────────────────
let _viewEl = null;
let _turmas = [];
let _active = null;
let _vault = [];
let _activeItemId = null;
let _collapsed = new Set();
let _seeded = new Set();
let _detailCache = new Map();
let _previewReq = 0;
let _cleanup = [];
const _ls = typeof localStorage !== 'undefined' ? localStorage : null;
const _scale = makeTextScale(_ls);
const _width = makeContentWidth(_ls);
const _favs = makeFavorites(_ls);
const _secOrder = makeSectionOrder(_ls);
let _reorders = [];
let _rail = null;
// The nav model, rebuilt each render into module state so the rail's `items`/`list` callbacks
// read the current vault without recomputing three times per render.
let _navEntries = [];
let _navSecs = [];
let _navSubs = [];
// Preset filter
let _presetId = null;
let _presetItems = [];
let _presetLoader = null;
// Live session (Perguntas) - loaded once on mount + on refresh click (no polling)
let _liveSession = null;
let _liveLoading = false;
// Editor (lazy-loaded types + tags)
let _types = [];
let _tags = [];
let _typesLoaded = false;
// Context menu
let _contextMenu = null;
// Focus mode (faithful port of cv-focus-mode.js semantics)
let _focusOn = false;
let _focusHotZones = [];
let _focusTopTimer = null;
let _focusSideTimer = null;
let _focusBottomTimer = null;
let _overTop = false;
let _overSide = false;
let _overBottom = false;

// All accordion section keys: used in mount reset + exclusive-open logic. Same list the
// sidebar renders from, so a new section cannot be added to one and forgotten in the other.
const ALL_SECTION_KEYS = LESSON_SECTION_ORDER;

// ── Helpers ──────────────────────────────────────────────────────────────────
import { esc as _esc } from '../js/dom.js';
function _err(e) { return t('content.error') + ': ' + ((e && e.message) || e); }
function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

function _itemIcon(item) { return typeIconHtml(item && item.type_icon, { size: 18 }); }
function _sectionLabel(key) { return t('lessons.section_' + key); }

// Locate an item: vault rows first, then synthetic lab items.
function _findItem(id) {
  let item = _vault.find((it) => String(it.id) === String(id));
  if (!item) item = findLabItem(id);
  return item || null;
}

// ── Focus mode ────────────────────────────────────────────────────────────────
// Faithful port of cv-focus-mode.js: body.cdx-lessons-focus hides the topbar +
// sidebar + bottom bar; each reveals when the cursor approaches its edge, then
// tucks away ~1.5s after the cursor leaves. The hide timer is cancelled while
// the cursor is OVER the revealed element (_overTop/_overSide/_overBottom), so it
// never collapses out from under the mouse. F toggles, Esc exits, default ON.
const _FOCUS_DELAY = 1500;
const _TOP_ZONE = 6, _LEFT_ZONE = 6, _BOTTOM_ZONE = 6;

function _focusEnable() {
  if (_focusOn) return;
  _focusOn = true;
  document.body.classList.add('cdx-lessons-focus');
  _updateTopbarPin();
  try { if (_ls) _ls.setItem('cv_focus_mode', '1'); } catch (_) {}
}

function _focusDisable() {
  if (!_focusOn) return;
  _focusOn = false;
  document.body.classList.remove(
    'cdx-lessons-focus', 'cdx-lessons-focus--top', 'cdx-lessons-focus--side',
    'cdx-lessons-focus--bottom', 'cdx-lessons-topbar-pin');
  clearTimeout(_focusTopTimer); _focusTopTimer = null;
  clearTimeout(_focusSideTimer); _focusSideTimer = null;
  clearTimeout(_focusBottomTimer); _focusBottomTimer = null;
  try { if (_ls) _ls.setItem('cv_focus_mode', '0'); } catch (_) {}
}

function _focusToggle() { if (_focusOn) _focusDisable(); else _focusEnable(); }

// Pin the topbar while focus is on AND no item is selected AND the sidebar is
// not revealed, so an empty Aula in focus mode still shows the chrome (Bundle L).
function _updateTopbarPin() {
  const shouldPin = _focusOn && !_activeItemId &&
    !document.body.classList.contains('cdx-lessons-focus--side');
  document.body.classList.toggle('cdx-lessons-topbar-pin', shouldPin);
}

function _showTop() {
  document.body.classList.add('cdx-lessons-focus--top');
  clearTimeout(_focusTopTimer);
  _focusTopTimer = setTimeout(_maybeHideTop, _FOCUS_DELAY);
}
function _maybeHideTop() {
  if (_overTop) return;
  document.body.classList.remove('cdx-lessons-focus--top');
}
function _showSide() {
  document.body.classList.add('cdx-lessons-focus--side');
  _updateTopbarPin();
  clearTimeout(_focusSideTimer);
  _focusSideTimer = setTimeout(_maybeHideSide, _FOCUS_DELAY);
}
function _maybeHideSide() {
  if (_overSide) return;
  document.body.classList.remove('cdx-lessons-focus--side');
  _updateTopbarPin();
}
function _showBottom() {
  document.body.classList.add('cdx-lessons-focus--bottom');
  clearTimeout(_focusBottomTimer);
  _focusBottomTimer = setTimeout(_maybeHideBottom, _FOCUS_DELAY);
}
function _maybeHideBottom() {
  if (_overBottom) return;
  document.body.classList.remove('cdx-lessons-focus--bottom');
}

function _onFocusMouseMove(e) {
  if (!_focusOn) return;
  if (e.clientY <= _TOP_ZONE) _showTop();
  if (e.clientX <= _LEFT_ZONE) _showSide();
  if (e.clientY >= (window.innerHeight - _BOTTOM_ZONE)) _showBottom();
}

// Thin fixed strips above any cross-origin embed iframe so the reveal still
// fires when the cursor reaches an edge over a full-bleed Drive/Slides preview.
function _focusMountHotZones() {
  const make = (extraCls, onEnter) => {
    const el = document.createElement('div');
    el.className = 'cdx-lessons-focus-hot ' + extraCls;
    el.setAttribute('aria-hidden', 'true');
    el.addEventListener('mouseenter', () => { if (_focusOn) onEnter(); });
    document.body.appendChild(el);
    _focusHotZones.push(el);
  };
  make('cdx-lessons-focus-hot--top', _showTop);
  make('cdx-lessons-focus-hot--side', _showSide);
  make('cdx-lessons-focus-hot--bottom', _showBottom);
  document.addEventListener('mousemove', _onFocusMouseMove);
  _cleanup.push(() => document.removeEventListener('mousemove', _onFocusMouseMove));
}

function _focusUnmountHotZones() {
  _focusHotZones.forEach((el) => { if (el.parentNode) el.parentNode.removeChild(el); });
  _focusHotZones = [];
  clearTimeout(_focusTopTimer); _focusTopTimer = null;
  clearTimeout(_focusSideTimer); _focusSideTimer = null;
  clearTimeout(_focusBottomTimer); _focusBottomTimer = null;
}

// Wire mouseenter/leave on a revealed element so its hide timer pauses while the
// cursor is over it (mirrors cv-focus-mode.js _wireBarHover). setOver flips the
// flag; restartTimer reschedules the hide once the cursor leaves.
function _wireFocusHover(el, getOver, setOver, restartHide) {
  if (!el) return;
  const onEnter = () => { setOver(true); };
  const onLeave = () => { setOver(false); if (_focusOn) restartHide(); };
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);
  _cleanup.push(() => {
    el.removeEventListener('mouseenter', onEnter);
    el.removeEventListener('mouseleave', onLeave);
  });
}

// ── Sidebar sections ──────────────────────────────────────────────────────────
const SECTION_GLYPHS = {
  // The reason glyphSvg learned `filled`. This was a hand-copy of the `star` key it already
  // had, forked ONLY because the library could return nothing but outlines, and a favourite
  // has to read as solid. lessons.css sizes it, hence size:null.
  favorites: glyphSvg('star', { size: null, filled: true, strokeWidth: 1.5 }),
  preset:   glyphSvg('preset', { size: null }),
  llm:      glyphSvg('sparkle', { size: null }),
  external: glyphSvg('external-link', { size: null }),
  drive:    glyphSvg('folder', { size: null }),
  items:    glyphSvg('archive', { size: null }),
  apostila: glyphSvg('book', { size: null }),
  tarefas:  glyphSvg('checklist', { size: null }),
  labs:     glyphSvg('flask', { size: null }),
};

// ── Rail-backed sidebar (experiment: Lessons consuming js/list-rail.js) ────────
// Élder 2026-07-17: "faça uma versão aplicando a sidebar de lessons usando o que o módulo tem
// para oferecer... depois a gente vê como editar de forma que fique parecido com o que tem
// hoje." So the sidebar now renders through the SHARED rail (its markup, its click/collapse/
// select wiring), using capabilities that were added to the module OFF-by-default (glyph,
// groupClass, prefix): the 10 live rails do not move, and Lessons opts in. The appearance is a
// FIRST PASS meant to be looked at and then refined in CSS, not the frozen final.

// The row's inner html (the rail wraps it in .cdx-rail-row > .cdx-rail-main). It is the SAME guts
// the old .cdx-lesson-sub card had (coloured zone, meta, favourite star), so the item card looks
// identical; only its outer element is now the rail's row instead of a bespoke div.
function _rowMain(item) {
  const zone = zoneClassFor(item.type);
  const id = String(item.id);
  const faved = _favs.has(id);
  return '<span class="cdx-lesson-sub-zone' + (zone ? ' cdx-lesson-sub-zone--' + zone : '') + '">' + _itemIcon(item) + '</span>' +
    '<span class="cdx-lesson-sub-meta">' +
      '<span class="cdx-lesson-sub-type">' + _esc(item.type_label || item.type) + '</span>' +
      '<span class="cdx-lesson-sub-title">' + _esc(item.title) + '</span>' +
      (item.summary ? '<span class="cdx-lesson-sub-sum">' + _esc(item.summary) + '</span>' : '') +
    '</span>' +
    '<button type="button" class="cdx-lesson-sub-fav' + (faved ? ' is-on' : '') + '" data-fav="' + _esc(id) + '" ' +
      'title="' + _esc(t('lessons.favorite')) + '" aria-label="' + _esc(t('lessons.favorite')) + '" aria-pressed="' + faved + '">&#9733;</button>';
}

function _llmLauncherHtml(l) {
  return '<a class="cdx-lesson-llm" href="' + _esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<img class="cdx-lesson-llm-favicon" src="https://www.google.com/s2/favicons?domain=' + _esc(l.domain) + '&sz=64" alt="" loading="lazy" referrerpolicy="no-referrer">' +
      '<span class="cdx-lesson-llm-name">' + _esc(l.name) + '</span>' +
    '</a>';
}

function _seedCollapsed(key) {
  if (!_seeded.has(key)) { _seeded.add(key); _collapsed.add(key); }
}

// Section accordion: exclusive, exactly as today (opening one closes the rest). The rail asks
// via `openId()`; the state stays `_collapsed` so the rest of the module (search, preset) keeps
// working unchanged.
const _ALWAYS_SHOWN = ['llm', 'items'];   // llm has its launchers; items is the home bucket
function _openSectionId() {
  for (const s of _navSecs) if (!_collapsed.has(String(s.id))) return s.id;
  return null;
}
function _toggleSection(key) {
  if (_collapsed.has(key)) { ALL_SECTION_KEYS.forEach((k) => _collapsed.add(k)); _collapsed.delete(key); }
  else { _collapsed.add(key); }
}

// ONE entry per (item × section it appears in). The same item shows in Favoritos AND in its type
// bucket AND in Preset, and today all of them light up together because the active state matches
// by item id. So the entry carries the item and getId stays the item's: a synthetic per-pair id
// would light only one, and the look cannot change. (This is the shape I had wrongly called a
// blocker for reuse; it was only ever about which PIXELS light, and the shared engine has none.)
function _buildNav() {
  const buckets = classifyVault(_vault);
  const entries = [];
  const subs = [];
  const push = (it, sec, sub) => entries.push({ it, sec, sub: sub || null });

  for (const it of _presetItems) push(it, 'preset');
  // Favoritos: ordered BY THE STORED LIST, not by vault order (the list is what a drag rewrites).
  const byId = new Map(_vault.map((it) => [String(it.id), it]));
  for (const id of _favs.all()) { const it = byId.get(String(id)); if (it) push(it, 'favorites'); }
  for (const it of buckets.llm) push(it, 'llm');
  for (const it of buckets.external) push(it, 'external');
  for (const it of labItems()) push(it, 'labs');
  for (const g of groupItemsByType(buckets.items)) {
    const key = 'type:' + g.typeKey;
    _seedCollapsed(key);
    subs.push({ id: key, title: (g.items[0] && g.items[0].type_label) || g.typeKey, parent: 'items' });
    for (const it of g.items) push(it, 'items', key);
  }
  for (const g of groupDriveByFolder(buckets.drive)) {
    const key = 'drive:' + g.folder;
    _seedCollapsed(key);
    subs.push({ id: key, title: g.folder, parent: 'drive' });
    for (const it of g.items) push(it, 'drive', key);
  }
  for (const it of buckets.apostila) push(it, 'apostila');
  for (const it of buckets.tarefas) push(it, 'tarefas');

  _navEntries = entries;
  _navSubs = subs;
  // Section ORDER = the admin's stored preference, falling back to Élder's 2026-06-01 order.
  _navSecs = _secOrder.get().map((k) => ({ id: k, title: _sectionLabel(k) }));
}

function _railCfg() {
  return {
    items: () => _navEntries,
    getId: (e) => e.it.id,
    selectedId: () => _activeItemId,
    onSelect: (id) => _renderItem(id),
    rowSelectIgnore: '.cdx-lesson-sub-fav',   // the star toggles, it does not select
    renderRow: (e) => ({ main: _rowMain(e.it) }),
    levels: [
      {
        of: (e) => e.sec,
        list: () => _navSecs,
        hideWhenEmpty: (g) => _ALWAYS_SHOWN.indexOf(String(g.id)) === -1,
        collapsible: true,
        exclusive: true,
        openId: _openSectionId,
        onToggle: (id) => { _toggleSection(id); _rail.render(); },
        // The opt-in capabilities. A constant `cdx-lesson-section` class (plus the per-key accent)
        // marks the TOP sections so the drag can target them without catching the sub-groups.
        glyph: (g) => SECTION_GLYPHS[g.id] || '',
        groupClass: (g) => 'cdx-lesson-section cdx-lesson-section--' + g.id,
        prefix: (g) => (g.id === 'llm' ? LLM_LAUNCHERS.map(_llmLauncherHtml).join('') : ''),
        // The LLMs badge counts its launchers too (they are prefix html, not vault rows).
        count: (g, deep) => (g.id === 'llm' ? deep + LLM_LAUNCHERS.length : deep),
        emptyText: t('lessons.empty_section'),
      },
      {
        of: (e) => e.sub,
        list: () => _navSubs,
        collapsible: true,
        collapsed: (g) => _collapsed.has(String(g.id)),
        onToggle: (id) => { if (_collapsed.has(id)) _collapsed.delete(id); else _collapsed.add(id); _rail.render(); },
      },
    ],
  };
}

function _renderSidebar() {
  _buildNav();
  if (_rail) _rail.render();
  _applySearch();
}

function _applySearch() {
  const input = _q('.cdx-lessons-search');
  const q = (input && input.value || '').toLowerCase().trim();
  const body = _q('.cdx-lessons-sidebar-body');
  if (!body) return;
  if (!q) {
    body.querySelectorAll('.cdx-rail-row').forEach((el) => { el.style.display = ''; });
    return;
  }
  // Iterate TOP sections only (the constant class the rail stamps), so a hit un-collapses the
  // section, not each type sub-group inside it.
  body.querySelectorAll('.cdx-lesson-section').forEach((sec) => {
    let any = false;
    sec.querySelectorAll('.cdx-rail-row').forEach((el) => {
      const hit = (el.textContent || '').toLowerCase().indexOf(q) !== -1;
      el.style.display = hit ? '' : 'none';
      if (hit) any = true;
    });
    if (any) sec.classList.remove('is-collapsed');
  });
}

// ── Preset loader ─────────────────────────────────────────────────────────────
function _mountPresetLoader() {
  const wrap = _q('.cdx-lessons-preset-wrap');
  if (!wrap) return;
  if (_presetLoader) { _presetLoader.destroy(); _presetLoader = null; }
  presetsApi.list({ _silent: true }).then((d) => {
    const presets = (d && d.presets) || [];
    if (!presets.length) return;
    _presetLoader = mountPresetLoader(wrap, {
      presets,
      currentPresetId: _presetId || null,
      onSelect: (preset) => {
        _presetId = preset.id;
        const ids = (preset.item_ids || []).map(String);
        _presetItems = _vault.filter((it) => ids.includes(String(it.id)));
        _collapsed.delete('preset');
        _renderSidebar();
      },
      onReset: () => {
        _presetId = null;
        _presetItems = [];
        _renderSidebar();
      },
    });
  }).catch(() => {});
}

// ── Live session (Perguntas card) ─────────────────────────────────────────────
// Faithful port of the monolith's _renderPinnedNexo: an ALWAYS-present launcher
// pinned at the sidebar bottom. No live session -> "Perguntas \xb7 Abrir sessoes",
// clicking opens the Questions home. Live -> "Perguntas \xb7 <name>" with a pulsing
// red dot, clicking opens the host view. A refresh button reloads on demand. No
// background polling: loaded once on mount + on refresh click.
// Lightning bolt from the shared glyph library (the Perguntas / live-session mark).
const _NEXO_GLYPH = glyphSvg('zap', { size: 18 });

function _renderLiveCard() {
  const el = _q('.cdx-lessons-live-card');
  if (!el) return;
  const live = _liveSession;
  const tail = live ? live.name : t('lessons.live_open_sessions');
  const titleAttr = _esc(t('nav.questions') + ' \xb7 ' + (live ? live.name : t('lessons.live_open_sessions')));
  // Wire straight into Codex (Questions ▸ Sessions), not the legacy ClassPulse host
  // page: a live session deep-links to its host via ?session=<code>; no session
  // opens the Sessions sub-tab. Removes the last Codex->backstage runtime link.
  const href = live
    ? '/codex/?tab=questions&sub=sessions&session=' + encodeURIComponent(live.id)
    : '/codex/?tab=questions&sub=sessions';
  // role="button" wrapper (not <button>) so the inner refresh <button> is valid.
  el.innerHTML =
    '<div role="button" tabindex="0" class="cdx-lessons-live cdx-lesson-section--preset" ' +
      'data-href="' + _esc(href) + '" title="' + titleAttr + '">' +
      '<span class="cdx-lessons-live-glyph">' + _NEXO_GLYPH + '</span>' +
      '<span class="cdx-lessons-live-label">' +
        '<span class="cdx-lessons-live-brand">' + _esc(t('nav.questions')) + '</span>' +
        ' \xb7 ' + _esc(tail) +
      '</span>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm cdx-lessons-live-refresh' + (_liveLoading ? ' is-loading' : '') + '" ' +
        'data-live-action="refresh" title="' + _esc(t('lessons.live_refresh')) + '" aria-label="' + _esc(t('lessons.live_refresh')) + '">' +
        '<span class="cdx-lessons-live-spin">&#8635;</span>' +
      '</button>' +
      (live ? '<span class="cdx-lessons-live-dot" aria-label="' + _esc(t('lessons.live_on')) + '"></span>' : '') +
    '</div>';

  const card = el.querySelector('.cdx-lessons-live');
  card.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-live-action="refresh"]')) return;
    const url = card.getAttribute('data-href');
    if (url) window.location.href = url;
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
  });
  const btn = el.querySelector('[data-live-action="refresh"]');
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (_liveLoading) return;
    _loadLiveSession();
  });
}

function _loadLiveSession() {
  _liveLoading = true;
  _renderLiveCard();
  cpApi.liveSession({ _silent: true })
    .then((d) => { _liveSession = (d && d.session) || null; })
    .catch((e) => { notice.internal(e); /* keep prior state on error */ })
    .then(() => { _liveLoading = false; _renderLiveCard(); });
}

// ── Main view ─────────────────────────────────────────────────────────────────
function _renderEmptyMain() {
  const main = _q('.cdx-lessons-main');
  if (!main) return;
  main.innerHTML =
    '<div class="cdx-lessons-welcome">' +
      '<p class="cdx-lessons-welcome-hint">' + t('lessons.welcome') + '</p>' +
      '<div class="cdx-lessons-welcome-keys">' +
        '<kbd class="cdx-lessons-kbd">F</kbd><span>' + t('lessons.focus_hint') + '</span>' +
      '</div>' +
    '</div>';
}

function _applyWidth(host) {
  host = host || _q('#cdx-lessons-content');
  if (!host || host.classList.contains('cdx-lessons-content--embed')) return;
  // Available width must come from the PARENT pane (uncapped), never the host:
  // the host already carries a max-width from the prior call, so reading its
  // own clientWidth would ratchet it ever-narrower and never widen back.
  const pane = _q('.cdx-lessons-main');
  const avail = (pane && pane.clientWidth) || host.clientWidth || 0;
  const px = _width.toMaxWidthPx(_width.get(), avail);
  host.classList.toggle('is-full-width', px === null);
  host.style.maxWidth = px === null ? 'none' : px + 'px';
}

function _isContentType(type) { return rendererStrategy(type) === 'fallback'; }
const _EMBED_STRATEGIES = new Set(['iframe', 'drive_folder', 'drive_file', 'video']);

function _renderItem(id) {
  _activeItemId = id;
  _updateTopbarPin();
  if (_viewEl) {
    // The rail marks the active row with .is-on via selectedId(); update it in place rather than
    // re-rendering the whole sidebar on every selection.
    _viewEl.querySelectorAll('.cdx-rail-row').forEach((el) =>
      el.classList.toggle('is-on', String(el.dataset.id) === String(id)));
  }
  const main = _q('.cdx-lessons-main');
  if (!main) return;
  const light = _findItem(id);
  if (!light) { _renderEmptyMain(); return; }
  const numeric = /^\d+$/.test(String(id));
  const cached = _detailCache.get(String(id));
  if (cached) { _paintItem(main, cached); return; }
  _paintItem(main, light, { loading: numeric && _isContentType(light.type) });
  if (numeric && _isContentType(light.type)) {
    const reqId = ++_previewReq;
    contentApi.getItem({ id }).then((d) => {
      if (reqId !== _previewReq) return;
      const full = (d && d.item) || light;
      _detailCache.set(String(id), full);
      if (String(_activeItemId) === String(id)) _paintItem(main, full);
    }).catch((e) => { if (reqId === _previewReq) notice.internal(_err(e)); });
  }
}

function _paintItem(main, item, opts) {
  opts = opts || {};
  // Content host only at the top; crumb lives in the bottom bar.
  main.innerHTML = '<div class="cdx-lessons-content" id="cdx-lessons-content"></div>';
  const host = main.querySelector('#cdx-lessons-content');
  if (opts.loading) {
    host.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>';
    _renderBar(main, item);
    return;
  }
  const strategy = rendererStrategy(item.type);
  if (_EMBED_STRATEGIES.has(strategy)) host.classList.add('cdx-lessons-content--embed');
  const meta = item.meta_json || {};
  if (strategy === 'iframe') _renderIframe(host, meta.url || '', t('lessons.embed_no_url'));
  else if (strategy === 'drive_folder') _renderIframe(host, driveFolderEmbedUrl(meta), t('lessons.drive_no_folder'));
  else if (strategy === 'drive_file') _renderDriveFile(host, item, meta);
  else if (strategy === 'video') _renderIframe(host, toVideoEmbedUrl(meta.url || ''), t('lessons.video_unrecognized'));
  else if (strategy === 'popup') _renderPopupCard(host, item, meta);
  else _renderContent(host, item);
  _renderBar(main, item);
  if (supportsTextResize(item)) host.style.setProperty('--cdx-content-scale', String(_scale.get()));
  _applyWidth(host);
}

// ── Per-type renderers ────────────────────────────────────────────────────────
function _renderIframe(host, url, emptyMsg) {
  if (!url) { host.innerHTML = '<div class="cdx-empty">' + emptyMsg + '</div>'; return; }
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'cdx-lessons-iframe-wrap';
  const iframe = document.createElement('iframe');
  iframe.className = 'cdx-lessons-iframe';
  iframe.src = url;
  iframe.setAttribute('allow', 'autoplay; encrypted-media; clipboard-write; fullscreen');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  wrap.appendChild(iframe);
  host.appendChild(wrap);
}

function _renderDriveFile(host, item, meta) {
  // The Codex drive-viewer owns the preview URL contract + empty-state handling.
  host.innerHTML = '';
  mountDriveFile(item, host);
}

function _renderPopupCard(host, item, meta) {
  const url = meta.url || '';
  host.innerHTML =
    '<div class="cdx-lessons-launcher">' +
      '<div class="cdx-lessons-launcher-title">' + _esc(item.title) + '</div>' +
      (item.summary ? '<p class="cdx-lessons-launcher-sum">' + _esc(item.summary) + '</p>' : '') +
      '<p class="cdx-lessons-launcher-hint">' + t('lessons.popup_hint') + '</p>' +
      (url ? '<p class="cdx-lessons-launcher-url">' + _esc(url) + '</p>' : '') +
    '</div>';
}

function _renderContent(host, item) {
  try { renderItem(item, host, {}); }
  catch (e) {
    if (window.bsLog) window.bsLog('lessons _renderContent: ' + (e && e.message || e), 'error');
    host.textContent = item.body_md || '';
  }
}

// ── Bottom bar: crumb + actions + resize ──────────────────────────────────────
// Replaces the separate top crumb (G21). The turma/title crumb lives on the left,
// action buttons in the center, and resize (A-/A+) on the right.
function _renderBar(main, item) {
  const actions = crumbActions(item);
  const meta = item.meta_json || {};
  const canCopyDrive = item.type === 'drive_file' && driveItemCanCopyText(meta.mimeType, item.title);
  const resizable = supportsTextResize(item);
  const isEditable = /^\d+$/.test(String(item.id));

  const turma = _active ? (_active.display_name || _active.name || '') : '';
  const crumbHtml =
    '<div class="cdx-lessons-bar-crumb">' +
      '<span class="cdx-lessons-bar-crumb-turma">' + _esc(turma) + '</span>' +
      '<span class="cdx-lessons-bar-crumb-sep">/</span>' +
      '<span class="cdx-lessons-bar-crumb-item">' + _esc(item.title) + '</span>' +
    '</div>';

  let actionsHtml = '';
  for (const a of actions) {
    if (a.id === 'popup') actionsHtml += '<button type="button" class="cdx-btn cdx-btn-sm" data-act="popup">' + t('lessons.open_window') + '</button>';
    else if (a.id === 'copy') actionsHtml += '<button type="button" class="cdx-btn cdx-btn-sm" data-act="copy">' + t('lessons.copy') + '</button>';
  }
  if (canCopyDrive) actionsHtml += '<button type="button" class="cdx-btn cdx-btn-sm" data-act="copy-drive">' + t('lessons.copy_drive_text') + '</button>';
  if (isEditable) actionsHtml += '<button type="button" class="cdx-btn cdx-btn-sm" data-act="edit">' + t('lessons.edit') + '</button>';

  const resizeHtml = resizable
    ? '<button type="button" class="cdx-btn cdx-btn-sm" data-resize="-1" aria-label="' + _esc(t('lessons.text_smaller')) + '">A-</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-resize="1" aria-label="' + _esc(t('lessons.text_bigger')) + '">A+</button>'
    : '';

  const bar = document.createElement('div');
  bar.className = 'cdx-lessons-bar';
  bar.innerHTML =
    crumbHtml +
    '<div class="cdx-lessons-bar-actions">' + actionsHtml + '</div>' +
    '<div class="cdx-lessons-bar-resize">' + resizeHtml + '</div>';
  main.appendChild(bar);

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'popup') _openPopup(crumbActions(item).find((a) => a.id === 'popup').url);
    else if (act === 'copy') _copyText(item.body_md || '');
    else if (act === 'copy-drive') _copyDriveText(item);
    else if (act === 'edit') _openEditor(item);
    else if (btn.dataset.resize) _bumpScale(Number(btn.dataset.resize) * _scale.STEP);
  });

  // Focus-mode: pause the bottom-bar hide timer while the cursor is over it.
  // The bar is recreated each paint, so this re-wires per item (cleaned on unmount).
  bar.addEventListener('mouseenter', () => { _overBottom = true; });
  bar.addEventListener('mouseleave', () => {
    _overBottom = false;
    if (_focusOn) { clearTimeout(_focusBottomTimer); _focusBottomTimer = setTimeout(_maybeHideBottom, _FOCUS_DELAY); }
  });
}

function _bumpScale(delta) {
  const next = _scale.set(_scale.bump(_scale.get(), delta));
  const host = _q('#cdx-lessons-content');
  if (host) host.style.setProperty('--cdx-content-scale', String(next));
}

function _openPopup(url) {
  if (!url) return null;
  const w = Math.max(800, Math.floor((window.outerWidth || window.innerWidth) - 80));
  const h = Math.max(600, Math.floor((window.outerHeight || window.innerHeight) - 80));
  const left = (typeof window.screenX === 'number' ? window.screenX : 0) + 40;
  const top = (typeof window.screenY === 'number' ? window.screenY : 0) + 40;
  const features = ['popup=yes', 'width=' + w, 'height=' + h, 'left=' + left, 'top=' + top,
    'toolbar=no', 'menubar=no', 'location=yes', 'resizable=yes', 'scrollbars=yes'].join(',');
  const popup = window.open(url, '_blank', features);
  if (!popup) { notice.warn(t('lessons.popup_blocked')); return null; }
  if (typeof popup.focus === 'function') popup.focus();
  return popup;
}

function _copyText(text) {
  if (!text) return;
  const done = () => toast.ok(t('lessons.copied'));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => _fallbackCopy(text, done));
  } else { _fallbackCopy(text, done); }
}
function _fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
  done();
}

async function _copyDriveText(item) {
  const meta = item.meta_json || {};
  const fileId = meta.file_id;
  if (!fileId) return;
  if (!window.BS_GOOGLE) { notice.warn(t('lessons.drive_unavailable')); return; }
  if (!BS_GOOGLE.isAuthed()) {
    try {
      await BS_GOOGLE.requestToken({ prompt: 'consent' });
      if (typeof BS_GOOGLE.init === 'function') BS_GOOGLE.init();
    } catch (_) { notice.warn(t('lessons.copy_drive_need_google')); return; }
    if (!BS_GOOGLE.isAuthed()) { notice.warn(t('lessons.copy_drive_need_google')); return; }
  }
  try {
    const text = await BS_GOOGLE.drive.getText(fileId, meta.mimeType || '');
    await navigator.clipboard.writeText(text);
    toast.ok(t('lessons.copy_drive_done'));
  } catch (err) {
    toast.err(t('lessons.copy_drive_error') + ': ' + ((err && err.message) || err));
  }
}

// ── Context menu ──────────────────────────────────────────────────────────────
function _openContextMenu(item, x, y) {
  _closeContextMenu();
  const isFaved = _favs.has(String(item.id));
  const isEditable = /^\d+$/.test(String(item.id));
  const menu = document.createElement('div');
  menu.className = 'cdx-lessons-ctx';
  menu.setAttribute('role', 'menu');
  let html = '';
  if (isEditable) {
    html += '<button type="button" class="cdx-lessons-ctx-item" data-ctx="edit">' + _esc(t('lessons.edit')) + '</button>';
  }
  html += '<button type="button" class="cdx-lessons-ctx-item" data-ctx="fav">' +
    _esc(isFaved ? t('lessons.unfavorite') : t('lessons.favorite')) + '</button>';
  menu.innerHTML = html;
  const vw = window.innerWidth || 800;
  const vh = window.innerHeight || 600;
  menu.style.cssText = 'position:fixed;left:' + Math.min(x, vw - 160) + 'px;top:' + Math.min(y, vh - 80) + 'px';
  document.body.appendChild(menu);
  _contextMenu = menu;
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ctx]');
    if (!btn) return;
    const ctx = btn.dataset.ctx;
    _closeContextMenu();
    if (ctx === 'edit') _openEditor(item);
    if (ctx === 'fav') { _favs.toggle(String(item.id)); _renderSidebar(); }
  });
  const onOut = (e) => {
    if (!menu.contains(e.target)) {
      _closeContextMenu();
      document.removeEventListener('mousedown', onOut, true);
    }
  };
  document.addEventListener('mousedown', onOut, true);
  _cleanup.push(() => document.removeEventListener('mousedown', onOut, true));
}

function _closeContextMenu() {
  if (_contextMenu && _contextMenu.parentNode) _contextMenu.parentNode.removeChild(_contextMenu);
  _contextMenu = null;
}

// ── Item editor ───────────────────────────────────────────────────────────────
function _ensureTypesAndTags() {
  if (_typesLoaded) return Promise.resolve();
  return Promise.all([
    contentApi.listTypes().then((d) => { _types = (d && d.types) || []; }).catch((e) => { notice.internal(e); }),
    contentApi.listTags().then((d) => { _tags = (d && d.tags) || []; }).catch((e) => { notice.internal(e); }),
  ]).then(() => { _typesLoaded = true; });
}

function _openEditor(item) {
  _ensureTypesAndTags().then(() => {
    const main = _q('.cdx-lessons-main');
    if (!main) return;
    main.innerHTML = '<div class="cdx-lessons-editor-host"></div>';
    const host = main.querySelector('.cdx-lessons-editor-host');
    const handle = itemForm.mount(host, {
      item,
      types: _types,
      tags: _tags,
      titleLabel: t('lessons.edit'),
      closeLabel: t('cohorts.close'),
      onSave: (saved) => {
        const idx = _vault.findIndex((it) => String(it.id) === String(saved.id));
        if (idx >= 0) _vault[idx] = Object.assign({}, _vault[idx], saved);
        _detailCache.set(String(saved.id), saved);
        handle.destroy();
        _renderItem(String(saved.id));
      },
      onCancel: () => {
        handle.destroy();
        if (_activeItemId) _renderItem(_activeItemId); else _renderEmptyMain();
      },
    });
  });
}

// ── Load ──────────────────────────────────────────────────────────────────────
function _pickActive(turmas) {
  const urlSel = new URLSearchParams(location.search).get('turma') || '';
  const sep = urlSel.indexOf('--');
  const c = sep > 0 ? urlSel.slice(0, sep) : '';
  const tu = sep > 0 ? urlSel.slice(sep + 2) : '';
  return turmas.find((x) => x.client_slug === c && x.turma_slug === tu) || turmas[0];
}

function _loadVault() {
  const body = _q('.cdx-lessons-sidebar-body');
  if (body) body.innerHTML = '<div class="cdx-empty">' + t('lessons.loading_items') + '</div>';
  if (!_active) return Promise.resolve();
  return api.getCodexView({ client_slug: _active.client_slug, turma_slug: _active.turma_slug })
    .then((d) => {
      _vault = (d && d.vault) || [];
      _renderSidebar();
      _renderEmptyMain();
      _mountPresetLoader();
    })
    .catch((e) => {
      notice.internal(e);
      if (body) body.innerHTML = '<div class="cdx-empty">' + t('lessons.error_items') + '</div>';
    });
}

// ── Reading controls ("Aa" popover) ──────────────────────────────────────────
function _wireReadingControls(btn) {
  if (!btn) return;
  let pop = document.getElementById('cdx-lessons-display-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'cdx-lessons-display-pop';
    pop.className = 'cdx-lessons-display-pop';
    pop.hidden = true;
    pop.innerHTML =
      '<div class="cdx-lessons-pop-row">' +
        '<span class="cdx-lessons-pop-label">' + _esc(t('lessons.text_size')) + '</span>' +
        '<div class="cdx-lessons-pop-fontbtns">' +
          '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm cdx-lessons-pop-fbtn" data-act="font-down" title="' + _esc(t('lessons.text_smaller')) + '">A&minus;</button>' +
          '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm cdx-lessons-pop-fbtn" data-act="font-up" title="' + _esc(t('lessons.text_bigger')) + '">A+</button>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-lessons-pop-row">' +
        '<span class="cdx-lessons-pop-label">' + _esc(t('lessons.width')) + '</span>' +
        '<input type="range" class="cdx-lessons-pop-width" min="0" max="100" step="1" aria-label="' + _esc(t('lessons.width')) + '">' +
      '</div>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-lessons-pop-reset" data-act="reset">' + _esc(t('lessons.reset_default')) + '</button>';
    document.body.appendChild(pop);
    const range = pop.querySelector('.cdx-lessons-pop-width');
    pop.querySelector('[data-act="font-down"]').addEventListener('click', () => _bumpScale(-_scale.STEP));
    pop.querySelector('[data-act="font-up"]').addEventListener('click', () => _bumpScale(_scale.STEP));
    range.addEventListener('input', () => { _width.set(parseInt(range.value, 10) / 100); _applyWidth(); });
    pop.querySelector('[data-act="reset"]').addEventListener('click', () => {
      _scale.set(1);
      const h = _q('#cdx-lessons-content');
      if (h) h.style.setProperty('--cdx-content-scale', '1');
      _width.set(_width.DEFAULT);
      _applyWidth();
      range.value = String(Math.round(_width.get() * 100));
    });
  }
  function position() {
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, r.right - pop.offsetWidth) + 'px';
  }
  function onDoc(e) { if (btn.contains(e.target) || pop.contains(e.target)) return; close(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open() {
    pop.querySelector('.cdx-lessons-pop-width').value = String(Math.round(_width.get() * 100));
    pop.hidden = false;
    position();
    document.addEventListener('click', onDoc, true);
    document.addEventListener('keydown', onKey, true);
  }
  function close() {
    pop.hidden = true;
    document.removeEventListener('click', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
  }
  btn.addEventListener('click', () => (pop.hidden ? open() : close()));
}

// ── Shell + wiring ────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-lessons">' +
      '<aside class="cdx-lessons-sidebar">' +
        '<div class="cdx-lessons-sidebar-head" id="cdx-lessons-head"></div>' +
        '<div class="cdx-lessons-sidebar-body"><div class="cdx-empty">' + t('lessons.loading_items') + '</div></div>' +
        '<div class="cdx-lessons-live-card"></div>' +
      '</aside>' +
      '<section class="cdx-lessons-main"></section>' +
    '</div>';

  const head = _q('#cdx-lessons-head');
  head.innerHTML =
    '<div class="cdx-lessons-head-row">' +
      '<div class="cdx-lessons-search-wrap">' +
        '<input type="search" class="cdx-lessons-search" placeholder="' + _esc(t('lessons.search_placeholder')) + '" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<button type="button" class="cdx-btn cdx-lessons-aa-btn" title="' + _esc(t('lessons.display_controls')) + '" aria-label="' + _esc(t('lessons.display_controls')) + '">Aa</button>' +
    '</div>' +
    '<div class="cdx-lessons-preset-wrap"></div>';

  head.querySelector('.cdx-lessons-search').addEventListener('input', _applySearch);
  _wireReadingControls(head.querySelector('.cdx-lessons-aa-btn'));

  // F / Escape: focus mode toggle
  const onKey = (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (e.key === 'Escape' && _focusOn) { _focusDisable(); return; }
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      _focusToggle();
    }
  };
  document.addEventListener('keydown', onKey);
  _cleanup.push(() => document.removeEventListener('keydown', onKey));

  // Focus-mode hover: pause each element's hide timer while the cursor is over it.
  _wireFocusHover(document.querySelector('.bs-topbar'),
    () => _overTop, (v) => { _overTop = v; }, () => { clearTimeout(_focusTopTimer); _focusTopTimer = setTimeout(_maybeHideTop, _FOCUS_DELAY); });
  _wireFocusHover(_q('.cdx-lessons-sidebar'),
    () => _overSide, (v) => { _overSide = v; }, () => { clearTimeout(_focusSideTimer); _focusSideTimer = setTimeout(_maybeHideSide, _FOCUS_DELAY); });

  // Restore persisted focus-mode preference (default: on). Skip on phones: focus
  // mode reveals the chrome via mouse-edge hotzones (no touch equivalent), so on a
  // phone it would tuck the topbar + sidebar out of reach. Below the drawer
  // breakpoint the sidebar is the hamburger drawer instead.
  let storedFocus = null;
  try { storedFocus = _ls && _ls.getItem('cv_focus_mode'); } catch (_) {}
  if (storedFocus !== '0' && window.innerWidth > 700) _focusEnable();

  const sidebarBody = _q('.cdx-lessons-sidebar-body');

  // Mount the shared rail INTO the sidebar body. The rail now owns section/sub collapse and
  // row selection (was the delegated handler below); the module keeps only what the rail has no
  // opinion about: the favourite star, the context menu, the drag.
  _rail = mountRail(sidebarBody, _railCfg());

  // Favourite star: the rail ignores it for selection (rowSelectIgnore); toggling + re-rendering
  // is the module's, since favourites is a section the rail draws but does not own.
  sidebarBody.addEventListener('click', (e) => {
    const fav = e.target.closest('.cdx-lesson-sub-fav');
    if (!fav) return;
    e.stopPropagation();
    _favs.toggle(fav.dataset.fav);
    _renderSidebar();
  });

  // Drag (Élder 2026-07-17, "pode inserir drag tb"): the two lists whose order is the ADMIN'S and
  // nobody else's, so both persist client-side, no Worker action. Reordering items inside a
  // section would be a shared, per-turma fact (a D1 column + a new action) and is not approved.
  //
  // Targets the rail's markup now. The top sections carry a constant `.cdx-lesson-section` class
  // (the rail's groupClass), which is what lets the section drag pick them WITHOUT catching the
  // type/folder sub-groups (also .cdx-rail-sec, but without that class). `handleSel` requires the
  // head to be a DIRECT child of a top section, so a sub-group head never starts a section drag.
  // Neither re-renders on drop: the DOM already is the new order.
  _reorders.push(mountReorder(sidebarBody, {
    itemSel: '.cdx-lesson-section',
    handleSel: '.cdx-lesson-section > .cdx-rail-sec-h',
    listSel: '.cdx-rail-body',
    idAttr: 'data-sec',
    onReorder: (keys) => { _secOrder.set(keys); },
  }));
  _reorders.push(mountReorder(sidebarBody, {
    itemSel: '.cdx-rail-row',
    listSel: '.cdx-rail-sec[data-sec="favorites"] .cdx-rail-seclist',
    idAttr: 'data-id',
    onReorder: (ids) => { _favs.reorder(ids); },
  }));

  // Context menu on sidebar items
  sidebarBody.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.cdx-rail-row');
    if (!row) return;
    e.preventDefault();
    const item = _findItem(row.dataset.id);
    if (!item) return;
    _openContextMenu(item, e.clientX, e.clientY);
  });
}

// ── Tab contract ──────────────────────────────────────────────────────────────
const APP_CLASS = 'bs-app--classvault';

export function mount(viewEl) {
  _viewEl = viewEl;
  const app = document.getElementById('screen-app');
  if (app) app.classList.add(APP_CLASS);
  _turmas = [];
  _active = null;
  _vault = [];
  _activeItemId = null;
  _presetId = null;
  _presetItems = [];
  _liveSession = null;
  _liveLoading = false;
  _typesLoaded = false;
  _overTop = _overSide = _overBottom = false;
  const openKey = _favs.all().length ? 'favorites' : 'items';
  _collapsed = new Set(ALL_SECTION_KEYS.filter((k) => k !== openKey));
  _seeded = new Set();
  _detailCache = new Map();
  _previewReq = 0;
  _cleanup = [];
  _reorders = [];
  if (_rail) { _rail.destroy(); _rail = null; }
  _navEntries = []; _navSecs = []; _navSubs = [];
  _focusMountHotZones();
  _renderShellLoading();
  cohortsApi.listAllTurmas().then((d) => {
    _turmas = (d && d.turmas) || [];
    if (!_turmas.length) {
      _viewEl.innerHTML = '<div class="cdx-empty">' + t('lessons.no_turmas') + '</div>';
      return;
    }
    _active = _pickActive(_turmas);
    _renderShell();
    _renderLiveCard();
    _loadLiveSession();
    _loadVault();
  }).catch((e) => {
    notice.internal(e);
    _viewEl.innerHTML = '<div class="cdx-empty">' + t('lessons.error_turmas') + '</div>';
  });
}

function _renderShellLoading() {
  _viewEl.innerHTML = '<div class="cdx-empty">' + t('lessons.loading_turmas') + '</div>';
}

export function unmount() {
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  _reorders.forEach((r) => r.destroy());
  _reorders = [];
  if (_rail) { _rail.destroy(); _rail = null; }
  _navEntries = []; _navSecs = []; _navSubs = [];
  _activeItemId = null;
  _detailCache = new Map();
  _liveSession = null;
  _liveLoading = false;
  _focusDisable();
  _focusUnmountHotZones();
  _overTop = _overSide = _overBottom = false;
  if (_presetLoader) { _presetLoader.destroy(); _presetLoader = null; }
  _presetId = null;
  _presetItems = [];
  _closeContextMenu();
  const app = document.getElementById('screen-app');
  if (app) app.classList.remove(APP_CLASS);
  const pop = document.getElementById('cdx-lessons-display-pop');
  if (pop) pop.remove();
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
