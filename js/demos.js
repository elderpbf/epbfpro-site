// js/demos.js — the two phone demos inside the offer section.
// Pulso = live-questions animation; Trilha = cycling print shots. Ported from the mock.
// (Both are slated for a rebuild from the real ClassPulse/ClassTrail CSS next.)
import { t, onLang } from './i18n.js';
import { getTheme, onTheme } from './theme.js';

const TR = [{ base: 'trilha-home', cap: 'trilha.cap.home' }, { base: 'trilha-aula', cap: 'trilha.cap.aula' }];
const DEMO_VOTES = [14, 68, 7, 11];   // % per option (the 2nd is correct)

/* ----- Trilha (print shots, auto-cycle) ----- */
let trI = 0, trT;
function buildTrilha() {
  const ph = document.getElementById('trPhone'); if (!ph) return;
  ph.querySelectorAll('img').forEach(n => n.remove());
  const theme = getTheme();
  TR.forEach((s, i) => {
    const img = document.createElement('img'); img.dataset.i = i; img.alt = t(s.cap);
    img.src = 'images/app/' + s.base + '-' + theme + '.jpg';
    if (i === 0) img.classList.add('plp-on'); ph.appendChild(img);
  });
  const cap = document.getElementById('trCap'); if (cap) cap.textContent = t(TR[0].cap);
  trI = 0; clearInterval(trT);
  trT = setInterval(() => {
    trI = (trI + 1) % TR.length;
    ph.querySelectorAll('img').forEach(im => im.classList.toggle('plp-on', +im.dataset.i === trI));
    if (cap) cap.textContent = t(TR[trI].cap);
  }, 3000);
}

/* ----- Pulso (live demo) ----- */
let demoTimers = [];
function clearDemo() { demoTimers.forEach(x => clearTimeout(x)); demoTimers = []; }
function D(fn, ms) { demoTimers.push(setTimeout(fn, ms)); }
function buildOpts() {
  const wrap = document.getElementById('opts'); if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const o = document.createElement('div'); o.className = 'plp-opt'; o.id = 'opt' + i;
    o.innerHTML = '<span class="plp-fill"></span><span class="plp-lbl"><span>' + t('demo.o' + (i + 1)) + '</span><span class="plp-pct"></span></span>';
    wrap.appendChild(o);
  }
}
function restartDemo() {
  clearDemo();
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const pq = document.getElementById('pq'); if (pq) pq.textContent = t('demo.q');
  buildOpts();
  const thBar = document.getElementById('thBar'), thN = document.getElementById('thN'), askTx = document.getElementById('askTx');
  if (thBar) thBar.style.width = '0%'; if (thN) thN.textContent = '0%';
  if (askTx) askTx.innerHTML = '<span class="plp-cur2"></span>';
  if (reduce) {
    $$('#opts .plp-opt').forEach((o, i) => { o.classList.add('plp-show'); o.querySelector('.plp-fill').style.width = DEMO_VOTES[i] + '%'; o.querySelector('.plp-pct').textContent = DEMO_VOTES[i] + '%'; });
    const c = document.getElementById('opt1'); if (c) c.classList.add('plp-correct');
    if (thBar) thBar.style.width = '82%'; if (thN) thN.textContent = '82%';
    if (askTx) askTx.textContent = '"' + t('demo.ask') + '"';
    return;
  }
  for (let i = 0; i < 4; i++) D(() => { const o = document.getElementById('opt' + i); if (o) o.classList.add('plp-show'); }, 300 + i * 180);
  D(() => {
    $$('#opts .plp-opt').forEach((o, i) => {
      o.querySelector('.plp-fill').style.width = DEMO_VOTES[i] + '%';
      let n = 0; const end = DEMO_VOTES[i]; const iv = setInterval(() => { n += Math.ceil(end / 14); if (n >= end) { n = end; clearInterval(iv); } o.querySelector('.plp-pct').textContent = n + '%'; }, 70);
    });
  }, 1500);
  D(() => { if (thBar) thBar.style.width = '82%'; let n = 0; const iv = setInterval(() => { n += 4; if (n >= 82) { n = 82; clearInterval(iv); } if (thN) thN.textContent = n + '%'; }, 45); }, 2600);
  D(() => { const c = document.getElementById('opt1'); if (c) { c.classList.add('plp-correct'); c.querySelector('.plp-lbl span').insertAdjacentHTML('afterend', '<span class="plp-tick"> ✓</span>'); } }, 3700);
  D(() => { const full = '"' + t('demo.ask') + '"'; let i = 0; const el = document.getElementById('askTx'); if (!el) return; const iv = setInterval(() => { i++; el.innerHTML = full.slice(0, i) + '<span class="plp-cur2"></span>'; if (i >= full.length) clearInterval(iv); }, 38); }, 4700);
  D(restartDemo, 9200);
}

export function initDemos() {
  buildTrilha(); restartDemo();
  onLang(() => { buildTrilha(); restartDemo(); });
  onTheme(() => { buildTrilha(); });
}
