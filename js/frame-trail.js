// js/frame-trail.js
// Runs INSIDE the offer-section Trilha phone (a srcdoc iframe built by demos.js, in
// place on the landing). Boots the REAL Codex trilha student page on canned data via
// the window.callWorker seam. INERT (body overflow locked; a transform "camera" pans
// instead of native scroll, so it never hijacks the landing). step() beacons (the
// landing draws the caption tab on top of the phone) + slow pacing + faded reveals
// make it read as steps: nova aula -> material. The tarefa is shown in the list but
// not opened: tapping it now routes to a separate Tarefas tab (actions.js 2026-07-15),
// which has no data in this canned demo, so driving into it dead-ends the walkthrough.
import { sleep, $, waitFor, tap, step, baseStyle, followParentTheme, lockPageScroll } from '/js/frame-demo-shared.js?v=17';

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
    title: 'Guia rápido da aula', summary: '', body_md: 'Um resumo prático da aula, com exemplos passo a passo e um checklist curto para aplicar no seu trabalho ainda nesta semana.', meta_json: {}, released_at: freshAt },
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

// 2) Demo-only skin: lock scrolling (camera pans via transform), box the material
//    body prose, fade expanded content in.
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
  '.cdx-tr-login-pill{display:none!important}';   // no auth chrome in the demo (student is pre-logged-in)
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
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) showEndState(); else autoplay();
});

// Reduced-motion fallback: the mount above only renders the closed aula list, and the
// open-aula + material "pages" only exist inside autoplay()'s simulated taps. Without
// this, a reduce-motion visitor never sees past the closed list. Reach the same end
// state autoplay lands on (aula 3 open, material expanded) with real clicks, then a
// SINGLE static jump (no transition) to bring it into the phone — a reposition, not a
// pan, so it stays honest to prefers-reduced-motion.
async function showEndState() {
  await waitFor('.cdx-tr-tl-row[data-aula="3"]');

  const header = $('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-card-header');
  if (header) header.click();

  const material = await waitFor('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub:not(.cdx-tr-sub--tarefa)', 2000);
  if (material) material.click();
  await waitFor('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub-expanded', 2000);

  // .cdx-trilha-hero (client avatar + name) sits well above the row inside main and
  // pensoia-header is OUTSIDE main entirely (fixed, does not pan with it) — a margin
  // that doesn't clear the hero's full height leaves a cropped sliver of it peeking
  // in above #cdx-tr-back-pill. 56 clears the hero and still opens right under the
  // header, at the cost of the expanded material's body running past the phone slot
  // (its own heading + collapsed row still fit; only the redacted preview lines don't).
  const main = $('.cdx-trilha-main');
  const row = $('.cdx-tr-tl-row[data-aula="3"]');
  if (main && row) {
    main.style.transition = 'none';
    const top = row.getBoundingClientRect().top;
    main.style.transform = 'translateY(-' + Math.max(0, Math.round(top - 40)) + 'px)';
  }
}

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
  step(1, 2, 'Nova aula publicada');
  await sleep(1900);
  await tapInView($('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-card-header'), 150);
  await sleep(2600);

  // BEAT 2 — open the material content, then hold on it before looping. The walkthrough
  // stops here: the tarefa is visible in the list above, but tapping it now leaves the
  // Aulas surface for the Tarefas tab (actions.js 2026-07-15), which the canned demo does
  // not feed, so driving into it would dead-end on an empty "nenhuma tarefa" page.
  step(2, 2, 'Abrindo o material');
  await sleep(1500);
  await tapInView($('.cdx-tr-tl-row[data-aula="3"] .cdx-tr-sub:not(.cdx-tr-sub--tarefa)'), 140);
  await sleep(5200);

  setTimeout(() => location.reload(), 900);
}
