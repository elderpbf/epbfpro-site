// questions/sessions.js
// Codex Questions -> Sessions sub-tab (native, host/admin). A faithful re-port of
// the legacy ClassPulse `panel-sessions`: a floating left-edge sidebar picker
// (hidden by default, revealed by pointing at the left edge, the ClassVault
// cv-sm pattern) listing session cards, plus a main area that hosts the selected
// session. Live hosting itself is the Q2 surface; here the main area carries the
// session lifecycle (Iniciar/Encerrar), a bridge to the legacy host, the
// per-session stats overlay, and a protected delete at the bottom of the page.
// All data through the facade; strings through t(); errors through notice.
import { questions as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';

let _viewEl = null;
let _cleanup = [];
let _sessions = [];
let _selectedCode = null;
let _sidebarPinned = true;  // open + pinned until the first session is picked
let _overSidebar = false;
let _hideTimer = null;

const REVEAL_ZONE = 6;     // px from the left edge that triggers the reveal
const HIDE_DELAY = 1500;   // ms after the cursor leaves the rail before it hides

// Bridge to the standalone legacy host for a session. Temporary until the native
// live host lands (Q2). A plain navigation link, never an iframe.
export function hostHref(code) {
  return '/backstage/classpulse/host.html?code=' + encodeURIComponent(code || '');
}

// Server accuracy is a 0..1 ratio (or null when unscored). Render as a rounded
// integer percent, or null so callers can show a non-numeric state.
export function pct(accuracy) {
  if (accuracy === null || accuracy === undefined) return null;
  return Math.round(accuracy * 100);
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function _on(el, evt, fn) {
  if (!el) return;
  el.addEventListener(evt, fn);
  _cleanup.push(() => el.removeEventListener(evt, fn));
}

// Mirror the legacy date column: pt-BR locale date, blank for missing/invalid.
function _fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

// ── Sidebar reveal (cv-sm pattern) ──────────────────────────
function _layout() { return _viewEl && _viewEl.querySelector('#cdx-sessions-layout'); }

function _openSidebar() {
  const l = _layout();
  if (!l) return;
  l.classList.add('cdx-sm--open');
  if (_sidebarPinned) return; // pinned: stays open, no hide timer
  clearTimeout(_hideTimer);
  _hideTimer = setTimeout(_maybeHide, HIDE_DELAY);
}

function _closeSidebar() {
  const l = _layout();
  if (!l) return;
  clearTimeout(_hideTimer);
  if (_sidebarPinned) return; // pinned: refuse to close until a session is picked
  l.classList.remove('cdx-sm--open');
}

function _maybeHide() { if (!_overSidebar) _closeSidebar(); }

// ── Session list (the picker) ───────────────────────────────
function _card(s) {
  const open = s.status === 'open';
  const sel = (s.code === _selectedCode) ? ' is-selected' : '';
  const live = open
    ? '<span class="cdx-live"><span class="cdx-live-dot"></span><span class="cdx-live-label">' + t('questions.sessions_live_label') + '</span></span>'
    : '';
  return '<div class="cdx-session-card' + sel + '" data-act="select" data-code="' + _esc(s.code) + '">' +
    '<div class="cdx-session-code">' + _esc(s.code) + '</div>' +
    '<div class="cdx-session-info">' +
      '<div class="cdx-session-title">' + _esc(s.title || t('questions.sessions_untitled')) + '</div>' +
      '<div class="cdx-session-meta">' + _fmtDate(s.created_at) + '</div>' +
    '</div>' +
    live +
  '</div>';
}

function _renderList() {
  if (!_viewEl) return;
  const list = _viewEl.querySelector('#cdx-sessions-list');
  if (!list) return;
  list.innerHTML = _sessions.length
    ? _sessions.map(_card).join('')
    : '<div class="cdx-sessions-empty"><div class="cdx-sessions-empty-icon">\u{1F4CB}</div><p>' + t('questions.sessions_empty') + '</p></div>';
}

async function _load() {
  if (!_viewEl) return;
  const list = _viewEl.querySelector('#cdx-sessions-list');
  if (!list) return;
  list.innerHTML = '<div class="cdx-sessions-loading">' + t('questions.sessions_loading') + '</div>';
  let res;
  try { res = await api.listSessions(); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl || list !== _viewEl.querySelector('#cdx-sessions-list')) return; // unmounted/changed
  _sessions = (res && res.sessions) || [];
  if (_selectedCode && !_sessions.some((s) => s.code === _selectedCode)) _selectedCode = null;
  _renderList();
  _renderMain();
}

// ── Main area: placeholder, or the selected session's host surface ──
function _renderMain() {
  const main = _viewEl && _viewEl.querySelector('#cdx-sessions-detail');
  if (!main) return;
  const s = _sessions.find((x) => x.code === _selectedCode);
  if (!s) {
    main.innerHTML = '<div class="cdx-sessions-placeholder">' + t('questions.sessions_placeholder') + '</div>';
    return;
  }
  const open = s.status === 'open';
  const statusKey = open ? 'questions.sessions_status_open' : 'questions.sessions_status_closed';
  // No "Reabrir": Iniciar when closed, Encerrar when live, where they live now
  // (the host bar). Iniciar maps to reopen_session under the hood.
  const lifecycle = open
    ? '<button class="cdx-btn cdx-btn-danger" data-act="close" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_close') + '</button>'
    : '<button class="cdx-btn cdx-btn-primary" data-act="start" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_start') + '</button>';
  main.innerHTML =
    '<div class="cdx-session-detail">' +
      '<div class="cdx-session-detail-head">' +
        '<h2 class="cdx-session-detail-title">' + _esc(s.title || t('questions.sessions_untitled')) + '</h2>' +
        '<span class="cdx-session-code">' + _esc(s.code) + '</span>' +
        '<span class="cdx-session-status cdx-session-status--' + (open ? 'open' : 'closed') + '">' + t(statusKey) + '</span>' +
      '</div>' +
      '<div class="cdx-session-detail-actions">' +
        lifecycle +
        '<a class="cdx-btn" href="' + hostHref(s.code) + '">' + t('questions.sessions_host') + '</a>' +
        '<button class="cdx-btn" data-act="stats" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_stats') + '</button>' +
      '</div>' +
      // Protected delete, pushed to the bottom of the page, out of the way.
      '<div class="cdx-session-danger" id="cdx-session-danger">' +
        '<button class="cdx-btn cdx-btn-danger" data-act="delete" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_delete') + '</button>' +
      '</div>' +
    '</div>';
}

// ── Per-session stats overlay (legacy openStats) ────────────
function _accBar(accuracy, totalAnswers) {
  const p = pct(accuracy);
  if (p === null) {
    return '<div class="cdx-stats-bar cdx-stats-bar--na">' +
      (totalAnswers || 0) + ' ' + t('questions.stats_answers') + '</div>';
  }
  return '<div class="cdx-stats-bar"><div class="cdx-stats-bar-fill" style="width:' + p +
    '%"></div><span class="cdx-stats-bar-text">' + p + '% ' + t('questions.stats_accuracy') + '</span></div>';
}

function _statsQCard(q) {
  return '<div class="cdx-stats-q">' +
    '<div class="cdx-stats-q-text">' + _esc(q.text) + '</div>' +
    '<div class="cdx-stats-q-meta">' + (q.total_answers || 0) + ' ' + t('questions.stats_answers') + '</div>' +
    _accBar(q.accuracy, q.total_answers) +
  '</div>';
}

function _statsHead(s) {
  return '<div class="cdx-session-stats-head">' +
    '<div>' +
      '<h2 class="cdx-session-stats-title">' + _esc(s.title || t('questions.sessions_untitled')) + '</h2>' +
      '<span class="cdx-session-code">' + _esc(s.code) + '</span>' +
    '</div>' +
    '<button class="cdx-btn" data-act="stats-close" type="button">' + t('questions.sessions_stats_close') + '</button>' +
  '</div>';
}

async function _openStats(code) {
  const main = _viewEl && _viewEl.querySelector('#cdx-sessions-detail');
  if (!main) return;
  const s = _sessions.find((x) => x.code === code) || { code };
  main.innerHTML = '<div class="cdx-session-stats">' + _statsHead(s) +
    '<div class="cdx-stats-loading">' + t('questions.sessions_stats_loading') + '</div></div>';

  let data;
  try { data = await api.sessionStats({ code }); } catch (e) { notice.internal(e); data = null; }
  if (!_viewEl || main !== _viewEl.querySelector('#cdx-sessions-detail')) return;

  let body;
  if (!data || !data.ok) {
    body = '<div class="cdx-stats-empty">' + t('questions.sessions_stats_empty') + '</div>';
  } else {
    const kpis = '<div class="cdx-stats-kpis">' +
      '<div class="cdx-kpi"><div class="cdx-kpi-val">' + (data.total_questions || 0) + '</div><div class="cdx-kpi-label">' + t('questions.sessions_stats_kpi_q') + '</div></div>' +
      '<div class="cdx-kpi"><div class="cdx-kpi-val">' + (data.unique_students || 0) + '</div><div class="cdx-kpi-label">' + t('questions.sessions_stats_kpi_s') + '</div></div>' +
    '</div>';
    const mostMissed = data.most_missed
      ? '<div class="cdx-session-stats-mm"><strong>' + t('questions.sessions_stats_most_missed') + ':</strong> ' +
          _esc(data.most_missed.text) + ' (' + pct(data.most_missed.accuracy) + '% ' + t('questions.stats_accuracy') + ')</div>'
      : '';
    const qlist = (data.questions && data.questions.length)
      ? '<div class="cdx-stats-qlist">' + data.questions.map(_statsQCard).join('') + '</div>'
      : '<div class="cdx-stats-empty">' + t('questions.sessions_stats_empty') + '</div>';
    body = kpis + mostMissed + qlist;
  }
  main.innerHTML = '<div class="cdx-session-stats">' + _statsHead(s) + body + '</div>';
}

// ── Delete (bottom danger zone, inline confirm) ─────────────
function _askDelete(code) {
  const zone = _viewEl && _viewEl.querySelector('#cdx-session-danger');
  if (!zone) return;
  zone.innerHTML =
    '<span class="cdx-session-confirm">' + t('questions.sessions_delete_confirm') + '</span>' +
    '<button class="cdx-btn cdx-btn-danger" data-act="delete-confirm" data-code="' + _esc(code) + '" type="button">' + t('questions.bank_yes') + '</button>' +
    '<button class="cdx-btn" data-act="delete-cancel" type="button">' + t('questions.bank_no') + '</button>';
}

async function _confirmDelete(code) {
  let res;
  try { res = await api.deleteSession({ code }); } catch (e) { notice.internal(e); res = null; }
  if (!res || res.error) { notice.error(t('questions.sessions_delete_error')); _renderMain(); return; }
  _selectedCode = null;
  _sidebarPinned = true;        // back to the pinned picker once nothing is selected
  _openSidebar();
  _load();
}

function _select(code) {
  _selectedCode = code;
  // First pick flips the sidebar from pinned-open to hover-reveal overlay mode.
  _sidebarPinned = false;
  _closeSidebar();
  _renderList();
  _renderMain();
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _sessions = [];
  _selectedCode = null;
  _sidebarPinned = true;
  _overSidebar = false;

  viewEl.innerHTML =
    '<div class="cdx-sessions-layout cdx-sm--open" id="cdx-sessions-layout">' +
      '<aside class="cdx-sessions-sidebar" id="cdx-sessions-sidebar">' +
        '<form class="cdx-create-session" id="cdx-sessions-create">' +
          '<h3 class="cdx-create-session-heading">' + t('questions.sessions_sidebar_heading') + '</h3>' +
          '<label class="cdx-create-session-label" for="cdx-sessions-title">' + t('questions.sessions_title_label') + '</label>' +
          '<input class="cdx-input" id="cdx-sessions-title" type="text" maxlength="120" autocomplete="off" placeholder="' + _esc(t('questions.sessions_new_title')) + '">' +
          '<button class="cdx-btn cdx-btn-primary" type="submit">' + t('questions.sessions_create') + '</button>' +
        '</form>' +
        '<div class="cdx-sessions-list" id="cdx-sessions-list"></div>' +
      '</aside>' +
      '<main class="cdx-sessions-main" id="cdx-sessions-detail"></main>' +
    '</div>';

  const form = viewEl.querySelector('#cdx-sessions-create');
  const titleInput = viewEl.querySelector('#cdx-sessions-title');
  const list = viewEl.querySelector('#cdx-sessions-list');
  const main = viewEl.querySelector('#cdx-sessions-detail');
  const sidebar = viewEl.querySelector('#cdx-sessions-sidebar');

  _on(form, 'submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    let res;
    try { res = await api.createSession({ title }); } catch (err) { notice.internal(err); res = null; }
    if (!res || res.error || !res.code) { notice.error(t('questions.sessions_create_error')); return; }
    titleInput.value = '';
    _load();
  });

  // Picker: select a session.
  _on(list, 'click', (e) => {
    const card = e.target.closest('[data-act="select"]');
    if (!card) return;
    _select(card.getAttribute('data-code'));
  });

  // Main area: lifecycle / stats / delete (delegated, no inline onclick).
  _on(main, 'click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const code = btn.getAttribute('data-code');
    if (act === 'start') {
      let res;
      try { res = await api.reopenSession({ code }); } catch (err) { notice.internal(err); res = null; }
      if (res && res.error) { notice.warn(t('questions.sessions_reopen_blocked')); return; }
      _load();
    } else if (act === 'close') {
      try { await api.closeSession({ code }); } catch (err) { notice.internal(err); }
      _load();
    } else if (act === 'stats') {
      _openStats(code);
    } else if (act === 'stats-close') {
      _renderMain();
    } else if (act === 'delete') {
      _askDelete(code);
    } else if (act === 'delete-confirm') {
      _confirmDelete(code);
    } else if (act === 'delete-cancel') {
      _renderMain();
    }
  });

  // Sidebar hover-reveal (cv-sm). Document-level listeners are tracked so they
  // are torn down on unmount (no leak across tab switches).
  _on(sidebar, 'mouseenter', () => { _overSidebar = true; clearTimeout(_hideTimer); });
  _on(sidebar, 'mouseleave', () => {
    _overSidebar = false;
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(_maybeHide, HIDE_DELAY);
  });
  _on(document, 'mousemove', (e) => { if (e.clientX <= REVEAL_ZONE) _openSidebar(); });
  _on(document, 'keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'Escape') _closeSidebar();
  });

  _renderMain();
  _load();
}

export function unmount() {
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  clearTimeout(_hideTimer);
  _hideTimer = null;
  _sessions = [];
  _selectedCode = null;
  _sidebarPinned = true;
  _overSidebar = false;
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
