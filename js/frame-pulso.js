// js/frame-pulso.js
// Runs INSIDE the offer-section Pulso phone (a srcdoc iframe built by demos.js, in
// place on the landing). Drives the REAL Codex student module (nexo-answer) on
// canned data via the window.callWorker seam. Nothing is rebuilt. Visible taps +
// tight pacing make it read as one flow: responde -> pergunta -> respondida.
import { sleep, $, waitFor, tap, followParentTheme } from '/js/frame-demo-shared.js?v=11';

// 1) Canned Worker transport (set before the real module's first call, at mount).
const D = {
  qid: 'demo-q-0',
  qtext: 'O resultado da IA precisa de revisão humana?',
  opts: ['Sempre', 'Só às vezes', 'Nunca', 'Depende do uso'],
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
  if (a === 'submit_student_question') { setTimeout(() => { D.qAnswered = true; }, 1600); return Promise.resolve({ ok: true }); }
  if (a === 'cp_student_inbox') return Promise.resolve({ ok: true, questions: D.qAnswered ? [{ id: 'sq1', text: 'pergunta', answer: 'resposta' }] : [] });
  return Promise.resolve({ ok: true });
};

// 2) Demo-only skin: box the option label + the Q/answer prose; keep the letter,
//    the question prompt, and the state strings real.
const style = document.createElement('style');
style.textContent =
  'html,body{margin:0;height:100%;background:var(--background);overflow:hidden}' +
  "body{font-family:'Inter','Segoe UI',sans-serif}" +
  '#cdx-tr-nexo-host,.nx-answer-screen{min-height:100%}.nx-answer-screen{padding:16px 14px;box-sizing:border-box}' +
  '.cdx-qr-option-btn>span:last-child{color:transparent!important;position:relative}' +
  '.cdx-qr-option-btn>span:last-child::after{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);height:13px;border-radius:3px;background:var(--text-secondary);opacity:.28;width:90%}' +
  '.cdx-qr-option-btn:nth-of-type(1)>span:last-child::after{width:80%}' +
  '.cdx-qr-option-btn:nth-of-type(2)>span:last-child::after{width:97%}' +
  '.cdx-qr-option-btn:nth-of-type(3)>span:last-child::after{width:68%}' +
  '.cdx-qr-option-btn:nth-of-type(4)>span:last-child::after{width:88%}' +
  '.cp-sqa-text,.cp-sqa-answer-text{color:transparent!important;position:relative;min-height:11px}' +
  '.cp-sqa-text::after,.cp-sqa-answer-text::after{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);height:10px;border-radius:3px;background:var(--text-secondary);opacity:.28;width:86%}' +
  '.cp-sqa-answer-text::after{width:64%}';
document.head.appendChild(style);

followParentTheme();

// 3) Mount the REAL student module and autoplay (visible taps, tight pacing).
import('/codex/trilha/js/nexo-answer.js').then(({ mount, unmount }) => {
  const HOST = document.getElementById('cdx-tr-nexo-host');
  const ASK = 'E quando o modelo erra?';
  let cycle = 0;

  function reset() {
    cycle += 1;
    try { for (const k of Object.keys(localStorage)) if (/^cl_ans_|^nx_seen_ans_/.test(k)) localStorage.removeItem(k); } catch (_) { /* noop */ }
    D.qid = 'demo-q-' + cycle; D.qAnswered = false; D.closed = false;
  }

  async function runOnce() {
    reset();
    mount(HOST, { sessionCode: 'DEMO', studentName: 'Você' });

    // BEAT 1 — read the question, tap an answer -> "Resposta enviada!"
    const optB = await waitFor('.cdx-qr-option-btn[data-index="1"]');
    await sleep(950);
    await tap(optB);

    // BEAT 2 — the answered screen leads into asking the instructor.
    await sleep(1200);
    await tap($('#qa-bar-collapsed'));
    const input = await waitFor('#qa-editor-input', 2000);
    if (input) {
      for (let i = 1; i <= ASK.length; i++) { input.value = ASK.slice(0, i); input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(26); }
    }
    await sleep(280);
    await tap($('#qa-editor-send'));             // -> "Pergunta enviada."

    // BEAT 3 — the instructor answers; the question closes -> "Sua pergunta" card.
    await sleep(1700);
    D.closed = true;
    await sleep(2600);

    try { unmount(); } catch (_) { /* noop */ }
    await sleep(550);
    runOnce();
  }

  if (matchMedia('(prefers-reduced-motion:reduce)').matches) {
    reset(); mount(HOST, { sessionCode: 'DEMO', studentName: 'Você' });
  } else {
    runOnce();
  }
});
