// js/frame-trail.js
// Runs INSIDE the offer-section Trilha phone (a srcdoc iframe built by demos.js, in
// place on the landing — no separate page). It boots the REAL Codex trilha student
// page (page.js + aulas.js + flat.js + nexo.js + pensoia-header, rendering through
// the real cards.css / trilha.css / tarefa-modal.css) on canned data, via the same
// window.callWorker transport seam the trilha tests use. Nothing is rebuilt or
// copied, so the demo tracks the real Trail automatically.
//
// Three real beats: nova aula -> abrir material -> enviar tarefa.

// 1) Canned Worker transport (set before the real modules call it).
const nowSec = Math.floor(Date.now() / 1000);
const freshAt = nowSec - 3600; // 1h ago -> inside the 5-day NOVO window
const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const AULAS = [
  { aula_number: 1, title: 'Fundamentos de IA generativa', happened_on: isoDaysAgo(14), scheduled_for: isoDaysAgo(14), topics_json: null },
  { aula_number: 2, title: 'Engenharia de prompts na prática', happened_on: isoDaysAgo(7), scheduled_for: isoDaysAgo(7), topics_json: null },
  { aula_number: 3, title: 'IA no seu fluxo de trabalho', happened_on: isoDaysAgo(1), scheduled_for: isoDaysAgo(1), topics_json: null }
];
const ITEMS = [
  { id: 'm1', type: 'material', type_label: 'Material', type_icon: '', aula_number: 3, position: 1,
    title: 'Guia rápido da aula', summary: '', body_md: '## Guia da aula\n\nResumo prático com exemplos e um checklist para aplicar no seu trabalho.', meta_json: {}, released_at: freshAt },
  { id: 't1', type: 'tarefa', aula_number: 3, position: 2,
    title: 'Escreva um prompt para uma tarefa real', body_md: 'Escolha uma tarefa do seu dia a dia e escreva um prompt para resolvê-la.', meta_json: { field_type: 'text', allow_anonymous: true }, released_at: freshAt }
];
const ITEM_BY_ID = {}; ITEMS.forEach((i) => { ITEM_BY_ID[i.id] = i; });

window.WORKER_URL = '';
window.callWorker = function (p) {
  const a = p && p.action;
  if (a === 'ct_get_turma_view') return Promise.resolve({
    client: { display_name: 'PensoIA' },
    turma: { display_name: 'IA na Prática' },
    aulas: AULAS, items: ITEMS, apostila_set: null
  });
  if (a === 'ct_get_item_public') return Promise.resolve({ item: ITEM_BY_ID[p.item_id] || null });
  if (a === 'ct_submit_tarefa') return Promise.resolve({ ok: true });
  if (a === 'cp_get_active_for_turma') return Promise.resolve({ session: null }); // no live session -> stays in trilha mode
  return Promise.resolve({ ok: true });
};

// Fresh start each loop so the tarefa shows "Enviar resposta" again.
try { for (const k of Object.keys(localStorage)) if (/^ct_tarefa_submitted_|^ct_student_name/.test(k)) localStorage.removeItem(k); } catch (_) { /* noop */ }

// 2) Demo-only skin (scoped to this iframe). Box the long rendered body prose;
//    keep aula/item titles, labels, dates, buttons and the typed answer real.
const style = document.createElement('style');
style.textContent =
  'html{overflow-x:hidden}body{overflow-x:hidden}' +
  '.ctr-prompt-body,.ctr-prompt-verbatim{color:transparent!important;position:relative;min-height:38px}' +
  '.ctr-prompt-body::after,.ctr-prompt-verbatim::after{content:"";position:absolute;left:0;right:0;top:2px;bottom:2px;border-radius:4px;opacity:.16;' +
  'background:repeating-linear-gradient(var(--text-secondary,#115e59) 0 9px, transparent 9px 17px)}' +
  '.ctr-copy-btn{display:none}';
document.head.appendChild(style);

// 3) Theme follows the parent landing.
const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
applyTheme(new URLSearchParams(location.search).get('theme'));
addEventListener('message', (e) => { if (e.data && e.data.plpTheme) applyTheme(e.data.plpTheme); });

// 4) Boot the REAL trilha modules (dynamic import AFTER the shim is installed, so
//    nexo.js's eval-time poll uses the canned transport), then autoplay.
Promise.all([
  import('/codex/trilha/js/pensoia-header.js'),
  import('/codex/js/glyphs.js'),
  import('/codex/trilha/js/aulas.js'),
  import('/codex/trilha/js/flat.js'),
  import('/codex/trilha/js/nexo.js'),
  import('/codex/trilha/js/page.js')
]).then(([, glyphs, , , , page]) => {
  window.CdxGlyphs = glyphs;
  page.mount(document.getElementById('cdx-trilha-root'), { location: { search: '?c=demo&t=demo&k=demo', pathname: '/' } });
  if (!matchMedia('(prefers-reduced-motion:reduce)').matches) autoplay();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
async function waitFor(sel, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const el = $(sel); if (el) return el; await sleep(80); }
  return null;
}

async function autoplay() {
  await waitFor('#cdx-tr-aulas-timeline .cdx-tr-tl-row');
  await sleep(1300);

  // BEAT 1 — open Aula 03 (the one carrying the "Novo material" banner).
  const hdr = $('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-card-header');
  if (hdr) { hdr.scrollIntoView({ block: 'start' }); hdr.click(); }
  await sleep(1700);

  // BEAT 2 — open the material content.
  const matSub = $('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub:not(.cdx-tr-sub--tarefa)');
  if (matSub) { matSub.scrollIntoView({ block: 'center' }); matSub.click(); }
  await sleep(2800);

  // BEAT 3 — open the tarefa, type an answer, send it.
  const taskSub = $('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub--tarefa');
  if (taskSub) { taskSub.scrollIntoView({ block: 'center' }); taskSub.click(); }
  await sleep(1500);
  const taskBtn = taskSub && taskSub.querySelector('.cdx-tr-item-action');
  if (taskBtn) taskBtn.click();                 // open the real tarefa-submit modal
  const ta = await waitFor('.tr-tarefa-field textarea, .tr-tarefa-field input', 2500);
  const nameI = $('.tr-tarefa-name');
  if (nameI) nameI.value = 'Você';
  const ANS = 'Resumir um documento e revisar os pontos antes de enviar.';
  if (ta) {
    for (let i = 1; i <= ANS.length; i++) { ta.value = ANS.slice(0, i); ta.dispatchEvent(new Event('input', { bubbles: true })); await sleep(22); }
  }
  await sleep(700);
  const submit = $('.tr-tarefa-submit');
  if (submit) submit.click();                   // -> canned ok -> closes, button flips to "Resposta enviada"
  await sleep(4500);

  setTimeout(() => location.reload(), 1500);     // loop
}
