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
import { mountComposer, correctForLaunch } from './question-composer.js';
import { register as registerQuestionEl, TAG as QTAG } from './question-element.js';
import { createQaFeed } from './live-qa.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import { resolveQuestion, isVariable, questionType, bankVisible, availableTypeFilters, audienceControlMode } from '../js/audiences.js';
import { filterByClass } from './bank.js';
import { revealTarget, autoRevealDecision, DEFAULT_PCT } from './auto-reveal.js';
import { buildAnswer, makeRng, hashSeed } from './sim-answers.js';
import { hostLabel } from './identity.js';

const LAYOUT_KEY = 'codex_host_layout';
const AUTO_KEY = 'codex_host_autoreveal';
const CLOSE_OPTS_KEY = 'codex_host_close_opts'; // persisted show/reveal checkbox state
const SIM_N_KEY = 'codex_host_sim_n';           // persisted debug simulator count
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
let _bankMode = 'bank';       // 'bank' | 'new' launch-card mode (Do banco is the default)
let _bankFilter = 'all';      // active type chip: 'all'|'generic'|'variable'|'unique'
let _bankSetName = '';        // currently loaded conjunto (empty = none picked yet)
let _bankRaw = [];            // raw questions for the loaded set (audience/type filtered client-side)
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
let _connected = 0;        // live count of students with the answer page open (presence)

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
      '<span class="cdx-host-connected" id="cdx-host-connected" hidden></span>' +
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

// The class glyph shown on a bank row + its filter chip: a filled dot (generic),
// a diamond (variable), a star (specific/unique). Mirrors the legend in the mock.
const _CLASS_GLYPH = { generic: '●', variable: '◆', unique: '★' };

function _composerCardMarkup() {
  // Two ways to launch, mutually exclusive: "Do banco" (the default, primary path)
  // and "Nova pergunta" (the deliberate one). Bank mode reads audience FIRST, then
  // a conjunto, then type chips; the audience governs which questions even show
  // (bankVisible) and how variable {{...}} morph. See backstage/mocks/codex-bank-picker.html.
  return '<div class="cdx-host-card" id="cdx-launch-card">' +
    '<div class="cdx-host-card-title">' + _esc(t('questions.host_launch')) + '</div>' +
    '<div class="cdx-seg cdx-bank-mode" id="cdx-launch-mode" role="tablist">' +
      '<button class="cdx-seg-btn is-on" data-act="mode" data-mode="bank" type="button">' + _ICON_BANK + ' ' + _esc(t('questions.host_mode_bank')) + '</button>' +
      '<button class="cdx-seg-btn" data-act="mode" data-mode="new" type="button">' + _esc(t('questions.host_mode_new')) + '</button>' +
    '</div>' +
    '<div class="cdx-bank-pane" id="cdx-bank-pane">' +
      '<div class="cdx-bank-field">' +
        '<div class="cdx-bank-field-label">' + _esc(t('questions.host_bank_audience_label')) + '</div>' +
        '<div class="cdx-bank-aud" id="cdx-bank-aud"></div>' +
      '</div>' +
      '<div class="cdx-bank-field">' +
        '<label class="cdx-bank-field-label" for="cdx-bank-set">' + _esc(t('questions.host_bank_set_label')) + '</label>' +
        '<select class="cdx-select" id="cdx-bank-set"><option value="">' + _esc(t('questions.host_bank_pick')) + '</option></select>' +
      '</div>' +
      '<div class="cdx-bank-chips" id="cdx-bank-chips">' +
        '<button class="cdx-bank-chip is-on" data-act="bank-filter" data-f="all" type="button">' + _esc(t('questions.host_bank_filter_all')) + '</button>' +
        '<button class="cdx-bank-chip" data-act="bank-filter" data-f="generic" type="button"><span class="cdx-bank-glyph cdx-bank-glyph-generic" aria-hidden="true">' + _CLASS_GLYPH.generic + '</span> ' + _esc(t('questions.host_bank_filter_generic')) + '</button>' +
        '<button class="cdx-bank-chip" data-act="bank-filter" data-f="variable" type="button"><span class="cdx-bank-glyph cdx-bank-glyph-variable" aria-hidden="true">' + _CLASS_GLYPH.variable + '</span> ' + _esc(t('questions.host_bank_filter_variable')) + '</button>' +
        '<button class="cdx-bank-chip" data-act="bank-filter" data-f="unique" type="button"><span class="cdx-bank-glyph cdx-bank-glyph-unique" aria-hidden="true">' + _CLASS_GLYPH.unique + '</span> ' + _esc(t('questions.host_bank_filter_unique')) + '</button>' +
      '</div>' +
      '<div class="cdx-bank-list" id="cdx-bank-list"><div class="cdx-bank-msg">' + _esc(t('questions.host_bank_pick_hint')) + '</div></div>' +
    '</div>' +
    '<div class="cdx-bank-pane" id="cdx-new-pane" hidden>' +
      '<div class="cdx-host-composer" id="cdx-host-composer"></div>' +
      '<p class="cdx-host-error" id="cdx-host-error"></p>' +
      '<div class="cdx-host-btn-row">' +
        '<button class="cdx-btn cdx-btn-primary" data-act="launch" type="button">' + _esc(t('questions.host_launch_btn')) + '</button>' +
        '<button class="cdx-btn" data-act="clear" type="button">' + _esc(t('questions.host_clear')) + '</button>' +
      '</div>' +
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
            '<div class="cdx-active-btns">' +
              '<button class="cdx-btn cdx-btn-primary" data-act="reveal-now" type="button">' + _esc(t('questions.host_reveal_now')) + '</button>' +
              '<button class="cdx-btn cdx-btn-danger" data-act="close-q" type="button">' + _esc(t('questions.host_close_q')) + '</button>' +
            '</div>' +
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

// Auto-revelar control: opt-in, sits under the active question. The host picks a
// percentage; the target is that share of the LIVE connected count (people with
// the answer page open, not a typed number). Once that many have answered (or
// answers stall, the plateau backstop), the results are SHOWN on the display and
// the question stays OPEN (only Encerrar closes). Inert until toggled on; the live
// connected readout, "X / target", and bar update from the existing poll tick.
function _autoRevealMarkup() {
  return '<div class="cdx-autoreveal" id="cdx-autoreveal">' +
    '<label class="cdx-autoreveal-toggle"><input type="checkbox" id="cdx-auto-on"> ' + _esc(t('questions.host_autoreveal')) + '</label>' +
    '<div class="cdx-autoreveal-controls">' +
      '<input type="number" class="cdx-autoreveal-num" id="cdx-auto-pct" min="1" max="100" step="5">' +
      '<span class="cdx-autoreveal-unit">% ' + _esc(t('questions.host_autoreveal_of')) + '</span>' +
      '<span class="cdx-autoreveal-connected" id="cdx-auto-connected">0</span>' +
      '<span class="cdx-autoreveal-unit">' + _esc(t('questions.host_autoreveal_connected')) + '</span>' +
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
  // Live connected count (presence): people with the answer page open, distinct
  // from those who answered. Updates the bar badge + auto-reveal target each tick.
  _connected = (data && Number.isFinite(data.connected)) ? data.connected : 0;
  _paintConnected();
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
      const pct = parseInt(s.pct, 10);
      return { enabled: !!s.enabled, pct: (Number.isFinite(pct) && pct > 0) ? pct : DEFAULT_PCT };
    }
  } catch (e) { /* ignore */ }
  return { enabled: false, pct: DEFAULT_PCT };
}
function _saveAuto() { try { localStorage.setItem(AUTO_KEY, JSON.stringify(_auto)); } catch (e) { /* ignore */ } }

// Reflect the persisted prefs into the inputs + the "= N" target preview. The
// target is a share of the LIVE connected count, so it shows "aguardando conexões"
// while nobody is connected yet.
function _syncAutoUI() {
  const wrap = _q('#cdx-autoreveal'), on = _q('#cdx-auto-on'), pct = _q('#cdx-auto-pct'), conn = _q('#cdx-auto-connected'), target = _q('#cdx-auto-target');
  if (!on) return;
  on.checked = !!_auto.enabled;
  if (pct) pct.value = _auto.pct;
  if (conn) conn.textContent = String(_connected);
  if (wrap) wrap.classList.toggle('is-on', !!_auto.enabled);
  if (target) {
    const tg = _auto.enabled ? revealTarget(_connected, _auto.pct) : null;
    target.textContent = tg != null ? ('= ' + tg) : (_auto.enabled ? t('questions.host_autoreveal_waiting') : '');
  }
}

// Paint the live connected count (students with the answer page open) into both
// the host bar badge and the auto-revelar control. Driven by data.connected on
// every poll tick; the bar badge shows only while the session is being hosted.
function _paintConnected() {
  const bar = _q('#cdx-host-connected');
  if (bar) {
    if (_isOpen()) {
      bar.hidden = false;
      bar.textContent = '👥 ' + _connected;
      bar.title = t('questions.host_connected_title').replace('{n}', String(_connected));
    } else {
      bar.hidden = true;
    }
  }
  const conn = _q('#cdx-auto-connected');
  if (conn) conn.textContent = String(_connected);
  const target = _q('#cdx-auto-target');
  if (target && _auto) {
    const tg = _auto.enabled ? revealTarget(_connected, _auto.pct) : null;
    target.textContent = tg != null ? ('= ' + tg) : (_auto.enabled ? t('questions.host_autoreveal_waiting') : '');
  }
}

// Called on every poll tick for the active (non-SQA) question: track the count
// for plateau detection, paint the progress, and fire the reveal when due.
function _updateAutoReveal(q, total) {
  const now = Date.now();
  if (_autoQId !== q.id) { _autoQId = q.id; _autoLastCount = total; _autoLastChangeAt = now; }
  else if (total !== _autoLastCount) { _autoLastCount = total; _autoLastChangeAt = now; }
  const target = _auto.enabled ? revealTarget(_connected, _auto.pct) : null;
  const countEl = _q('#cdx-auto-count'), barEl = _q('#cdx-auto-bar');
  if (countEl) countEl.textContent = target != null ? (total + ' / ' + target) : ('' + total);
  if (barEl) barEl.style.width = (target ? Math.min(100, Math.round(total / target * 100)) : 0) + '%';
  if (!_auto.enabled || target == null || _autoFiredQId === q.id) return;
  const decision = autoRevealDecision({ enabled: true, count: total, target, lastChangeAt: _autoLastChangeAt, now });
  if (decision.reveal) { _autoFiredQId = q.id; _autoShow(decision.reason); }
}

// Threshold reached: SHOW the responses on the display (set_question_visibility),
// keeping the question OPEN so people can still answer. Never closes, only the
// Encerrar button closes. Cues the host (flash + chime) so they can watch the
// room, not the screen.
async function _autoShow(reason) {
  if (!_activeQId) return;
  try { await api.setVisibility({ id: _activeQId, session_code: _session.code, show_results: true }); }
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
  const botNames = Array.from({ length: n }, (_v, j) => 'Bot_' + String(j + 1).padStart(3, '0'));
  // Register each bot as "connected" FIRST, via the same inbox heartbeat a real
  // student's answer page sends. Without this the bots only submit answers and
  // never count toward the connected headcount, so auto-revelar (keyed to that
  // count) would never fire. Pre-registering establishes the room size up front,
  // so the threshold fires at its true percentage, not on the first answer.
  for (let i = 0; i < n; i += batch) {
    if (!_container || !_simRunning) break;
    await Promise.all(botNames.slice(i, i + batch).map((nm) =>
      api.studentInbox({ session_code: _session.code, student_name: nm, _silent: true }).catch(() => {})));
  }
  for (let i = 0; i < n; i += batch) {
    if (!_container || !_simRunning) break;
    const calls = [];
    for (let j = i; j < Math.min(i + batch, n); j++) {
      const payload = buildAnswer(q, makeRng(hashSeed('Bot_' + (j + 1) + ':' + q.id)), skew);
      if (!payload) continue;
      const params = Object.assign({ question_id: q.id, session_code: _session.code, student_name: botNames[j], _silent: true }, payload);
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
  metaEl.textContent = hostLabel(q.student_name) + (when ? ' · ' + when : '');
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

// Manual "Mostrar respostas": show the responses on the display RIGHT NOW
// (set_question_visibility), keeping the question OPEN so people keep answering.
// Only the Encerrar button closes. The correct-answer highlight remains a
// close-time option (the reveal checkbox), since the backend only reveals on close.
async function _revealNow() {
  if (!_activeQId) return;
  try { await api.setVisibility({ id: _activeQId, session_code: _session.code, show_results: true }); }
  catch (e) { notice.internal(e); return; }
  notice.info(t('questions.host_shown'));
}

// Persist the close-options checkboxes across questions AND sessions, so a host
// who always reveals (or never does) sets it once. Defaults match the prior
// behavior (show on, reveal off).
function _loadCloseOpts() {
  try { const s = JSON.parse(localStorage.getItem(CLOSE_OPTS_KEY)); if (s && typeof s === 'object') return { show: s.show !== false, reveal: !!s.reveal }; }
  catch (e) { /* ignore */ }
  return { show: true, reveal: false };
}
function _saveCloseOpts() {
  const show = !!(_q('#cdx-chk-show') && _q('#cdx-chk-show').checked);
  const reveal = !!(_q('#cdx-chk-reveal') && _q('#cdx-chk-reveal').checked);
  try { localStorage.setItem(CLOSE_OPTS_KEY, JSON.stringify({ show, reveal })); } catch (e) { /* ignore */ }
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
  // list_question_sets returns rows of { list_name, count }; read list_name (same
  // as the Bank sub-tab). Reading b.name fell back to the raw object, rendering
  // "[object Object]" and setting that as the option value, so no questions loaded.
  sel.innerHTML = '<option value="">' + _esc(t('questions.host_bank_pick')) + '</option>' +
    banks.map((b) => { const nm = (b && (b.list_name || b.name)) || ''; return '<option value="' + _esc(nm) + '">' + _esc(nm) + '</option>'; }).join('');
}

// The audience config (variables x audiences matrix) is loaded once per mount.
// It governs which bank questions show (unique ones are audience-scoped) and how
// variable {{...}} tokens resolve at launch.
async function _loadAudienceConfig() {
  let res;
  try { res = await audienceApi.getConfig(); } catch (_) { res = null; }
  _audienceConfig = (res && res.config) || null;
  _renderAudienceControl();
  _syncBankChips();
}

// The audience picker, audience-first in the bank pane. The 2b hybrid: render as
// segmented pills while the room is small (<= 3 real audiences, 4 pills with "Sem
// audiência"), switch to a dropdown beyond. Both carry the same "Sem audiência"
// entry. Clicks/changes are handled by delegated listeners on #cdx-bank-aud, so a
// re-render here never leaks listeners.
function _renderAudienceControl() {
  const host = _q('#cdx-bank-aud');
  if (!host) return;
  const auds = (_audienceConfig && _audienceConfig.audiences) || {};
  const keys = Object.keys(auds);
  const noneLabel = t('questions.host_audience_none');
  if (audienceControlMode(keys.length) === 'pills') {
    const pill = (val, label) => '<button class="cdx-bank-aud-pill' + (val === _selectedAudience ? ' is-on' : '') +
      '" data-act="bank-aud" data-aud="' + _esc(val) + '" type="button">' + _esc(label) + '</button>';
    host.innerHTML = '<div class="cdx-seg cdx-bank-aud-seg">' + pill('', noneLabel) +
      keys.map((k) => pill(k, (auds[k] && auds[k].label) || k)).join('') + '</div>';
  } else {
    host.innerHTML = '<select class="cdx-select" id="cdx-bank-aud-select"><option value="">' + _esc(noneLabel) + '</option>' +
      keys.map((k) => '<option value="' + _esc(k) + '"' + (k === _selectedAudience ? ' selected' : '') + '>' +
        _esc((auds[k] && auds[k].label) || k) + '</option>').join('') + '</select>';
  }
}

// Pick an audience (from a pill or the dropdown): re-paint the control, re-sync the
// type chips (Variáveis/Específicas unlock only with an audience), and re-filter the
// loaded set. No refetch: bankVisible and the {{...}} morph are both client-side.
function _selectAudience(val) {
  _selectedAudience = val || '';
  _renderAudienceControl();
  _syncBankChips();
  _renderBankList();
}

// Grey the type chips that make no sense for the current audience (no audience ->
// only Todas + Genéricas), and reset to Todas if the active chip just became
// unavailable. Mirrors the mock's syncChips.
function _syncBankChips() {
  const wrap = _q('#cdx-bank-chips');
  if (!wrap) return;
  const avail = availableTypeFilters(_selectedAudience);
  if (avail.indexOf(_bankFilter) === -1) _bankFilter = 'all';
  wrap.querySelectorAll('.cdx-bank-chip').forEach((c) => {
    const f = c.getAttribute('data-f');
    const ok = avail.indexOf(f) !== -1;
    c.classList.toggle('is-disabled', !ok);
    c.classList.toggle('is-on', f === _bankFilter);
    c.disabled = !ok;
  });
}

// Switch the launch card between the bank and the new-question composer.
function _setBankMode(mode) {
  _bankMode = (mode === 'new') ? 'new' : 'bank';
  const bankPane = _q('#cdx-bank-pane');
  const newPane = _q('#cdx-new-pane');
  if (bankPane) bankPane.hidden = (_bankMode !== 'bank');
  if (newPane) newPane.hidden = (_bankMode !== 'new');
  const seg = _q('#cdx-launch-mode');
  if (seg) seg.querySelectorAll('.cdx-seg-btn').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-mode') === _bankMode));
}

// The value map of the currently selected audience, or null (no audience).
function _audienceValues() {
  if (!_audienceConfig || !_audienceConfig.audiences || !_selectedAudience) return null;
  const a = _audienceConfig.audiences[_selectedAudience];
  return (a && a.values) || null;
}

// Fetch a conjunto's questions once and cache them; audience + type filtering then
// runs client-side (bankVisible + filterByClass) so chip/audience clicks never hit
// the network. Selecting the empty option clears the list back to the hint.
async function _loadBankQuestions(listName) {
  _bankSetName = listName || '';
  const list = _q('#cdx-bank-list');
  if (!list) return;
  if (!_bankSetName) { _bankRaw = []; _renderBankList(); return; }
  list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.sessions_loading')) + '</div>';
  let res;
  try { res = await api.getQuestions({ list_name: _bankSetName }); } catch (e) { notice.internal(e); res = null; }
  _bankRaw = (res && res.questions) || [];
  _renderBankList();
}

// Render the cached set under the current audience + type filters. bankVisible
// drops what the audience cannot use (no audience -> generic only; an audience ->
// generic + variable + its own unique); filterByClass then applies the chip.
function _renderBankList() {
  const list = _q('#cdx-bank-list');
  if (!list) return;
  if (!_bankSetName) { list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.host_bank_pick_hint')) + '</div>'; return; }
  let qs = _bankRaw.filter((q) => bankVisible(q, _selectedAudience));
  qs = filterByClass(qs, _bankFilter);
  if (!qs.length) { list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.host_bank_empty')) + '</div>'; return; }
  const vals = _audienceValues();
  _bankMap = {};
  list.innerHTML = qs.map((q, i) => {
    _bankMap[i] = q;
    // One-line row: chevron + class glyph + truncated text + glyph buttons (✎ Editar,
    // ▶ Lançar). Clicking the row body expands it to the full text + options with the
    // correct one marked. The resolved text/options preview what students will see
    // (the raw template stays in _bankMap for launch). Editar opens the composer.
    const resolved = resolveQuestion(q, vals);
    const cls = questionType(q);
    return '<div class="cdx-bank-item" data-bank-i="' + i + '">' +
      '<div class="cdx-bank-item-head">' +
        '<span class="cdx-bank-chevron" aria-hidden="true">▸</span>' +
        '<span class="cdx-bank-glyph cdx-bank-glyph-' + cls + '" aria-hidden="true">' + _CLASS_GLYPH[cls] + '</span>' +
        '<span class="cdx-bank-item-text">' + _esc(resolved.question) + '</span>' +
        '<button class="cdx-iconbtn cdx-bank-edit" data-act="bank-edit" data-bank-i="' + i + '" type="button" title="' + _esc(t('questions.host_bank_edit')) + '" aria-label="' + _esc(t('questions.host_bank_edit')) + '">✎</button>' +
        '<button class="cdx-iconbtn cdx-iconbtn-go cdx-bank-launch" data-act="bank-launch" data-bank-i="' + i + '" type="button" title="' + _esc(t('questions.host_bank_launch')) + '" aria-label="' + _esc(t('questions.host_bank_launch')) + '">▶</button>' +
      '</div>' +
      _bankDetailHtml(q, resolved) +
    '</div>';
  }).join('');
}

// The expandable detail under a bank row: type tag, the correct answer (host-only),
// and the option list with the correct one marked. Text types carry no options, so
// only the type shows; the full question text appears by letting the head text wrap
// when the row is open (CSS). Reuses the shared correct-answer resolver.
function _bankDetailHtml(q, resolved) {
  const type = q.type || 'mc';
  const isOpt = ['mc', 'tf', 'poll'].includes(type);
  const opts = Array.isArray(resolved.options) ? resolved.options
    : ((typeof q.options === 'string') ? _safeParse(q.options) : (q.options || []));
  const correctVal = correctForLaunch(q);
  let correctIdx = [];
  if (Array.isArray(correctVal)) correctIdx = correctVal.map(Number);
  else if (correctVal !== null && correctVal !== undefined && correctVal !== '') { const n = parseInt(correctVal, 10); if (Number.isInteger(n)) correctIdx = [n]; }
  const resp = (type !== 'poll' && correctIdx.length)
    ? (' · ' + t('questions.host_bank_answer') + ': ' + correctIdx.map((ix) => LETTERS[ix] || (ix + 1)).join(', ')) : '';
  // Class tag (generic / variable / specific): tells the host what kind of bank
  // question it is. A "specific" (unique) one also names the audience it belongs
  // to, so it's clear why an audience filter hides or shows it.
  const cls = questionType(q); // 'generic' | 'variable' | 'unique'
  const clsLabel = cls === 'unique' ? t('questions.host_bank_class_unique')
    : (cls === 'variable' ? t('questions.host_bank_class_variable') : t('questions.host_bank_class_generic'));
  let clsAud = '';
  if (cls === 'unique' && q.audience) {
    const auds = (_audienceConfig && _audienceConfig.audiences) || {};
    clsAud = ' · ' + ((auds[q.audience] && auds[q.audience].label) || q.audience);
  }
  let optsHtml = '';
  if (isOpt && Array.isArray(opts) && opts.length) {
    optsHtml = '<div class="cdx-bank-detail-opts">' + opts.map((o, ix) => {
      const ok = correctIdx.indexOf(ix) !== -1;
      return '<div class="cdx-bank-opt' + (ok ? ' is-correct' : '') + '">' + _esc((LETTERS[ix] || (ix + 1)) + ') ' + o) + (ok ? ' ✓' : '') + '</div>';
    }).join('') + '</div>';
  }
  return '<div class="cdx-bank-detail">' +
    '<div class="cdx-bank-detail-meta">' +
      '<span class="cdx-bank-class cdx-bank-class-' + cls + '">' + _esc(clsLabel) + '</span> ' +
      _esc((TYPE_TAGS[type] || type) + clsAud + resp) +
    '</div>' +
    optsHtml +
  '</div>';
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
  // Resolve the correct answer from EITHER the bank scalar or a history item's
  // correct_answers array; reading only the scalar dropped it on relaunch, so a
  // closed question couldn't highlight on reveal.
  const payload = { session_code: _session.code, type: q.type || 'mc', text: r.question, options: opts,
    correct_answer: correctForLaunch(q) };
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
  _connected = 0;
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
  // Restore persisted host controls (close-options + simulator count).
  const co = _loadCloseOpts();
  const chkShow = _q('#cdx-chk-show'); if (chkShow) chkShow.checked = co.show;
  const chkReveal = _q('#cdx-chk-reveal'); if (chkReveal) chkReveal.checked = co.reveal;
  try { const savedN = parseInt(localStorage.getItem(SIM_N_KEY), 10); const simN = _q('#cdx-sim-n'); if (simN && Number.isFinite(savedN) && savedN > 0) simN.value = Math.min(200, savedN); } catch (e) { /* ignore */ }

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
  _loadBankSets();

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
      if (act === 'reveal-now') return _revealNow();
      if (act === 'sim-run') return _simulate();
      if (act === 'trail') { const m = _q('#cdx-trail-modal'); if (m) m.classList.add('open'); return; }
      if (act === 'qr') return _openQr();
      if (act === 'mode') { _setBankMode(btn.getAttribute('data-mode')); return; }
      if (act === 'bank-filter') { if (btn.disabled || btn.classList.contains('is-disabled')) return; _bankFilter = btn.getAttribute('data-f') || 'all'; _syncBankChips(); _renderBankList(); return; }
      if (act === 'bank-launch') { const q = _bankMap[btn.getAttribute('data-bank-i')]; if (q) _launchFromBank(q); return; }
      if (act === 'bank-edit') { const q = _bankMap[btn.getAttribute('data-bank-i')]; if (q) { _setBankMode('new'); _prefillFromBank(q); } return; }
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
  // The audience control re-renders (pills <-> dropdown), so delegate from the
  // stable container: a pill click or the dropdown change both pick an audience.
  _on(_q('#cdx-bank-aud'), 'click', (e) => {
    const b = e.target.closest('[data-act="bank-aud"]');
    if (b) _selectAudience(b.getAttribute('data-aud') || '');
  });
  _on(_q('#cdx-bank-aud'), 'change', (e) => {
    if (e.target && e.target.id === 'cdx-bank-aud-select') _selectAudience(e.target.value);
  });
  _on(_q('#cdx-bank-list'), 'click', (e) => {
    // Editar/Lançar are data-act buttons handled by the host click handler; a click
    // on the row body (chevron or text) just expands/collapses the readable detail.
    if (e.target.closest('[data-act]')) return;
    const item = e.target.closest('.cdx-bank-item');
    if (item) item.classList.toggle('is-open');
  });
  _on(_q('#cdx-sqa-response'), 'input', _scheduleSqaSave);
  _on(_q('#cdx-auto-on'), 'change', (e) => { _auto.enabled = !!e.target.checked; _saveAuto(); _syncAutoUI(); });
  _on(_q('#cdx-auto-pct'), 'input', (e) => { const v = parseInt(e.target.value, 10); _auto.pct = (Number.isFinite(v) && v > 0) ? Math.min(100, v) : DEFAULT_PCT; _saveAuto(); _syncAutoUI(); });
  _on(_q('#cdx-chk-show'), 'change', _saveCloseOpts);
  _on(_q('#cdx-chk-reveal'), 'change', _saveCloseOpts);
  _on(_q('#cdx-sim-n'), 'input', (e) => { const v = parseInt(e.target.value, 10); try { if (Number.isFinite(v) && v > 0) localStorage.setItem(SIM_N_KEY, String(Math.min(200, v))); } catch (err) { /* ignore */ } });
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
  _connected = 0;
  _simRunning = false;
  _onStats = null; _onDelete = null; _onRename = null;
}
