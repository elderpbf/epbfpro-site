// questions/sessions.js
// Codex Questions -> Sessions sub-tab (native, host/admin). A faithful re-port of
// the legacy ClassPulse `panel-sessions`: a floating left-edge sidebar picker
// (the ClassVault cv-sm pattern) of bare session cards (code/title/date/live dot,
// click-to-select), and a main area that, when a session is picked, mounts the
// native live host (live-host.js), itself a faithful port of the legacy
// `host.html`. The lifecycle (Iniciar/Encerrar) lives on the host's own session
// bar, exactly like the legacy.
//
// The per-session Stats overlay and the protected session Delete are implemented
// below but NOT wired to any trigger; their placement is pending a post-port
// decision. They must NOT be put back on the sidebar cards (that was reviewed and
// rejected). Data through the facade; strings via t(); errors via notice.
import { questions as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import * as liveHost from './live-host.js';

let _viewEl = null;
let _cleanup = [];
let _sessions = [];
let _selectedCode = null;
let _sidebarPinned = true;  // open + pinned until the first session is picked
let _overSidebar = false;
let _hideTimer = null;

const REVEAL_ZONE = 6;     // px from the left edge that triggers the reveal
const HIDE_DELAY = 1500;   // ms after the cursor leaves the rail before it hides

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
  return '<div class="cdx-session-card' + sel + '" data-code="' + _esc(s.code) + '">' +
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

// The native live host owns poll timers + listeners, so it MUST be unmounted
// before the main area re-renders (which would otherwise orphan its loops).
function _teardownLiveHost() { try { liveHost.unmount(); } catch (_) { /* ignore */ } }

// ── Main area: placeholder, or the selected session's live host ──
// Selecting a session turns the whole main area into the native live host (a
// faithful port of host.html). The host owns its own session bar (Iniciar/
// Encerrar, Trilha, QR, Display, Visao), the not-hosted note, and the dashboard.
function _renderMain() {
  _teardownLiveHost();
  const main = _viewEl && _viewEl.querySelector('#cdx-sessions-detail');
  if (!main) return;
  const s = _sessions.find((x) => x.code === _selectedCode);
  if (!s) {
    main.innerHTML = '<div class="cdx-sessions-placeholder">' + t('questions.sessions_placeholder') + '</div>';
    return;
  }
  // The host bar owns the Estatisticas button (left of Visao) and a session-name
  // dropdown (Renomear / Excluir); each calls back into these handlers.
  liveHost.mount(main, {
    session: s,
    onStats: () => _openStats(s.code),
    onDelete: () => _confirmDelete(s.code),
    onRename: (title) => _renameSession(s.code, title),
  });
}

// Rename a session via the frozen Worker's rename_session action, then reload so
// the picker + the host bar pick up the new title.
async function _renameSession(code, title) {
  let res;
  try { res = await api.renameSession({ code, title }); } catch (e) { notice.internal(e); res = null; }
  if (!res || res.error) { notice.error(t('questions.sessions_rename_error')); return; }
  _load();
}

// ── Per-session stats overlay (legacy openStats) ────────────
// Opened from the host bar's Estatisticas button (via the onStats callback);
// Fechar returns to the live host.
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

// Stats overlays the main area; Fechar returns to the live host (or placeholder).
async function _openStats(code) {
  _teardownLiveHost();
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

// ── Delete (triggered from the host's session-name button) ──
// The host bar reveals an Excluir button on the session name and confirms there
// (window.confirm); on confirm it calls back to _confirmDelete via onDelete.
async function _confirmDelete(code) {
  let res;
  try { res = await api.deleteSession({ code }); } catch (e) { notice.internal(e); res = null; }
  if (!res || res.error) { notice.error(t('questions.sessions_delete_error')); _renderList(); return; }
  if (_selectedCode === code) {
    _selectedCode = null;
    _sidebarPinned = true;        // back to the pinned picker once nothing is selected
    _openSidebar();
  }
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
    // Like the legacy create flow, jump straight into hosting the new session.
    _selectedCode = res.code;
    _sidebarPinned = false;
    _closeSidebar();
    _load();
  });

  // Picker: clicking a card selects it and mounts the host. The batch-3 sidebar
  // is intentionally bare (no card actions); per-session Stats/Delete placement
  // is a post-port decision (see the retained helpers above).
  _on(list, 'click', (e) => {
    const card = e.target.closest('.cdx-session-card');
    if (card) _select(card.getAttribute('data-code'));
  });

  // Main area only owns the stats overlay's Fechar; the live host (mounted here
  // when a session is selected) owns its own buttons.
  _on(main, 'click', (e) => {
    if (e.target.closest('[data-act="stats-close"]')) _renderMain();
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
  _teardownLiveHost();
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
