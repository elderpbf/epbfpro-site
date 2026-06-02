// questions/sessions.js
// Codex Questions -> Sessions sub-tab (native, host/admin). Faithful re-port of
// the legacy ClassPulse `panel-sessions`: a create form + a list of session
// cards (code badge, title, date, live indicator) and, per card, the actions
// Hospedar / Estatísticas / Encerrar|Reabrir / Excluir. "Estatísticas" opens the
// per-session stats overlay (the legacy `openStats`: KPIs + per-question
// accuracy). "Hospedar" is a bridge LINK to the standalone legacy host page
// until the native live host lands (Q2); it is a plain navigation link, never an
// iframe/embed. "Excluir" deletes the session and all its data behind an inline
// confirm. All data through the facade; strings through t(); user-facing errors
// through the shared notice system.
import { questions as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';

let _viewEl = null;
let _cleanup = [];
let _sessions = [];

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

// ── Session list ────────────────────────────────────────────
// Faithful re-port of the legacy `cp-session-card`: a code badge, the title +
// date, an optional live indicator, and the per-card action row. The card-click
// host launch is the Q2 surface; until then "Hospedar" is an explicit bridge
// button, so the card itself is not click-to-host here.
function _card(s) {
  const open = s.status === 'open';
  const lifecycle = open
    ? '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="close" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_close') + '</button>'
    : '<button class="cdx-btn cdx-btn-sm" data-act="reopen" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_reopen') + '</button>';
  const live = open
    ? '<span class="cdx-live" title="' + _esc(t('questions.sessions_status_open')) + '"><span class="cdx-live-dot"></span><span class="cdx-live-label">' + t('questions.sessions_status_open') + '</span></span>'
    : '';
  return '<div class="cdx-session-card' + (open ? ' cdx-session-card--open' : '') + '" data-code="' + _esc(s.code) + '">' +
    '<div class="cdx-session-code">' + _esc(s.code) + '</div>' +
    '<div class="cdx-session-info">' +
      '<div class="cdx-session-title">' + _esc(s.title || t('questions.sessions_untitled')) + '</div>' +
      '<div class="cdx-session-meta">' + _fmtDate(s.created_at) + '</div>' +
    '</div>' +
    live +
    '<div class="cdx-session-actions">' +
      '<a class="cdx-btn cdx-btn-sm" href="' + hostHref(s.code) + '">' + t('questions.sessions_host') + '</a>' +
      '<button class="cdx-btn cdx-btn-sm" data-act="stats" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_stats') + '</button>' +
      lifecycle +
      '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delete" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_delete') + '</button>' +
    '</div>' +
  '</div>';
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
  list.innerHTML = _sessions.length
    ? _sessions.map(_card).join('')
    : '<div class="cdx-sessions-empty">' + t('questions.sessions_empty') + '</div>';
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

function _renderStats(panel, session, data) {
  const title = _esc(session.title || t('questions.sessions_untitled'));
  const head =
    '<div class="cdx-session-stats-head">' +
      '<div>' +
        '<h2 class="cdx-session-stats-title">' + title + '</h2>' +
        '<span class="cdx-session-code">' + _esc(session.code) + '</span>' +
      '</div>' +
      '<button class="cdx-btn cdx-btn-sm" data-act="stats-close" type="button">' + t('questions.sessions_stats_close') + '</button>' +
    '</div>';

  if (!data || !data.ok) {
    panel.innerHTML = head + '<div class="cdx-stats-empty">' + t('questions.sessions_stats_empty') + '</div>';
    return;
  }

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

  panel.innerHTML = head + kpis + mostMissed + qlist;
}

async function _openStats(code) {
  if (!_viewEl) return;
  const session = _sessions.find((s) => s.code === code) || { code };
  const panel = _viewEl.querySelector('#cdx-session-stats');
  const createWrap = _viewEl.querySelector('#cdx-sessions-create');
  const list = _viewEl.querySelector('#cdx-sessions-list');
  if (createWrap) createWrap.hidden = true;
  if (list) list.hidden = true;
  panel.hidden = false;
  panel.innerHTML = '<div class="cdx-stats-loading">' + t('questions.sessions_stats_loading') + '</div>';

  let data;
  try { data = await api.sessionStats({ code }); } catch (e) { notice.internal(e); data = null; }
  if (!_viewEl || panel !== _viewEl.querySelector('#cdx-session-stats') || panel.hidden) return;
  _renderStats(panel, session, data);
}

function _closeStats() {
  if (!_viewEl) return;
  const panel = _viewEl.querySelector('#cdx-session-stats');
  const createWrap = _viewEl.querySelector('#cdx-sessions-create');
  const list = _viewEl.querySelector('#cdx-sessions-list');
  if (panel) { panel.hidden = true; panel.innerHTML = ''; }
  if (createWrap) createWrap.hidden = false;
  if (list) list.hidden = false;
}

// ── Delete (inline confirm) ─────────────────────────────────
function _askDelete(card, code) {
  const actions = card.querySelector('.cdx-session-actions');
  if (!actions) return;
  actions.innerHTML =
    '<span class="cdx-session-confirm">' + t('questions.sessions_delete_confirm') + '</span>' +
    '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delete-confirm" data-code="' + _esc(code) + '" type="button">' + t('questions.bank_yes') + '</button>' +
    '<button class="cdx-btn cdx-btn-sm" data-act="delete-cancel" type="button">' + t('questions.bank_no') + '</button>';
}

async function _confirmDelete(code) {
  let res;
  try { res = await api.deleteSession({ code }); } catch (e) { notice.internal(e); res = null; }
  if (!res || res.error) { notice.error(t('questions.sessions_delete_error')); _load(); return; }
  _load();
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _sessions = [];
  viewEl.innerHTML =
    '<div class="cdx-sessions">' +
      '<form class="cdx-sessions-create" id="cdx-sessions-create">' +
        '<input class="cdx-input" id="cdx-sessions-title" type="text" maxlength="120" placeholder="' + _esc(t('questions.sessions_new_title')) + '">' +
        '<button class="cdx-btn cdx-btn-primary" type="submit">' + t('questions.sessions_create') + '</button>' +
      '</form>' +
      '<div class="cdx-sessions-list" id="cdx-sessions-list"></div>' +
      '<div class="cdx-session-stats" id="cdx-session-stats" hidden></div>' +
    '</div>';
  const form = viewEl.querySelector('#cdx-sessions-create');
  const titleInput = viewEl.querySelector('#cdx-sessions-title');
  const list = viewEl.querySelector('#cdx-sessions-list');

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

  // One delegated handler for the per-card actions (no inline onclick).
  _on(list, 'click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const code = btn.getAttribute('data-code');
    if (act === 'stats') {
      _openStats(code);
    } else if (act === 'close') {
      try { await api.closeSession({ code }); } catch (err) { notice.internal(err); }
      _load();
    } else if (act === 'reopen') {
      let res;
      try { res = await api.reopenSession({ code }); } catch (err) { notice.internal(err); res = null; }
      if (res && res.error) { notice.warn(t('questions.sessions_reopen_blocked')); return; }
      _load();
    } else if (act === 'delete') {
      _askDelete(btn.closest('.cdx-session-card'), code);
    } else if (act === 'delete-confirm') {
      _confirmDelete(code);
    } else if (act === 'delete-cancel') {
      _load();
    }
  });

  // Stats overlay close button lives outside the list, so it has its own handler.
  _on(viewEl.querySelector('#cdx-session-stats'), 'click', (e) => {
    if (e.target.closest('[data-act="stats-close"]')) _closeStats();
  });

  _load();
}

export function unmount() {
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  _sessions = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
