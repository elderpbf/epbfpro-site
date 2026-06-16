// js/frame-trail.js
// Runs INSIDE the offer-section Trilha phone (a srcdoc iframe built by demos.js, in
// place on the landing). Boots the REAL Codex trilha student page on canned data via
// the window.callWorker seam. INERT (body overflow locked; a transform "camera" pans
// instead of native scroll, so it never hijacks the landing). Action captions + slow
// pacing + faded reveals make it read as steps: nova aula -> material -> tarefa.
import { sleep, $, waitFor, tap, caption, baseStyle, followParentTheme } from '/js/frame-demo-shared.js?v=12';

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
  if (a === 'cp_get_active_for_turma') return Promise.resolve({ session: null });
  return Promise.resolve({ ok: true });
};

// Fresh start each loop so the tarefa shows "Enviar resposta" again.
try { for (const k of Object.keys(localStorage)) if (/^ct_tarefa_submitted_|^ct_student_name/.test(k)) localStorage.removeItem(k); } catch (_) { /* noop */ }

// 2) Demo-only skin: lock scrolling (camera pans via transform), box body prose +
//    the tarefa answer, fade expanded content in.
baseStyle();
const style = document.createElement('style');
style.textContent =
  'html,body{height:100%;margin:0;overflow:hidden!important}' +
  '.cdx-trilha-main{will-change:transform}' +
  '.cdx-tr-sub-expanded,.cdx-tr-body{animation:plp-rise .4s ease both}' +
  '.ctr-prompt-body,.ctr-prompt-verbatim{color:transparent!important;position:relative;min-height:38px}' +
  '.ctr-prompt-body::after,.ctr-prompt-verbatim::after{content:"";position:absolute;left:0;right:0;top:2px;bottom:2px;border-radius:4px;opacity:.16;' +
  'background:repeating-linear-gradient(var(--text-secondary,#115e59) 0 9px, transparent 9px 17px)}' +
  '.ctr-copy-btn{display:none}' +
  '.tr-tarefa-field textarea,.ct-tarefa-answer-text{color:transparent!important;caret-color:transparent!important;' +
  'background-image:repeating-linear-gradient(rgba(120,140,150,.30) 0 11px, transparent 11px 24px)!important;background-clip:padding-box!important}';
document.head.appendChild(style);

followParentTheme();

// 3) Boot the REAL trilha modules (dynamic import AFTER the shim is installed), then autoplay.
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

// The demo's OWN scroll: pan `.cdx-trilha-main` so `el` sits `margin` px from the top.
let panY = 0;
function panTo(el, margin) {
  const root = $('.cdx-trilha-main'); if (!root || !el) return;
  const m = (margin == null ? 150 : margin);
  panY = Math.max(0, panY + (el.getBoundingClientRect().top - m));
  root.style.transition = 'transform .55s ease';
  root.style.transform = 'translateY(' + (-panY) + 'px)';
}
// Bring the target into view, let the pan settle, THEN tap.
async function tapInView(el, margin) {
  if (!el) return;
  panTo(el, margin);
  await sleep(720);
  await tap(el);
}

async function autoplay() {
  await waitFor('.cdx-tr-tl-row[data-aula="3"]');
  await sleep(900);

  // BEAT 1 — a new aula is published; open it.
  caption('Nova aula publicada');
  await sleep(1300);
  await tapInView($('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-card-header'), 150);
  await sleep(1900);

  // BEAT 2 — open the material content.
  caption('Abrindo o material');
  await sleep(1000);
  await tapInView($('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub:not(.cdx-tr-sub--tarefa)'), 140);
  await sleep(2600);

  // BEAT 3 — open the tarefa, type, send.
  caption('Enviando a tarefa');
  await sleep(1000);
  const taskSel = '.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub--tarefa';
  await tapInView($(taskSel), 140);
  const taskBtn = await waitFor(taskSel + ' .cdx-tr-item-action', 2500);
  await sleep(500);
  await tapInView(taskBtn, 140);                 // open the real tarefa modal (fixed overlay)
  const ta = await waitFor('.tr-tarefa-field textarea, .tr-tarefa-field input', 2500);
  const nameI = $('.tr-tarefa-name');
  if (nameI) nameI.value = 'Você';
  if (ta) {
    const filler = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    for (let i = 6; i <= filler.length; i += 6) { ta.value = filler.slice(0, i); ta.dispatchEvent(new Event('input', { bubbles: true })); await sleep(60); }
  }
  await sleep(600);
  await tap($('.tr-tarefa-submit'));
  caption('Tarefa enviada');
  await sleep(3600);

  setTimeout(() => location.reload(), 900);
}
