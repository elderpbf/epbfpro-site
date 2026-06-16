// js/frame-pulso.js
// Runs INSIDE the offer-section Pulso phone (a srcdoc iframe built by demos.js, so
// it lives in place on the landing — no separate page, no new route). It drives the
// REAL Codex student module (codex/trilha/js/nexo-answer.js, rendered through the
// real question-element + question-render + nexo.css) on canned data, via the same
// window.callWorker transport seam the question tests use. Nothing here rebuilds or
// copies the app, so any change to the real student UI is reflected automatically.
//
// Three real beats: responde -> pergunta (cp-qa-bar) -> respondida.

// 1) Canned Worker transport. codex-api.call(action, p) sets p.action then calls
//    the global callWorker; set it before the real module's first call (at mount).
const D = {
  qid: 'demo-q-0',
  qtext: 'O resultado da IA precisa de revisão humana?',  // real short prompt (kept)
  opts: ['Sempre', 'Só às vezes', 'Nunca', 'Depende do uso'], // boxed in CSS below
  qAnswered: false, closed: false
};
window.WORKER_URL = '';
window.callWorker = function (p) {
  const a = p && p.action;
  if (a === 'get_session_state') return Promise.resolve({
    session: { code: 'DEMO', status: 'open' },
    qa_enabled: true,
    active_question: D.closed ? null : {
      id: D.qid, text: D.qtext, type: 'mc', status: 'active',
      options: D.opts, max_select: 1,
      answer_counts: [0, 0, 0, 0], show_results: false, reveal_answer: false,
      correct_answers: [], voter_count: 0
    },
    history: []
  });
  if (a === 'submit_answer') return Promise.resolve({ ok: true });
  if (a === 'submit_student_question') { setTimeout(() => { D.qAnswered = true; }, 2200); return Promise.resolve({ ok: true }); }
  if (a === 'cp_student_inbox') return Promise.resolve({ ok: true, questions: D.qAnswered ? [{ id: 'sq1', text: 'pergunta', answer: 'resposta' }] : [] });
  return Promise.resolve({ ok: true });
};

// 2) Demo-only skin (scoped to this iframe). Box the option label and the Q/answer
//    prose; keep the A/B/C/D letter, the question prompt, and the state strings real.
const style = document.createElement('style');
style.textContent =
  'html,body{margin:0;height:100%;background:var(--background);overflow:hidden}' +
  "body{font-family:'Inter','Segoe UI',sans-serif}" +
  '#demo-host,.nx-answer-screen{min-height:100%}.nx-answer-screen{padding:16px 14px;box-sizing:border-box}' +
  '.cdx-qr-option-btn>span:last-child{color:transparent!important;position:relative}' +
  '.cdx-qr-option-btn>span:last-child::after{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);height:13px;border-radius:3px;background:var(--text-secondary);opacity:.28;width:90%}' +
  '.cdx-qr-option-btn:nth-of-type(1)>span:last-child::after{width:80%}' +
  '.cdx-qr-option-btn:nth-of-type(2)>span:last-child::after{width:97%}' +
  '.cdx-qr-option-btn:nth-of-type(3)>span:last-child::after{width:68%}' +
  '.cdx-qr-option-btn:nth-of-type(4)>span:last-child::after{width:88%}' +
  '.cp-sqa-text,.cp-sqa-answer-text{color:transparent!important;position:relative;min-height:11px}' +
  '.cp-sqa-text::after,.cp-sqa-answer-text::after{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);height:10px;border-radius:3px;background:var(--text-secondary);opacity:.22;width:86%}' +
  '.cp-sqa-answer-text::after{width:64%}';
document.head.appendChild(style);

// 3) Theme follows the parent landing (?theme= on first load, postMessage on toggle).
const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
applyTheme(new URLSearchParams(location.search).get('theme'));
addEventListener('message', (e) => { if (e.data && e.data.plpTheme) applyTheme(e.data.plpTheme); });

// 4) Mount the REAL student module and autoplay the three beats.
import('/codex/trilha/js/nexo-answer.js').then(({ mount, unmount }) => {
  const HOST = document.getElementById('demo-host');
  const ASK = 'E quando o modelo erra?';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  let cycle = 0;

  function reset() {
    cycle += 1;
    try { for (const k of Object.keys(localStorage)) if (/^cl_ans_|^nx_seen_ans_/.test(k)) localStorage.removeItem(k); } catch (_) { /* noop */ }
    D.qid = 'demo-q-' + cycle; D.qAnswered = false; D.closed = false;
  }
  async function waitFor(sel, ms = 6000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const el = $(sel); if (el) return el; await sleep(80); }
    return null;
  }

  async function runOnce() {
    reset();
    mount(HOST, { sessionCode: 'DEMO', studentName: 'Você' });

    const optB = await waitFor('.cdx-qr-option-btn[data-index="1"]');
    await sleep(1500);
    if (optB) optB.click();                       // -> "Resposta enviada!"

    await sleep(2400);
    const collapsed = $('#qa-bar-collapsed');
    if (collapsed) collapsed.click();
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
    if (send) send.click();                       // -> "Pergunta enviada."

    await sleep(6500);
    D.closed = true;                              // next poll -> onIdle -> "Sua pergunta" card
    await sleep(4200);
    await sleep(2500);
    try { unmount(); } catch (_) { /* noop */ }
    await sleep(900);
    runOnce();
  }

  if (matchMedia('(prefers-reduced-motion:reduce)').matches) {
    reset(); mount(HOST, { sessionCode: 'DEMO', studentName: 'Você' });
  } else {
    runOnce();
  }
});
