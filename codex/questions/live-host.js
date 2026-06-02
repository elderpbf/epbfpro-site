// questions/live-host.js
// Codex-native live host dashboard (Q2): a faithful port of the legacy
// ClassPulse 3-column host (host.html + host-composer/history/sqa/layout). It
// mounts into the Sessions detail for the selected OPEN session and gives the
// instructor the live teaching surface: a launch composer (left), the active
// question with live results + the closed-question history (center), and the
// student Q&A feed (right), over a resizable 3-column layout.
//
// Contract: backend ONLY through the codex-api facade; the active question is
// rendered by the Codex-owned <codex-question> element (question-element.js),
// driven through its SCOPED callbacks (no document event bus); the Q&A feed is
// live-qa.js. Strings via t(); cdx- classes; no inline handlers.
//
// unmount() is the release-gated teardown (tests/questions-unmount.test.mjs): it
// tears down the embedded element's poll timer, the Q&A feed's poll timer, the
// student-Q&A answer debounce, and every layout/resizer/document listener.
import { questions as api } from '../js/codex-api.js';
import { mountComposer } from './question-composer.js';
import { register as registerQuestionEl, TAG as QTAG } from './question-element.js';
import { createQaFeed } from './live-qa.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';

const LAYOUT_KEY = 'codex_host_layout';
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

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function _on(el, evt, fn, opts) {
  if (!el) return;
  el.addEventListener(evt, fn, opts);
  _cleanup.push(() => el.removeEventListener(evt, fn, opts));
}

function _q(sel) { return _container && _container.querySelector(sel); }

// ── Layout persistence (port of host-layout.js) ──────────────
function _loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
    if (!saved) return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    ['left', 'center', 'right'].forEach((k) => {
      if (!saved[k]) saved[k] = JSON.parse(JSON.stringify(DEFAULT_LAYOUT[k]));
      if (typeof saved[k].visible !== 'boolean') saved[k].visible = true;
    });
    return saved;
  } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); }
}

function _saveLayout() {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(_layout)); } catch (e) { /* ignore */ }
}

function _applyLayout() {
  const left = _q('#cdx-hd-left'), center = _q('#cdx-hd-center'), right = _q('#cdx-hd-right');
  const rLC = _q('#cdx-hd-rlc'), rCR = _q('#cdx-hd-rcr');
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
  _container.querySelectorAll('[data-toggle-col]').forEach((btn) => {
    btn.classList.toggle('is-on', !!_layout[btn.dataset.toggleCol].visible);
  });
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
    if (direction === 'left-center') {
      const w = Math.max(260, Math.min(maxW, startLeftW + delta));
      leftCol.style.width = w + 'px'; _layout.left.width = w;
    } else {
      const w2 = Math.max(280, Math.min(maxW, startRightW - delta));
      rightCol.style.width = w2 + 'px'; _layout.right.width = w2;
    }
  };
  const onUp = () => {
    handle.classList.remove('cdx-hd-dragging');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    _saveLayout();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  // Track for unmount in case teardown happens mid-drag.
  _cleanup.push(() => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); });
}

// ── Markup ───────────────────────────────────────────────────
function _render() {
  const open = _session.status === 'open';
  _container.innerHTML =
    '<div class="cdx-host" id="cdx-host">' +
      '<div class="cdx-host-bar">' +
        '<div class="cdx-host-bar-left">' +
          (open ? '<span class="cdx-host-live"><span class="cdx-host-live-dot"></span><span class="cdx-host-live-label">' + _esc(t('questions.qr_live')) + '</span></span>' : '') +
          '<span class="cdx-host-code">' + _esc(_session.code) + '</span>' +
        '</div>' +
        '<div class="cdx-host-bar-actions">' +
          '<details class="cdx-host-visao"><summary>' + _esc(t('questions.host_view')) + ' ▾</summary>' +
            '<div class="cdx-host-visao-panel">' +
              '<div class="cdx-host-visao-label">' + _esc(t('questions.host_columns')) + '</div>' +
              '<button class="cdx-host-vt is-on" data-toggle-col="left" type="button">' + _esc(t('questions.host_col_composer')) + '</button>' +
              '<button class="cdx-host-vt is-on" data-toggle-col="center" type="button">' + _esc(t('questions.host_col_active')) + '</button>' +
              '<button class="cdx-host-vt is-on" data-toggle-col="right" type="button">' + _esc(t('questions.host_col_qa')) + '</button>' +
              '<button class="cdx-host-reset" data-act="reset-layout" type="button">' + _esc(t('questions.host_reset_layout')) + '</button>' +
            '</div>' +
          '</details>' +
          '<a class="cdx-btn cdx-host-display" href="' + _esc(_displayHref()) + '" target="_blank" rel="noopener">' + _esc(t('questions.host_display')) + '</a>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-host-dashboard">' +
        '<section class="cdx-hd-col cdx-hd-col-left" id="cdx-hd-left">' + _composerCardMarkup() + '</section>' +
        '<div class="cdx-hd-resizer" data-resize="left-center" id="cdx-hd-rlc"></div>' +
        '<section class="cdx-hd-col cdx-hd-col-center" id="cdx-hd-center">' + _centerMarkup() + '</section>' +
        '<div class="cdx-hd-resizer" data-resize="center-right" id="cdx-hd-rcr"></div>' +
        '<section class="cdx-hd-col cdx-hd-col-right" id="cdx-hd-right">' + _qaMarkup() + '</section>' +
      '</div>' +
    '</div>';
}

function _displayHref() { return '/go/display.html?code=' + encodeURIComponent(_session.code); }

function _composerCardMarkup() {
  return '<div class="cdx-host-card" id="cdx-launch-card">' +
    '<div class="cdx-host-card-title">' + _esc(t('questions.host_launch')) + '</div>' +
    '<button class="cdx-bank-toggle" data-act="bank-toggle" type="button">' + _esc(t('questions.host_bank')) + ' <i class="cdx-bank-chevron">▾</i></button>' +
    '<div class="cdx-bank-panel" id="cdx-bank-panel">' +
      '<select class="cdx-select" id="cdx-bank-set"><option value="">' + _esc(t('questions.host_bank_pick')) + '</option></select>' +
      '<div class="cdx-bank-list" id="cdx-bank-list"><div class="cdx-bank-msg">' + _esc(t('questions.host_bank_pick_hint')) + '</div></div>' +
    '</div>' +
    '<div class="cdx-host-composer" id="cdx-host-composer"></div>' +
    '<div class="cdx-close-options">' +
      '<label><input type="checkbox" id="cdx-chk-show" checked> ' + _esc(t('questions.host_show_results')) + '</label>' +
      '<label><input type="checkbox" id="cdx-chk-reveal"> ' + _esc(t('questions.host_reveal_answer')) + '</label>' +
    '</div>' +
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
        '<div class="cdx-active-foot">' +
          '<span class="cdx-active-tally" id="cdx-active-tally"></span>' +
          '<button class="cdx-btn cdx-btn-danger" data-act="close-q" type="button">' + _esc(t('questions.host_close_q')) + '</button>' +
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

function _qaMarkup() {
  return '<section class="cdx-qa-section" id="cdx-qa-section">' +
    '<div class="cdx-qa-header">' +
      '<span class="cdx-qa-title">' + _esc(t('questions.host_qa_title')) + '</span>' +
      '<span class="cdx-qa-badge" id="cdx-qa-badge" style="display:none"></span>' +
    '</div>' +
    '<div id="cdx-qa-feed"></div>' +
  '</section>';
}

// ── History (port of host-history.js renderHistory) ──────────
const TYPE_TAGS = { mc: 'MC', tf: 'V/F', poll: 'Enquete', open: 'Aberta', wordcloud: 'Nuvem', rating: 'Avaliação', numeric: 'Número' };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function _renderHistory(closedQs) {
  const card = _q('#cdx-history-card');
  const list = _q('#cdx-history-list');
  if (!card || !list) return;
  if (!closedQs || !closedQs.length) { card.style.display = 'none'; return; }

  list.innerHTML = closedQs.map((q) => {
    let resultsHtml = '';
    if (q.options && q.answer_counts && q.options.length > 0) {
      const hTotal = q.answer_counts.reduce((a, b) => a + b, 0);
      const hDenom = (q.voter_count && q.voter_count > 0) ? q.voter_count : hTotal;
      const hCorrect = Array.isArray(q.correct_answers) ? q.correct_answers : [];
      resultsHtml = '<div class="cdx-hi-results">' + q.options.map((opt, i) => {
        const pct = hDenom > 0 ? Math.round(q.answer_counts[i] / hDenom * 100) : 0;
        const isCorrect = q.reveal_answer && hCorrect.indexOf(i) !== -1;
        return '<div class="cdx-hi-bar">' +
          '<div class="cdx-hi-bar-label"><span class="cdx-hi-bar-badge ' + (isCorrect ? 'correct' : '') + '">' +
            LETTERS[i] + (isCorrect ? ' ✓' : '') + '</span>' +
            '<span class="cdx-hi-bar-text">' + _esc(opt) + '</span></div>' +
          '<div class="cdx-hi-bar-pct">' + pct + '%</div>' +
          '<div class="cdx-hi-bar-count">' + q.answer_counts[i] + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }
    const tag = TYPE_TAGS[q.type || 'mc'] || (q.type || 'mc');
    const when = q.created_at ? new Date(q.created_at).toLocaleString('pt-BR') : '';
    return '<div class="cdx-history-item" data-qid="' + _esc(q.id) + '">' +
      '<div class="cdx-hi-text">' + _esc(q.text || '') + '</div>' +
      '<span class="cdx-hi-type cdx-hi-type-' + (q.type || 'mc') + '">' + _esc(tag) + '</span>' +
      '<div class="cdx-hi-meta">' + _esc(when) + '</div>' +
      resultsHtml +
      '<div class="cdx-hi-actions">' +
        '<button class="cdx-hi-btn cdx-hi-btn-primary" data-hi-act="relaunch" data-qid="' + _esc(q.id) + '" type="button">' + _esc(t('questions.host_relaunch')) + '</button>' +
        '<button class="cdx-hi-btn" data-hi-act="edit" data-qid="' + _esc(q.id) + '" type="button">' + _esc(t('questions.host_edit')) + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
  card.style.display = 'block';
  // keep a map for relaunch/edit
  _historyMap = {};
  closedQs.forEach((q) => { _historyMap[q.id] = q; });
}

let _historyMap = {};

// ── Active question panel + Q&A sync (port of host-page _cpqDataHandler) ──
function _onData(data) {
  if (!_container) return;
  if (_qa) _qa.syncFromState(data);
  _renderHistory(data.history || []);

  const q = data.active_question;
  const panel = _q('#cdx-active-panel');
  const std = _q('#cdx-active-standard');
  const sqa = _q('#cdx-active-sqa');
  if (!q) {
    _activeQId = null; _activeQType = null; _activeStudentQuestionId = null;
    if (panel) panel.style.display = 'none';
    if (std) std.style.display = '';
    if (sqa) sqa.style.display = 'none';
    return;
  }
  _activeQId = q.id;
  _activeQType = q.type || 'mc';

  if (_activeQType === 'student_qa') {
    _activeStudentQuestionId = q.student_question_id || null;
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

  if (panel) panel.style.display = 'block';
}

// ── Student-Q&A active card debounce (port of host-sqa.js) ───
function _renderSqaActive(q) {
  const metaEl = _q('#cdx-sqa-meta');
  const textEl = _q('#cdx-sqa-text');
  const inputEl = _q('#cdx-sqa-response');
  const statusEl = _q('#cdx-sqa-status');
  if (!metaEl || !textEl || !inputEl || !statusEl) return;
  let when = '';
  try { when = q.student_time ? new Date(q.student_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; } catch (_) { when = ''; }
  metaEl.textContent = (q.student_name || t('questions.qr_anonymous')) + (when ? ' · ' + when : '');
  textEl.textContent = q.text || '';
  const serverAnswer = q.student_answer || '';
  if ((typeof document === 'undefined' || document.activeElement !== inputEl) && serverAnswer !== _sqaLastServerAnswer) {
    inputEl.value = serverAnswer;
  }
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

// ── Bank picker (set select + question list -> prefill composer) ──
async function _loadBankSets() {
  const sel = _q('#cdx-bank-set');
  if (!sel) return;
  let res;
  try { res = await api.listSets(); } catch (e) { notice.internal(e); res = null; }
  const banks = (res && res.banks) || [];
  sel.innerHTML = '<option value="">' + _esc(t('questions.host_bank_pick')) + '</option>' +
    banks.map((b) => '<option value="' + _esc(b.name || b) + '">' + _esc(b.name || b) + '</option>').join('');
}

async function _loadBankQuestions(listName) {
  const list = _q('#cdx-bank-list');
  if (!list) return;
  if (!listName) { list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.host_bank_pick_hint')) + '</div>'; return; }
  list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.sessions_loading')) + '</div>';
  let res;
  try { res = await api.getQuestions({ list_name: listName }); } catch (e) { notice.internal(e); res = null; }
  const qs = (res && res.questions) || [];
  if (!qs.length) { list.innerHTML = '<div class="cdx-bank-msg">' + _esc(t('questions.host_bank_empty')) + '</div>'; return; }
  _bankMap = {};
  list.innerHTML = qs.map((q, i) => {
    _bankMap[i] = q;
    return '<div class="cdx-bank-item" data-bank-i="' + i + '">' +
      '<span class="cdx-bank-item-text">' + _esc(q.question || q.text || '') + '</span>' +
      '<button class="cdx-btn cdx-btn-primary cdx-bank-launch" data-act="bank-launch" data-bank-i="' + i + '" type="button">' + _esc(t('questions.host_bank_launch')) + '</button>' +
    '</div>';
  }).join('');
}

let _bankMap = {};

function _prefillFromBank(q) {
  const opts = (typeof q.options === 'string') ? _safeParse(q.options) : (q.options || []);
  const correct = Array.isArray(q.correct_answers) ? q.correct_answers
    : (q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== '' ? [parseInt(q.correct_answer, 10)] : []);
  _remountComposer({
    type: q.type || 'mc',
    text: q.question || q.text || '',
    options: opts,
    correct_answers: correct,
    correct_answer: q.correct_answer,
    max_select: q.max_select !== undefined ? q.max_select : 1,
  });
}

function _safeParse(s) { try { return JSON.parse(s); } catch (_) { return []; } }

async function _launchFromBank(q) {
  const opts = (typeof q.options === 'string') ? _safeParse(q.options) : (q.options || []);
  const payload = { session_code: _session.code, type: q.type || 'mc', text: q.question || q.text, options: opts,
    correct_answer: (q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== '') ? q.correct_answer : null };
  if (TEXT_TYPES.includes(q.type)) payload.max_select = 0;
  else payload.max_select = (q.max_select !== undefined && q.max_select !== null) ? parseInt(q.max_select, 10) : 1;
  try { await api.launchQuestion(payload); _activeQId = null; } catch (e) { notice.internal(e); }
}

// ── Mount / unmount ──────────────────────────────────────────
export function mount(containerEl, ctx) {
  _container = containerEl;
  _session = (ctx && ctx.session) || { code: '', status: 'open', title: '' };
  _cleanup = [];
  _layout = _loadLayout();
  _activeQId = null; _activeQType = null; _activeStudentQuestionId = null;
  _sqaLastServerAnswer = null; _sqaSaving = false; _historyMap = {}; _bankMap = {};

  registerQuestionEl();
  _render();
  _remountComposer(null);
  _applyLayout();

  // Embed the Codex-owned render element and drive it through scoped callbacks.
  const renderHost = _q('#cdx-active-render');
  _qEl = document.createElement(QTAG);
  _qEl.setAttribute('mode', 'host');
  _qEl.onData = _onData;
  if (renderHost) renderHost.appendChild(_qEl);
  _qEl.start(_session.code);

  // Q&A feed (right column) owns its own poll.
  _qa = createQaFeed({
    sessionCode: _session.code,
    feedEl: _q('#cdx-qa-feed'),
    badgeEl: _q('#cdx-qa-badge'),
    onError: (msg) => notice.error(msg),
  });

  // Delegated dashboard actions.
  const host = _q('#cdx-host');
  _on(host, 'click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const act = btn.getAttribute('data-act');
      if (act === 'launch') return _launch();
      if (act === 'clear') return _remountComposer(null);
      if (act === 'close-q') return _closeQuestion();
      if (act === 'sqa-close') return _closeQuestion();
      if (act === 'bank-toggle') {
        const panel = _q('#cdx-bank-panel');
        const open = panel.classList.toggle('open');
        btn.classList.toggle('open', open);
        if (open) _loadBankSets();
        return;
      }
      if (act === 'bank-launch') { const q = _bankMap[btn.getAttribute('data-bank-i')]; if (q) _launchFromBank(q); return; }
      if (act === 'reset-layout') { _layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); _applyLayout(); _saveLayout(); return; }
    }
    const col = e.target.closest('[data-toggle-col]');
    if (col) {
      const key = col.dataset.toggleCol;
      const next = !_layout[key].visible;
      const visibleCount = ['left', 'center', 'right'].filter((k) => (k === key ? next : _layout[k].visible)).length;
      if (visibleCount === 0) return;
      _layout[key].visible = next;
      _applyLayout(); _saveLayout();
      return;
    }
    const histBtn = e.target.closest('[data-hi-act]');
    if (histBtn) {
      const q = _historyMap[histBtn.getAttribute('data-qid')];
      if (!q) return;
      if (histBtn.getAttribute('data-hi-act') === 'relaunch') _launchFromBank(q);
      else _prefillFromBank(q);
    }
  });

  // Bank set change + question pick.
  _on(_q('#cdx-bank-set'), 'change', (e) => _loadBankQuestions(e.target.value));
  _on(_q('#cdx-bank-list'), 'click', (e) => {
    const item = e.target.closest('[data-bank-i]');
    if (item && !e.target.closest('[data-act="bank-launch"]')) {
      const q = _bankMap[item.getAttribute('data-bank-i')];
      if (q) _prefillFromBank(q);
    }
  });

  // Student-Q&A live answer typing (debounced).
  _on(_q('#cdx-sqa-response'), 'input', _scheduleSqaSave);

  // Resizers.
  _container.querySelectorAll('.cdx-hd-resizer').forEach((h) => _on(h, 'pointerdown', (e) => _startResize(e, h)));

  // A persistent document listener (Escape closes the Visão dropdown); tracked
  // so it never leaks across a tab switch.
  _on(document, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    const d = _q('.cdx-host-visao');
    if (d && d.open) d.open = false;
  });
}

export function unmount() {
  if (_qEl) { try { _qEl.teardown(); } catch (_) { /* ignore */ } _qEl.onData = null; _qEl = null; }
  if (_qa) { try { _qa.destroy(); } catch (_) { /* ignore */ } _qa = null; }
  if (_composer) { try { _composer.destroy(); } catch (_) { /* ignore */ } _composer = null; }
  if (_sqaDebounce) { clearTimeout(_sqaDebounce); _sqaDebounce = null; }
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  if (_container) _container.innerHTML = '';
  _container = null;
  _session = null;
  _activeQId = null; _activeQType = null; _activeStudentQuestionId = null;
  _historyMap = {}; _bankMap = {};
}
