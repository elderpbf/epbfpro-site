// codex/trilha/js/survey-demo.js
// PROTOTYPE (track-64). Two look-and-feel versions of the reaction survey, rendered inside the
// real Trilha chrome so the shape is judged against the live page instead of a mock that drifts.
//
// Both share the shell Élder picked: a quiet strip on the trail that opens the survey over the
// page. They differ only in what the dialog holds, every question at once or one at a time.
//
// Inert unless ?survey=1 or ?survey=2 is in the URL: no facade call, no state read, no storage,
// and the answers go nowhere. Nothing here is the shipping module; it exists to settle the shape.
// The question texts live here as stub data on purpose: in the real feature they are rows in
// ct_survey_questions, not dictionary keys.
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { glyphSvg } from '../../js/glyphs.js';

// ── Stub instrument: the ten agreed items ────────────────────────────────────
// The two open-ended ones are OPTIONAL. That is what makes the counter honest: a person who
// answers everything they must is finished, whether or not they felt like writing prose.
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

const SCALE_MIN = 1;
const SCALE_MAX = 5;
// A tap on a scale or a choice moves on by itself. A typed answer never does: nothing is more
// hostile than a box that runs away mid-word.
const SELF_ADVANCING = { scale: true, choice: true };

// ── Pure helpers ─────────────────────────────────────────────────────────────

// PURE. The version number in ?survey=, or 0 when the prototype is off. Anything outside
// 1..2 reads as off, so a stray value can never half-mount it.
export function variantFrom(search) {
  const m = /(?:^|[?&])survey=(\d)(?:&|$)/.exec(String(search || ''));
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 2 ? n : 0;
}

// PURE. How many items a person actually has to answer. The progress bar is measured against
// THIS, not against ITEMS.length, which is why it reaches 100% instead of parking at 8 de 10.
export function requiredTotal() {
  return ITEMS.filter((it) => !it.optional).length;
}

// PURE. An item counts as answered when it carries any value. A words item needs at least one
// of its three boxes; blank strings never count.
export function isAnswered(answers, i) {
  const v = (answers || {})[i];
  if (v == null) return false;
  if (Array.isArray(v)) return v.some((w) => String(w || '').trim() !== '');
  return String(v).trim() !== '';
}

// PURE. Progress over the REQUIRED items only. An optional item that stays blank is a finished
// survey, not an unfinished one.
export function answeredCount(answers) {
  return ITEMS.reduce((n, it, i) => n + (!it.optional && isAnswered(answers, i) ? 1 : 0), 0);
}

// PURE. Percent for the bar, capped at 100 so a stray key can never overfill it.
export function progressPct(answers) {
  const total = requiredTotal();
  if (!total) return 100;
  return Math.min(100, Math.round(answeredCount(answers) / total * 100));
}

// PURE. The next item to put in front of the person after `idx`: the first one they have not
// answered. Returns -1 when there is nothing left to move to.
export function nextUnanswered(answers, idx) {
  for (let i = idx + 1; i < ITEMS.length; i++) if (!isAnswered(answers, i)) return i;
  return -1;
}

// PURE. One box, one word. The box said "em até três palavras" and then quietly accepted a whole
// sentence, which is how a three-word cloud stops being a three-word cloud. Crushing the spaces out
// would only trade a sentence for one fake word, so a second word SPILLS into the box on the right,
// the way an OTP field advances. Returns the three boxes plus where the caret should go.
export function spillWords(current, slot, raw) {
  const out = Array.isArray(current) ? current.slice(0, 3) : [];
  while (out.length < 3) out.push('');
  const text = String(raw == null ? '' : raw);
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) { out[slot] = ''; return { words: out, focus: slot }; }
  let last = slot;
  for (let k = 0; k < parts.length && slot + k < 3; k++) { out[slot + k] = parts[k]; last = slot + k; }
  const wantsNext = parts.length > 1 || /\s$/.test(text);
  return { words: out, focus: wantsNext ? Math.min(last + 1, 2) : last };
}

// ── Question rendering, shared by both versions ──────────────────────────────

function scaleHtml(idx, answers) {
  const cur = answers[idx];
  let html = '<div class="cdx-sv-scale" role="group">';
  for (let n = SCALE_MIN; n <= SCALE_MAX; n++) {
    const on = String(cur) === String(n);
    html += '<button type="button" class="cdx-sv-dot' + (on ? ' is-on' : '') + '"' +
      ' data-sv-set="' + idx + '" data-sv-val="' + n + '"' +
      ' aria-pressed="' + (on ? 'true' : 'false') + '">' + n + '</button>';
  }
  html += '</div><div class="cdx-sv-ends"><span>' + esc(t('survey.scale_low')) + '</span>' +
          '<span>' + esc(t('survey.scale_high')) + '</span></div>';
  return html;
}

function choiceHtml(idx, answers, item) {
  const cur = answers[idx];
  return '<div class="cdx-sv-choices">' + item.options.map((opt) => {
    const on = cur === opt;
    return '<button type="button" class="cdx-sv-choice' + (on ? ' is-on' : '') + '"' +
      ' data-sv-set="' + idx + '" data-sv-val="' + esc(opt) + '"' +
      ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="cdx-sv-radio"></span>' + esc(opt) + '</button>';
  }).join('') + '</div>';
}

function wordsHtml(idx, answers) {
  const cur = Array.isArray(answers[idx]) ? answers[idx] : ['', '', ''];
  let html = '<div class="cdx-sv-words">';
  for (let w = 0; w < 3; w++) {
    html += '<input type="text" class="cdx-sv-word" maxlength="24" data-sv-word="' + idx + '"' +
      ' data-sv-slot="' + w + '" value="' + esc(cur[w] || '') + '"' +
      ' autocomplete="off" spellcheck="false"' +
      ' aria-label="' + esc(t('survey.word_n')).replace('{n}', String(w + 1)) + '">';
  }
  return html + '</div><div class="cdx-sv-hint">' + esc(t('survey.word_hint')) + '</div>';
}

function textHtml(idx, answers) {
  return '<textarea class="cdx-sv-text" rows="4" maxlength="1000" data-sv-text="' + idx + '"' +
    ' placeholder="' + esc(t('survey.text_placeholder')) + '">' + esc(answers[idx] || '') + '</textarea>';
}

function inputHtml(idx, answers) {
  const item = ITEMS[idx];
  if (item.kind === 'scale') return scaleHtml(idx, answers);
  if (item.kind === 'choice') return choiceHtml(idx, answers, item);
  if (item.kind === 'words') return wordsHtml(idx, answers);
  return textHtml(idx, answers);
}

function questionHtml(idx, answers) {
  const item = ITEMS[idx];
  return '<div class="cdx-sv-q' + (isAnswered(answers, idx) ? ' is-done' : '') + '" data-sv-q="' + idx + '">' +
    '<div class="cdx-sv-qhead">' +
      '<span class="cdx-sv-qnum">' + (idx + 1) + '<span>/' + ITEMS.length + '</span></span>' +
      (item.optional ? '<span class="cdx-sv-opt">' + esc(t('survey.optional')) + '</span>' : '') +
    '</div>' +
    '<div class="cdx-sv-prompt">' + esc(item.prompt) + '</div>' +
    '<div class="cdx-sv-input">' + inputHtml(idx, answers) + '</div>' +
  '</div>';
}

function progressHtml(answers) {
  return '<div class="cdx-sv-progress">' +
    '<div class="cdx-sv-bar"><div class="cdx-sv-fill" style="width:' + progressPct(answers) + '%"></div></div>' +
    '<span class="cdx-sv-pcount">' + esc(progressLabel(answers)) + '</span>' +
  '</div>';
}

function progressLabel(answers) {
  return t('survey.progress')
    .replace('{n}', String(answeredCount(answers)))
    .replace('{total}', String(requiredTotal()));
}

function introHtml() {
  return '<div class="cdx-sv-intro">' +
    '<div class="cdx-sv-eyebrow">' + glyphSvg('star', { size: 14 }) + ' ' + esc(t('survey.eyebrow')) + '</div>' +
    '<h2 class="cdx-sv-title">' + esc(t('survey.title')) + '</h2>' +
    '<p class="cdx-sv-lede">' + esc(t('survey.lede')) + '</p>' +
  '</div>';
}

function doneHtml() {
  return '<div class="cdx-sv-done">' +
    '<div class="cdx-sv-done-mark">' + glyphSvg('check-circle', { size: 34 }) + '</div>' +
    '<h2 class="cdx-sv-title">' + esc(t('survey.thanks_title')) + '</h2>' +
    '<p class="cdx-sv-lede">' + esc(t('survey.thanks_lede')) + '</p>' +
  '</div>';
}

// ── The two versions, both inside the same dialog ────────────────────────────

// V1: every question in the dialog, one send at the foot. Answering scrolls the next one into
// view rather than throwing the reader back to the top.
function bodyAllAtOnce(st) {
  return introHtml() +
    '<div class="cdx-sv-list">' + ITEMS.map((_x, i) => questionHtml(i, st.answers)).join('') + '</div>';
}

// V2: one question in the dialog. A tap on a scale or a choice moves on by itself; a typed
// answer waits for the button.
function bodyOneAtATime(st) {
  return introHtml() + '<div class="cdx-sv-stage">' + questionHtml(st.step, st.answers) + '</div>';
}

function footAllAtOnce() {
  return '<button type="button" class="cdx-sv-send" data-sv-send>' + esc(t('survey.send')) + '</button>';
}

function footOneAtATime(st) {
  const last = st.step === ITEMS.length - 1;
  return '<div class="cdx-sv-nav">' +
    '<button type="button" class="cdx-sv-back" data-sv-step="-1"' + (st.step === 0 ? ' disabled' : '') + '>' +
      esc(t('survey.back')) + '</button>' +
    (last
      ? '<button type="button" class="cdx-sv-send" data-sv-send>' + esc(t('survey.send')) + '</button>'
      : '<button type="button" class="cdx-sv-next" data-sv-step="1">' + esc(t('survey.next')) + '</button>') +
  '</div>';
}

const VARIANTS = {
  1: { body: bodyAllAtOnce,   foot: footAllAtOnce,   key: 'survey.v1', stepped: false },
  2: { body: bodyOneAtATime,  foot: footOneAtATime,  key: 'survey.v2', stepped: true  },
};

// ── Shell ────────────────────────────────────────────────────────────────────

const _st = { variant: 0, answers: {}, step: 0, open: false, sent: false };
let _host = null;
let _modalHost = null;

function switcherHtml() {
  return '<div class="cdx-sv-switch">' +
    '<span class="cdx-sv-switch-lbl">' + esc(t('survey.switch_label')) + '</span>' +
    [1, 2].map((n) =>
      '<a class="cdx-sv-switch-b' + (n === _st.variant ? ' is-on' : '') + '" href="?survey=' + n + '">' +
        n + '. ' + esc(t(VARIANTS[n].key)) + '</a>').join('') +
  '</div>';
}

function stripHtml() {
  // The hook is on the STRIP, not only on its button: the whole banner is a better phone target,
  // and on touch Chromium hands the synthesised click to the strip rather than to the button it
  // started on, so a hook only on the button is never found by a closest() walking upward.
  return '<div class="cdx-sv-strip" data-sv-open>' +
    '<span class="cdx-sv-strip-mark">' + glyphSvg('star', { size: 16 }) + '</span>' +
    '<span class="cdx-sv-strip-txt">' +
      '<strong>' + esc(t('survey.title')) + '</strong>' +
      '<span>' + esc(t('survey.strip_sub')) + '</span>' +
    '</span>' +
    '<button type="button" class="cdx-sv-strip-go" data-sv-open>' + esc(t('survey.badge_answer')) + '</button>' +
  '</div>';
}

function modalHtml() {
  const v = VARIANTS[_st.variant];
  const body = _st.sent ? doneHtml() : v.body(_st);
  const foot = _st.sent ? '' : '<div class="cdx-sv-modal-foot">' + v.foot(_st) + '</div>';
  return '<div class="cdx-sv-scrim" data-sv-scrim>' +
    '<div class="cdx-sv-modal" role="dialog" aria-modal="true">' +
      '<div class="cdx-sv-modal-head">' +
        (_st.sent ? '<div class="cdx-sv-progress"></div>' : progressHtml(_st.answers)) +
        '<button type="button" class="cdx-sv-x" data-sv-close aria-label="' + esc(t('survey.close')) + '">' +
          glyphSvg('close', { size: 18 }) + '</button>' +
      '</div>' +
      '<div class="cdx-sv-modal-body" data-sv-scroll>' + body + '</div>' +
      foot +
    '</div>' +
  '</div>';
}

function render() {
  if (!_host) return;
  _host.innerHTML = switcherHtml() + stripHtml();
  renderModal(_st.open ? modalHtml() : '');
}

// The dialog layer lives on document.body, the way the trail's own modals do. Empty markup tears
// it down, so `open` is the only state anyone has to reason about.
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
}

// ── Answering, WITHOUT rebuilding the dialog ─────────────────────────────────
// Re-rendering on every tap is what threw the reader back to the top of the questionnaire: you
// answered question 6 and landed on question 1. So an answer patches the three things that
// actually changed (the pressed button, the card's done state, the progress readout) and leaves
// the scroll position where the reader left it. Same reason js/list-sync.js exists.

function patchProgress() {
  if (!_modalHost) return;
  const fill = _modalHost.querySelector('.cdx-sv-fill');
  const count = _modalHost.querySelector('.cdx-sv-pcount');
  if (fill) fill.style.width = progressPct(_st.answers) + '%';
  if (count) count.textContent = progressLabel(_st.answers);
}

function patchQuestion(idx) {
  if (!_modalHost) return;
  const card = _modalHost.querySelector('.cdx-sv-q[data-sv-q="' + idx + '"]');
  if (!card) return;
  card.classList.toggle('is-done', isAnswered(_st.answers, idx));
  const cur = _st.answers[idx];
  card.querySelectorAll('[data-sv-set]').forEach((btn) => {
    const on = btn.getAttribute('data-sv-val') === String(cur);
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// Bring the next unanswered question into view, gently. `center` keeps it clear of both the
// sticky progress head and the sticky send foot.
function revealNext(idx) {
  if (!_modalHost) return;
  const next = nextUnanswered(_st.answers, idx);
  if (next < 0) return;
  const el = _modalHost.querySelector('.cdx-sv-q[data-sv-q="' + next + '"]');
  if (!el || typeof el.scrollIntoView !== 'function') return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// In the stepped version an answer moves on by itself, but only for the kinds that are a single
// tap. The brief pause lets the person see what they picked before the screen changes.
function advanceAfterAnswer(idx) {
  const win = _host && _host.ownerDocument && _host.ownerDocument.defaultView;
  const go = () => {
    if (_st.step !== idx) return;             // they moved on themselves meanwhile
    if (idx >= ITEMS.length - 1) return;      // the last card ends with Enviar, never a jump
    _st.step = idx + 1;
    render();
    scrollBodyTop();
  };
  if (win && typeof win.setTimeout === 'function') win.setTimeout(go, 260); else go();
}

function scrollBodyTop() {
  if (!_modalHost) return;
  const body = _modalHost.querySelector('[data-sv-scroll]');
  if (body) body.scrollTop = 0;
}

// ── Events ───────────────────────────────────────────────────────────────────

// Where a click really landed. On touch, Chromium can hand the synthesised click to an ancestor of
// the element the pointer went down on, so an upward closest() from e.target misses a hook that
// sits on a descendant. Falling back to what is actually under the point recovers it.
function hookFrom(e, sel) {
  const direct = e.target.closest(sel);
  if (direct) return direct;
  const doc = e.target.ownerDocument;
  if (!doc || typeof doc.elementFromPoint !== 'function') return null;
  const at = doc.elementFromPoint(e.clientX, e.clientY);
  return at ? at.closest(sel) : null;
}

function onClick(e) {
  const set = hookFrom(e, '[data-sv-set]');
  if (set) {
    const idx = Number(set.getAttribute('data-sv-set'));
    _st.answers[idx] = set.getAttribute('data-sv-val');
    patchQuestion(idx);
    patchProgress();
    if (VARIANTS[_st.variant].stepped) {
      if (SELF_ADVANCING[ITEMS[idx].kind]) advanceAfterAnswer(idx);
    } else {
      revealNext(idx);
    }
    return;
  }
  const step = hookFrom(e, '[data-sv-step]');
  if (step) {
    _st.step = Math.max(0, Math.min(ITEMS.length - 1, _st.step + Number(step.getAttribute('data-sv-step'))));
    render();
    scrollBodyTop();
    return;
  }
  if (hookFrom(e, '[data-sv-open]')) { _st.open = true; _st.step = 0; render(); return; }
  if (hookFrom(e, '[data-sv-close]')) { _st.open = false; render(); return; }
  const scrim = hookFrom(e, '[data-sv-scrim]');
  if (scrim && e.target === scrim) { _st.open = false; render(); return; }
  if (hookFrom(e, '[data-sv-send]')) { _st.sent = true; render(); return; }
}

function onInput(e) {
  const word = e.target.closest('[data-sv-word]');
  if (word) {
    const i = Number(word.getAttribute('data-sv-word'));
    const slot = Number(word.getAttribute('data-sv-slot'));
    const spill = spillWords(_st.answers[i], slot, word.value);
    _st.answers[i] = spill.words;
    // Repaint only this item's boxes, never the card: a re-render would steal the caret mid-word.
    const card = word.closest('.cdx-sv-q');
    const boxes = card ? card.querySelectorAll('[data-sv-word]') : [];
    boxes.forEach((b) => {
      const sl = Number(b.getAttribute('data-sv-slot'));
      if (sl >= slot && b.value !== spill.words[sl]) b.value = spill.words[sl] || '';
    });
    if (spill.focus !== slot && boxes[spill.focus] && boxes[spill.focus].focus) boxes[spill.focus].focus();
    if (card) card.classList.toggle('is-done', isAnswered(_st.answers, i));
    return;
  }
  const txt = e.target.closest('[data-sv-text]');
  if (txt) _st.answers[Number(txt.getAttribute('data-sv-text'))] = txt.value;
}

// ── Mount ────────────────────────────────────────────────────────────────────

// Mount into the live page once the trail itself has rendered. The main element is `hidden`
// until page.js has its data, so an attribute observer is what tells us the chrome is real.
function attach(doc) {
  const main = doc.querySelector('.cdx-trilha-main');
  if (!main) return;
  _host = doc.createElement('div');
  _host.className = 'cdx-sv-host';
  const panels = main.querySelector('.cdx-trilha-tabcontent');
  if (panels) panels.insertBefore(_host, panels.firstChild);
  else main.insertBefore(_host, main.firstChild);
  // Delegated on the document, not on main: the dialog lives on document.body, outside main.
  // Every hook is a data-attribute of this prototype's own markup, so nothing else is reachable.
  doc.addEventListener('click', onClick);
  doc.addEventListener('input', onInput);
  render();
}

export function start(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w || !w.document) return;
  _st.variant = variantFrom(w.location && w.location.search);
  if (!_st.variant) return;
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
