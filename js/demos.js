// js/demos.js — the two offer-section phone demos. Each phone embeds the REAL Codex
// student surface IN PLACE via a srcdoc iframe (no separate page, no new route): the
// iframe links the real Codex CSS and a landing-owned frame module (frame-pulso.js /
// frame-trail.js) mounts the real Codex student code on canned data. So each demo IS
// the app and tracks it automatically — no drift. It is an iframe (not inlined) on
// purpose: the app's body styles and the fixed cp-qa-bar need CSS + layout isolation.

const PULSO_SRCDOC =
  '<!DOCTYPE html><html lang="pt-BR" data-theme="light"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<link rel="stylesheet" href="/codex/css/theme.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/questions/questions.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/trilha/css/nexo.css?v=1.0">' +
  '</head><body><div id="demo-host"></div>' +
  '<script type="module" src="/js/frame-pulso.js?v=9"></scr' + 'ipt></body></html>';

const TRAIL_SRCDOC =
  '<!DOCTYPE html><html lang="pt-BR" data-theme="light"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<link rel="stylesheet" href="/codex/css/theme.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/trilha/css/public-header.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/css/item-render.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/questions/questions.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/trilha/css/trilha.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/trilha/css/cards.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/trilha/css/nexo.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/trilha/css/tarefa-modal.css?v=1.0">' +
  '<link rel="stylesheet" href="/codex/trilha/css/mobile.css?v=1.0">' +
  '<script src="/codex/js/theme-manager.js?v=1.0"></scr' + 'ipt>' +
  '<script>ThemeManager.initPublic({storageKey:"trilha_theme",defaultTheme:"light"});</scr' + 'ipt>' +
  '</head><body>' +
  '<pensoia-header mode="student" theme-storage-key="trilha_theme"></pensoia-header>' +
  '<div class="cdx-trilha-page" id="cdx-trilha-root">' +
    '<div class="cdx-trilha-loading">Carregando sua trilha...</div>' +
    '<div class="cdx-trilha-error" hidden><div class="cdx-trilha-error-icon">&#128274;</div><p class="cdx-trilha-error-msg"></p></div>' +
    '<main class="cdx-trilha-main" hidden>' +
      '<section class="cdx-trilha-hero"><div class="cdx-trilha-hero-identity">' +
        '<div class="cdx-tr-client-avatar" id="cdx-tr-client-avatar"><img id="cdx-tr-client-icon" src="" alt="" hidden></div>' +
        '<div class="cdx-tr-hero-text"><span class="cdx-tr-hero-eyebrow">Sua trilha de aprendizado</span>' +
          '<h1 class="cdx-tr-client-name" id="cdx-tr-client-name"></h1>' +
          '<p class="cdx-tr-turma-name" id="cdx-tr-turma-name"></p></div>' +
      '</div></section>' +
      '<nav class="cdx-trilha-tabs" role="tablist"><div class="cdx-trilha-tabs-left">' +
        '<button class="cdx-tr-tab-btn active" role="tab" data-tab="aulas" aria-selected="true">Aulas</button>' +
        '<button class="cdx-tr-tab-btn" role="tab" data-tab="outros" aria-selected="false" id="cdx-tr-tab-outros" hidden>Outros materiais</button></div>' +
        '<div class="cdx-trilha-tabs-right"><button class="cdx-tr-tab-btn" role="tab" data-tab="apostila" aria-selected="false" id="cdx-tr-tab-apostila" hidden>Conteúdo do curso</button></div></nav>' +
      '<div class="cdx-trilha-tabcontent">' +
        '<div class="cdx-trilha-panel" data-panel="aulas">' +
          '<button id="cdx-tr-back-pill" class="cdx-tr-back-pill" type="button">&lsaquo; Voltar à trilha</button>' +
          '<div id="cdx-tr-aulas-timeline" class="cdx-tr-timeline"></div></div>' +
        '<div class="cdx-trilha-panel" data-panel="apostila" hidden><div id="cdx-tr-apostila-list" class="cdx-tr-card-list"></div></div>' +
        '<div class="cdx-trilha-panel" data-panel="outros" hidden><div id="cdx-tr-outros-filter" class="cdx-tr-type-filter"></div><div id="cdx-tr-outros-list" class="cdx-tr-card-list"></div></div>' +
      '</div>' +
      '<footer class="cdx-trilha-footer"><span>Feito com PensoIA</span></footer>' +
    '</main>' +
  '</div>' +
  '<script type="module" src="/js/frame-trail.js?v=9"></scr' + 'ipt></body></html>';

export function initDemos() {
  const p = document.getElementById('pulseFrame');
  if (p) p.srcdoc = PULSO_SRCDOC;
  const t = document.getElementById('trailFrame');
  if (t) t.srcdoc = TRAIL_SRCDOC;
}
