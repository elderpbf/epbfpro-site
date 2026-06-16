// codex/demo/pulso.js
// Autoplays the three student beats on the REAL live-question experience
// (codex/trilha/js/nexo-answer.js, which renders through the real question-element
// + question-render + nexo.css). Nothing here re-implements or copies the app: it
// only (1) is fed canned data by the window.callWorker shim installed in pulso.html
// and (2) clicks the real buttons. So any change to the real student UI is picked
// up automatically — the whole point of the iframe-the-real-app approach.
//
// The three beats (all real states from nexo-answer.js):
//   1. RESPONDE   — question + A/B/C/D options; tap B -> "Resposta enviada!"
//   2. PERGUNTA   — the real cp-qa-bar: type a question, send -> "Pergunta enviada."
//   3. RESPONDIDA — instructor answers; question closes -> "Sua pergunta /
//                   Resposta do instrutor" card.
import { mount, unmount } from '/codex/trilha/js/nexo-answer.js';

const HOST = document.getElementById('demo-host');
const ASK = 'E quando o modelo erra?';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);

// Follow the parent page's theme (?theme= on first load, postMessage on toggle).
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); }
applyTheme(new URLSearchParams(location.search).get('theme'));
addEventListener('message', (e) => { if (e.data && e.data.plpTheme) applyTheme(e.data.plpTheme); });

let cycle = 0;
function resetState() {
  cycle += 1;
  try {
    for (const k of Object.keys(localStorage)) if (/^cl_ans_|^nx_seen_ans_/.test(k)) localStorage.removeItem(k);
  } catch (_) { /* noop */ }
  const d = window.__demo;
  d.qid = 'demo-q-' + cycle;     // fresh id each loop so beat 1 shows options again
  d.answered = false; d.qSent = false; d.qAnswered = false; d.closed = false;
}

async function waitFor(sel, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const el = $(sel); if (el) return el; await sleep(80); }
  return null;
}

async function run() {
  resetState();
  mount(HOST, { sessionCode: 'DEMO', studentName: 'Você' });

  // BEAT 1 — the question + options render (state 'cpq'); tap option B.
  const optB = await waitFor('.cdx-qr-option-btn[data-index="1"]');
  await sleep(1500);
  if (optB) optB.click();                       // real submit -> "Resposta enviada!"

  // BEAT 2 — ask the instructor through the real cp-qa-bar.
  await sleep(2400);
  const collapsed = $('#qa-bar-collapsed');
  if (collapsed) collapsed.click();             // expand the editor
  const input = await waitFor('#qa-editor-input', 2500);
  if (input) {
    for (let i = 1; i <= ASK.length; i++) {
      input.value = ASK.slice(0, i);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(34);
    }
  }
  await sleep(500);
  const send = $('#qa-editor-send');
  if (send) send.click();                       // -> "Pergunta enviada." toast

  // BEAT 3 — instructor answers (inbox), then closes the question so the student
  // lands on the "Sua pergunta / Resposta do instrutor" card.
  await sleep(6500);                            // qAnswered flips +2.2s; inbox polls every 4s
  window.__demo.closed = true;                  // next session poll -> onIdle -> 'my-answer'
  await sleep(4200);

  // hold, then loop
  await sleep(2500);
  try { unmount(); } catch (_) { /* noop */ }
  await sleep(900);
  run();
}

if (matchMedia('(prefers-reduced-motion:reduce)').matches) {
  resetState();
  mount(HOST, { sessionCode: 'DEMO', studentName: 'Você' });   // static: the question, no autoplay
} else {
  run();
}
