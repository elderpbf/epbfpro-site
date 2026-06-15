// js/demos.js — the two phone demos in the offer section, built from the REAL
// Codex components (not invented): the Pulso student live-question view
// (questions.css .cdx-qr-* + the nexo .cp-qa-bar) and the Trilha living-workbook
// timeline (trilha cards.css .cdx-tr-*). Each phone renders the real DOM at true
// mobile width (scaled into the bezel by .plp-app-scale) and a scripted roteiro
// drives it. Theme follows the page via the scoped tokens in landing.css, so only
// text needs rebuilding on a language change.
import { t, onLang } from './i18n.js';

const DEMO_VOTES = [14, 68, 7, 11]; // % per option; option 2 (index 1) is correct
const CORRECT = 1;
const ANSWERS = 25;                 // climbing answer count
const COMP = 82;                    // class-comprehension % (the side thermometer)
const LETTERS = ['A', 'B', 'C', 'D'];
const reduce = () => matchMedia('(prefers-reduced-motion:reduce)').matches;

// Real Codex glyphs (lucide-style, stroke). thermometer is copied from glyphs.js.
const SVG = {
  thermo: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  open: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
};
const ic = (paths, w) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (w ? ' style="width:' + w + 'px;height:' + w + 'px"' : '') + '>' + paths + '</svg>';

let timers = [];
const clear = () => { timers.forEach(clearTimeout); timers = []; };
const D = (fn, ms) => timers.push(setTimeout(fn, ms));
const $ = id => document.getElementById(id);

/* ─────────────────────────── Pulso (live questions) ─────────────────────────── */
function pulseShell() {
  const app = $('pulseApp'); if (!app) return null;
  app.innerHTML =
    '<div class="plp-pl-head"><span class="cdx-qr-status-badge live">' + t('demo.live') + '</span>' +
      '<span class="cdx-qr-answer-count" id="plAns"></span></div>' +
    '<h2 class="question-text" id="plQ">' + t('demo.q') + '</h2>' +
    '<div class="plp-pl-main"><div id="plChoices"></div>' +
      '<div class="plp-th"><span>' + ic(SVG.thermo) + '</span>' +
        '<div class="plp-th-tube"><i class="plp-th-fill" id="plThFill"></i></div>' +
        '<b class="plp-th-pct" id="plThPct">0%</b><span class="plp-th-lbl">' + t('demo.comp') + '</span></div>' +
    '</div>' +
    '<div class="cp-qa-bar" id="plQa"><div class="cp-qa-toast" id="plToast"></div>' +
      '<div class="cp-qa-bar-collapsed"><span class="cp-qa-bar-placeholder" id="plPh">' + t('demo.askph') + '</span>' +
        '<span class="cp-qa-bar-send">&#10148;</span></div></div>';
  return app;
}

function optionsHTML() {
  return '<div>' + LETTERS.map((L, i) =>
    '<button class="cdx-qr-option-btn" data-i="' + i + '"><span class="cdx-qr-option-letter">' + L + '</span>' +
    '<span>' + t('demo.o' + (i + 1)) + '</span></button>').join('') + '</div>';
}

function resultsHTML() {
  return '<div class="cdx-qr-student">' + LETTERS.map((L, i) => {
    const correct = i === CORRECT;
    return '<div class="cdx-qr-bar' + (correct ? ' is-correct' : '') + '">' +
      '<span class="cdx-qr-bar-letter">' + L + '</span>' +
      '<div class="cdx-qr-bar-body"><div class="cdx-qr-bar-label">' +
        '<span class="cdx-qr-bar-text">' + t('demo.o' + (i + 1)) + '</span>' +
        '<span class="cdx-qr-bar-pct">' + DEMO_VOTES[i] + '%</span></div>' +
      '<div class="cdx-qr-bar-track"><span class="cdx-qr-bar-fill' + (correct ? '' : ' mine') + '"></span></div>' +
      '</div></div>';
  }).join('') + '</div>';
}

function setThermo(pct) {
  const f = $('plThFill'), p = $('plThPct');
  if (f) f.style.height = pct + '%';
  if (p) p.textContent = pct + '%';
}

function runPulse() {
  if (!pulseShell()) return;
  const choices = $('plChoices');
  choices.innerHTML = optionsHTML();

  if (reduce()) {
    choices.innerHTML = resultsHTML();
    choices.querySelectorAll('.cdx-qr-bar-fill').forEach((f, i) => { f.style.width = DEMO_VOTES[i] + '%'; });
    if ($('plAns')) $('plAns').textContent = ANSWERS + ' ' + t('demo.answers');
    setThermo(COMP);
    return;
  }

  // tap option 2
  D(() => { const b = choices.querySelector('[data-i="1"]'); if (b) b.classList.add('is-selected'); }, 1500);
  // flip to results
  D(() => {
    choices.innerHTML = resultsHTML();
    requestAnimationFrame(() => choices.querySelectorAll('.cdx-qr-bar-fill').forEach((f, i) => { f.style.width = DEMO_VOTES[i] + '%'; }));
    let n = 0; const iv = setInterval(() => { n += 2; if (n >= ANSWERS) { n = ANSWERS; clearInterval(iv); } if ($('plAns')) $('plAns').textContent = n + ' ' + t('demo.answers'); }, 60);
    setThermo(COMP);
  }, 2300);
  // type a question to the instructor, then "send" + toast
  D(() => {
    const bar = $('plQa'), ph = $('plPh'); if (!bar || !ph) return;
    bar.classList.add('plp-typing');
    const full = t('demo.ask'); let i = 0;
    const iv = setInterval(() => { ph.textContent = full.slice(0, ++i); if (i >= full.length) clearInterval(iv); }, 36);
  }, 5200);
  D(() => {
    const toast = $('plToast'), ph = $('plPh'), bar = $('plQa');
    if (toast) { toast.textContent = t('demo.sent'); toast.classList.add('visible'); }
    if (ph) ph.textContent = t('demo.askph');
    if (bar) bar.classList.remove('plp-typing');
  }, 7400);
  D(() => { const toast = $('plToast'); if (toast) toast.classList.remove('visible'); }, 9200);
  // loop
  D(runPulse, 10500);
}

/* ─────────────────────────── Trilha (living workbook) ───────────────────────── */
function doneCard(num, titleKey) {
  return '<div class="cdx-tr-tl-row">' +
    '<div class="cdx-tr-tl-dot cdx-tr-tl-dot--done">&#10003;</div>' +
    '<div class="cdx-tr-card"><div class="cdx-tr-card-header">' +
      '<div class="cdx-tr-zone cdx-tr-zone--done"><span class="cdx-tr-zone-num">' + num + '</span>' +
        '<span class="cdx-tr-zone-label">' + t('trilha.zone') + '</span></div>' +
      '<div class="cdx-tr-meta"><span class="cdx-tr-meta-eyebrow">' + t('trilha.done') + '</span>' +
        '<span class="cdx-tr-title">' + t(titleKey) + '</span></div>' +
      '<div class="cdx-tr-actions"><span class="cdx-tr-chevron">&rsaquo;</span></div>' +
    '</div></div></div>';
}

function currentCard() {
  return '<div class="cdx-tr-tl-row" id="trRow3">' +
    '<div class="cdx-tr-tl-dot">3</div>' +
    '<div class="cdx-tr-card" id="trCard3"><div class="cdx-tr-card-header">' +
      '<div class="cdx-tr-zone"><span class="cdx-tr-zone-num">3</span>' +
        '<span class="cdx-tr-zone-label">' + t('trilha.zone') + '</span></div>' +
      '<div class="cdx-tr-meta"><span class="cdx-tr-title">' + t('trilha.a3') + '</span>' +
        '<span class="cdx-tr-summary">' + t('trilha.a3sum') + '</span></div>' +
      '<div class="cdx-tr-actions"><span class="cdx-tr-chevron">&rsaquo;</span></div>' +
    '</div></div></div>';
}

const novoBanner = () =>
  '<div class="cdx-tr-novo-banner plp-pulsing"><span class="cdx-tr-novo-text">' + t('trilha.novo') + '</span>' +
  '<span class="cdx-tr-novo-count">1</span></div>';

const trailBody = () =>
  '<div class="cdx-tr-body"><div class="cdx-tr-sub-list">' +
    '<div class="cdx-tr-sub"><div class="cdx-tr-sub-zone">' + ic(SVG.doc, 22) + '</div>' +
      '<div class="cdx-tr-sub-meta"><span class="cdx-tr-sub-type">' + t('trilha.mat.type') + '</span>' +
        '<span class="cdx-tr-sub-title">' + t('trilha.mat.title') + '</span></div>' +
      '<div class="cdx-tr-sub-actions"><button class="cdx-tr-item-action">' + ic(SVG.open, 13) + t('trilha.open') + '</button></div></div>' +
    '<div class="cdx-tr-sub cdx-tr-sub--tarefa"><div class="cdx-tr-sub-zone cdx-tr-sub-zone--tarefa">' + ic(SVG.task, 22) + '</div>' +
      '<div class="cdx-tr-sub-meta"><span class="cdx-tr-sub-type">' + t('trilha.task.type') + '</span>' +
        '<span class="cdx-tr-sub-title">' + t('trilha.task.title') + '</span></div>' +
      '<div class="cdx-tr-sub-actions"><button class="cdx-tr-item-action cdx-tr-item-action--task" id="trTask">' + ic(SVG.task, 13) + t('trilha.do') + '</button></div></div>' +
  '</div></div>';

function markTaskDone() {
  const b = $('trTask'); if (!b) return;
  b.classList.remove('cdx-tr-item-action--task');
  b.classList.add('is-done');
  b.innerHTML = ic(SVG.check, 13) + t('trilha.done');
}

function runTrail() {
  const app = $('trailApp'); if (!app) return;
  const cap = $('trCap'); if (cap) cap.textContent = t('trilha.cap');
  app.innerHTML = '<div class="cdx-tr-timeline">' + doneCard(1, 'trilha.a1') + doneCard(2, 'trilha.a2') + currentCard() + '</div>';

  if (reduce()) {
    const card = $('trCard3');
    card.insertAdjacentHTML('afterbegin', novoBanner());
    card.classList.add('open'); $('trRow3').classList.add('is-open');
    card.insertAdjacentHTML('beforeend', trailBody());
    markTaskDone();
    return;
  }

  D(() => { const card = $('trCard3'); if (card) card.insertAdjacentHTML('afterbegin', novoBanner()); }, 1200);
  D(() => {
    const card = $('trCard3'), row = $('trRow3'); if (!card) return;
    const banner = card.querySelector('.cdx-tr-novo-banner'); if (banner) banner.classList.remove('plp-pulsing');
    card.classList.add('open'); if (row) row.classList.add('is-open');
    card.insertAdjacentHTML('beforeend', trailBody());
  }, 3000);
  D(markTaskDone, 5600);
  D(runTrail, 8400);
}

export function initDemos() {
  runPulse();
  runTrail();
  onLang(() => { clear(); runPulse(); runTrail(); });
}
