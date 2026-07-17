// questions/sessions.js
// Codex Questions -> Sessions sub-tab (native, host/admin). A faithful re-port of
// the legacy ClassPulse `panel-sessions`: a floating left-edge sidebar picker
// (the ClassVault cv-sm pattern) of bare session cards (code/title/date/live dot,
// click-to-select), and a main area that, when a session is picked, mounts the
// native live host (live-host.js), itself a faithful port of the legacy
// `host.html`. The lifecycle (Iniciar/Encerrar) lives on the host's own session
// bar, exactly like the legacy.
//
// The per-session Stats overlay and the protected session Delete are wired via the
// host's onStats/onDelete callbacks (live-host mount), NOT the sidebar cards (that
// placement was reviewed and rejected). Data through the facade; strings via t();
// errors via notice.
import { questions as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import * as liveHost from './live-host.js';
import { mountRail } from '../js/list-rail.js';

let _viewEl = null;
let _cleanup = [];
let _sessions = [];
let _selectedCode = null;
// The picker is the shared list-rail (js/list-rail.js) in width:autohide mode. The reveal zone,
// the hide timer, Escape and the open class used to be hand-rolled right here, byte-for-byte the
// same as cohorts' copy; both now come from the module. This file only says WHEN it is pinned.
let _rail = null;
// The create form lives in the rail's footer, and render() replaces the footer DOM. Keeping the
// typed title in module state makes that safe BY CONSTRUCTION: today nothing re-renders the list
// while you type (no timer; only mount/create/delete/rename do), but "no caller does that yet" is
// the kind of guarantee this track keeps finding broken.
let _newTitle = '';
let _loading = false;

// Server accuracy is a 0..1 ratio (or null when unscored). Render as a rounded
// integer percent, or null so callers can show a non-numeric state. Private: the
// canonical exported copy lives in stats.js (nothing imports this one). [questions-07]
function pct(accuracy) {
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

// ── Session list (the picker) ───────────────────────────────
// The rail owns the row shell; this is only the inside. A turma-linked session is labeled
// "Cliente · Turma" (list_sessions joins the turma + client); a standalone (avulsa) Q&A
// session keeps its own title. The live pill goes in the row's act slot, on the right,
// which is exactly where the bespoke card had it.
function _cardMain(s) {
  const title = (s.client_name && s.turma_name)
    ? _esc(s.client_name) + ' · ' + _esc(s.turma_name)
    : _esc(s.title || t('questions.sessions_untitled'));
  return '<div class="cdx-session-info">' +
      '<div class="cdx-session-title">' + title + '</div>' +
      '<div class="cdx-session-meta">' + _fmtDate(s.created_at) + '</div>' +
    '</div>';
}

function _cardAct(s) {
  return s.status === 'open'
    ? '<span class="cdx-live"><span class="cdx-live-dot"></span><span class="cdx-live-label">' + t('questions.sessions_live_label') + '</span></span>'
    : '';
}

// The create form: unchanged markup, now the rail's footer (it was the sidebar's first child).
// Its value comes from _newTitle so a re-render can never eat what you are typing.
function _createFormHtml() {
  return '<form class="cdx-create-session" id="cdx-sessions-create">' +
      '<h3 class="cdx-create-session-heading">' + t('questions.sessions_sidebar_heading') + '</h3>' +
      '<label class="cdx-create-session-label" for="cdx-sessions-title">' + t('questions.sessions_title_label') + '</label>' +
      '<input class="cdx-input" id="cdx-sessions-title" type="text" maxlength="120" autocomplete="off" value="' + _esc(_newTitle) + '" placeholder="' + _esc(t('questions.sessions_new_title')) + '">' +
      '<button class="cdx-btn cdx-btn-primary" type="submit">' + t('questions.sessions_create') + '</button>' +
    '</form>';
}

function _renderList() {
  if (_rail) _rail.render();
}

async function _load() {
  if (!_viewEl) return;
  _loading = true;
  _renderList();
  let res;
  try { res = await api.listSessions(); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return; // unmounted mid-flight
  _loading = false;
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
    main.innerHTML = '<div class="cdx-placeholder">' + t('questions.sessions_placeholder') + '</div>';
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
  if (!res || res.error) { toast.err(t('questions.sessions_rename_error')); return; }
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
  // A. Session↔turma alert: a session tied to a turma warns before deleting (the turma
  // relies on it for access + Q&A); a standalone session deletes freely. The host bar
  // already ran its generic confirm, so this only adds the turma-specific heads-up.
  const linked = _sessions.find((x) => x.code === code);
  if (linked && linked.turma_name) {
    const label = (linked.client_name ? linked.client_name + ' · ' : '') + linked.turma_name;
    if (!window.confirm(t('questions.sessions_delete_linked_warn') + '\n\n' + label)) return;
  }
  let res;
  try { res = await api.deleteSession({ code }); } catch (e) { notice.internal(e); res = null; }
  if (!res || res.error) { toast.err(t('questions.sessions_delete_error')); _renderList(); return; }
  if (_selectedCode === code) {
    _selectedCode = null;
    _rail.pin(true);              // back to the pinned picker once nothing is selected
  }
  _load();
}

function _select(code) {
  _selectedCode = code;
  // First pick flips the sidebar from pinned-open to hover-reveal overlay mode.
  _rail.pin(false);
  _renderList();
  _renderMain();
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _sessions = [];
  // Deep-link (?session=<code>, e.g. the Lessons live card): preselect that
  // session so its live host opens straight away; without one, the pinned picker
  // shows. _load() reconciles, if the code is no longer listed/open it falls back
  // to the placeholder. The value is the session code (cp_get_live_session aliases
  // it to `id`, but it is the same `code` that list_sessions returns under `code`).
  const pre = (ctx && ctx.session) ? String(ctx.session) : null;
  _selectedCode = pre;
  _newTitle = '';
  _loading = false;

  viewEl.innerHTML =
    '<div class="cdx-sessions-layout" id="cdx-sessions-layout">' +
      // The rail mounts INTO the aside, which keeps .cdx-sessions-sidebar: that class is the
      // mobile drawer's hook in codex-topbar.js (Sessões is newly registered there; it was the
      // one screen with no hamburger at all, Élder: "all should have them").
      // No cdx-sm--open here: the rail stamps it on its first render, so it has ONE owner.
      '<aside class="cdx-sessions-sidebar" id="cdx-sessions-sidebar"></aside>' +
      '<main class="cdx-sessions-main" id="cdx-sessions-detail"></main>' +
    '</div>';

  const main = viewEl.querySelector('#cdx-sessions-detail');
  const sidebar = viewEl.querySelector('#cdx-sessions-sidebar');

  // Flat list = the clean adoption: no sections, no bands, no reorder. Deliberately no
  // title/add either, so the module skips the head bar entirely and the sidebar looks as it
  // does today. The create form stays a real inline form (see _createFormHtml), in the footer.
  _rail = mountRail(sidebar, {
    items: () => _sessions,
    getId: (s) => s.code,
    renderRow: (s) => ({ main: _cardMain(s), act: _cardAct(s) }),
    selectedId: () => _selectedCode,
    onSelect: (code) => _select(code),
    emptyHtml: () => (_loading
      ? '<div class="cdx-sessions-loading">' + t('questions.sessions_loading') + '</div>'
      : '<div class="cdx-sessions-empty"><div class="cdx-sessions-empty-icon">\u{1F4CB}</div><p>' + t('questions.sessions_empty') + '</p></div>'),
    footer: _createFormHtml,
    width: {
      mode: 'autohide',
      layoutEl: viewEl.querySelector('#cdx-sessions-layout'),  // the class toggles on the layout
      openClass: 'cdx-sm--open',
      pinned: !pre,          // a deep-link (?session=) opens straight into the host, unpinned
    },
  });

  // The form is consumer html in the footer, so the consumer wires it, the same split cohorts
  // uses for its head actions. Delegated on the sidebar, so it survives every rail re-render.
  _on(sidebar, 'input', (e) => {
    if (e.target && e.target.id === 'cdx-sessions-title') _newTitle = e.target.value;
  });
  _on(sidebar, 'submit', async (e) => {
    if (!e.target.closest('#cdx-sessions-create')) return;
    e.preventDefault();
    const title = _newTitle.trim();
    if (!title) return;
    let res;
    try { res = await api.createSession({ title }); } catch (err) { notice.internal(err); res = null; }
    if (!res || res.error || !res.code) { toast.err(t('questions.sessions_create_error')); return; }
    _newTitle = '';
    // Like the legacy create flow, jump straight into hosting the new session.
    _selectedCode = res.code;
    _rail.pin(false);
    _load();
  });

  // Main area only owns the stats overlay's Fechar; the live host (mounted here
  // when a session is selected) owns its own buttons.
  _on(main, 'click', (e) => {
    if (e.target.closest('[data-act="stats-close"]')) _renderMain();
  });

  _renderMain();
  _load();
}

export function unmount() {
  _teardownLiveHost();
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  // The rail's autohide holds document-level listeners (mousemove/keydown); destroy() is what
  // tears them down, so skipping it leaks a set per tab switch.
  if (_rail) { _rail.destroy(); _rail = null; }
  _sessions = [];
  _selectedCode = null;
  _newTitle = '';
  _loading = false;
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
