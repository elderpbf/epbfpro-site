// questions/stats.js
// Codex Questions -> Stats sub-tab (native, read-only). Two views: per-session
// (pick a session -> KPIs + most-missed + per-question accuracy bars) and global
// (KPIs + toughest questions + participation trend, with an optional date
// range). All data comes through the facade; all strings through t(). No polling,
// so unmount just drops the listeners it registered and clears the view.
import { questions as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';

let _viewEl = null;
let _cleanup = [];

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
  el.addEventListener(evt, fn);
  _cleanup.push(() => el.removeEventListener(evt, fn));
}

function _kpi(value, labelKey) {
  return '<div class="cdx-kpi"><div class="cdx-kpi-val">' + (value || 0) +
    '</div><div class="cdx-kpi-label">' + t(labelKey) + '</div></div>';
}

function _accuracyBar(accuracy, totalAnswers) {
  const p = pct(accuracy);
  if (p === null) {
    return '<div class="cdx-stats-bar cdx-stats-bar--na">' +
      (totalAnswers || 0) + ' ' + t('questions.stats_answers') + '</div>';
  }
  return '<div class="cdx-stats-bar"><div class="cdx-stats-bar-fill" style="width:' + p +
    '%"></div><span class="cdx-stats-bar-text">' + p + '% ' + t('questions.stats_accuracy') + '</span></div>';
}

// ---- Per-session view ----
function _renderSessionStats(el, st) {
  if (!st || !st.ok) {
    el.innerHTML = '<div class="cdx-stats-empty">' + t('questions.stats_empty') + '</div>';
    return;
  }
  const kpis = '<div class="cdx-stats-kpis">' +
    _kpi(st.total_questions, 'questions.stats_total_questions') +
    _kpi(st.unique_students, 'questions.stats_unique_students') + '</div>';
  const mm = st.most_missed
    ? '<div class="cdx-stats-mostmissed"><span class="cdx-stats-mostmissed-label">' +
      t('questions.stats_most_missed') + '</span> ' + _esc(st.most_missed.text) +
      ' (' + pct(st.most_missed.accuracy) + '% ' + t('questions.stats_accuracy') + ')</div>'
    : '';
  const scored = (st.questions || []).filter((q) => q.type === 'mc' || q.type === 'tf');
  const list = scored.length
    ? scored.map((q) => '<div class="cdx-stats-q"><div class="cdx-stats-q-text">' +
        _esc(q.text) + '</div>' + _accuracyBar(q.accuracy, q.total_answers) + '</div>').join('')
    : '<div class="cdx-stats-empty">' + t('questions.stats_empty') + '</div>';
  el.innerHTML = kpis + mm + '<div class="cdx-stats-qlist">' + list + '</div>';
}

async function _renderSession(body) {
  body.innerHTML =
    '<div class="cdx-stats-picker">' +
      '<label class="cdx-stats-label" for="cdx-stats-session">' + t('questions.stats_pick_session') + '</label>' +
      '<select class="cdx-select" id="cdx-stats-session"><option value="">' + t('questions.stats_loading') + '</option></select>' +
    '</div>' +
    '<div class="cdx-stats-result" id="cdx-stats-result"></div>';
  const sel = body.querySelector('#cdx-stats-session');
  const result = body.querySelector('#cdx-stats-result');

  let res;
  try { res = await api.listSessions(); } catch (_) { res = null; }
  if (sel !== body.querySelector('#cdx-stats-session')) return; // view changed mid-await
  const sessions = (res && res.sessions) || [];
  if (!sessions.length) {
    sel.innerHTML = '<option value="">' + t('questions.stats_no_sessions') + '</option>';
    return;
  }
  sel.innerHTML = '<option value="">' + t('questions.stats_pick_session') + '</option>' +
    sessions.map((s) => '<option value="' + _esc(s.code) + '">' +
      _esc(s.title || s.code) + ' (' + _esc(s.code) + ')</option>').join('');

  _on(sel, 'change', async () => {
    const code = sel.value;
    if (!code) { result.innerHTML = ''; return; }
    result.innerHTML = '<div class="cdx-stats-loading">' + t('questions.stats_loading') + '</div>';
    let st;
    try { st = await api.sessionStats({ code }); } catch (_) { st = null; }
    _renderSessionStats(result, st);
  });
}

// ---- Global view ----
function _renderGlobalStats(el, gs) {
  if (!gs || !gs.ok) {
    el.innerHTML = '<div class="cdx-stats-empty">' + t('questions.stats_empty') + '</div>';
    return;
  }
  const kpis = '<div class="cdx-stats-kpis">' +
    _kpi(gs.total_sessions, 'questions.stats_total_sessions') +
    _kpi(gs.total_questions, 'questions.stats_total_questions') +
    _kpi(gs.total_students, 'questions.stats_total_students') + '</div>';
  // The Worker only returns toughest questions that have a computed accuracy.
  const toughest = (gs.toughest || []).length
    ? '<div class="cdx-stats-section"><div class="cdx-stats-section-title">' +
      t('questions.stats_toughest') + '</div>' +
      gs.toughest.map((q) => '<div class="cdx-stats-q"><div class="cdx-stats-q-text">' +
        _esc(q.text) + '</div>' + _accuracyBar(q.accuracy, q.total_answers) + '</div>').join('') +
      '</div>'
    : '';
  const trend = (gs.trend || []).length
    ? '<div class="cdx-stats-section"><div class="cdx-stats-section-title">' +
      t('questions.stats_trend') + '</div>' +
      gs.trend.map((s) => '<div class="cdx-stats-trend-row"><span class="cdx-stats-trend-name">' +
        _esc(s.title || s.code) + '</span><span class="cdx-stats-trend-val">' +
        (s.students || 0) + ' ' + t('questions.stats_unique_students') + ', ' +
        (s.answers || 0) + ' ' + t('questions.stats_answers') + '</span></div>').join('') +
      '</div>'
    : '';
  el.innerHTML = kpis + toughest + trend;
}

function _renderGlobal(body) {
  body.innerHTML =
    '<div class="cdx-stats-filter">' +
      '<label class="cdx-stats-label">' + t('questions.stats_from') +
        ' <input type="date" class="cdx-input" id="cdx-gs-from"></label>' +
      '<label class="cdx-stats-label">' + t('questions.stats_to') +
        ' <input type="date" class="cdx-input" id="cdx-gs-to"></label>' +
      '<button class="cdx-btn" id="cdx-gs-apply" type="button">' + t('questions.stats_apply') + '</button>' +
    '</div>' +
    '<div class="cdx-stats-result" id="cdx-gs-result"><div class="cdx-stats-loading">' +
      t('questions.stats_loading') + '</div></div>';
  const result = body.querySelector('#cdx-gs-result');
  const from = body.querySelector('#cdx-gs-from');
  const to = body.querySelector('#cdx-gs-to');

  const load = async () => {
    result.innerHTML = '<div class="cdx-stats-loading">' + t('questions.stats_loading') + '</div>';
    const p = {};
    if (from.value && to.value) { p.date_from = from.value; p.date_to = to.value; }
    let gs;
    try { gs = await api.globalStats(p); } catch (_) { gs = null; }
    _renderGlobalStats(result, gs);
  };
  _on(body.querySelector('#cdx-gs-apply'), 'click', load);
  load();
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  viewEl.innerHTML =
    '<div class="cdx-stats">' +
      '<div class="cdx-stats-modes" role="tablist">' +
        '<button class="cdx-stats-mode active" data-mode="session" type="button">' +
          t('questions.stats_view_session') + '</button>' +
        '<button class="cdx-stats-mode" data-mode="global" type="button">' +
          t('questions.stats_view_global') + '</button>' +
      '</div>' +
      '<div class="cdx-stats-body" id="cdx-stats-body"></div>' +
    '</div>';
  const body = viewEl.querySelector('#cdx-stats-body');
  const modes = Array.prototype.slice.call(viewEl.querySelectorAll('.cdx-stats-mode'));

  function setMode(mode) {
    modes.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    if (mode === 'global') _renderGlobal(body);
    else _renderSession(body);
  }
  modes.forEach((b) => _on(b, 'click', () => setMode(b.dataset.mode)));
  setMode('session');
}

export function unmount() {
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
