/* Mock harness for the trilha "Salvar como app" affordance , 3 placement options.
   The trilha chrome is a FAITHFUL PORT: markup copied from the real sources
   (pensoia-header buildHeaderHtml, trilha/index.html hero+tabs, aulas.js buildAulaRow)
   and rendered with the REAL linked CSS. Only the install variants + the mock controls
   are new. Each aX.html sets window.MOCK_OPTION (1|2|3) then loads this file.

   Behavioral rules demonstrated (Élder's feedback):
   - No fragile 5s timer: the invite starts visible and COLLAPSES on the first real
     interaction (scroll or click) , that is the "comportamental" collapse.
   - "Em questão": the live-question takeover (real hook: HIDE_SELECTORS get
     .cdx-tr-hidden-by-nexo) hides the trilha body; the invite must not be big there. */

const LOGO = '/codex/trilha/icons/app-icon-192.png';
const DL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>';

// Real hide targets when a live question takes over (copied from nexo.js HIDE_SELECTORS).
const HIDE_SELECTORS = ['.cdx-trilha-hero', '.cdx-trilha-tabs', '.cdx-trilha-tabcontent', '.cdx-trilha-footer'];

// ── Faithful trilha snapshot (ported markup) ─────────────────────────────────────
function aulaRow(num, status, badge, date, title, topics, tarefa) {
  const pad = num < 10 ? '0' + num : String(num);
  const chips = topics.map((t) => '<span class="cdx-tr-topic-chip">' + t + '</span>').join('');
  const tpill = tarefa ? '<span class="cdx-tr-tarefa-pill">✓ Tarefa</span>' : '';
  return '' +
  '<div class="cdx-tr-tl-row" data-aula="' + num + '">' +
    '<div class="cdx-tr-tl-dot cdx-tr-tl-dot--' + status + '">' + badge + '</div>' +
    '<div class="cdx-tr-card" data-aula="' + num + '">' +
      '<div class="cdx-tr-card-header" role="button" tabindex="0" aria-expanded="false">' +
        '<div class="cdx-tr-zone cdx-tr-zone--' + status + '">' +
          '<span class="cdx-tr-zone-num">' + pad + '</span>' +
          '<span class="cdx-tr-zone-label">Aula</span>' +
        '</div>' +
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
  // Header (ported from pensoia-header buildHeaderHtml; logo is a text placeholder for the mock).
  // Wrapped in <pensoia-header> because public-header.css scopes every .ph-* rule under it.
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
    '<main class="cdx-trilha-main">' +
      '<section class="cdx-trilha-hero">' +
        '<div class="cdx-trilha-hero-identity">' +
          '<div class="cdx-tr-client-avatar" id="cdx-tr-client-avatar"><span class="cdx-tr-avatar-initials">TJ</span></div>' +
          '<div class="cdx-tr-hero-text">' +
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
        '<div class="cdx-trilha-tabs-right">' +
          '<button class="cdx-tr-tab-btn" role="tab" aria-selected="false">Apostila do curso</button>' +
        '</div>' +
      '</nav>' +
      '<div class="cdx-trilha-tabcontent">' +
        '<div class="cdx-trilha-panel" data-panel="aulas">' +
          '<div class="cdx-tr-timeline">' +
            aulaRow(1, 'done', '✓', '12 mar 2025', 'Fundamentos de IA generativa', ['LLMs', 'Prompts'], true) +
            aulaRow(2, 'done', '✓', '19 mar 2025', 'Riscos, vieses e limites', ['Ética', 'Alucinação'], true) +
            aulaRow(3, 'upcoming', '3', '26 mar 2025', 'IA aplicada à decisão judicial', ['Pesquisa', 'Minuta'], false) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<footer class="cdx-trilha-footer"><span>Feito com PensoIA</span> · <a href="#">pensoia.com</a></footer>' +
    '</main>' +
  '</div>';
}

// ── Live-question takeover (real hook: HIDE_SELECTORS + .cdx-tr-hidden-by-nexo) ───
function setQuestao(on) {
  document.body.classList.toggle('mk-in-questao', on);
  HIDE_SELECTORS.forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.classList.toggle('cdx-tr-hidden-by-nexo', on)));
  let host = document.getElementById('cdx-tr-nexo-host');
  if (on) {
    if (!host) {
      host = document.createElement('div');
      host.id = 'cdx-tr-nexo-host';
      host.innerHTML =
        '<div class="mk-q-card">' +
          '<div class="mk-q-live"><span class="mk-q-dot"></span> Pergunta ao vivo</div>' +
          '<div class="mk-q-text">Qual princípio deve orientar o uso de IA generativa na elaboração de uma minuta de decisão?</div>' +
          '<div class="mk-q-opts">' +
            '<button>A. Delegar a fundamentação à IA</button>' +
            '<button>B. Revisão humana obrigatória do conteúdo</button>' +
            '<button>C. Publicar sem conferência se o modelo for confiável</button>' +
          '</div>' +
          '<div class="mk-q-note">(representação do card de pergunta ao vivo , só pra ver o convite recuar aqui)</div>' +
        '</div>';
      (document.querySelector('.cdx-trilha-main') || document.body).appendChild(host);
    }
    host.style.display = '';
  } else if (host) {
    host.style.display = 'none';
  }
  if (window.MK_ON_QUESTAO) window.MK_ON_QUESTAO(on);
}

// ── First-interaction collapse (replaces the fragile timer) ──────────────────────
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

// ── The three options ────────────────────────────────────────────────────────────
function mountOption1() {
  // Header chip + first-visit hint balloon. Chip is ALWAYS small (never big), so the
  // "not big during questions" rule is satisfied for free.
  const right = document.getElementById('mk-ph-right');
  const chip = document.createElement('button');
  chip.className = 'mk-chip';
  chip.innerHTML = DL_SVG + '<span>Instalar</span>';
  chip.addEventListener('click', () => alert('Aqui abriria o instalar (Android) ou a dica do iPhone num popover ancorado no chip.'));
  right.insertBefore(chip, right.firstChild);

  const hint = document.createElement('div');
  hint.className = 'mk-hint';
  hint.textContent = 'Instale o app da trilha da TJSE ↗';
  document.body.appendChild(hint);
  const place = () => {
    const r = chip.getBoundingClientRect();
    hint.style.top = (r.bottom + 10) + 'px';
    hint.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  };
  place(); window.addEventListener('resize', place);
  window.MK_REPLAY = () => { hint.classList.remove('is-gone'); place(); arm(); };
  function arm() { onFirstInteraction(() => hint.classList.add('is-gone')); }
  arm();
}

function mountOption2() {
  // Hero strip -> collapses into a badge docked on the client avatar.
  const hero = document.querySelector('.cdx-trilha-hero');
  const strip = document.createElement('div');
  strip.className = 'mk-strip';
  strip.innerHTML =
    '<img class="mk-logo" src="' + LOGO + '" alt="">' +
    '<div class="mk-strip-txt"><span class="mk-strip-title">Leve a trilha da TJSE no celular</span>' +
    '<span class="mk-strip-desc">Instale como app e abra num toque, sem navegador.</span></div>' +
    '<button class="mk-strip-btn">Instalar</button>' +
    '<button class="mk-strip-x" aria-label="Dispensar">×</button>';
  hero.insertAdjacentElement('afterend', strip);

  const avatar = document.getElementById('cdx-tr-client-avatar');
  const badge = document.createElement('button');
  badge.className = 'mk-badge';
  badge.innerHTML = DL_SVG;
  badge.title = 'Instalar app';
  avatar.appendChild(badge);

  const collapse = () => { strip.classList.add('is-collapsed'); badge.classList.add('is-on'); };
  strip.querySelector('.mk-strip-x').addEventListener('click', collapse);
  strip.querySelector('.mk-strip-btn').addEventListener('click', () => alert('Instalaria o app / dica do iPhone.'));
  badge.addEventListener('click', () => { strip.classList.remove('is-collapsed'); badge.classList.remove('is-on'); });
  window.MK_REPLAY = () => { strip.classList.remove('is-collapsed'); badge.classList.remove('is-on'); arm(); };
  function arm() { onFirstInteraction(collapse); }
  arm();
}

function mountOption3() {
  // Bottom snackbar -> slides out to a floating icon. Fixed, so it needs explicit
  // retract during questions (handled via body.mk-in-questao in CSS).
  const snack = document.createElement('div');
  snack.className = 'mk-snack';
  snack.innerHTML =
    '<img class="mk-logo mk-logo--sm" src="' + LOGO + '" alt="">' +
    '<span class="mk-snack-txt">Instalar app da trilha</span>' +
    '<button class="mk-btn">Instalar</button>';
  document.body.appendChild(snack);

  const fab = document.createElement('button');
  fab.className = 'mk-fab';
  fab.innerHTML = DL_SVG;
  fab.title = 'Instalar app';
  document.body.appendChild(fab);

  const collapse = () => { snack.classList.add('is-gone'); fab.classList.add('is-on'); };
  snack.querySelector('.mk-btn').addEventListener('click', () => alert('Instalaria o app / dica do iPhone.'));
  fab.addEventListener('click', () => { snack.classList.remove('is-gone'); fab.classList.remove('is-on'); });
  window.MK_REPLAY = () => { snack.classList.remove('is-gone'); fab.classList.remove('is-on'); arm(); };
  function arm() { onFirstInteraction(collapse); }
  arm();
}

// ── Mock control panel ───────────────────────────────────────────────────────────
function mountControls() {
  const box = document.createElement('div');
  box.className = 'mk-ctrl';
  box.innerHTML =
    '<div class="mk-ctrl-title">Controles do mock</div>' +
    '<label><input type="checkbox" id="mk-q"> Simular questão ao vivo</label>' +
    '<button id="mk-replay">↻ Mostrar convite de novo</button>' +
    '<span class="mk-ctrl-note">O convite recolhe ao primeiro scroll/clique.</span>';
  document.body.appendChild(box);
  box.querySelector('#mk-q').addEventListener('change', (e) => setQuestao(e.target.checked));
  box.querySelector('#mk-replay').addEventListener('click', () => { if (window.MK_REPLAY) window.MK_REPLAY(); });
}

// ── Boot ─────────────────────────────────────────────────────────────────────────
function boot() {
  document.body.insertAdjacentHTML('afterbegin', trilhaHtml());
  const opt = window.MOCK_OPTION || 1;
  if (opt === 1) mountOption1();
  else if (opt === 2) mountOption2();
  else mountOption3();
  mountControls();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
