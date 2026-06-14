// questions/stats.js
// Codex Questions -> Stats sub-tab (native, read-only). GLOBAL stats only, a
// faithful re-port of the legacy ClassPulse panel-global-stats: a date-range
// filter (De / Ate / Limpar / Filtrar), three KPI boxes (sessions / questions /
// unique students), a "toughest questions" list and a "participation per
// session" table. Per-session stats are an overlay in the live-host flow (Q2),
// not a sub-tab here. All data comes through the facade; all strings through
// t(). No polling, so unmount just drops the listeners it registered.
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
  if (!el) return;
  el.addEventListener(evt, fn);
  _cleanup.push(() => el.removeEventListener(evt, fn));
}

// Mirror the legacy date column: locale date, blank for missing/invalid.
function _fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
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

// Toughest card: question text + "<session> · N respostas" meta + accuracy bar.
function _toughestCard(q) {
  const meta = _esc(q.session_title || '') + ' · ' +
    (q.total_answers || 0) + ' ' + t('questions.stats_answers');
  return '<div class="cdx-stats-q">' +
    '<div class="cdx-stats-q-text">' + _esc(q.text) + '</div>' +
    '<div class="cdx-stats-q-meta">' + meta + '</div>' +
    _accuracyBar(q.accuracy, q.total_answers) +
  '</div>';
}

function _trendRow(s) {
  return '<tr>' +
    '<td>' + _esc(s.title || s.code) + '</td>' +
    '<td>' + _fmtDate(s.created_at) + '</td>' +
    '<td class="cdx-stats-num cdx-stats-hl">' + (s.students || 0) + '</td>' +
    '<td class="cdx-stats-num">' + (s.answers || 0) + '</td>' +
  '</tr>';
}

function _renderResult(el, gs) {
  if (!gs || !gs.ok) {
    el.innerHTML = '<div class="cdx-stats-empty">' + t('questions.stats_empty') + '</div>';
    return;
  }
  const kpis = '<div class="cdx-stats-kpis">' +
    _kpi(gs.total_sessions, 'questions.stats_total_sessions') +
    _kpi(gs.total_questions, 'questions.stats_total_questions') +
    _kpi(gs.total_students, 'questions.stats_total_students') +
  '</div>';

  // No sessions in range: KPIs (all zero) + a period-empty notice, no sections.
  if (!gs.total_sessions) {
    el.innerHTML = kpis + '<div class="cdx-stats-empty">' + t('questions.stats_empty_period') + '</div>';
    return;
  }

  const toughest = (gs.toughest || []).length
    ? gs.toughest.map(_toughestCard).join('')
    : '<div class="cdx-stats-empty">' + t('questions.stats_empty') + '</div>';

  const rows = (gs.trend || []).map(_trendRow).join('');
  const table =
    '<div class="cdx-stats-table-wrap"><table class="cdx-stats-table"><thead><tr>' +
      '<th>' + t('questions.stats_col_session') + '</th>' +
      '<th>' + t('questions.stats_col_date') + '</th>' +
      '<th class="cdx-stats-num">' + t('questions.stats_col_students') + '</th>' +
      '<th class="cdx-stats-num">' + t('questions.stats_col_answers') + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';

  el.innerHTML = kpis +
    '<h3 class="cdx-stats-section-title">' + t('questions.stats_toughest') + '</h3>' +
    '<div class="cdx-stats-qlist">' + toughest + '</div>' +
    '<h3 class="cdx-stats-section-title">' + t('questions.stats_trend') + '</h3>' +
    table;
}

async function _load(result, from, to) {
  result.innerHTML = '<div class="cdx-stats-loading">' + t('questions.stats_loading') + '</div>';
  const p = {};
  if (from && to) { p.date_from = from; p.date_to = to; }
  let gs;
  try { gs = await api.globalStats(p); } catch (e) { if (window.bsLog) window.bsLog('stats: global load failed: ' + (e && e.message || e), 'error'); gs = null; }
  if (!_viewEl) return; // view changed mid-await
  _renderResult(result, gs);
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  viewEl.innerHTML =
    '<div class="cdx-stats">' +
      '<div class="cdx-stats-filter">' +
        '<div class="cdx-stats-filter-dates">' +
          '<label class="cdx-stats-flabel" for="cdx-gs-from">' + t('questions.stats_from') + '</label>' +
          '<input type="date" class="cdx-stats-date" id="cdx-gs-from">' +
          '<label class="cdx-stats-flabel" for="cdx-gs-to">' + t('questions.stats_to') + '</label>' +
          '<input type="date" class="cdx-stats-date" id="cdx-gs-to">' +
        '</div>' +
        '<div class="cdx-stats-filter-actions">' +
          '<button class="cdx-stats-clear" id="cdx-gs-clear" type="button">' + t('questions.stats_clear') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" id="cdx-gs-apply" type="button">' + t('questions.stats_apply') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-stats-result" id="cdx-gs-result"></div>' +
    '</div>';

  const result = viewEl.querySelector('#cdx-gs-result');
  const from = viewEl.querySelector('#cdx-gs-from');
  const to = viewEl.querySelector('#cdx-gs-to');

  _on(viewEl.querySelector('#cdx-gs-apply'), 'click', () => _load(result, from.value, to.value));
  _on(viewEl.querySelector('#cdx-gs-clear'), 'click', () => {
    from.value = ''; to.value = '';
    _load(result, '', '');
  });

  _load(result, '', '');
}

export function unmount() {
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
