// lessons/lessons.js
// Codex Lessons (Aula) tab: the in-class content-run surface. Native port of the
// legacy ClassVault (classvault.js): cdx- styling, facade-only backend, every
// string via t(). Two panes inside #codex-view: a left sidebar navigator (turma
// selector + search + the turma's released items grouped into collapsible
// sections) and a main view that renders the selected item.
//
// 3A scope: navigator + content-type render (Markdown via the shared renderer)
// + a graceful fallback card for link/embed/drive/video types. The full per-type
// renderers, focus mode, presets, favorites, and editing land in 3A-ii / 3B
// (see manifest/FUTURE.md). The sidebar shell is kept structurally thin until the
// layout-contract session formalizes it.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.CTRenderer  (../backstage/js/ct-renderer.js)  Markdown/content render
//   window.BSToast     (../backstage/js/bs-toast.js)      optional transient toast
import { lessons as api, content as contentApi, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { iconHtml as typeIconHtml } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import { classifyVault, sidebarSections, SECTION_ORDER, rendererStrategy } from './lesson-model.js';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _turmas = [];
let _active = null;
let _vault = [];
let _activeItemId = null;
let _collapsed = new Set();      // section keys currently collapsed
let _detailCache = new Map();    // id -> full item (with body_md)
let _previewReq = 0;
let _cleanup = [];

// Vault classification, section order, and renderer dispatch are pure logic in
// ./lesson-model.js (imported above) so they can be unit-tested without the DOM.

// ── Helpers ─────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _toast(msg) { if (window.BSToast && window.BSToast.show) window.BSToast.show(msg); }
function _err(e) { return t('content.error') + ': ' + ((e && e.message) || e); }
function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

function _initials(turma) {
  const s = (turma && (turma.display_name || turma.name || turma.turma_slug)) || '?';
  return s.trim().slice(0, 2).toUpperCase();
}
function _itemIcon(item) {
  return typeIconHtml(item && item.type_icon, { size: 18 });
}

function _sectionLabel(key) { return t('lessons.section_' + key); }

// ── Sidebar ──────────────────────────────────────────────────────────────────
function _renderTurmaSelector() {
  const options = _turmas.map((tu) => {
    const key = tu.client_slug + '--' + tu.turma_slug;
    const sel = (_active && _active.client_slug === tu.client_slug && _active.turma_slug === tu.turma_slug) ? ' selected' : '';
    const label = (tu.client_display_name || tu.client_slug) + ' · ' + (tu.display_name || tu.name);
    return '<option value="' + _esc(key) + '"' + sel + '>' + _esc(label) + '</option>';
  }).join('');
  return '<div class="cdx-lessons-turma">' +
    '<span class="cdx-lessons-turma-avatar">' + _esc(_initials(_active)) + '</span>' +
    '<select class="cdx-lessons-turma-select" aria-label="' + _esc(t('lessons.turma_label')) + '">' + options + '</select>' +
  '</div>';
}

function _renderSubCard(item) {
  return '<div class="cdx-lesson-sub' + (String(item.id) === String(_activeItemId) ? ' is-active' : '') + '" data-item-id="' + _esc(String(item.id)) + '">' +
    '<span class="cdx-lesson-sub-icon">' + _itemIcon(item) + '</span>' +
    '<span class="cdx-lesson-sub-meta">' +
      '<span class="cdx-lesson-sub-type">' + _esc(item.type_label || item.type) + '</span>' +
      '<span class="cdx-lesson-sub-title">' + _esc(item.title) + '</span>' +
      (item.summary ? '<span class="cdx-lesson-sub-sum">' + _esc(item.summary) + '</span>' : '') +
    '</span>' +
  '</div>';
}

function _renderSection(section) {
  const collapsed = _collapsed.has(section.key);
  const rows = section.items.length
    ? section.items.map(_renderSubCard).join('')
    : '<div class="cdx-empty cdx-empty--inline">' + t('lessons.empty_section') + '</div>';
  return '<div class="cdx-lesson-section' + (collapsed ? ' is-collapsed' : '') + '">' +
    '<button type="button" class="cdx-lesson-section-head" data-section="' + _esc(section.key) + '" aria-expanded="' + (!collapsed) + '">' +
      '<span class="cdx-lesson-section-chev">' + (collapsed ? '›' : '⌄') + '</span>' +
      '<span class="cdx-lesson-section-label">' + _sectionLabel(section.key) + '</span>' +
      '<span class="cdx-lesson-section-count">' + section.items.length + '</span>' +
    '</button>' +
    (collapsed ? '' : '<div class="cdx-lesson-section-body">' + rows + '</div>') +
  '</div>';
}

function _renderSidebar() {
  const body = _q('.cdx-lessons-sidebar-body');
  if (!body) return;
  const sections = sidebarSections(classifyVault(_vault));
  body.innerHTML = sections.map(_renderSection).join('');
  _applySearch();
}

function _applySearch() {
  const input = _q('.cdx-lessons-search');
  const q = (input && input.value || '').toLowerCase().trim();
  const body = _q('.cdx-lessons-sidebar-body');
  if (!body) return;
  if (!q) {
    body.querySelectorAll('.cdx-lesson-sub').forEach((el) => { el.style.display = ''; });
    return;
  }
  body.querySelectorAll('.cdx-lesson-section').forEach((sec) => {
    let any = false;
    sec.querySelectorAll('.cdx-lesson-sub').forEach((el) => {
      const hit = (el.textContent || '').toLowerCase().indexOf(q) !== -1;
      el.style.display = hit ? '' : 'none';
      if (hit) any = true;
    });
    // While searching, force matching sections open so results are visible.
    if (any) {
      sec.classList.remove('is-collapsed');
      const b = sec.querySelector('.cdx-lesson-section-body');
      if (b) b.style.display = '';
    }
  });
}

// ── Main view ──────────────────────────────────────────────────────────────
function _renderEmptyMain() {
  const main = _q('.cdx-lessons-main');
  if (main) main.innerHTML = '<div class="cdx-lessons-welcome">' + t('lessons.welcome') + '</div>';
}

function _renderBreadcrumb(item) {
  const turma = _active ? ((_active.display_name || _active.name) || '') : '';
  return '<div class="cdx-lessons-crumb">' +
    '<span>' + _esc(turma) + '</span>' +
    '<span class="cdx-lessons-crumb-sep">/</span>' +
    '<span class="cdx-lessons-crumb-current">' + _esc(item.title) + '</span>' +
  '</div>';
}

// 3A renders Markdown-card types (rendererStrategy 'fallback') through the shared
// renderer; iframe/drive/video/popup types get a simple open-card placeholder
// until 3A-ii ports their full renderers (built on lesson-model's embed helpers).
function _isContentType(type) { return rendererStrategy(type) === 'fallback'; }
function _externalUrl(item) {
  return item && (item.url || item.popup_url || item.embed_url || item.external_url || item.href) || '';
}

function _renderItem(id) {
  _activeItemId = id;
  if (_viewEl) {
    _viewEl.querySelectorAll('.cdx-lesson-sub').forEach((el) =>
      el.classList.toggle('is-active', String(el.dataset.itemId) === String(id)));
  }
  const main = _q('.cdx-lessons-main');
  if (!main) return;
  const light = _vault.find((it) => String(it.id) === String(id));
  if (!light) { _renderEmptyMain(); return; }

  // Synthetic drive:/lab: ids are not yet supported in 3A; show the fallback.
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
  main.innerHTML = _renderBreadcrumb(item) +
    '<div class="cdx-lessons-content" id="cdx-lessons-content"></div>';
  const host = main.querySelector('#cdx-lessons-content');
  if (opts.loading) { host.innerHTML = '<div class="cdx-empty">' + t('content.loading') + '</div>'; return; }

  if (_isContentType(item.type) && window.CTRenderer && window.CTRenderer.render) {
    try { window.CTRenderer.render(item, host, {}); return; }
    catch (_) { host.textContent = item.body_md || ''; return; }
  }
  // Fallback card for link/embed/drive/video (full renderers arrive in 3A-ii).
  const url = _externalUrl(item);
  const openBtn = url
    ? '<a class="cdx-btn cdx-btn-primary" href="' + _esc(url) + '" target="_blank" rel="noopener">' + t('lessons.open_external') + '</a>'
    : '';
  host.innerHTML =
    '<div class="cdx-lessons-fallback">' +
      '<span class="cdx-lessons-fallback-icon">' + _itemIcon(item) + '</span>' +
      '<div class="cdx-lessons-fallback-title">' + _esc(item.title) + '</div>' +
      (item.summary ? '<p class="cdx-lessons-fallback-sum">' + _esc(item.summary) + '</p>' : '') +
      openBtn +
    '</div>';
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
    .then((d) => { _vault = (d && d.vault) || []; _renderSidebar(); _renderEmptyMain(); })
    .catch(() => { if (body) body.innerHTML = '<div class="cdx-empty">' + t('lessons.error_items') + '</div>'; });
}

// ── Shell + wiring ────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-lessons">' +
      '<aside class="cdx-lessons-sidebar">' +
        '<div class="cdx-lessons-sidebar-head" id="cdx-lessons-head"></div>' +
        '<div class="cdx-lessons-sidebar-body"><div class="cdx-empty">' + t('lessons.loading_items') + '</div></div>' +
      '</aside>' +
      '<section class="cdx-lessons-main"></section>' +
    '</div>';
  const head = _q('#cdx-lessons-head');
  head.innerHTML = _renderTurmaSelector() +
    '<div class="cdx-lessons-search-wrap">' +
      '<input type="search" class="cdx-lessons-search" placeholder="' + _esc(t('lessons.search_placeholder')) + '" autocomplete="off" spellcheck="false">' +
    '</div>';

  head.querySelector('.cdx-lessons-turma-select').addEventListener('change', (e) => {
    const u = new URL(location.href);
    u.searchParams.set('tab', 'lessons');
    u.searchParams.set('turma', e.target.value);
    location.href = u.toString();
  });
  head.querySelector('.cdx-lessons-search').addEventListener('input', _applySearch);

  // Delegated sidebar clicks: section accordion toggle + item select.
  _q('.cdx-lessons-sidebar-body').addEventListener('click', (e) => {
    const secHead = e.target.closest('.cdx-lesson-section-head');
    if (secHead) {
      const key = secHead.dataset.section;
      if (_collapsed.has(key)) _collapsed.delete(key); else _collapsed.add(key);
      _renderSidebar();
      return;
    }
    const sub = e.target.closest('.cdx-lesson-sub');
    if (sub) _renderItem(sub.dataset.itemId);
  });
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl) {
  _viewEl = viewEl;
  _turmas = [];
  _active = null;
  _vault = [];
  _activeItemId = null;
  // Every load collapses all sections except the first content section ("items").
  _collapsed = new Set(SECTION_ORDER.filter((k) => k !== 'items'));
  _detailCache = new Map();
  _previewReq = 0;
  _cleanup = [];
  _renderShellLoading();
  cohortsApi.listAllTurmas().then((d) => {
    _turmas = (d && d.turmas) || [];
    if (!_turmas.length) { _viewEl.innerHTML = '<div class="cdx-empty">' + t('lessons.no_turmas') + '</div>'; return; }
    _active = _pickActive(_turmas);
    _renderShell();
    _loadVault();
  }).catch(() => {
    _viewEl.innerHTML = '<div class="cdx-empty">' + t('lessons.error_turmas') + '</div>';
  });
}

function _renderShellLoading() {
  _viewEl.innerHTML = '<div class="cdx-empty">' + t('lessons.loading_turmas') + '</div>';
}

export function unmount() {
  _cleanup.forEach((fn) => fn());
  _cleanup = [];
  _activeItemId = null;
  _detailCache = new Map();
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
