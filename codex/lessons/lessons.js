// lessons/lessons.js
// Codex Lessons (Aula) tab: the in-class content-run surface. Native port of the
// legacy ClassVault (classvault.js): cdx- styling, facade-only backend, every
// string via t(). Two panes inside #codex-view: a left sidebar navigator (turma
// selector + search + the turma's released items grouped into collapsible
// sections) and a main view that renders the selected item.
//
// 3A-i scope: navigator + content-type render (Markdown via the shared renderer).
// 3A-ii (this layer): the real per-type renderers (iframe slide/embed/lab, Drive
// folder/file, video, popup launcher), the bottom action bar (Abrir em janela /
// Copiar / Copiar texto), and the +A/-A text-resize. Focus mode, presets,
// favorites, and editing land in 3B (see manifest/FUTURE.md). The sidebar shell
// is kept structurally thin until the layout-contract session formalizes it.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.CTRenderer    (../backstage/js/ct-renderer.js)     Markdown/content render
//   window.CVDriveViewer (../backstage/js/cv-drive-viewer.js) Drive file embed (preferred)
//   window.BS_GOOGLE     (../backstage/js/bs-google.js)       Drive text extraction
import { lessons as api, content as contentApi, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { iconHtml as typeIconHtml } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import {
  classifyVault, sidebarSections, SECTION_ORDER, rendererStrategy,
  crumbActions, supportsTextResize, makeTextScale,
  driveFolderEmbedUrl, driveFileEmbedUrl, toVideoEmbedUrl, driveItemCanCopyText,
} from './lesson-model.js';

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
// Text-resize store: localStorage-backed, clamp/default in the pure model.
const _scale = makeTextScale(typeof localStorage !== 'undefined' ? localStorage : null);

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

// rendererStrategy 'fallback' (content/body_md) renders through the shared
// Markdown renderer; iframe/drive/video/popup types render via the helpers
// below, built on lesson-model's embed helpers (ported from classvault.js).
function _isContentType(type) { return rendererStrategy(type) === 'fallback'; }
// Strategies that fill the content host with an embed (no padding, no scroll).
const _EMBED_STRATEGIES = new Set(['iframe', 'drive_folder', 'drive_file', 'video']);

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
}

// ── Per-type renderers (ported from classvault.js ClassVault.renderers) ──────
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

// Prefer the shared Drive viewer (same embed contract as the Drive sub-tab);
// fall back to the plain /preview iframe when it is not loaded.
function _renderDriveFile(host, item, meta) {
  if (window.CVDriveViewer && typeof window.CVDriveViewer.mountInContainer === 'function') {
    host.innerHTML = '';
    window.CVDriveViewer.mountInContainer(item, host);
    return;
  }
  _renderIframe(host, driveFileEmbedUrl(meta), t('lessons.drive_no_file'));
}

// popup_url items: a describe-only launcher card. The launch lives in the bottom
// bar (Abrir em janela), not as a button floating over the viewport.
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
  if (window.CTRenderer && window.CTRenderer.render) {
    try { window.CTRenderer.render(item, host, {}); return; }
    catch (_) { host.textContent = item.body_md || ''; return; }
  }
  host.textContent = item.body_md || '';
}

// ── Bottom action bar (Abrir em janela / Copiar / Copiar texto + A-/A+) ──────
// Structural footer sibling of the scrolling content (no sticky-over-content).
// Editing (Editar) is wired in Phase 3B alongside the native editor.
function _renderBar(main, item) {
  const actions = crumbActions(item);
  const meta = item.meta_json || {};
  const canCopyDrive = item.type === 'drive_file' && driveItemCanCopyText(meta.mimeType, item.title);
  const resizable = supportsTextResize(item);
  if (!actions.length && !canCopyDrive && !resizable) return;

  let left = '';
  for (const a of actions) {
    if (a.id === 'popup') left += '<button type="button" class="cdx-btn cdx-btn-sm" data-act="popup">' + t('lessons.open_window') + '</button>';
    else if (a.id === 'copy') left += '<button type="button" class="cdx-btn cdx-btn-sm" data-act="copy">' + t('lessons.copy') + '</button>';
  }
  if (canCopyDrive) left += '<button type="button" class="cdx-btn cdx-btn-sm" data-act="copy-drive">' + t('lessons.copy_drive_text') + '</button>';

  const right = resizable
    ? '<button type="button" class="cdx-btn cdx-btn-sm" data-resize="-1" aria-label="' + _esc(t('lessons.text_smaller')) + '">A−</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-resize="1" aria-label="' + _esc(t('lessons.text_bigger')) + '">A+</button>'
    : '';

  const bar = document.createElement('div');
  bar.className = 'cdx-lessons-bar';
  bar.innerHTML = '<div class="cdx-lessons-bar-actions">' + left + '</div>' +
    '<div class="cdx-lessons-bar-resize">' + right + '</div>';
  main.appendChild(bar);

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'popup') _openPopup(crumbActions(item).find((a) => a.id === 'popup').url);
    else if (act === 'copy') _copyText(item.body_md || '');
    else if (act === 'copy-drive') _copyDriveText(item);
    else if (btn.dataset.resize) _bumpScale(Number(btn.dataset.resize) * _scale.STEP);
  });
}

function _bumpScale(delta) {
  const next = _scale.set(_scale.bump(_scale.get(), delta));
  const host = _q('#cdx-lessons-content');
  if (host) host.style.setProperty('--cdx-content-scale', String(next));
}

// Open a chrome-light popup window (ported from cv-type-registry _cvtOpenPopup).
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
  const done = () => notice.ok(t('lessons.copied'));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => _fallbackCopy(text, done));
  } else { _fallbackCopy(text, done); }
}
function _fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) { /* ignore */ }
  document.body.removeChild(ta);
  done();
}

// Copy a Drive file's text (Google Docs / .txt / .md) via BS_GOOGLE. Prompts
// Google consent inline if not yet connected (ported from classvault.js).
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
    notice.ok(t('lessons.copy_drive_done'));
  } catch (err) {
    notice.error(t('lessons.copy_drive_error') + ': ' + ((err && err.message) || err));
  }
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
