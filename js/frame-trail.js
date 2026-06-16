// js/frame-trail.js
// Runs INSIDE the offer-section Trilha phone (a srcdoc iframe built by demos.js, in
// place on the landing). Boots the REAL Codex trilha student page on canned data via
// the window.callWorker seam. INERT (body overflow locked; a transform "camera" pans
// instead of native scroll, so it never hijacks the landing). step() beacons (the
// landing draws the caption tab on top of the phone) + slow pacing + faded reveals
// make it read as steps: nova aula -> material -> tarefa.
import { sleep, $, waitFor, tap, step, baseStyle, followParentTheme, lockPageScroll } from '/js/frame-demo-shared.js?v=16';

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
// Seed a student session (key cdx_student_<c>_<t>, here demo/demo) so tapping the
// tarefa "Enviar" opens the submit modal directly. The real app gates submission
// behind login; in the demo the student is already logged in, so we skip that modal.
try { localStorage.setItem('cdx_student_demo_demo', 'demo-session'); } catch (_) { /* noop */ }

// 2) Demo-only skin: lock scrolling (camera pans via transform), box body prose +
//    the tarefa answer, fade expanded content in.
baseStyle();
lockPageScroll();   // the trilha modules / modal focus inputs; keep that off the landing
const style = document.createElement('style');
style.textContent =
  'html,body{height:100%;margin:0;overflow:hidden!important}' +
  // The camera pans .cdx-trilha-main via inline transform; its cdx-tr-fade-in animation
  // (fill both, ends at translateY(0)) would override that inline transform, pinning the
  // content and leaving taps stuck at the bottom. Drop the animation so the camera works.
  '.cdx-trilha-main{will-change:transform;animation:none!important}' +
  '.cdx-tr-sub-expanded,.cdx-tr-body{animation:plp-rise .4s ease both}' +
  '.ctr-prompt-body,.ctr-prompt-verbatim{color:transparent!important;position:relative;min-height:38px}' +
  '.ctr-prompt-body::after,.ctr-prompt-verbatim::after{content:"";position:absolute;left:0;right:0;top:2px;bottom:2px;border-radius:4px;opacity:.16;' +
  'background:repeating-linear-gradient(var(--text-secondary,#115e59) 0 9px, transparent 9px 17px)}' +
  '.ctr-copy-btn{display:none}' +
  '.cdx-tr-login-pill{display:none!important}' +   // no auth chrome in the demo (student is pre-logged-in)
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
// Computed ABSOLUTELY each call (clear the transform, measure the target's natural
// position, then animate to it) so it can't drift as the app re-lays-out between beats
// (navigating into an aula, expanding a sub) — the old incremental accumulator ran the
// transform to thousands of px and left taps stuck near the bottom edge. NEVER
// scrollIntoView/scrollTo — those bubble across the iframe boundary and hijack the
// landing's scroll. This only moves the demo's own content via transform.
function panTo(el, margin) {
  const main = $('.cdx-trilha-main'); if (!main || !el) return;
  const m = (margin == null ? 150 : margin);
  const prev = main.style.transform || 'none';
  main.style.transition = 'none';
  main.style.transform = 'none';
  const natural = el.getBoundingClientRect().top;   // untransformed viewport top
  const pan = Math.max(0, Math.round(natural - m));
  main.style.transform = prev;                        // restore so there's no flash
  void main.offsetWidth;                              // commit prev as the transition start
  main.style.transition = 'transform .6s ease';
  main.style.transform = 'translateY(-' + pan + 'px)';
}
// True if any part of `el` is comfortably inside the phone viewport.
function inBand(el) {
  const H = document.documentElement.clientHeight;
  const r = el.getBoundingClientRect();
  return r.top >= 8 && r.bottom <= H - 8;
}
// Bring the target into view, let the pan settle, THEN tap. The tarefa modal is a
// FIXED, centered, internally-scrollable overlay (.tr-modal) that the transform camera
// can't move, so for targets inside it we scroll the modal's own content instead. For
// page targets we pan; a correction pass re-measures and pans again if a mid-flight
// layout change (an expand finishing) left the target out of the band.
async function tapInView(el, margin) {
  if (!el) return;
  const modal = el.closest && el.closest('.tr-modal');
  if (modal) {
    const er = el.getBoundingClientRect(), mr = modal.getBoundingClientRect();
    modal.scrollTop = Math.max(0, modal.scrollTop + (er.top - mr.top) - (mr.height - er.height) / 2);
    await sleep(480);
  } else {
    panTo(el, margin);
    await sleep(700);
    if (!inBand(el)) { panTo(el, margin); await sleep(560); }
  }
  await tap(el);
}

async function autoplay() {
  await waitFor('.cdx-tr-tl-row[data-aula="3"]');
  await sleep(1100);

  // BEAT 1 — a new aula is published; open it.
  step(1, 4, 'Nova aula publicada');
  await sleep(1900);
  await tapInView($('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-card-header'), 150);
  await sleep(2600);

  // BEAT 2 — open the material content.
  step(2, 4, 'Abrindo o material');
  await sleep(1500);
  await tapInView($('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub:not(.cdx-tr-sub--tarefa)'), 140);
  await sleep(3400);

  // BEAT 3 — open the tarefa, type, send.
  step(3, 4, 'Enviando a tarefa');
  await sleep(1500);
  const taskSel = '.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub--tarefa';
  await tapInView($(taskSel), 140);
  const taskBtn = await waitFor(taskSel + ' .cdx-tr-item-action', 2500);
  await sleep(800);
  await tapInView(taskBtn, 140);                 // open the real tarefa modal (fixed overlay)
  const ta = await waitFor('.tr-tarefa-field textarea, .tr-tarefa-field input', 2500);
  const nameI = $('.tr-tarefa-name');
  if (nameI) nameI.value = 'Você';
  if (ta) {
    const filler = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    for (let i = 6; i <= filler.length; i += 6) { ta.value = filler.slice(0, i); ta.dispatchEvent(new Event('input', { bubbles: true })); await sleep(70); }
  }
  await sleep(900);
  await tapInView($('button.tr-tarefa-submit'), 140);   // the real "Enviar resposta" button (modal-aware)

  // BEAT 4 — submitted.
  step(4, 4, 'Tarefa enviada');
  await sleep(4200);

  setTimeout(() => location.reload(), 900);
}
