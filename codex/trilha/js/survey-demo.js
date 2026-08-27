// codex/trilha/js/survey-demo.js
// PROTOTYPE (track-64). The STUDENT SHELL of the reaction survey, rendered in the real Trilha
// chrome so the shape is judged against the live page instead of a mock that drifts.
//
// TWO INDEPENDENT AXES, not four variants (Élder 2026-08-26). They compose, so adding a third
// pace or a third presentation later multiplies nothing:
//
//   presentation:  dialog     a quiet strip on the trail that opens the survey over the page
//                  full       the same overlay edge to edge, opened on arrival, with no close:
//                             the trail is covered until the thank-you says continuar
//   pace:          all        every question at once, one send at the foot
//                  steps      one question, advancing by itself after a one-tap answer
//
// It draws no question. Every card, every input kind and every counting rule comes from
// js/survey-question.js, the shared seam the admin tab will import too. That split is the point:
// one implementation, so the preview an admin sees and the form a student answers cannot disagree.
//
// Inert unless ?survey=1..4 is in the URL: no facade call, no state read, no storage, and the
// answers go nowhere. The ten items are stub data; in the shipping feature they are rows of
// ct_survey_questions.
import { t } from '../i18n.js';
import { glyphSvg } from '../../js/glyphs.js';
import { esc } from '../../js/dom.js';
import {
  questionCard, progressHtml, patchQuestion, patchProgress, applyWordInput,
  isAnswered, nextUnanswered, isSelfAdvancing, hookFrom, isComplete, missingCount,
} from '../../js/survey-question.js';

// The two open-ended items are OPTIONAL, which is what lets the bar reach 100%.
const ITEMS = [
  { kind: 'scale',  prompt: 'O conteúdo foi compatível com os objetivos anunciados e seguiu o programa.' },
  { kind: 'scale',  prompt: 'A carga horária foi adequada ao conteúdo previsto.' },
  { kind: 'choice', prompt: 'O grau de complexidade do conteúdo em relação ao seu nível:',
    options: ['Foi adequado', 'Estava além do meu nível', 'Estava aquém do meu nível', 'Outro'] },
  { kind: 'scale',  prompt: 'O instrutor demonstrou domínio do conteúdo e trouxe referências atualizadas.' },
  { kind: 'scale',  prompt: 'Os exemplos usados e a didática facilitaram a compreensão.' },
  { kind: 'scale',  prompt: 'Você se sente em condições de aplicar o que aprendeu.' },
  { kind: 'scale',  prompt: 'A organização do curso de forma geral (divulgação, atendimento, estrutura).' },
  { kind: 'scale',  prompt: 'Sua satisfação geral com o curso.' },
  { kind: 'words',  prompt: 'Em até três palavras, o que você leva deste curso?', optional: true },
  { kind: 'text',   prompt: 'Críticas, elogios e sugestões.', optional: true },
];

const PRESENTATIONS = ['dialog', 'full'];
const PACES = ['all', 'steps'];

// Label keys written out LITERALLY, never assembled as 'survey.pres_' + id. A key built at
// runtime is invisible to the dead-key guard in tests/trilha-i18n.test.mjs, which is exactly the
// trap track-30 documented with `page.tabshort_*`. The guard caught this one on the first run.
const AXIS_LABELS = {
  dialog: 'survey.pres_dialog',
  full:   'survey.pres_full',
  all:    'survey.pace_all',
  steps:  'survey.pace_steps',
};

// PURE. ?survey=N carries BOTH axes in one digit, so a switcher link flips exactly one bit:
// N = 1 + pace + 2*presentation. Returns null when the prototype is off, so a stray value can
// never half-mount it.
export function modeFrom(search) {
  const m = /(?:^|[?&])survey=(\d)(?:&|$)/.exec(String(search || ''));
  const n = m ? Number(m[1]) : 0;
  if (n < 1 || n > 4) return null;
  const i = n - 1;
  return { n: n, presentation: PRESENTATIONS[i >> 1], pace: PACES[i & 1] };
}

// PURE. The inverse: which ?survey= digit a given pair is. The switcher needs it to build a link
// that changes one axis and leaves the other alone.
export function modeNumber(presentation, pace) {
  const p = Math.max(0, PRESENTATIONS.indexOf(presentation));
  const c = Math.max(0, PACES.indexOf(pace));
  return 1 + c + 2 * p;
}

const _st = { mode: null, answers: {}, step: 0, open: false, sent: false };
let _host = null;
let _modalHost = null;

// Where the questions live, which is what the in-place patchers write into. Both presentations
// render into the same overlay layer, so there is one answer.
function surface() {
  return _modalHost;
}

function card(i) {
  return questionCard(ITEMS[i], i, _st.answers, t, { total: ITEMS.length });
}

// ── The two paces. This is the ENTIRE difference between them. ───────────────────────────────
// Neither draws a question: they choose which items to lay out and which buttons go in the foot.

function bodyAll() {
  return '<div class="cdx-sv-list">' + ITEMS.map((_x, i) => card(i)).join('') + '</div>';
}

function bodySteps() {
  return '<div class="cdx-sv-stage">' + card(_st.step) + '</div>';
}

// The send button does not exist until every required item is answered. Before that the foot
// carries the reason, so the space does not jump when the button finally arrives. Élder, on
// seeing it offered from the very first screen: it should appear only after the obligatory ones.
function sendOrReason() {
  if (isComplete(ITEMS, _st.answers)) {
    return '<button type="button" class="cdx-sv-send" data-sv-send>' + esc(t('survey.send')) + '</button>';
  }
  const n = missingCount(ITEMS, _st.answers);
  const key = n === 1 ? 'survey.missing_one' : 'survey.missing_n';
  return '<p class="cdx-sv-missing">' + esc(t(key).replace('{n}', String(n))) + '</p>';
}

function footAll() {
  return sendOrReason();
}

function footSteps() {
  const last = _st.step === ITEMS.length - 1;
  return '<div class="cdx-sv-nav">' +
    '<button type="button" class="cdx-sv-back" data-sv-step="-1"' + (_st.step === 0 ? ' disabled' : '') + '>' +
      esc(t('survey.back')) + '</button>' +
    (last
      ? sendOrReason()
      : '<button type="button" class="cdx-sv-next" data-sv-step="1">' + esc(t('survey.next')) + '</button>') +
  '</div>';
}

const PACE = {
  all:   { body: bodyAll,   foot: footAll,   stepped: false },
  steps: { body: bodySteps, foot: footSteps, stepped: true  },
};

// ── Chrome shared by both presentations ──────────────────────────────────────────────────────

function introHtml() {
  // On full screen the person tapped their TRAIL and got this instead, so the first thing it does
  // is explain itself. In the dialog they chose to open it, and the plain title is right.
  const gate = _st.mode.presentation === 'full';
  return '<div class="cdx-sv-intro">' +
    '<div class="cdx-sv-eyebrow">' + glyphSvg('star', { size: 14 }) + ' ' + esc(t('survey.eyebrow')) + '</div>' +
    '<h2 class="cdx-sv-title">' + esc(t(gate ? 'survey.gate_title' : 'survey.title')) + '</h2>' +
    '<p class="cdx-sv-lede">' + esc(t(gate ? 'survey.gate_lede' : 'survey.lede')) + '</p>' +
  '</div>';
}

function doneHtml() {
  return '<div class="cdx-sv-done">' +
    '<div class="cdx-sv-done-mark">' + glyphSvg('check-circle', { size: 34 }) + '</div>' +
    '<h2 class="cdx-sv-title">' + esc(t('survey.thanks_title')) + '</h2>' +
    '<p class="cdx-sv-lede">' + esc(t('survey.thanks_lede')) + '</p>' +
    // The way out. On full screen it is the ONLY way out, which is what makes the gate humane
    // rather than a dead end: answering is what opens the trail.
    '<button type="button" class="cdx-sv-send cdx-sv-continue" data-sv-continue>' +
      esc(t('survey.continue')) + '</button>' +
  '</div>';
}

function bodyHtml() {
  return _st.sent ? doneHtml() : introHtml() + PACE[_st.mode.pace].body();
}

function footHtml() {
  return _st.sent ? '' : PACE[_st.mode.pace].foot();
}

function headHtml() {
  return _st.sent ? '<div class="cdx-sv-progress"></div>' : progressHtml(ITEMS, _st.answers, t);
}

// ── Presentation: dialog ─────────────────────────────────────────────────────────────────────

function stripHtml() {
  // The hook is on the STRIP, not only on its button: the whole banner is a better phone target,
  // and on touch the synthesised click arrives at the strip rather than at the button it started
  // on, so a hook only on the button is never found by a closest() walking upward.
  return '<div class="cdx-sv-strip" data-sv-open>' +
    '<span class="cdx-sv-strip-mark">' + glyphSvg('star', { size: 16 }) + '</span>' +
    '<span class="cdx-sv-strip-txt">' +
      '<strong>' + esc(t('survey.title')) + '</strong>' +
      '<span>' + esc(t('survey.strip_sub')) + '</span>' +
    '</span>' +
    '<button type="button" class="cdx-sv-strip-go" data-sv-open>' + esc(t('survey.badge_answer')) + '</button>' +
  '</div>';
}

// ── The overlay, shared by both presentations ────────────────────────────────────────────────
// Both are the SAME layer over the page, sitting above the trail rather than flowing inside it.
// `dialog` is a sheet with a scrim around it and a close button; `full` is the same layer edge to
// edge, with no scrim gap, no close button and no strip behind it, so the only way out is
// finishing. One markup, one set of scroll and patch mechanics, one class difference.

function overlayHtml() {
  const full = _st.mode.presentation === 'full';
  const foot = footHtml();
  const wrap = (cls, inner, extra) =>
    '<div class="' + cls + '"' + (extra || '') + '><div class="cdx-sv-wrap">' + inner + '</div></div>';
  return '<div class="cdx-sv-scrim' + (full ? ' is-full' : '') + '"' + (full ? '' : ' data-sv-scrim') + '>' +
    '<div class="cdx-sv-modal" role="dialog" aria-modal="true">' +
      wrap('cdx-sv-modal-head', headHtml() +
        (full ? '' :
          '<button type="button" class="cdx-sv-x" data-sv-close aria-label="' + esc(t('survey.close')) + '">' +
            glyphSvg('close', { size: 18 }) + '</button>')) +
      wrap('cdx-sv-modal-body', bodyHtml(), ' data-sv-scroll') +
      (foot ? wrap('cdx-sv-modal-foot', foot) : '') +
    '</div>' +
  '</div>';
}

// ── Render ───────────────────────────────────────────────────────────────────────────────────

function switchRow(labelKey, values, axis) {
  return '<div class="cdx-sv-switch-row">' +
    '<span class="cdx-sv-switch-lbl">' + esc(t(labelKey)) + '</span>' +
    values.map((v) => {
      const n = axis === 'presentation'
        ? modeNumber(v, _st.mode.pace)
        : modeNumber(_st.mode.presentation, v);
      const on = _st.mode[axis] === v;
      return '<a class="cdx-sv-switch-b' + (on ? ' is-on' : '') + '" href="?survey=' + n + '">' +
        esc(t(AXIS_LABELS[v])) + '</a>';
    }).join('') +
  '</div>';
}

function switcherHtml() {
  return '<div class="cdx-sv-switch">' +
    switchRow('survey.pres_label', PRESENTATIONS, 'presentation') +
    switchRow('survey.pace_label', PACES, 'pace') +
  '</div>';
}

function render() {
  if (!_host) return;
  // On full screen there is no strip: the overlay IS the entry, and once it is dismissed the
  // trail is simply the trail. In the dialog the strip is what opens it and what stays behind.
  const full = _st.mode.presentation === 'full';
  _host.innerHTML = switcherHtml() + (full ? '' : stripHtml());
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
  if (!_modalHost || !_st.mode || _st.mode.presentation !== 'full') return;
  const doc = _modalHost.ownerDocument;
  const hdr = doc.querySelector('pensoia-header');
  const scrim = _modalHost.querySelector('.cdx-sv-scrim');
  if (!scrim) return;
  const top = hdr ? Math.max(0, Math.round(hdr.getBoundingClientRect().bottom)) : 0;
  scrim.style.top = top + 'px';
}

// Bring the next unanswered question into view, gently. `center` keeps it clear of both the
// sticky progress head and the sticky send foot, in either presentation.
function revealNext(idx) {
  const root = surface();
  if (!root) return;
  const next = nextUnanswered(ITEMS, _st.answers, idx);
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
    if (idx >= ITEMS.length - 1) return;      // the last card ends with Enviar, never a jump
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
    patchProgress(surface(), ITEMS, _st.answers, t);
    if (PACE[_st.mode.pace].stepped) {
      if (isSelfAdvancing(ITEMS[idx])) advanceAfterAnswer(idx);
    } else {
      revealNext(idx);
    }
    return;
  }
  const step = hookFrom(e, '[data-sv-step]');
  if (step) {
    _st.step = Math.max(0, Math.min(ITEMS.length - 1, _st.step + Number(step.getAttribute('data-sv-step'))));
    render();
    scrollTop();
    return;
  }
  if (hookFrom(e, '[data-sv-open]')) { _st.open = true; _st.step = 0; render(); return; }
  if (hookFrom(e, '[data-sv-close]')) { _st.open = false; render(); return; }
  const scrim = hookFrom(e, '[data-sv-scrim]');
  if (scrim && e.target === scrim) { _st.open = false; render(); return; }
  if (hookFrom(e, '[data-sv-send]')) { _st.sent = true; render(); scrollTop(); return; }
  if (hookFrom(e, '[data-sv-continue]')) { _st.open = false; render(); return; }
}

function onInput(e) {
  const word = e.target.closest('[data-sv-word]');
  if (word) { applyWordInput(word, _st.answers); return; }
  const txt = e.target.closest('[data-sv-text]');
  if (txt) {
    const idx = Number(txt.getAttribute('data-sv-text'));
    _st.answers[idx] = txt.value;
    const c = txt.closest('.cdx-sv-q');
    if (c) c.classList.toggle('is-done', isAnswered(_st.answers, idx));
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

export function start(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w || !w.document) return;
  _st.mode = modeFrom(w.location && w.location.search);
  if (!_st.mode) return;
  _st.open = _st.mode.presentation === 'full';   // full screen greets them; the dialog waits
  const doc = w.document;
  const main = doc.querySelector('.cdx-trilha-main');
  if (main && !main.hidden) { attach(doc); return; }
  if (!main || typeof w.MutationObserver !== 'function') return;
  const obs = new w.MutationObserver(() => {
    if (!main.hidden) { obs.disconnect(); attach(doc); }
  });
  obs.observe(main, { attributes: true, attributeFilter: ['hidden'] });
}

start();
