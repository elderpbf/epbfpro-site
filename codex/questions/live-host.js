// questions/live-host.js
// Codex-native live host: a faithful PORT of the legacy ClassPulse host page
// (backstage/classpulse/host.html + host-* modules), mounted into the Sessions
// main area for the selected session. It looks like host.html, element for
// element, but is ported to the Codex contract (native ES module, codex-api
// facade only, strings via t(), cdx- classes, mount/unmount).
//
// Layout (exactly host.html): a sticky session bar (code + LIVE, Visao column
// toggles, Trilha, QR, Display, Iniciar/Encerrar), a "not hosted" note, and the
// 3-column dashboard (launch composer / active question + history / student
// Q&A). applyHostedUI() toggles the hosting chrome just like the legacy.
//
// unmount() is release-gated (tests/questions-unmount.test.mjs): it tears down
// the embedded element's poll, the Q&A feed's poll, the SQA debounce, and every
// layout/resizer/document/modal listener.
import { questions as api, cohorts, audiences as audienceApi } from '../js/codex-api.js';
import { mountComposer } from './question-composer.js';
import { register as registerQuestionEl, TAG as QTAG } from './question-element.js';
import { createQaFeed } from './live-qa.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import { resolveQuestion, isVariable, questionType, visibleForAudience } from '../js/audiences.js';
import { revealTarget, autoRevealDecision, DEFAULT_PCT } from './auto-reveal.js';
import { buildAnswer, makeRng, hashSeed } from './sim-answers.js';

const LAYOUT_KEY = 'codex_host_layout';
const AUTO_KEY = 'codex_host_autoreveal';
const DEFAULT_LAYOUT = { left: { visible: true, width: 360 }, center: { visible: true }, right: { visible: true, width: 380 } };
const TEXT_TYPES = ['open', 'wordcloud', 'rating', 'numeric'];

let _container = null;
let _session = null;
let _cleanup = [];
let _qEl = null;
let _qa = null;
let _composer = null;
let _activeQId = null;
let _activeQType = null;
let _activeStudentQuestionId = null;
let _sqaDebounce = null;
let _sqaLastServerAnswer = null;
let _sqaSaving = false;
let _layout = null;
let _historyMap = {};
let _bankMap = {};
let _audienceConfig = null;   // { variables, audiences } loaded from the Worker config doc
let _selectedAudience = '';   // audience key governing bank filter + launch resolution
let _trailTurma = null;
let _trailAllTurmas = [];
let _onStats = null;   // sessions.js callback: open the per-session stats overlay
let _onDelete = null;  // sessions.js callback: delete this session (revealed via the name)
let _onRename = null;  // sessions.js callback: rename this session (title) via the name menu
let _auto = null;      // { enabled, headcount, pct } auto-revelar prefs (persisted)
let _autoQId = null;       // active question the auto-reveal tracker is following
let _autoFiredQId = null;  // question we already auto-revealed (fire-once guard)
let _autoLastCount = 0;    // last answer count seen (for plateau detection)
let _autoLastChangeAt = 0; // ms timestamp of the last count change
let _autoFlashTimer = null;// timeout that clears the reveal flash (cleared on unmount)
let _simRunning = false;   // guards the debug-only in-host answer simulator

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function _on(el, evt, fn, opts) { if (!el) return; el.addEventListener(evt, fn, opts); _cleanup.push(() => el.removeEventListener(evt, fn, opts)); }
function _q(sel) { return _container && _container.querySelector(sel); }
function _isOpen() { return _session && _session.status === 'open'; }

// ── Markup (mirrors host.html) ───────────────────────────────
function _render() {
  _container.innerHTML =
    '<div class="cdx-host" id="cdx-host">' +
      _barMarkup() +
      '<div class="cdx-host-note" id="cdx-host-note" hidden>' + _esc(t('questions.host_not_hosted')) + '</div>' +
      '<div class="cdx-host-dashboard" id="cdx-host-dashboard">' +
        '<section class="cdx-hd-col cdx-hd-col-left" id="cdx-hd-left">' + _composerCardMarkup() + '</section>' +
        '<div class="cdx-hd-resizer" data-resize="left-center" id="cdx-hd-rlc"></div>' +
        '<section class="cdx-hd-col cdx-hd-col-center" id="cdx-hd-center">' + _centerMarkup() + '</section>' +
        '<div class="cdx-hd-resizer" data-resize="center-right" id="cdx-hd-rcr"></div>' +
        '<section class="cdx-hd-col cdx-hd-col-right" id="cdx-hd-right">' + _qaMarkup() + '</section>' +
      '</div>' +
    '</div>' +
    _trailModalMarkup();
}

function _barMarkup() {
  return '<div class="cdx-host-bar">' +
    '<div class="cdx-host-titlewrap">' +
      '<button class="cdx-host-name" data-act="name" type="button">' + _esc(_session.title || ('' + t('questions.sessions_untitled'))) + ' <i class="cdx-host-name-caret">▾</i></button>' +
      '<div class="cdx-host-name-menu" id="cdx-host-name-menu" hidden>' +
        '<button class="cdx-host-menu-item" data-act="rename" type="button">' + _esc(t('questions.host_rename')) + '</button>' +
        '<button class="cdx-host-menu-item cdx-host-menu-item--danger" data-act="delete" type="button">' + _esc(t('questions.sessions_delete')) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-host-bar-actions">' +
      '<button class="cdx-btn cdx-host-stats" data-act="stats" type="button">' + _esc(t('questions.host_stats')) + '</button>' +
      '<details class="cdx-host-visao" id="cdx-host-visao" hidden><summary>' + _esc(t('questions.host_view')) + ' ▾</summary>' +
        '<div class="cdx-host-visao-panel">' +
          '<div class="cdx-host-visao-label">' + _esc(t('questions.host_columns')) + '</div>' +
          '<button class="cdx-host-vt is-on" data-toggle-col="left" type="button">' + _esc(t('questions.host_col_composer')) + '</button>' +
          '<button class="cdx-host-vt is-on" data-toggle-col="center" type="button">' + _esc(t('questions.host_col_active')) + '</button>' +
          '<button class="cdx-host-vt is-on" data-toggle-col="right" type="button">' + _esc(t('questions.host_col_qa')) + '</button>' +
          '<button class="cdx-host-reset" data-act="reset-layout" type="button">' + _esc(t('questions.host_reset_layout')) + '</button>' +
        '</div>' +
      '</details>' +
      '<button class="cdx-btn cdx-host-trail" id="cdx-host-trail" data-act="trail" type="button" hidden><span class="cdx-host-trail-dot" id="cdx-host-trail-dot"></span>' + _esc(t('questions.host_trail')) + '</button>' +
      '<button class="cdx-btn cdx-host-qr" id="cdx-host-qr" data-act="qr" type="button" hidden>' + _esc(t('questions.host_qr')) + '</button>' +
      '<a class="cdx-btn cdx-host-display" id="cdx-host-display" href="' + _esc(_displayHref()) + '" target="_blank" rel="noopener" hidden>' + _esc(t('questions.host_display')) + '</a>' +
      '<button class="cdx-btn cdx-btn-primary cdx-host-start" id="cdx-host-start" data-act="start" type="button" hidden>' + _esc(t('questions.host_start')) + '</button>' +
      '<button class="cdx-btn cdx-btn-danger cdx-host-stop" id="cdx-host-stop" data-act="stop" type="button" hidden>' + _esc(t('questions.host_stop')) + '</button>' +
    '</div>' +
  '</div>';
}

function _displayHref() { return '/go/display.html?code=' + encodeURIComponent(_session.code); }

// Inline SVG glyph copied node-for-node from host.html (the bank hamburger). The
// AI Gerar/Melhorar glyphs now live in the shared composer, which renders the AI
// buttons itself so the Bank and the live host show the same controls.
const _ICON_BANK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>';

function _composerCardMarkup() {
  return '<div class="cdx-host-card" id="cdx-launch-card">' +
    '<div class="cdx-host-card-title">' + _esc(t('questions.host_launch')) + '</div>' +
    '<button class="cdx-bank-toggle" data-act="bank-toggle" type="button">' + _ICON_BANK + ' ' + _esc(t('questions.host_bank')) + ' <i class="cdx-bank-chevron">▾</i></button>' +
    '<div class="cdx-bank-panel" id="cdx-bank-panel">' +
      '<div class="cdx-bank-set-row">' +
        '<label class="cdx-bank-set-label" for="cdx-bank-set">' + _esc(t('questions.host_bank_set_label')) + '</label>' +
        '<select class="cdx-select" id="cdx-bank-set"><option value="">' + _esc(t('questions.host_bank_pick')) + '</option></select>' +
        '<select class="cdx-select cdx-bank-audience" id="cdx-bank-audience" title="' + _esc(t('questions.host_audience_none')) + '" hidden></select>' +
      '</div>' +
      '<div class="cdx-bank-list" id="cdx-bank-list"><div class="cdx-bank-msg">' + _esc(t('questions.host_bank_pick_hint')) + '</div></div>' +
    '</div>' +
    '<div class="cdx-host-composer" id="cdx-host-composer"></div>' +
    '<p class="cdx-host-error" id="cdx-host-error"></p>' +
    '<div class="cdx-host-btn-row">' +
      '<button class="cdx-btn cdx-btn-primary" data-act="launch" type="button">' + _esc(t('questions.host_launch_btn')) + '</button>' +
      '<button class="cdx-btn" data-act="clear" type="button">' + _esc(t('questions.host_clear')) + '</button>' +
    '</div>' +
  '</div>';
}

function _centerMarkup() {
  return '<div class="cdx-active-panel" id="cdx-active-panel">' +
      '<div id="cdx-active-standard">' +
        '<div class="cdx-active-badge">' + _esc(t('questions.host_active_q')) + '</div>' +
        '<div class="cdx-active-text" id="cdx-active-text"></div>' +
        '<div id="cdx-active-render"></div>' +
        _autoRevealMarkup() +
        _simMarkup() +
        '<div class="cdx-active-foot">' +
          '<span class="cdx-active-tally" id="cdx-active-tally"></span>' +
          '<div class="cdx-active-foot-right">' +
            '<div class="cdx-close-options">' +
              '<label><input type="checkbox" id="cdx-chk-show" checked> ' + _esc(t('questions.host_show_results')) + '</label>' +
              '<label><input type="checkbox" id="cdx-chk-reveal"> ' + _esc(t('questions.host_reveal_answer')) + '</label>' +
            '</div>' +
            '<button class="cdx-btn cdx-btn-danger" data-act="close-q" type="button">' + _esc(t('questions.host_close_q')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="cdx-active-sqa" style="display:none">' +
        '<div class="cdx-active-badge cdx-active-badge--sqa">' + _esc(t('questions.host_sqa_badge')) + '</div>' +
        '<div class="cdx-sqa-meta" id="cdx-sqa-meta"></div>' +
        '<div class="cdx-active-text" id="cdx-sqa-text"></div>' +
        '<div class="cdx-sqa-answer-block">' +
          '<div class="cdx-sqa-answer-label">' + _esc(t('questions.host_sqa_answer_label')) + '</div>' +
          '<textarea class="cdx-sqa-answer-input" id="cdx-sqa-response" rows="3" placeholder="' + _esc(t('questions.host_sqa_answer_placeholder')) + '"></textarea>' +
          '<div class="cdx-sqa-status" id="cdx-sqa-status"></div>' +
          '<div class="cdx-sqa-hint">' + _esc(t('questions.host_sqa_hint')) + '</div>' +
        '</div>' +
        '<div class="cdx-host-btn-row cdx-host-btn-row--end">' +
          '<button class="cdx-btn cdx-btn-danger" data-act="sqa-close" type="button">' + _esc(t('questions.host_close_q')) + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-host-card" id="cdx-history-card" style="display:none">' +
      '<div class="cdx-host-card-title">' + _esc(t('questions.host_history')) + '</div>' +
      '<div id="cdx-history-list"></div>' +
    '</div>';
}

// Auto-revelar control: opt-in, sits under the active question. The host enters a
// room headcount + a percentage; once that share has answered (or answers stall),
// the question closes and the correct answer is shown automatically. Inert until
// toggled on; the live "X / target" + bar update from the existing poll tick.
function _autoRevealMarkup() {
  return '<div class="cdx-autoreveal" id="cdx-autoreveal">' +
    '<label class="cdx-autoreveal-toggle"><input type="checkbox" id="cdx-auto-on"> ' + _esc(t('questions.host_autoreveal')) + '</label>' +
    '<div class="cdx-autoreveal-controls">' +
      '<input type="number" class="cdx-autoreveal-num" id="cdx-auto-pct" min="1" max="100" step="5">' +
      '<span class="cdx-autoreveal-unit">% ' + _esc(t('questions.host_autoreveal_of')) + '</span>' +
      '<input type="number" class="cdx-autoreveal-num" id="cdx-auto-head" min="1" step="1" placeholder="0">' +
      '<span class="cdx-autoreveal-unit">' + _esc(t('questions.host_autoreveal_people')) + '</span>' +
      '<span class="cdx-autoreveal-target" id="cdx-auto-target"></span>' +
    '</div>' +
    '<div class="cdx-autoreveal-progress">' +
      '<div class="cdx-autoreveal-bar"><div class="cdx-autoreveal-bar-fill" id="cdx-auto-bar"></div></div>' +
      '<span class="cdx-autoreveal-count" id="cdx-auto-count"></span>' +
    '</div>' +
    '<div class="cdx-autoreveal-status" id="cdx-auto-status"></div>' +
  '</div>';
}

// Debug-only in-host simulator: a one-click "Simular respostas" that fires N fake
// student answers at the active question through the public submit_answer action,
// so a live-question feature (auto-revelar, tallies) can be exercised from the
// same screen without a real class. Hidden unless the bs_debug flag is on, so it
// can never touch a real session. For genuine load use the codex-simulate skill.
function _simMarkup() {
  return '<div class="cdx-sim" id="cdx-sim" hidden>' +
    '<span class="cdx-sim-label">' + _esc(t('questions.host_sim_label')) + '</span>' +
    '<input type="number" class="cdx-sim-n" id="cdx-sim-n" min="1" max="200" value="30">' +
    '<button class="cdx-btn cdx-sim-btn" data-act="sim-run" type="button">' + _esc(t('questions.host_sim_run')) + '</button>' +
    '<span class="cdx-sim-status" id="cdx-sim-status"></span>' +
  '</div>';
}

function _qaMarkup() {
  return '<section class="cdx-qa-section" id="cdx-qa-section">' +
    '<div class="cdx-qa-header">' +
      '<span class="cdx-qa-title">' + _esc(t('questions.host_qa_title')) + '</span>' +
      '<span class="cdx-qa-badge" id="cdx-qa-badge" style="display:none"></span>' +
    '</div>' +
    '<div id="cdx-qa-feed"></div>' +
  '</section>';
}

function _trailModalMarkup() {
  return '<div class="cdx-trail-modal" id="cdx-trail-modal">' +
    '<div class="cdx-trail-box">' +
      '<h3>' + _esc(t('questions.host_trail_modal_title')) + '</h3>' +
      '<div id="cdx-trail-content"></div>' +
      '<button class="cdx-btn cdx-btn--ghost cdx-btn-full" data-act="trail-close" type="button">' + _esc(t('questions.host_trail_close')) + '</button>' +
    '</div>' +
  '</div>';
}

// ── Hosting chrome (port of host-share applyHostedUI) ────────
function _applyHostedUI(open) {
  const note = _q('#cdx-host-note'), launch = _q('#cdx-launch-card');
  const qa = _q('#cdx-qa-section'), start = _q('#cdx-host-start'), stop = _q('#cdx-host-stop');
  const visao = _q('#cdx-host-visao'), display = _q('#cdx-host-display'), panel = _q('#cdx-active-panel');
  if (note) note.hidden = open;
  if (launch) launch.style.display = open ? '' : 'none';
  if (qa) qa.style.display = open ? '' : 'none';
  if (start) start.hidden = open;
  if (stop) stop.hidden = !open;
  if (visao) visao.hidden = !open;
  if (display) display.hidden = !open;
  _refreshShareSurface(open);
  if (!open) {
    if (panel) panel.style.display = 'none';
    _activeQId = null; _activeQType = null; _activeStudentQuestionId = null;
  }
}

function _refreshShareSurface(open) {
  const hasTrail = !!_buildTrailUrl();
  const trail = _q('#cdx-host-trail'), qr = _q('#cdx-host-qr');
  // Trilha + QR show regardless of session state (Élder 2026-06-05): the trilha
  // link is useful before the session starts too. Both are ALWAYS visible; the
  // QR needs a join URL (a linked turma), so without one it reads as disabled and
  // clicking explains why rather than vanishing from the bar (Élder 2026-06-06).
  if (trail) { trail.hidden = false; trail.classList.toggle('is-linked', !!_trailTurma); }
  if (qr) { qr.hidden = false; qr.classList.toggle('is-disabled', !hasTrail); }
}

// ── Trilha turma link (port of host-share.js) ────────────────
function _buildTrailUrl() {
  const tt = _trailTurma;
  if (!tt) return null;
  return 'https://pensoia.com/trilha/' + encodeURIComponent(tt.client_slug) + '/' + encodeURIComponent(tt.turma_slug) + (tt.token ? '?k=' + encodeURIComponent(tt.token) : '');
}

async function _loadTrail() {
  try {
    const res = await cohorts.lookupTurmaBySession({ session_id: _session.code });
    _trailTurma = (res && res.turma) || null;
  } catch (e) { _trailTurma = null; }
  try {
    const list = await cohorts.listAllTurmas();
    _trailAllTurmas = (list && list.turmas) || [];
  } catch (e) { _trailAllTurmas = []; }
  _renderTrailContent();
  _refreshShareSurface(_isOpen());
}

function _renderTrailContent() {
  const content = _q('#cdx-trail-content');
  if (!content) return;
  if (_trailTurma) {
    const tt = _trailTurma;
    const turmaName = tt.display_name || tt.name || tt.turma_slug;
    const clientName = tt.client_display_name || tt.client_slug;
    const url = '/trilha/' + encodeURIComponent(tt.client_slug) + '/' + encodeURIComponent(tt.turma_slug) + (tt.token ? '?k=' + encodeURIComponent(tt.token) : '');
    content.innerHTML =
      '<div class="cdx-trail-status">' + _esc(t('questions.host_trail_linked')) + '</div>' +
      '<div class="cdx-trail-title">' + _esc(turmaName) + '</div>' +
      '<div class="cdx-trail-engine">' + _esc(clientName) + '</div>' +
      '<a class="cdx-trail-link" href="' + _esc(url) + '" target="_blank" rel="noopener">' + _esc(t('questions.host_trail_open')) + '</a>' +
      '<button class="cdx-btn cdx-btn-danger cdx-btn-full" data-act="trail-unlink" type="button">' + _esc(t('questions.host_trail_unlink')) + '</button>';
  } else if (_trailAllTurmas.length) {
    const opts = '<option value="">' + _esc(t('questions.host_trail_pick')) + '</option>' + _trailAllTurmas.map((tt) => {
      const name = tt.display_name || tt.name || tt.turma_slug;
      const client = tt.client_display_name || tt.client_slug;
      const inUse = tt.classpulse_session_id && tt.classpulse_session_id !== _session.code;
      const value = tt.client_slug + '|' + tt.turma_slug;
      return '<option value="' + _esc(value) + '"' + (inUse ? ' disabled' : '') + '>' + _esc(client + ' / ' + name + (inUse ? ' (' + tt.classpulse_session_id + ')' : '')) + '</option>';
    }).join('');
    content.innerHTML =
      '<div class="cdx-trail-status">' + _esc(t('questions.host_trail_none')) + '</div>' +
      '<select class="cdx-select" id="cdx-trail-picker">' + opts + '</select>' +
      '<button class="cdx-btn cdx-btn-primary cdx-btn-full" data-act="trail-link" type="button">' + _esc(t('questions.host_trail_link')) + '</button>';
  } else {
    content.innerHTML = '<div class="cdx-trail-empty">' + _esc(t('questions.host_trail_no_turmas')) + '</div>';
  }
}

async function _linkTrail(clientSlug, turmaSlug) {
  try {
    await cohorts.updateTurmaMeta({ client_slug: clientSlug, slug: turmaSlug, classpulse_session_id: _session.code });
    await _loadTrail();
    const modal = _q('#cdx-trail-modal'); if (modal) modal.classList.remove('open');
  } catch (e) { notice.internal(e); }
}

async function _unlinkTrail() {
  if (!_trailTurma) return;
  try {
    await cohorts.updateTurmaMeta({ client_slug: _trailTurma.client_slug, slug: _trailTurma.turma_slug, classpulse_session_id: null });
    _trailTurma = null;
    await _loadTrail();
    const modal = _q('#cdx-trail-modal'); if (modal) modal.classList.remove('open');
  } catch (e) { notice.internal(e); }
}

function _openQr() {
  const joinUrl = _buildTrailUrl();
  if (!joinUrl) { notice.info(t('questions.host_qr_no_turma')); return; }
  if (typeof window !== 'undefined' && window.QRShareModal && typeof window.QRShareModal.open === 'function') {
    window.QRShareModal.open({ joinUrl: joinUrl });
  }
}

// ── Lifecycle: Iniciar / Encerrar (port of host-session.js) ──
async function _startHost(force) {
  let res, err;
  try { res = await api.reopenSession({ code: _session.code }); }
  catch (e) { err = e; res = null; }
  const blocker = (res && res.error && res.data) || (err && err.data) || (res && res.data) || null;
  if ((res && res.error) || err) {
    const activeCode = blocker && blocker.active_code;
    if (!force && activeCode) {
      const name = (blocker.active_title || activeCode);
      if (typeof confirm === 'function' && confirm(t('questions.host_start_conflict').replace('{name}', name))) {
        try { await api.closeSession({ code: activeCode }); await _startHost(true); return; }
        catch (e2) { notice.internal(e2); return; }
      }
      return;
    }
    notice.warn(t('questions.sessions_reopen_blocked'));
    return;
  }
  _session.status = 'open';
  _applyHostedUI(true);
  if (_qEl) _qEl.startPolling();
}

async function _stopHost() {
  if (typeof confirm === 'function' && !confirm(t('questions.host_stop_confirm'))) return;
  try {
    if (_activeQId) { try { await api.closeQuestion({ id: _activeQId, session_code: _session.code, show_results: false, reveal_answer: false }); } catch (_) { /* ignore */ } }
    await api.closeSession({ code: _session.code });
    _session.status = 'closed';
    _applyHostedUI(false);
  } catch (e) { notice.internal(e); }
}

// ── History (port of host-history.js renderHistory) ──────────
const TYPE_TAGS = { mc: 'MC', tf: 'V/F', poll: 'Enquete', open: 'Aberta', wordcloud: 'Nuvem', rating: 'Avaliação', numeric: 'Número' };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function _renderHistory(closedQs) {
  const card = _q('#cdx-history-card'), list = _q('#cdx-history-list');
  if (!card || !list) return;
  if (!closedQs || !closedQs.length) { card.style.display = 'none'; return; }
  _historyMap = {};
  list.innerHTML = closedQs.map((q) => {
    _historyMap[q.id] = q;
    let resultsHtml = '';
    if (q.options && q.answer_counts && q.options.length > 0) {
      const hTotal = q.answer_counts.reduce((a, b) => a + b, 0);
      const hDenom = (q.voter_count && q.voter_count > 0) ? q.voter_count : hTotal;
      const hCorrect = Array.isArray(q.correct_answers) ? q.correct_answers : [];
      resultsHtml = '<div class="cdx-hi-results">' + q.options.map((opt, i) => {
        const pct = hDenom > 0 ? Math.round(q.answer_counts[i] / hDenom * 100) : 0;
        const isCorrect = q.reveal_answer && hCorrect.indexOf(i) !== -1;
        return '<div class="cdx-hi-bar"><div class="cdx-hi-bar-label"><span class="cdx-hi-bar-badge ' + (isCorrect ? 'correct' : '') + '">' +
          LETTERS[i] + (isCorrect ? ' ✓' : '') + '</span><span class="cdx-hi-bar-text">' + _esc(opt) + '</span></div>' +
          '<div class="cdx-hi-bar-pct">' + pct + '%</div><div class="cdx-hi-bar-count">' + q.answer_counts[i] + '</div></div>';
      }).join('') + '</div>';
    }
    const tag = TYPE_TAGS[q.type || 'mc'] || (q.type || 'mc');
    const when = q.created_at ? new Date(q.created_at).toLocaleString('pt-BR') : '';
    return '<div class="cdx-history-item" data-qid="' + _esc(q.id) + '">' +
      '<div class="cdx-hi-text">' + _esc(q.text || '') + '</div>' +
      '<span class="cdx-hi-type cdx-hi-type-' + (q.type || 'mc') + '">' + _esc(tag) + '</span>' +
      '<div class="cdx-hi-meta">' + _esc(when) + '</div>' + resultsHtml +
      '<div class="cdx-hi-actions">' +
        '<button class="cdx-hi-btn cdx-hi-btn-primary" data-hi-act="relaunch" data-qid="' + _esc(q.id) + '" type="button">' + _esc(t('questions.host_relaunch')) + '</button>' +
        '<button class="cdx-hi-btn" data-hi-act="edit" data-qid="' + _esc(q.id) + '" type="button">' + _esc(t('questions.host_edit')) + '</button>' +
        '<button class="cdx-hi-btn cdx-hi-btn-danger" data-hi-act="delete" data-qid="' + _esc(q.id) + '" type="button">' + _esc(t('questions.host_delete')) + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
  card.style.display = 'block';
}

// Delete a launched question from history: removes the question row + its
// answers via the facade, which also drops it from every stats surface. A
// re-poll refreshes the history (and the active panel) right away.
async function _deleteHistoryQuestion(q) {
  if (typeof confirm === 'function' && !confirm(t('questions.host_delete_confirm'))) return;
  try { await api.deleteSessionQuestion({ id: q.id }); }
  catch (e) { notice.internal(e); return; }
  delete _historyMap[q.id];
  if (_qEl) _qEl.startPolling();
}

// ── Active panel + Q&A sync (port of host-page _cpqDataHandler) ──
function _onData(data) {
  if (!_container) return;
  if (_qa) _qa.syncFromState(data);
  _renderHistory(data.history || []);
  const q = data.active_question;
  const panel = _q('#cdx-active-panel'), std = _q('#cdx-active-standard'), sqa = _q('#cdx-active-sqa');
  if (!q) {
    _activeQId = null; _activeQType = null; _activeStudentQuestionId = null;
    _autoQId = null; _autoFiredQId = null;
    const cnt = _q('#cdx-auto-count'); if (cnt) cnt.textContent = '';
    const bar = _q('#cdx-auto-bar'); if (bar) bar.style.width = '0%';
    if (panel) panel.style.display = 'none';
    if (std) std.style.display = '';
    if (sqa) sqa.style.display = 'none';
    return;
  }
  _activeQId = q.id; _activeQType = q.type || 'mc';
  if (_activeQType === 'student_qa') {
    _activeStudentQuestionId = q.student_question_id || null;
    _autoQId = null;
    _renderSqaActive(q);
    if (std) std.style.display = 'none';
    if (sqa) sqa.style.display = '';
    if (panel) panel.style.display = 'block';
    return;
  }
  _activeStudentQuestionId = null;
  if (sqa) sqa.style.display = 'none';
  if (std) std.style.display = '';
  const textEl = _q('#cdx-active-text');
  if (textEl) textEl.textContent = q.text;
  const usesText = TEXT_TYPES.includes(q.type);
  const total = usesText ? (q.text_answers || []).length : (q.answer_counts || []).reduce((a, b) => a + b, 0);
  const tally = _q('#cdx-active-tally');
  if (tally) tally.textContent = total + ' ' + (total === 1 ? t('questions.qr_answer') : t('questions.qr_answers'));
  _updateAutoReveal(q, total);
  if (panel) panel.style.display = 'block';
}

// ── Auto-revelar (questions/auto-reveal.js logic + this poll-driven glue) ─────
function _loadAuto() {
  try {
    const s = JSON.parse(localStorage.getItem(AUTO_KEY));
    if (s && typeof s === 'object') {
      const head = parseInt(s.headcount, 10);
      const pct = parseInt(s.pct, 10);
      return { enabled: !!s.enabled, headcount: (Number.isFinite(head) && head > 0) ? head : '', pct: (Number.isFinite(pct) && pct > 0) ? pct : DEFAULT_PCT };
    }
  } catch (e) { /* ignore */ }
  return { enabled: false, headcount: '', pct: DEFAULT_PCT };
}
function _saveAuto() { try { localStorage.setItem(AUTO_KEY, JSON.stringify(_auto)); } catch (e) { /* ignore */ } }

// Reflect the persisted prefs into the inputs + the "= N" target preview.
function _syncAutoUI() {
  const wrap = _q('#cdx-autoreveal'), on = _q('#cdx-auto-on'), pct = _q('#cdx-auto-pct'), head = _q('#cdx-auto-head'), target = _q('#cdx-auto-target');
  if (!on) return;
  on.checked = !!_auto.enabled;
  if (pct) pct.value = _auto.pct;
  if (head) head.value = _auto.headcount;
  if (wrap) wrap.classList.toggle('is-on', !!_auto.enabled);
  if (target) {
    const tg = _auto.enabled ? revealTarget(_auto.headcount, _auto.pct) : null;
    target.textContent = tg != null ? ('= ' + tg) : (_auto.enabled ? t('questions.host_autoreveal_set_people') : '');
  }
}

// Called on every poll tick for the active (non-SQA) question: track the count
// for plateau detection, paint the progress, and fire the reveal when due.
function _updateAutoReveal(q, total) {
  const now = Date.now();
  if (_autoQId !== q.id) { _autoQId = q.id; _autoLastCount = total; _autoLastChangeAt = now; }
  else if (total !== _autoLastCount) { _autoLastCount = total; _autoLastChangeAt = now; }
  const target = _auto.enabled ? revealTarget(_auto.headcount, _auto.pct) : null;
  const countEl = _q('#cdx-auto-count'), barEl = _q('#cdx-auto-bar');
  if (countEl) countEl.textContent = target != null ? (total + ' / ' + target) : ('' + total);
  if (barEl) barEl.style.width = (target ? Math.min(100, Math.round(total / target * 100)) : 0) + '%';
  if (!_auto.enabled || target == null || _autoFiredQId === q.id) return;
  const decision = autoRevealDecision({ enabled: true, count: total, target, lastChangeAt: _autoLastChangeAt, now });
  if (decision.reveal) { _autoFiredQId = q.id; _autoReveal(decision.reason); }
}

// Close the active question showing the correct answer, then cue the host (flash
// + chime) so they can be watching the room, not the screen.
async function _autoReveal(reason) {
  if (!_activeQId) return;
  try { await api.closeQuestion({ id: _activeQId, session_code: _session.code, show_results: true, reveal_answer: true }); }
  catch (e) { notice.internal(e); return; }
  const statusEl = _q('#cdx-auto-status');
  if (statusEl) statusEl.textContent = reason === 'plateau' ? t('questions.host_autoreveal_fired_plateau') : t('questions.host_autoreveal_fired_target');
  const panel = _q('#cdx-active-panel');
  if (panel) {
    panel.classList.add('cdx-autoreveal-flash');
    if (_autoFlashTimer) clearTimeout(_autoFlashTimer);
    _autoFlashTimer = setTimeout(() => { const p = _q('#cdx-active-panel'); if (p) p.classList.remove('cdx-autoreveal-flash'); _autoFlashTimer = null; }, 1200);
  }
  _chime();
  _activeQId = null;
}

// Best-effort short chime via WebAudio (no asset). Silently no-ops if the audio
// context is unavailable or blocked.
function _chime() {
  try {
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => { try { ctx.close(); } catch (e) { /* ignore */ } };
  } catch (e) { /* audio is best-effort */ }
}

// Debug-only: spray N fake answers at the active question via the public facade
// action, in small concurrent batches so they arrive like a real room filling
// in. No timers (so the unmount leak contract holds); aborts if unmounted. The
// firing logic is here; WHAT each bot answers comes from the pure sim-answers.js.
async function _simulate() {
  if (_simRunning) return;
  const q = _qEl && typeof _qEl.getActiveQuestion === 'function' ? _qEl.getActiveQuestion() : null;
  const statusEl = _q('#cdx-sim-status');
  if (!q || !q.id) { if (statusEl) statusEl.textContent = t('questions.host_sim_no_q'); return; }
  const input = _q('#cdx-sim-n');
  let n = parseInt(input && input.value, 10);
  if (!Number.isFinite(n) || n < 1) n = 30;
  n = Math.min(200, n);
  _simRunning = true;
  let ok = 0, done = 0;
  const skew = 0.6, batch = 6;
  for (let i = 0; i < n; i += batch) {
    if (!_container || !_simRunning) break;
    const calls = [];
    for (let j = i; j < Math.min(i + batch, n); j++) {
      const payload = buildAnswer(q, makeRng(hashSeed('Bot_' + (j + 1) + ':' + q.id)), skew);
      if (!payload) continue;
      const params = Object.assign({ question_id: q.id, session_code: _session.code, student_name: 'Bot_' + String(j + 1).padStart(3, '0'), _silent: true }, payload);
      calls.push(api.submitAnswer(params).then((r) => { done++; if (r && !r.error) ok++; }).catch(() => { done++; }));
    }
    await Promise.all(calls);
    const liveStatus = _q('#cdx-sim-status');
    if (liveStatus) liveStatus.textContent = t('questions.host_sim_progress').replace('{done}', String(done)).replace('{total}', String(n));
  }
  _simRunning = false;
  const finalStatus = _q('#cdx-sim-status');
  if (finalStatus) finalStatus.textContent = t('questions.host_sim_done').replace('{ok}', String(ok)).replace('{n}', String(n));
}

// ── Student-Q&A active card debounce (port of host-sqa.js) ───
function _renderSqaActive(q) {
  const metaEl = _q('#cdx-sqa-meta'), textEl = _q('#cdx-sqa-text'), inputEl = _q('#cdx-sqa-response'), statusEl = _q('#cdx-sqa-status');
  if (!metaEl || !textEl || !inputEl || !statusEl) return;
  let when = '';
  try { when = q.student_time ? new Date(q.student_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; } catch (_) { when = ''; }
  metaEl.textContent = (q.student_name || t('questions.qr_anonymous')) + (when ? ' · ' + when : '');
  textEl.textContent = q.text || '';
  const serverAnswer = q.student_answer || '';
  if ((typeof document === 'undefined' || document.activeElement !== inputEl) && serverAnswer !== _sqaLastServerAnswer) inputEl.value = serverAnswer;
  _sqaLastServerAnswer = serverAnswer;
  statusEl.textContent = _sqaSaving ? t('questions.host_sqa_saving') : '';
}

function _scheduleSqaSave() {
  if (_sqaDebounce) clearTimeout(_sqaDebounce);
  _sqaDebounce = setTimeout(_commitSqaAnswer, 350);
}

async function _commitSqaAnswer() {
  if (!_activeStudentQuestionId) return;
  const inputEl = _q('#cdx-sqa-response');
  if (!inputEl) return;
  const text = inputEl.value;
  if (text === _sqaLastServerAnswer) return;
  _sqaSaving = true;
  const statusEl = _q('#cdx-sqa-status');
  if (statusEl) statusEl.textContent = t('questions.host_sqa_saving');
  try {
    const res = await api.updateStudentQuestion({ id: _activeStudentQuestionId, status: 'pending', answer: text });
    if (res && res.ok) { _sqaLastServerAnswer = text; if (statusEl) statusEl.textContent = t('questions.host_sqa_saved'); }
  } catch (e) { notice.internal(e); }
  finally { _sqaSaving = false; }
}

// ── Composer + launch/close ──────────────────────────────────
function _payloadToLaunch(payload) {
  const out = { session_code: _session.code, type: payload.type, text: payload.question, options: payload.options, correct_answer: payload.correct_answer };
  if (payload.max_select !== undefined && payload.max_select !== null) out.max_select = payload.max_select;
  else if (TEXT_TYPES.includes(payload.type)) out.max_select = 0;
  return out;
}

async function _launch() {
  if (!_composer) return;
  const payload = _composer.read();
  const errEl = _q('#cdx-host-error');
  if (!payload.question || !String(payload.question).trim()) { if (errEl) errEl.textContent = t('questions.host_err_no_text'); return; }
  if (errEl) errEl.textContent = '';
  let res;
  try { res = await api.launchQuestion(_payloadToLaunch(payload)); } catch (e) { notice.internal(e); res = null; }
  if (!res || res.error) { if (errEl) errEl.textContent = (res && res.error) || t('questions.host_err_launch'); return; }
  _activeQId = res.id;
  if (_qEl) _qEl.startPolling();
  _remountComposer(null);
}

async function _closeQuestion() {
  if (!_activeQId) return;
  const showResults = !!(_q('#cdx-chk-show') && _q('#cdx-chk-show').checked);
  const revealAnswer = !!(_q('#cdx-chk-reveal') && _q('#cdx-chk-reveal').checked);
  try { await api.closeQuestion({ id: _activeQId, session_code: _session.code, show_results: showResults, reveal_answer: revealAnswer }); }
  catch (e) { notice.internal(e); }
  _activeQId = null;
  const panel = _q('#cdx-active-panel');
  if (panel) panel.style.display = 'none';
}

function _remountComposer(initial) {
  const host = _q('#cdx-host-composer');
  if (!host) return;
  if (_composer) { try { _composer.destroy(); } catch (_) { /* ignore */ } }
  _composer = mountComposer(host, initial);
}


// ── Bank picker ──────────────────────────────────────────────
async function _loadBankSets() {
  const sel = _q('#cdx-bank-set');
  if (!sel) return;
  let res;
  try { res = await api.listSets(); } catch (e) { notice.internal(e); res = null; }
  const banks = (res && res.banks) || [];
  sel.innerHTML = '<option value="">' + _esc(t('questions.host_bank_pick')) + '</option>' + banks.map((b) => '<option value="' + _esc(b.name || b) + '">' + _esc(b.name || b) + '</option>').join('');
}

// The audience config (variables x audiences matrix) is loaded once per mount.
// It governs which bank questions show (unique ones are audience-scoped) and how
// variable {{...}} tokens resolve at launch.
async function _loadAudienceConfig() {
  let res;
  try { res = await audienceApi.getConfig(); } catch (_) { res = null; }
  _audienceConfig = (res && res.config) || null;
  _populateAudiencePicker();
}

function _populateAudiencePicker() {
  const sel = _q('#cdx-bank-audience');
  if (!sel) return;
  const auds = (_audienceConfig && _audienceConfig.audiences) || {};
  const keys = Object.keys(auds);
  if (!keys.length) { sel.hidden = true; sel.innerHTML = ''; return; }
  sel.hidden = false;
  sel.innerHTML = '<option value="">' + _esc(t('questions.host_audience_none')) + '</option>' +
    keys.map((k) => '<option value="' + _esc(k) + '"' + (k === _selectedAudience ? ' selected' : '') + '>' +
      _esc((auds[k] && auds[k].label) || k) + '</option>').join('');
}

// The value map of the currently selected audience, or null (no audience).
function _audienceValues() {
  if (!_audienceConfig || !_audienceConfig.audiences || !_selectedAudience) return null;
  const a = _audienceConfig.audiences[_selectedAudience];
  return (a && a.values) || null;
}

async function _loadBankQuestions(listName) {
  const list = _q('#cdx-bank-list');
  if (!list) return;
  if (!listName) { list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.host_bank_pick_hint')) + '</div>'; return; }
  list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.sessions_loading')) + '</div>';
  let res;
  try { res = await api.getQuestions({ list_name: listName }); } catch (e) { notice.internal(e); res = null; }
  // Hide unique questions that belong to a different audience than the selected one.
  const qs = ((res && res.questions) || []).filter((q) => visibleForAudience(q, _selectedAudience));
  if (!qs.length) { list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.host_bank_empty')) + '</div>'; return; }
  const vals = _audienceValues();
  _bankMap = {};
  list.innerHTML = qs.map((q, i) => {
    _bankMap[i] = q;
    // Show the resolved text for the selected audience so the host previews what
    // students will see; the raw template stays in _bankMap for launch.
    const shown = resolveQuestion(q, vals).question;
    return '<div class="cdx-bank-item" data-bank-i="' + i + '"><span class="cdx-bank-item-text">' + _esc(shown) + '</span>' +
      '<button class="cdx-btn cdx-btn-primary cdx-bank-launch" data-act="bank-launch" data-bank-i="' + i + '" type="button">' + _esc(t('questions.host_bank_launch')) + '</button></div>';
  }).join('');
}

function _safeParse(s) { try { return JSON.parse(s); } catch (_) { return []; } }

function _prefillFromBank(q) {
  const r = resolveQuestion(q, _audienceValues());
  const opts = Array.isArray(r.options) ? r.options
    : ((typeof q.options === 'string') ? _safeParse(q.options) : (q.options || []));
  const correct = Array.isArray(q.correct_answers) ? q.correct_answers
    : (q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== '' ? [parseInt(q.correct_answer, 10)] : []);
  _remountComposer({ type: q.type || 'mc', text: r.question, options: opts, correct_answers: correct, correct_answer: q.correct_answer, max_select: q.max_select !== undefined ? q.max_select : 1 });
}

async function _launchFromBank(q) {
  const r = resolveQuestion(q, _audienceValues());
  // Never launch an unresolved template to students: a leftover {{...}} means no
  // audience was picked, or the audience is missing a value for this variable.
  if (isVariable(r.question) || (Array.isArray(r.options) && r.options.some((o) => isVariable(o)))) {
    notice.error(t('questions.host_audience_unresolved'));
    return;
  }
  const opts = Array.isArray(r.options) ? r.options
    : ((typeof q.options === 'string') ? _safeParse(q.options) : (q.options || []));
  const payload = { session_code: _session.code, type: q.type || 'mc', text: r.question, options: opts,
    correct_answer: (q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== '') ? q.correct_answer : null };
  if (TEXT_TYPES.includes(q.type)) payload.max_select = 0;
  else payload.max_select = (q.max_select !== undefined && q.max_select !== null) ? parseInt(q.max_select, 10) : 1;
  try { await api.launchQuestion(payload); if (_qEl) _qEl.startPolling(); } catch (e) { notice.internal(e); }
}

// ── Layout (port of host-layout.js) ──────────────────────────
function _loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
    if (!saved) return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    ['left', 'center', 'right'].forEach((k) => { if (!saved[k]) saved[k] = JSON.parse(JSON.stringify(DEFAULT_LAYOUT[k])); if (typeof saved[k].visible !== 'boolean') saved[k].visible = true; });
    return saved;
  } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); }
}
function _saveLayout() { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(_layout)); } catch (e) { /* ignore */ } }
function _applyLayout() {
  const left = _q('#cdx-hd-left'), center = _q('#cdx-hd-center'), right = _q('#cdx-hd-right'), rLC = _q('#cdx-hd-rlc'), rCR = _q('#cdx-hd-rcr');
  if (!left || !center || !right) return;
  left.classList.toggle('cdx-hd-hidden', !_layout.left.visible);
  center.classList.toggle('cdx-hd-hidden', !_layout.center.visible);
  right.classList.toggle('cdx-hd-hidden', !_layout.right.visible);
  if (rLC) rLC.classList.toggle('cdx-hd-hidden', !(_layout.left.visible && (_layout.center.visible || _layout.right.visible)));
  if (rCR) rCR.classList.toggle('cdx-hd-hidden', !(_layout.right.visible && (_layout.center.visible || _layout.left.visible)));
  const maxW = Math.min(600, Math.max(280, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 320));
  _layout.left.width = Math.max(260, Math.min(maxW, _layout.left.width || 360));
  _layout.right.width = Math.max(280, Math.min(maxW, _layout.right.width || 380));
  left.style.width = _layout.left.width + 'px';
  right.style.width = _layout.right.width + 'px';
  _container.querySelectorAll('[data-toggle-col]').forEach((btn) => btn.classList.toggle('is-on', !!_layout[btn.dataset.toggleCol].visible));
}
function _startResize(e, handle) {
  e.preventDefault();
  handle.classList.add('cdx-hd-dragging');
  const direction = handle.dataset.resize;
  const startX = e.clientX;
  const leftCol = _q('#cdx-hd-left'), rightCol = _q('#cdx-hd-right');
  const startLeftW = leftCol.offsetWidth || _layout.left.width;
  const startRightW = rightCol.offsetWidth || _layout.right.width;
  const maxW = Math.min(600, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 320);
  const onMove = (ev) => {
    const delta = ev.clientX - startX;
    if (direction === 'left-center') { const w = Math.max(260, Math.min(maxW, startLeftW + delta)); leftCol.style.width = w + 'px'; _layout.left.width = w; }
    else { const w2 = Math.max(280, Math.min(maxW, startRightW - delta)); rightCol.style.width = w2 + 'px'; _layout.right.width = w2; }
  };
  const onUp = () => { handle.classList.remove('cdx-hd-dragging'); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); _saveLayout(); };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  _cleanup.push(() => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); });
}

// ── Mount / unmount ──────────────────────────────────────────
export function mount(containerEl, ctx) {
  _container = containerEl;
  _session = (ctx && ctx.session) || { code: '', status: 'closed', title: '' };
  _cleanup = [];
  _layout = _loadLayout();
  _auto = _loadAuto();
  _autoQId = null; _autoFiredQId = null; _autoLastCount = 0; _autoLastChangeAt = 0;
  _activeQId = null; _activeQType = null; _activeStudentQuestionId = null;
  _sqaLastServerAnswer = null; _sqaSaving = false; _historyMap = {}; _bankMap = {};
  _audienceConfig = null; _selectedAudience = '';
  _trailTurma = null; _trailAllTurmas = [];
  _onStats = (ctx && ctx.onStats) || null;
  _onDelete = (ctx && ctx.onDelete) || null;
  _onRename = (ctx && ctx.onRename) || null;

  registerQuestionEl();
  _render();
  _remountComposer(null);
  _applyLayout();
  _syncAutoUI();
  // The in-host answer simulator is a debug-only affordance: reveal it only when
  // the shared bs_debug flag is on, so it can never fire in a real class.
  const simEl = _q('#cdx-sim');
  if (simEl) simEl.hidden = !((typeof localStorage !== 'undefined') && localStorage.getItem('bs_debug') === '1');

  const renderHost = _q('#cdx-active-render');
  _qEl = document.createElement(QTAG);
  _qEl.setAttribute('mode', 'host');
  _qEl.onData = _onData;
  if (renderHost) renderHost.appendChild(_qEl);
  _qEl.start(_session.code);

  _qa = createQaFeed({ sessionCode: _session.code, feedEl: _q('#cdx-qa-feed'), badgeEl: _q('#cdx-qa-badge'), onError: (msg) => notice.error(msg) });

  _applyHostedUI(_isOpen());
  _loadTrail();
  _loadAudienceConfig();

  const host = _q('#cdx-host');
  _on(host, 'click', (e) => {
    // Any click outside the session-name menu closes it.
    if (!e.target.closest('.cdx-host-titlewrap')) { const nm = _q('#cdx-host-name-menu'); if (nm && !nm.hidden) nm.hidden = true; }
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const act = btn.getAttribute('data-act');
      if (act === 'stats') { if (_onStats) _onStats(); return; }
      if (act === 'name') { const nm = _q('#cdx-host-name-menu'); if (nm) nm.hidden = !nm.hidden; return; }
      if (act === 'rename') {
        const nm = _q('#cdx-host-name-menu'); if (nm) nm.hidden = true;
        const cur = (_session && _session.title) || '';
        const v = (typeof prompt === 'function') ? prompt(t('questions.host_rename_prompt'), cur) : null;
        if (v != null && v.trim() && _onRename) _onRename(v.trim());
        return;
      }
      if (act === 'delete') { const nm = _q('#cdx-host-name-menu'); if (nm) nm.hidden = true; if (typeof confirm !== 'function' || confirm(t('questions.sessions_delete_confirm'))) { if (_onDelete) _onDelete(); } return; }
      if (act === 'start') return _startHost(false);
      if (act === 'stop') return _stopHost();
      if (act === 'launch') return _launch();
      if (act === 'clear') return _remountComposer(null);
      if (act === 'close-q' || act === 'sqa-close') return _closeQuestion();
      if (act === 'sim-run') return _simulate();
      if (act === 'trail') { const m = _q('#cdx-trail-modal'); if (m) m.classList.add('open'); return; }
      if (act === 'qr') return _openQr();
      if (act === 'bank-toggle') { const p = _q('#cdx-bank-panel'); const open = p.classList.toggle('open'); btn.classList.toggle('open', open); if (open) _loadBankSets(); return; }
      if (act === 'bank-launch') { const q = _bankMap[btn.getAttribute('data-bank-i')]; if (q) _launchFromBank(q); return; }
      if (act === 'reset-layout') { _layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); _applyLayout(); _saveLayout(); return; }
    }
    const col = e.target.closest('[data-toggle-col]');
    if (col) {
      const key = col.dataset.toggleCol;
      const next = !_layout[key].visible;
      if (['left', 'center', 'right'].filter((k) => (k === key ? next : _layout[k].visible)).length === 0) return;
      _layout[key].visible = next; _applyLayout(); _saveLayout();
      return;
    }
    const histBtn = e.target.closest('[data-hi-act]');
    if (histBtn) {
      const q = _historyMap[histBtn.getAttribute('data-qid')];
      if (!q) return;
      const hiAct = histBtn.getAttribute('data-hi-act');
      if (hiAct === 'relaunch') _launchFromBank(q);
      else if (hiAct === 'delete') _deleteHistoryQuestion(q);
      else _prefillFromBank(q);
    }
  });

  // Trilha modal actions.
  const trailModal = _q('#cdx-trail-modal');
  _on(trailModal, 'click', (e) => {
    if (e.target === trailModal) { trailModal.classList.remove('open'); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'trail-close') trailModal.classList.remove('open');
    else if (act === 'trail-unlink') _unlinkTrail();
    else if (act === 'trail-link') { const v = (_q('#cdx-trail-picker') || {}).value; if (v) { const parts = v.split('|'); _linkTrail(parts[0], parts[1]); } }
  });

  _on(_q('#cdx-bank-set'), 'change', (e) => _loadBankQuestions(e.target.value));
  _on(_q('#cdx-bank-audience'), 'change', (e) => {
    _selectedAudience = e.target.value;
    const setSel = _q('#cdx-bank-set');
    _loadBankQuestions(setSel ? setSel.value : '');
  });
  _on(_q('#cdx-bank-list'), 'click', (e) => {
    const item = e.target.closest('[data-bank-i]');
    if (item && !e.target.closest('[data-act="bank-launch"]')) { const q = _bankMap[item.getAttribute('data-bank-i')]; if (q) _prefillFromBank(q); }
  });
  _on(_q('#cdx-sqa-response'), 'input', _scheduleSqaSave);
  _on(_q('#cdx-auto-on'), 'change', (e) => { _auto.enabled = !!e.target.checked; _saveAuto(); _syncAutoUI(); });
  _on(_q('#cdx-auto-pct'), 'input', (e) => { const v = parseInt(e.target.value, 10); _auto.pct = (Number.isFinite(v) && v > 0) ? Math.min(100, v) : DEFAULT_PCT; _saveAuto(); _syncAutoUI(); });
  _on(_q('#cdx-auto-head'), 'input', (e) => { const v = parseInt(e.target.value, 10); _auto.headcount = (Number.isFinite(v) && v > 0) ? v : ''; _saveAuto(); _syncAutoUI(); });
  _container.querySelectorAll('.cdx-hd-resizer').forEach((h) => _on(h, 'pointerdown', (e) => _startResize(e, h)));

  // Escape closes the Visao dropdown / Trilha modal; tracked document listener.
  _on(document, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    const d = _q('#cdx-host-visao'); if (d && d.open) d.open = false;
    const m = _q('#cdx-trail-modal'); if (m) m.classList.remove('open');
  });
}

export function unmount() {
  if (_qEl) { try { _qEl.teardown(); } catch (_) { /* ignore */ } _qEl.onData = null; _qEl = null; }
  if (_qa) { try { _qa.destroy(); } catch (_) { /* ignore */ } _qa = null; }
  if (_composer) { try { _composer.destroy(); } catch (_) { /* ignore */ } _composer = null; }
  if (_sqaDebounce) { clearTimeout(_sqaDebounce); _sqaDebounce = null; }
  if (_autoFlashTimer) { clearTimeout(_autoFlashTimer); _autoFlashTimer = null; }
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  if (_container) _container.innerHTML = '';
  _container = null; _session = null;
  _activeQId = null; _activeQType = null; _activeStudentQuestionId = null;
  _historyMap = {}; _bankMap = {}; _trailTurma = null; _trailAllTurmas = [];
  _auto = null; _autoQId = null; _autoFiredQId = null; _autoLastCount = 0; _autoLastChangeAt = 0;
  _simRunning = false;
  _onStats = null; _onDelete = null; _onRename = null;
}
