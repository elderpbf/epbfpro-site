// codex/trilha/js/survey.js
// THE GATE (track-64 §3.7b). When a cohort's reaction survey is open and this student has not
// answered, the survey covers the trail and the only way past it is answering.
//
// It draws no question. Every card, every input kind and every counting rule comes from
// js/survey-question.js, the shared seam the admin tab imports too, so the preview Élder sees and
// the form a student answers cannot disagree.
//
// It decides nothing either. Whether to gate is js/survey-locks.js shouldGate(), the same module
// the admin tab reads to explain why a send is blocked. The Worker returns the FIELDS; one
// implementation of the decision serves both screens.
//
// FAIL OPEN, always. A missing field, a timeout, an unexpected shape: the trail renders. A wall
// raised by a failed fetch is exactly the stranded student this feature was warned about, and it
// is the same doctrine as the Trilha access gate (Key Decision 2026-07-10, "gate falha-aberto").
//
// The trail is COVERED, never touched: nothing is hidden, moved or stored, so dismissing the
// overlay needs nothing restored.
//
// PACE is a code-level default with a query override for comparison (§3.7). Both layouts stay
// built and tested; ?survey=steps shows one question at a time on the same data. The presentation
// is fixed: the gate is the full-screen one, below the trail's own header.
import { t } from '../i18n.js';
import { glyphSvg } from '../../js/glyphs.js';
import { esc } from '../../js/dom.js';
import {
  questionCard, progressHtml, patchQuestion, patchProgress, applyWordInput,
  isAnswered, nextUnanswered, isSelfAdvancing, hookFrom, isComplete, itemFromRow,
} from '../../js/survey-question.js';
import { shouldGate } from '../../js/survey-locks.js';
import { trail } from './api.js';
import { state } from './state.js';

// The gate is always the full-screen presentation; only the PACE stays a choice, and only as a
// code-level default (§3.7). Letting the student pick would put a decision before question 1, and
// switching automatically by device makes it impossible to know what any given student saw.
const PACES = ['all', 'steps'];
export function paceFrom(search) {
  return /(?:^|[?&])survey=steps(?:&|$)/.test(String(search || '')) ? 'steps' : 'all';
}

// The rows the Worker returned, as the items the seam renders, plus the id each answer must be
// sent back under. The renderer keys answers by INDEX; ct_survey_responses keys them by
// question_id, and this is the only place the two meet.
export function itemsFromRows(rows) {
  const out = [];
  (rows || []).forEach((r) => {
    try { out.push(Object.assign(itemFromRow(r), { id: r.id })); }
    catch (_) { /* an unknown kind is a row this build cannot render; skipping beats throwing */ }
  });
  return out;
}

export function answersByQuestionId(items, answers) {
  const out = {};
  (items || []).forEach((it, i) => {
    if (!it || it.id == null) return;
    const v = (answers || {})[i];
    if (v == null || (Array.isArray(v) ? !v.some((w) => String(w || '').trim()) : String(v).trim() === '')) return;
    out[it.id] = v;
  });
  return out;
}

const _st = { pace: 'all', items: [], answers: {}, step: 0, open: false, sent: false, sending: false };
let _host = null;
let _modalHost = null;

// Where the questions live, which is what the in-place patchers write into. Both presentations
// render into the same overlay layer, so there is one answer.
function surface() {
  return _modalHost;
}

function card(i) {
  return questionCard(_st.items[i], i, _st.answers, t, { total: _st.items.length });
}

// ── The two paces. This is the ENTIRE difference between them. ───────────────────────────────
// Neither draws a question: they choose which items to lay out and which buttons go in the foot.

function bodyAll() {
  return '<div class="cdx-sv-list">' + _st.items.map((_x, i) => card(i)).join('') + '</div>';
}

function bodySteps() {
  return '<div class="cdx-sv-stage">' + card(_st.step) + '</div>';
}

// The send button does not exist until every required item is answered, and NOTHING stands in its
// place until then. A line counting what is missing reads as nagging (Élder 2026-08-27), and the
// tracker at the top already says exactly where they are. The ADMIN side is the opposite: there
// the button is greyed and says what is blocking it, because that is diagnosis, not pressure.
function sendIfReady() {
  return isComplete(_st.items, _st.answers)
    ? '<button type="button" class="cdx-sv-send" data-sv-send>' + esc(t('survey.send')) + '</button>'
    : '';
}

function footAll() {
  return sendIfReady();
}

function footSteps() {
  const last = _st.step === _st.items.length - 1;
  return '<div class="cdx-sv-nav">' +
    '<button type="button" class="cdx-sv-back" data-sv-step="-1"' + (_st.step === 0 ? ' disabled' : '') + '>' +
      esc(t('survey.back')) + '</button>' +
    (last
      ? sendIfReady()
      : '<button type="button" class="cdx-sv-next" data-sv-step="1">' + esc(t('survey.next')) + '</button>') +
  '</div>';
}

const PACE = {
  all:   { body: bodyAll,   foot: footAll,   stepped: false },
  steps: { body: bodySteps, foot: footSteps, stepped: true  },
};

// ── Chrome ───────────────────────────────────────────────────────────────────────────────────

function introHtml() {
  // The person tapped their TRAIL and got this instead, so the first thing the gate does is
  // explain itself. Someone who expected the trail is owed a reason before a question.
  return '<div class="cdx-sv-intro">' +
    '<div class="cdx-sv-eyebrow">' + glyphSvg('star', { size: 14 }) + ' ' + esc(t('survey.eyebrow')) + '</div>' +
    '<h2 class="cdx-sv-title">' + esc(t('survey.gate_title')) + '</h2>' +
    '<p class="cdx-sv-lede">' + esc(t('survey.gate_lede')) + '</p>' +
  '</div>';
}

function doneHtml() {
  return '<div class="cdx-sv-done">' +
    '<div class="cdx-sv-done-mark">' + glyphSvg('check-circle', { size: 34 }) + '</div>' +
    '<h2 class="cdx-sv-title">' + esc(t('survey.thanks_title')) + '</h2>' +
    '<p class="cdx-sv-lede">' + esc(t('survey.thanks_lede')) + '</p>' +
    // The way out, and the ONLY one, which is what makes the gate humane rather than a dead end:
    // answering is what opens the trail.
    '<button type="button" class="cdx-sv-send cdx-sv-continue" data-sv-continue>' +
      esc(t('survey.continue')) + '</button>' +
  '</div>';
}

function bodyHtml() {
  return _st.sent ? doneHtml() : introHtml() + PACE[_st.pace].body();
}

function footHtml() {
  return _st.sent ? '' : PACE[_st.pace].foot();
}

// Whose trail this is, taken from the hero the trail already rendered rather than fetched again.
// It sits in the gate's own head so the student stays grounded without the gate having to start
// below a 300px hero, which on a phone would leave almost no room for a question (Élder 2026-08-27).
function whoHtml() {
  if (!_host || false) return '';
  const doc = _host.ownerDocument;
  const pick = (sel) => {
    const el = doc.querySelector(sel);
    return el ? String(el.textContent || '').trim() : '';
  };
  const parts = [pick('#cdx-tr-client-name'), pick('#cdx-tr-turma-name')].filter(Boolean);
  return parts.length ? '<div class="cdx-sv-who">' + esc(parts.join(' · ')) + '</div>' : '';
}

function headHtml() {
  return whoHtml() + (_st.sent ? '<div class="cdx-sv-progress"></div>' : progressHtml(_st.items, _st.answers, t));
}

// ── Presentation: dialog ─────────────────────────────────────────────────────────────────────

// ── The overlay ──────────────────────────────────────────────────────────────────────────────
// A layer ABOVE the trail, never a section inside it. It carries no close button and nothing sits
// behind it, so the only way out is finishing; the trail underneath is covered and untouched.

function overlayHtml() {
  const foot = footHtml();
  const wrap = (cls, inner, extra) =>
    '<div class="' + cls + '"' + (extra || '') + '><div class="cdx-sv-wrap">' + inner + '</div></div>';
  // The foot is ALWAYS in the tree, hidden while it is empty. It has to be: the send button
  // arrives by patching, and patching cannot fill an element that was never rendered. Dropping it
  // when empty is what made the button never appear after the nag line was removed.
  return '<div class="cdx-sv-scrim is-full">' +
    '<div class="cdx-sv-modal" role="dialog" aria-modal="true">' +
      wrap('cdx-sv-modal-head', headHtml()) +
      wrap('cdx-sv-modal-body', bodyHtml(), ' data-sv-scroll') +
      wrap('cdx-sv-modal-foot', foot, foot ? '' : ' hidden') +
    '</div>' +
  '</div>';
}

// ── Render ───────────────────────────────────────────────────────────────────────────────────

function render() {
  if (!_host) return;
  // The host stays empty on purpose. The overlay IS the entry, and once it is dismissed the trail
  // is simply the trail: nothing was hidden, so nothing has to be put back.
  _host.innerHTML = '';
  renderModal(_st.open ? overlayHtml() : '');
}

// The dialog layer lives on document.body, the way the trail's own modals do (comunicado-modal.js,
// tarefa-submit-modal.js). Nested in the tab content, `position: fixed` resolves against the panel
// on a phone and the scrim never covers the viewport. Empty markup tears it down, so `open` is the
// only state anyone has to reason about.
function renderModal(html) {
  const doc = _host && _host.ownerDocument;
  if (!doc || !doc.body) return;
  if (!html) {
    if (_modalHost) { _modalHost.remove(); _modalHost = null; }
    doc.body.classList.remove('tr-modal-open');
    return;
  }
  if (!_modalHost) {
    _modalHost = doc.createElement('div');
    _modalHost.className = 'cdx-sv-modal-layer';
    doc.body.appendChild(_modalHost);
  }
  _modalHost.innerHTML = html;
  doc.body.classList.add('tr-modal-open');
  offsetBelowHeader();
}

// The gate starts BELOW the trail's own header, so the person can still see whose trail this is
// while they answer (Élder 2026-08-27: keep the header to ground the student). Measured rather
// than hard-coded, because that header's padding is clamp()-based and differs between a phone and
// a laptop. Body scroll is locked while the overlay is up, so the header cannot slide out from
// under it.
function offsetBelowHeader() {
  if (!_modalHost || false) return;
  const doc = _modalHost.ownerDocument;
  const hdr = doc.querySelector('pensoia-header');
  const scrim = _modalHost.querySelector('.cdx-sv-scrim');
  if (!scrim) return;
  const top = hdr ? Math.max(0, Math.round(hdr.getBoundingClientRect().bottom)) : 0;
  scrim.style.top = top + 'px';
}

// The foot is the one piece that MUST change when an answer lands, because the send button only
// exists once the last required item is answered. Patching it in place is what lets answering keep
// the body's scroll: a full render would fix the foot and throw the reader back to the top, which
// is the bug this whole patching path exists to avoid. Found by the browser run, not by the suite:
// the bar hit 100% and the button never arrived.
function patchFoot() {
  if (!_modalHost) return;
  const foot = _modalHost.querySelector('.cdx-sv-modal-foot');
  const wrap = foot && foot.querySelector('.cdx-sv-wrap');
  if (!foot || !wrap) return;
  const html = footHtml();
  wrap.innerHTML = html;
  foot.hidden = !html;   // an empty foot must not leave its border and padding on screen
}

// Bring the next unanswered question into view, gently. `center` keeps it clear of both the
// sticky progress head and the sticky send foot, in either presentation.
function revealNext(idx) {
  const root = surface();
  if (!root) return;
  const next = nextUnanswered(_st.items, _st.answers, idx);
  if (next < 0) return;
  const el = root.querySelector('.cdx-sv-q[data-sv-q="' + next + '"]');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// In the stepped pace an answer moves on by itself, but only for the kinds that are one tap. The
// brief pause lets the person see what they picked before the screen changes.
function advanceAfterAnswer(idx) {
  const win = _host && _host.ownerDocument && _host.ownerDocument.defaultView;
  const go = () => {
    if (_st.step !== idx) return;             // they moved on themselves meanwhile
    if (idx >= _st.items.length - 1) return;      // the last card ends with Enviar, never a jump
    _st.step = idx + 1;
    render();
    scrollTop();
  };
  if (win && typeof win.setTimeout === 'function') win.setTimeout(go, 260); else go();
}

// Back to the start of the questions, which is the overlay's own scrolling body in both modes.
function scrollTop() {
  const body = _modalHost && _modalHost.querySelector('[data-sv-scroll]');
  if (body) body.scrollTop = 0;
}

function onClick(e) {
  const set = hookFrom(e, '[data-sv-set]');
  if (set) {
    const idx = Number(set.getAttribute('data-sv-set'));
    _st.answers[idx] = set.getAttribute('data-sv-val');
    patchQuestion(surface(), idx, _st.answers);
    patchProgress(surface(), _st.items, _st.answers, t);
    patchFoot();
    if (PACE[_st.pace].stepped) {
      if (isSelfAdvancing(_st.items[idx])) advanceAfterAnswer(idx);
    } else {
      revealNext(idx);
    }
    return;
  }
  const step = hookFrom(e, '[data-sv-step]');
  if (step) {
    _st.step = Math.max(0, Math.min(_st.items.length - 1, _st.step + Number(step.getAttribute('data-sv-step'))));
    render();
    scrollTop();
    return;
  }
  // No close, no scrim dismissal: the gate has exactly two exits, and both are earned. Sending
  // waits for the Worker before it shows the thank-you (see submit()), so nobody is told their
  // answers were recorded until they were.
  if (hookFrom(e, '[data-sv-send]')) { submit().then(scrollTop); return; }
  if (hookFrom(e, '[data-sv-continue]')) { _st.open = false; render(); return; }
}

function onInput(e) {
  const word = e.target.closest('[data-sv-word]');
  if (word) {
    const idx = applyWordInput(word, _st.answers);
    if (!_st.items[idx].optional) { patchProgress(surface(), _st.items, _st.answers, t); patchFoot(); }
    return;
  }
  const txt = e.target.closest('[data-sv-text]');
  if (txt) {
    const idx = Number(txt.getAttribute('data-sv-text'));
    _st.answers[idx] = txt.value;
    const c = txt.closest('.cdx-sv-q');
    if (c) c.classList.toggle('is-done', isAnswered(_st.answers, idx));
    // Today both typed items are optional so this cannot flip completeness, but the instrument is
    // editable and a required text item would silently strand the send button without this.
    if (!_st.items[idx].optional) { patchProgress(surface(), _st.items, _st.answers, t); patchFoot(); }
  }
}

// Mount into the live page once the trail itself has rendered. The main element is `hidden` until
// page.js has its data, so an attribute observer is what tells us the chrome is real.
function attach(doc) {
  const main = doc.querySelector('.cdx-trilha-main');
  if (!main) return;
  _host = doc.createElement('div');
  _host.className = 'cdx-sv-host';
  const parent = main.querySelector('.cdx-trilha-tabcontent') || main;
  parent.insertBefore(_host, parent.firstChild);
  // Nothing in the trail is hidden or moved, in either presentation. A full-screen overlay covers
  // the page by itself, and hiding the panels would leave them hidden after "continuar para a
  // trilha", which is the one thing that must work at the end.
  // Delegated on the document, not on main: the dialog lives on document.body, outside main.
  // Every hook is a data-attribute of this prototype's own markup, so nothing else is reachable.
  doc.addEventListener('click', onClick);
  doc.addEventListener('input', onInput);
  const win = doc.defaultView;
  if (win && win.addEventListener) win.addEventListener('resize', offsetBelowHeader);
  render();
}

// The one call the gate makes, and everything it does with the answer.
//
// Every branch that is not "the survey is open, sent, inside its window, and this person has not
// answered" ends the same way: return, and the trail renders. shouldGate() is where that is
// decided, from the fields the Worker returned, and it refuses on anything it cannot prove.
export async function start(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w || !w.document) return;
  const token = state && state.sessionToken;
  if (!token) return;                       // nobody is logged in: there is no one to gate

  let r;
  try {
    r = await trail.surveyForStudent({ session: token, _silent: true });
  } catch (e) {
    return;                                 // FAIL OPEN: a dead call must never raise a wall
  }
  if (!r || !r.ok || !r.survey) return;

  const gate = {
    status: r.survey.status,
    sent_at: r.survey.sent_at,
    closes_at: r.survey.closes_at,
    answered: r.survey.answered,
    aulas: r.aulas,
    now: r.now,
  };
  if (!shouldGate(gate)) return;

  _st.items = itemsFromRows(r.questions);
  if (!_st.items.length) return;            // an instrument this build cannot render is not a gate
  _st.surveyId = r.survey.id;
  _st.token = token;
  _st.pace = paceFrom(w.location && w.location.search);
  _st.open = true;

  const doc = w.document;
  const main = doc.querySelector('.cdx-trilha-main');
  if (main && !main.hidden) { attach(doc); return; }
  if (!main || typeof w.MutationObserver !== 'function') return;
  const obs = new w.MutationObserver(() => {
    if (!main.hidden) { obs.disconnect(); attach(doc); }
  });
  obs.observe(main, { attributes: true, attributeFilter: ['hidden'] });
}

// Submit. The renderer keys answers by index; ct_survey_responses keys them by question_id, and
// answersByQuestionId is the only place the two vocabularies meet.
//
// The thank-you appears only after the Worker confirms. Showing it first and reconciling later
// would tell somebody their answers were recorded when they were not, and the gate is the one
// screen where that lie also costs the response.
export async function submit() {
  if (_st.sending || _st.sent) return;
  if (!isComplete(_st.items, _st.answers)) return;
  _st.sending = true;
  let ok = false;
  try {
    const r = await trail.surveyAnswer({
      session: _st.token,
      answers: answersByQuestionId(_st.items, _st.answers),
      _silent: true,
    });
    ok = !!(r && r.ok);
  } catch (_) { ok = false; }
  _st.sending = false;
  if (!ok) {
    // Nothing was recorded, so nothing changes on screen except a line saying so. The person keeps
    // their answers and the button, which is the only recoverable state here.
    const foot = _modalHost && _modalHost.querySelector('.cdx-sv-modal-foot .cdx-sv-wrap');
    if (foot && !foot.querySelector('.cdx-sv-err')) {
      const p = foot.ownerDocument.createElement('p');
      p.className = 'cdx-sv-err';
      p.textContent = t('survey.send_failed');
      foot.appendChild(p);
    }
    return;
  }
  _st.sent = true;
  renderModal(overlayHtml());
}

// NOT self-starting any more, and this is the whole bug it was born with. The module was imported
// for its side effect from trilha/index.html, so `start()` ran at IMPORT time, before page.js had
// read the session out of localStorage. `state.sessionToken` was still null, the very first line
// returned "nobody is logged in", and the gate never appeared for anybody. Every check that passed
// before this was a check of the fail-open path, which is exactly the shape that hides it.
//
// page.js calls it now, after the trail has actually rendered, the same way startNexo is called.
