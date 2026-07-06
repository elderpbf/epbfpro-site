/* Mock harness for the trilha "Salvar como app" affordance.
   ONE page, a TOGGLE switches between the 6 placement ideas live (cheapest to review).
   Trilha chrome is a FAITHFUL PORT: markup copied from the real sources
   (pensoia-header buildHeaderHtml, trilha/index.html hero+tabs, aulas.js buildAulaRow),
   rendered with the REAL linked CSS. Only the install variants + the mock controls are new.

   Shared behavior (Élder): PERSISTENT (no X-remove; only collapses; would return if
   uninstalled), BIG on entry then CONTIDO on first interaction, always logo + Instalar,
   minimal during a live question. "Mostrar de novo" replays BIG. */

const LOGO = '/codex/trilha/icons/app-icon-192.png';
const DL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>';
const HIDE_SELECTORS = ['.cdx-trilha-hero', '.cdx-trilha-tabs', '.cdx-trilha-tabcontent', '.cdx-trilha-footer'];

const logoImg = (cls) => '<img class="mk-logo ' + (cls || '') + '" src="' + LOGO + '" alt="">';
const BTN = '<button class="mk-btn" type="button">Instalar</button>';

// ── Faithful trilha snapshot (ported markup) ─────────────────────────────────────
function aulaRow(num, status, badge, date, title, topics, tarefa) {
  const pad = num < 10 ? '0' + num : String(num);
  const chips = topics.map((t) => '<span class="cdx-tr-topic-chip">' + t + '</span>').join('');
  const tpill = tarefa ? '<span class="cdx-tr-tarefa-pill">✓ Tarefa</span>' : '';
  return '<div class="cdx-tr-tl-row" data-aula="' + num + '">' +
    '<div class="cdx-tr-tl-dot cdx-tr-tl-dot--' + status + '">' + badge + '</div>' +
    '<div class="cdx-tr-card" data-aula="' + num + '">' +
      '<div class="cdx-tr-card-header" role="button" tabindex="0" aria-expanded="false">' +
        '<div class="cdx-tr-zone cdx-tr-zone--' + status + '"><span class="cdx-tr-zone-num">' + pad + '</span><span class="cdx-tr-zone-label">Aula</span></div>' +
        '<div class="cdx-tr-meta">' +
          '<div class="cdx-tr-meta-row"><span class="cdx-tr-date-pill">' + date + '</span>' + tpill + '</div>' +
          '<div class="cdx-tr-title">' + title + '</div>' +
          (chips ? '<div class="cdx-tr-topics">' + chips + '</div>' : '') +
        '</div>' +
        '<div class="cdx-tr-actions"><span class="cdx-tr-chevron">›</span></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function trilhaHtml() {
  return '' +
  '<pensoia-header mode="student">' +
  '<header class="ph-bar">' +
    '<div class="ph-left">' +
      '<a class="ph-logo" href="#" aria-label="PensoIA"><span class="ph-logo-mark" style="font-family:Comfortaa,system-ui,sans-serif;font-weight:700;font-size:1.15rem;color:var(--primary)">PensoIA</span></a>' +
      '<button class="ph-exit-btn" type="button">← Sair</button>' +
    '</div>' +
    '<div class="ph-title"></div>' +
    '<div class="ph-right" id="mk-ph-right">' +
      '<button class="ph-theme-btn" type="button" aria-label="Alternar tema"><span class="ph-theme-icon">☾</span></button>' +
      '<div class="cdx-ns-wrap"><button class="ph-action-btn cdx-ns-btn" type="button"><span class="cdx-ns-initials">MB</span></button></div>' +
    '</div>' +
  '</header>' +
  '</pensoia-header>' +
  '<div class="cdx-trilha-page" id="cdx-trilha-root">' +
    '<main class="cdx-trilha-main" id="mk-main">' +
      '<section class="cdx-trilha-hero">' +
        '<div class="cdx-trilha-hero-identity" id="mk-hero-identity">' +
          '<div class="cdx-tr-client-avatar" id="cdx-tr-client-avatar"><span class="cdx-tr-avatar-initials">TJ</span></div>' +
          '<div class="cdx-tr-hero-text" id="mk-hero-text">' +
            '<span class="cdx-tr-hero-eyebrow">Sua trilha de aprendizado</span>' +
            '<h1 class="cdx-tr-client-name">Tribunal de Justiça de Sergipe</h1>' +
            '<p class="cdx-tr-turma-name">Turma 2025.1 · IA no Judiciário</p>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<nav class="cdx-trilha-tabs" role="tablist">' +
        '<div class="cdx-trilha-tabs-left">' +
          '<button class="cdx-tr-tab-btn active" role="tab" aria-selected="true">Aulas</button>' +
          '<button class="cdx-tr-tab-btn" role="tab" aria-selected="false">Fórum</button>' +
          '<button class="cdx-tr-tab-btn" role="tab" aria-selected="false">Outros materiais</button>' +
        '</div>' +
        '<div class="cdx-trilha-tabs-right"><button class="cdx-tr-tab-btn" role="tab" aria-selected="false">Apostila do curso</button></div>' +
      '</nav>' +
      '<div class="cdx-trilha-tabcontent"><div class="cdx-trilha-panel" data-panel="aulas"><div class="cdx-tr-timeline">' +
        aulaRow(1, 'done', '✓', '12 mar 2025', 'Fundamentos de IA generativa', ['LLMs', 'Prompts'], true) +
        aulaRow(2, 'done', '✓', '19 mar 2025', 'Riscos, vieses e limites', ['Ética', 'Alucinação'], true) +
        aulaRow(3, 'upcoming', '3', '26 mar 2025', 'IA aplicada à decisão judicial', ['Pesquisa', 'Minuta'], false) +
      '</div></div></div>' +
      '<footer class="cdx-trilha-footer"><span>Feito com PensoIA</span> · <a href="#">pensoia.com</a></footer>' +
    '</main>' +
  '</div>';
}

// ── Live-question takeover (real hook) ───────────────────────────────────────────
function setQuestao(on) {
  document.body.classList.toggle('mk-in-questao', on);
  HIDE_SELECTORS.forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.classList.toggle('cdx-tr-hidden-by-nexo', on)));
  let host = document.getElementById('cdx-tr-nexo-host');
  if (on) {
    if (!host) {
      host = document.createElement('div');
      host.id = 'cdx-tr-nexo-host';
      host.innerHTML = '<div class="mk-q-card"><div class="mk-q-live"><span class="mk-q-dot"></span> Pergunta ao vivo</div>' +
        '<div class="mk-q-text">Qual princípio deve orientar o uso de IA generativa na minuta de uma decisão?</div>' +
        '<div class="mk-q-opts"><button>A. Delegar a fundamentação à IA</button><button>B. Revisão humana obrigatória</button><button>C. Publicar sem conferência</button></div>' +
        '<div class="mk-q-note">(representação do card de pergunta ao vivo, só pra ver o convite recuar aqui)</div></div>';
      (document.querySelector('.cdx-trilha-main') || document.body).appendChild(host);
    }
    host.style.display = '';
  } else if (host) { host.style.display = 'none'; }
  if (current && current.onQuestao) current.onQuestao(on);
}

// ── First-interaction collapse ───────────────────────────────────────────────────
function onFirstInteraction(fn) {
  let done = false;
  const run = () => { if (done) return; done = true; cleanup(); fn(); };
  const cleanup = () => {
    window.removeEventListener('scroll', run, true);
    window.removeEventListener('pointerdown', run, true);
    window.removeEventListener('keydown', run, true);
  };
  window.addEventListener('scroll', run, true);
  window.addEventListener('pointerdown', run, true);
  window.addEventListener('keydown', run, true);
  return cleanup;
}

// ── Option registry ──────────────────────────────────────────────────────────────
let current = null;          // { nodes:[], collapse, expand, onQuestao? }
let armCleanup = null;

function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }

// 1 · TRUE hero extension: the hero box grows UPWARD to hold the install info (one
// continuous box, same width, no divider). The WHOLE bar installs (not just a button).
// Collapsed = a shorter strip: short label + a download glyph. During questions the bar
// is gone but a pill lands in the topbar's existing space (the pill is the button).
function opt1() {
  const hero = document.querySelector('.cdx-trilha-hero');
  hero.classList.add('mk-hero-joined');
  const doInstall = () => alert('Aqui instalaria (Android) / mostraria a dica do iPhone.');
  const b = el('div', 'mk-o1',
    logoImg() +
    '<div class="mk-o1-txt">' +
      '<span class="mk-o1-title">Instale a trilha no celular</span>' +
      '<span class="mk-o1-desc">Salve como app na tela inicial e abra num toque, sem navegador.</span>' +
      '<span class="mk-o1-minlabel">Instalar app</span>' +
    '</div>' +
    '<span class="mk-o1-cta">Instalar</span>' +
    '<span class="mk-o1-glyph">' + DL_SVG + '</span>');
  b.addEventListener('click', doInstall);
  hero.parentNode.insertBefore(b, hero);
  let qpill = null;
  return {
    nodes: [b],
    collapse: () => b.classList.add('is-min'),
    expand: () => b.classList.remove('is-min'),
    onQuestao: (on) => {
      if (on) {
        if (!qpill) { qpill = el('button', 'mk-q-pill', logoImg('mk-logo--sm') + '<span>Instalar app</span>'); qpill.addEventListener('click', doInstall); }
        document.body.appendChild(qpill); // fixed + centered via CSS, over the topbar's empty middle
      } else if (qpill) { qpill.remove(); }
    },
    onRemove: () => { hero.classList.remove('mk-hero-joined'); if (qpill) qpill.remove(); }
  };
}
// 2 · Detached banner above hero -> pill in topbar
function opt2() {
  const page = document.getElementById('cdx-trilha-root');
  const card = el('div', 'mk-o2',
    logoImg() + '<div class="mk-o2-txt"><span class="mk-o1-title">Leve a trilha no celular</span></div>' + BTN);
  page.parentNode.insertBefore(card, page);
  const pill = el('button', 'mk-topbar-pill', logoImg('mk-logo--sm') + '<span>Instalar</span>');
  const right = document.getElementById('mk-ph-right');
  const toBig = () => { card.style.display = ''; pill.remove(); };
  const toMin = () => { card.style.display = 'none'; right.insertBefore(pill, right.firstChild); };
  return { nodes: [card, pill], collapse: toMin, expand: toBig };
}
// 3 · FAB bottom-right: card -> icon
function opt3() {
  const card = el('div', 'mk-o3', logoImg() + '<div class="mk-o3-txt">Instalar app</div>' + BTN);
  const fab = el('button', 'mk-fab', DL_SVG); fab.title = 'Instalar app';
  document.body.append(card, fab);
  const toMin = () => { card.style.display = 'none'; fab.classList.add('is-on'); };
  const toBig = () => { card.style.display = ''; fab.classList.remove('is-on'); };
  return { nodes: [card, fab], collapse: toMin, expand: toBig,
    onQuestao: (on) => { card.style.display = on ? 'none' : (fab.classList.contains('is-on') ? 'none' : ''); } };
}
// 4 · Edge tab right: card -> vertical edge tab
function opt4() {
  const card = el('div', 'mk-o4', logoImg() + '<div class="mk-o3-txt">Instale o app</div>' + BTN);
  const tab = el('button', 'mk-edge', 'Instalar app');
  document.body.append(card, tab);
  const toMin = () => { card.classList.add('is-min'); tab.classList.add('is-on'); };
  const toBig = () => { card.classList.remove('is-min'); tab.classList.remove('is-on'); };
  tab.addEventListener('click', toBig);
  return { nodes: [card, tab], collapse: toMin, expand: toBig };
}
// 5 · Bottom full-width bar -> centered pill
function opt5() {
  const bar = el('div', 'mk-o5', logoImg('mk-logo--sm') + '<span class="mk-o5-txt">Instale a trilha no celular</span>' + BTN);
  document.body.append(bar);
  return { nodes: [bar], collapse: () => bar.classList.add('is-min'), expand: () => bar.classList.remove('is-min') };
}
// 6 · Card inside hero (right) -> chip under turma
function opt6() {
  const identity = document.getElementById('mk-hero-identity');
  const card = el('div', 'mk-o6', logoImg() + '<div class="mk-o3-txt">Instalar app</div>' + BTN);
  identity.appendChild(card);
  const chip = el('button', 'mk-chip', logoImg('mk-logo--sm') + '<span>Instalar app</span>');
  const heroText = document.getElementById('mk-hero-text');
  const toMin = () => { card.style.display = 'none'; heroText.appendChild(chip); };
  const toBig = () => { card.style.display = ''; chip.remove(); };
  return { nodes: [card, chip], collapse: toMin, expand: toBig };
}
const OPTS = { 1: opt1, 2: opt2, 3: opt3, 4: opt4, 5: opt5, 6: opt6 };

function selectOption(n) {
  if (armCleanup) { armCleanup(); armCleanup = null; }
  if (current) { if (current.onRemove) current.onRemove(); current.nodes.forEach((x) => x.remove()); current = null; }
  document.querySelectorAll('.mk-tog-btn').forEach((b) => b.classList.toggle('is-sel', Number(b.dataset.opt) === n));
  current = OPTS[n]();
  current.nodes.forEach((x) => { if (x.querySelector) { const btn = x.matches && x.matches('.mk-btn') ? x : x.querySelector('.mk-btn'); if (btn) btn.addEventListener('click', () => alert('Aqui instalaria (Android) / mostraria a dica do iPhone.')); } });
  armCleanup = onFirstInteraction(() => current && current.collapse());
}

// ── Controls (bottom-LEFT so they never cover the trilha) ────────────────────────
function mountControls() {
  const box = el('div', 'mk-ctrl');
  const btns = [1, 2, 3, 4, 5, 6].map((n) => '<button class="mk-tog-btn" data-opt="' + n + '">' + n + '</button>').join('');
  box.innerHTML = '<div class="mk-ctrl-title">Opção</div><div class="mk-tog">' + btns + '</div>' +
    '<label><input type="checkbox" id="mk-q"> Simular questão ao vivo</label>' +
    '<button id="mk-replay" class="mk-ctrl-act">↻ Mostrar convite de novo</button>' +
    '<span class="mk-ctrl-note">Recolhe no 1º scroll/clique. Persistente: não some.</span>';
  document.body.appendChild(box);
  box.querySelectorAll('.mk-tog-btn').forEach((b) => b.addEventListener('click', () => selectOption(Number(b.dataset.opt))));
  box.querySelector('#mk-q').addEventListener('change', (e) => setQuestao(e.target.checked));
  box.querySelector('#mk-replay').addEventListener('click', () => {
    if (armCleanup) { armCleanup(); armCleanup = null; }
    if (current) current.expand();
    armCleanup = onFirstInteraction(() => current && current.collapse());
  });
}

function boot() {
  document.body.insertAdjacentHTML('afterbegin', trilhaHtml());
  mountControls();
  selectOption(window.MOCK_OPTION || 1);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
