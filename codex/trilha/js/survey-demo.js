// codex/trilha/js/survey-demo.js
// PROTOTYPE (track-64). Four look-and-feel variants of the reaction survey, rendered inside the
// real Trilha chrome so the shape is judged against the live page instead of a mock that drifts.
//
// Inert unless ?survey=1..4 is in the URL: no facade call, no state read, no storage, and the
// answers go nowhere. Nothing here is the shipping module; it exists to settle ONE question,
// which of the four shapes the survey should have. The question texts live here as stub data on
// purpose: in the real feature they are rows in ct_survey_questions, not dictionary keys.
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { glyphSvg } from '../../js/glyphs.js';

// ── Stub instrument: the ten agreed items ────────────────────────────────────
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
  { kind: 'words',  prompt: 'Em até três palavras, o que você leva deste curso?' },
  { kind: 'text',   prompt: 'Críticas, elogios e sugestões.' },
];

const SCALE_MIN = 1;
const SCALE_MAX = 5;

// ── Pure helpers ─────────────────────────────────────────────────────────────

// PURE. The variant number in ?survey=, or 0 when the prototype is off. Anything outside
// 1..4 reads as off, so a stray value can never half-mount it.
export function variantFrom(search) {
  const m = /(?:^|[?&])survey=(\d)(?:&|$)/.exec(String(search || ''));
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 4 ? n : 0;
}

// PURE. How many of the ten are answered, for the progress readouts.
export function answeredCount(answers) {
  return ITEMS.reduce((n, _item, i) => n + (isAnswered(answers, i) ? 1 : 0), 0);
}

// PURE. An item counts as answered when it carries any value. A words item needs at least one
// of its three boxes; blank strings never count.
export function isAnswered(answers, i) {
  const v = (answers || {})[i];
  if (v == null) return false;
  if (Array.isArray(v)) return v.some((w) => String(w || '').trim() !== '');
  return String(v).trim() !== '';
}

// ── Question rendering, shared by all four variants ──────────────────────────

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
      ' aria-label="' + esc(t('survey.word_n')).replace('{n}', String(w + 1)) + '">';
  }
  return html + '</div>';
}

function textHtml(idx, answers) {
  return '<textarea class="cdx-sv-text" rows="4" maxlength="1000" data-sv-text="' + idx + '"' +
    ' placeholder="' + esc(t('survey.text_placeholder')) + '">' + esc(answers[idx] || '') + '</textarea>';
}

// One question block: number, prompt and the input for its kind.
function questionHtml(idx, answers, opts) {
  const item = ITEMS[idx];
  const showNum = !opts || opts.showNumber !== false;
  let body = '';
  if (item.kind === 'scale') body = scaleHtml(idx, answers);
  else if (item.kind === 'choice') body = choiceHtml(idx, answers, item);
  else if (item.kind === 'words') body = wordsHtml(idx, answers);
  else body = textHtml(idx, answers);
  return '<div class="cdx-sv-q' + (isAnswered(answers, idx) ? ' is-done' : '') + '" data-sv-q="' + idx + '">' +
    (showNum ? '<div class="cdx-sv-qnum">' + (idx + 1) + '<span>/' + ITEMS.length + '</span></div>' : '') +
    '<div class="cdx-sv-prompt">' + esc(item.prompt) + '</div>' +
    '<div class="cdx-sv-input">' + body + '</div>' +
  '</div>';
}

function progressHtml(answers) {
  const done = answeredCount(answers);
  const pct = Math.round(done / ITEMS.length * 100);
  return '<div class="cdx-sv-progress">' +
    '<div class="cdx-sv-bar"><div class="cdx-sv-fill" style="width:' + pct + '%"></div></div>' +
    '<span class="cdx-sv-pcount">' + esc(t('survey.progress')).replace('{n}', String(done)).replace('{total}', String(ITEMS.length)) + '</span>' +
  '</div>';
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

// ── The four variants ────────────────────────────────────────────────────────
// Each returns { html, mount(el) }, so the shell below can place them without knowing which.

// V1: every question on one scrolling page, one send at the foot. What the student meets when
// the e-mail drops them straight into the form.
function variantOnePage(st) {
  return {
    html:
      '<div class="cdx-sv-sheet">' +
        introHtml() +
        progressHtml(st.answers) +
        '<div class="cdx-sv-list">' + ITEMS.map((_x, i) => questionHtml(i, st.answers)).join('') + '</div>' +
        '<div class="cdx-sv-foot">' +
          '<button type="button" class="cdx-sv-send" data-sv-send>' + esc(t('survey.send')) + '</button>' +
          '<span class="cdx-sv-foot-note">' + esc(t('survey.foot_note')) + '</span>' +
        '</div>' +
      '</div>',
  };
}

// V2: one question at a time, with a progress bar and back/next. Feels like a survey app, keeps
// a phone screen uncrowded, and makes the length invisible until the end.
function variantStepper(st) {
  const i = st.step;
  const last = i === ITEMS.length - 1;
  return {
    html:
      '<div class="cdx-sv-sheet cdx-sv-sheet--step">' +
        introHtml() +
        progressHtml(st.answers) +
        '<div class="cdx-sv-stage">' + questionHtml(i, st.answers) + '</div>' +
        '<div class="cdx-sv-nav">' +
          '<button type="button" class="cdx-sv-back" data-sv-step="-1"' + (i === 0 ? ' disabled' : '') + '>' +
            esc(t('survey.back')) + '</button>' +
          (last
            ? '<button type="button" class="cdx-sv-send" data-sv-send>' + esc(t('survey.send')) + '</button>'
            : '<button type="button" class="cdx-sv-next" data-sv-step="1">' + esc(t('survey.next')) + '</button>') +
        '</div>' +
      '</div>',
  };
}

// V3: a card sitting at the top of the trail's own timeline, in the trail's card language, that
// opens in place. The survey behaves like any other thing waiting for the student.
function variantInlineCard(st) {
  const done = answeredCount(st.answers);
  return {
    html:
      '<div class="cdx-sv-card' + (st.open ? ' is-open' : '') + '">' +
        '<button type="button" class="cdx-sv-card-top" data-sv-toggle>' +
          '<span class="cdx-sv-card-mark">' + glyphSvg('star', { size: 18 }) + '</span>' +
          '<span class="cdx-sv-card-info">' +
            '<span class="cdx-sv-card-eyebrow">' + esc(t('survey.eyebrow')) + '</span>' +
            '<span class="cdx-sv-card-title">' + esc(t('survey.title')) + '</span>' +
          '</span>' +
          '<span class="cdx-sv-card-badge">' + (done
            ? esc(t('survey.progress')).replace('{n}', String(done)).replace('{total}', String(ITEMS.length))
            : esc(t('survey.badge_answer'))) + '</span>' +
          '<span class="cdx-sv-chev' + (st.open ? ' is-open' : '') + '">' + glyphSvg('chevron-down', { size: 18 }) + '</span>' +
        '</button>' +
        (st.open
          ? '<div class="cdx-sv-card-body">' +
              '<p class="cdx-sv-lede">' + esc(t('survey.lede')) + '</p>' +
              '<div class="cdx-sv-list">' + ITEMS.map((_x, i) => questionHtml(i, st.answers)).join('') + '</div>' +
              '<div class="cdx-sv-foot">' +
                '<button type="button" class="cdx-sv-send" data-sv-send>' + esc(t('survey.send')) + '</button>' +
              '</div>' +
            '</div>'
          : '') +
      '</div>',
  };
}

// V4: a quiet strip at the top of the trail that opens the survey over the page. The trail stays
// exactly as it is, and answering is a deliberate step out of it.
function variantBannerModal(st) {
  const strip =
    '<div class="cdx-sv-strip">' +
      '<span class="cdx-sv-strip-mark">' + glyphSvg('star', { size: 16 }) + '</span>' +
      '<span class="cdx-sv-strip-txt">' +
        '<strong>' + esc(t('survey.title')) + '</strong>' +
        '<span>' + esc(t('survey.strip_sub')) + '</span>' +
      '</span>' +
      '<button type="button" class="cdx-sv-strip-go" data-sv-open>' + esc(t('survey.badge_answer')) + '</button>' +
    '</div>';
  const modal = !st.open ? '' :
    '<div class="cdx-sv-scrim" data-sv-scrim>' +
      '<div class="cdx-sv-modal" role="dialog" aria-modal="true">' +
        '<div class="cdx-sv-modal-head">' +
          progressHtml(st.answers) +
          '<button type="button" class="cdx-sv-x" data-sv-close aria-label="' + esc(t('survey.close')) + '">' +
            glyphSvg('close', { size: 18 }) + '</button>' +
        '</div>' +
        '<div class="cdx-sv-modal-body">' +
          introHtml() +
          '<div class="cdx-sv-list">' + ITEMS.map((_x, i) => questionHtml(i, st.answers)).join('') + '</div>' +
        '</div>' +
        '<div class="cdx-sv-modal-foot">' +
          '<button type="button" class="cdx-sv-send" data-sv-send>' + esc(t('survey.send')) + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  return { html: strip + modal };
}

const VARIANTS = {
  1: { build: variantOnePage,     key: 'survey.v1', takeover: true  },
  2: { build: variantStepper,     key: 'survey.v2', takeover: true  },
  3: { build: variantInlineCard,  key: 'survey.v3', takeover: false },
  4: { build: variantBannerModal, key: 'survey.v4', takeover: false },
};

// ── Shell ────────────────────────────────────────────────────────────────────

const _st = { variant: 0, answers: {}, step: 0, open: false, sent: false };
let _host = null;

function switcherHtml() {
  return '<div class="cdx-sv-switch">' +
    '<span class="cdx-sv-switch-lbl">' + esc(t('survey.switch_label')) + '</span>' +
    [1, 2, 3, 4].map((n) =>
      '<a class="cdx-sv-switch-b' + (n === _st.variant ? ' is-on' : '') + '" href="?survey=' + n + '">' +
        n + '. ' + esc(t(VARIANTS[n].key)) + '</a>').join('') +
  '</div>';
}

function render() {
  if (!_host) return;
  const v = VARIANTS[_st.variant];
  const inner = _st.sent ? '<div class="cdx-sv-sheet">' + doneHtml() + '</div>' : v.build(_st).html;
  _host.innerHTML = switcherHtml() + inner;
}

// One delegated listener for the whole prototype: every control is a data-attribute, so no
// per-render rewiring and nothing to leak.
function onClick(e) {
  const set = e.target.closest('[data-sv-set]');
  if (set) {
    _st.answers[Number(set.getAttribute('data-sv-set'))] = set.getAttribute('data-sv-val');
    render(); return;
  }
  const step = e.target.closest('[data-sv-step]');
  if (step) {
    _st.step = Math.max(0, Math.min(ITEMS.length - 1, _st.step + Number(step.getAttribute('data-sv-step'))));
    render(); return;
  }
  if (e.target.closest('[data-sv-toggle]') || e.target.closest('[data-sv-open]')) { _st.open = true; render(); return; }
  if (e.target.closest('[data-sv-close]')) { _st.open = false; render(); return; }
  const scrim = e.target.closest('[data-sv-scrim]');
  if (scrim && e.target === scrim) { _st.open = false; render(); return; }
  if (e.target.closest('[data-sv-send]')) { _st.sent = true; render(); return; }
}

function onInput(e) {
  const word = e.target.closest('[data-sv-word]');
  if (word) {
    const i = Number(word.getAttribute('data-sv-word'));
    const slot = Number(word.getAttribute('data-sv-slot'));
    const cur = Array.isArray(_st.answers[i]) ? _st.answers[i].slice() : ['', '', ''];
    cur[slot] = word.value;
    _st.answers[i] = cur;
    return;   // no re-render: it would steal the caret mid-word
  }
  const txt = e.target.closest('[data-sv-text]');
  if (txt) _st.answers[Number(txt.getAttribute('data-sv-text'))] = txt.value;
}

// Mount into the live page once the trail itself has rendered. The main element is `hidden`
// until page.js has its data, so an attribute observer is what tells us the chrome is real.
function attach(doc) {
  const main = doc.querySelector('.cdx-trilha-main');
  if (!main) return;
  const v = VARIANTS[_st.variant];
  _host = doc.createElement('div');
  _host.className = 'cdx-sv-host' + (v.takeover ? ' cdx-sv-host--takeover' : '');
  if (v.takeover) {
    // A takeover replaces the trail's own body: the student came here to answer, not to browse.
    // The hero stays (it carries the client and turma identity, which is the context for the
    // questions); the tab strip and the panels go.
    const tabs = main.querySelector('.cdx-trilha-tabs');
    if (tabs) tabs.hidden = true;
    const panels = main.querySelector('.cdx-trilha-tabcontent') || main;
    Array.from(panels.children).forEach((c) => { c.hidden = true; });
    panels.appendChild(_host);
  } else {
    const panels = main.querySelector('.cdx-trilha-tabcontent');
    if (panels) panels.insertBefore(_host, panels.firstChild);
    else main.insertBefore(_host, main.firstChild);
  }
  main.addEventListener('click', onClick);
  main.addEventListener('input', onInput);
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
