// engine/sidebar-integration.js
//
// Left-edge auto-hide sidebar for Panels v2. Two modes:
//   collapsed -- 280px wide. Header carries the deck title + an editable
//                "N / total" panel counter. Body splits into collapsible
//                groups (Ferramentas open by default, Paineis collapsed)
//                whose state persists in localStorage per manifest.id.
//   menu      -- expands to 100vw. Renders a full-page panel grid plus the
//                tools section (separated). Click a panel card to jump to it.
//                Closed via the topbar "Fechar menu" button (registered
//                lazily through the topbar handle), not an in-body X.
//
// Reveal: hovering the 12px reveal zone on the left edge slides the
// sidebar in. Pointer-leaving the sidebar (with a 600ms grace) slides it
// back out. The full-page menu stays open until explicitly dismissed.
//
// Tool kinds:
//   'popup'  -- opens config.url in a sized popup window over the deck
//               (uses the same mechanics as tools/popup-launcher).
//   'modal'  -- mounts a registered tool (config.tool) inside a modal
//               overlay; close button unmounts it.
//
// Theme: chrome reads Backstage tokens (--surface, --text-primary, --border)
// so it tracks the topbar's data-theme switch. The sidebar does not own a
// theme of its own.
//
// Usage:
//   const topbar = attachTopbar(runtime, { ... });
//   attachSidebar(runtime, { topbar });        // tools optional; defaults below

import { registry } from './registry.js';

// Inline single-color SVG glyphs that follow currentColor for theme switching.
// Inlined (not fetched) so the sidebar stays self-contained and theme changes
// reflect instantly without a stylesheet swap.
const LOCAL_ICONS = {
  tokenizer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14M12 5v14"/></svg>',
  menu:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
};

const DEFAULT_TOOLS = [
  { id: 'claude',    label: 'Claude',    kind: 'popup', url: 'https://claude.ai' },
  { id: 'chatgpt',   label: 'ChatGPT',   kind: 'popup', url: 'https://chatgpt.com' },
  { id: 'gemini',    label: 'Gemini',    kind: 'popup', url: 'https://gemini.google.com' },
  { id: 'tokenizer', label: 'Tokenizer', kind: 'popup', url: 'https://tiktokenizer.vercel.app', icon: 'tokenizer' },
];

function buildToolIcon(tool) {
  const span = document.createElement('span');
  span.className = 'pn-sidebar__tool-icon';
  if (tool.icon && LOCAL_ICONS[tool.icon]) {
    span.innerHTML = LOCAL_ICONS[tool.icon];
    return span;
  }
  if (tool.icon && (tool.icon.startsWith('http') || tool.icon.startsWith('/'))) {
    const img = document.createElement('img');
    img.src = tool.icon;
    img.alt = '';
    span.appendChild(img);
    return span;
  }
  if (tool.kind === 'popup' && tool.url) {
    try {
      const u = new URL(tool.url);
      // Google's S2 favicon service handles favicon discovery server-side
      // (sites use varied paths: /favicon.ico, /favicon.svg, manifest icons).
      // claude.ai and gemini.google.com 404 on /favicon.ico; S2 returns the
      // right asset for any domain.
      const img = document.createElement('img');
      img.src = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
      img.alt = '';
      img.addEventListener('error', () => { span.classList.add('is-empty'); span.innerHTML = ''; });
      span.appendChild(img);
      return span;
    } catch (_) { /* fall through */ }
  }
  span.classList.add('is-empty');
  return span;
}

function openPopup(url) {
  const w = Math.max(800, Math.floor((window.outerWidth || window.innerWidth) - 80));
  const h = Math.max(600, Math.floor((window.outerHeight || window.innerHeight) - 80));
  const left = (typeof window.screenX === 'number' ? window.screenX : 0) + 40;
  const top = (typeof window.screenY === 'number' ? window.screenY : 0) + 40;
  const features = [
    'popup=yes',
    'width=' + w, 'height=' + h, 'left=' + left, 'top=' + top,
    'toolbar=no', 'menubar=no', 'location=yes', 'resizable=yes', 'scrollbars=yes',
  ].join(',');
  const popup = window.open(url, '_blank', features);
  if (popup && typeof popup.focus === 'function') popup.focus();
  return popup;
}

let activeModal = null;

function openModal(tool, label) {
  closeModal();
  const mod = registry.getTool(tool.tool);
  if (!mod) {
    console.warn('[panels-sidebar] unknown tool: ' + tool.tool);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'pn-sidebar-modal';

  const frame = document.createElement('div');
  frame.className = 'pn-sidebar-modal__frame';

  const header = document.createElement('div');
  header.className = 'pn-sidebar-modal__header';
  const titleEl = document.createElement('span');
  titleEl.textContent = label || tool.label || tool.tool;
  header.appendChild(titleEl);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pn-sidebar-modal__close';
  close.setAttribute('aria-label', 'Fechar');
  close.textContent = 'X';
  close.addEventListener('click', closeModal);
  header.appendChild(close);

  const body = document.createElement('div');
  body.className = 'pn-sidebar-modal__body';

  frame.appendChild(header);
  frame.appendChild(body);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  try {
    mod.mount(body, tool.config || {});
  } catch (e) {
    console.error('[panels-sidebar] mount failed for ' + tool.tool, e);
  }

  activeModal = { overlay, module: mod };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

function closeModal() {
  if (!activeModal) return;
  try { activeModal.module.unmount(); } catch (_) {}
  if (activeModal.overlay && activeModal.overlay.parentNode) {
    activeModal.overlay.remove();
  }
  activeModal = null;
}

function buildToolList(tools, onLaunch) {
  const ul = document.createElement('ul');
  ul.className = 'pn-sidebar__tools';
  for (const tool of tools) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pn-sidebar__tool';
    btn.dataset.toolId = tool.id;

    btn.appendChild(buildToolIcon(tool));

    const lab = document.createElement('span');
    lab.className = 'pn-sidebar__tool-label';
    lab.textContent = tool.label;
    btn.appendChild(lab);

    btn.addEventListener('click', () => onLaunch(tool));
    li.appendChild(btn);
    ul.appendChild(li);
  }
  return ul;
}

function buildPanelList(runtime, onJump) {
  const ul = document.createElement('ul');
  ul.className = 'pn-sidebar__panel-list';
  const manifest = runtime.manifest;
  if (!manifest || !Array.isArray(manifest.panels)) return ul;
  manifest.panels.forEach((entry, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pn-sidebar__panel';
    btn.dataset.panelIndex = String(i);
    if (i === runtime.currentIndex) btn.classList.add('is-active');

    const idx = document.createElement('span');
    idx.className = 'pn-sidebar__panel-index';
    idx.textContent = String(i + 1);
    btn.appendChild(idx);

    const lab = document.createElement('span');
    lab.className = 'pn-sidebar__panel-label';
    lab.textContent = (entry && entry.title) || (entry && entry.id) || (typeof entry === 'string' ? entry : 'Panel ' + (i + 1));
    btn.appendChild(lab);

    btn.addEventListener('click', () => onJump(i));
    li.appendChild(btn);
    ul.appendChild(li);
  });
  return ul;
}

function buildToolGrid(tools, onLaunch) {
  const grid = document.createElement('div');
  grid.className = 'pn-menu-grid';
  for (const tool of tools) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pn-menu-card';
    card.dataset.toolId = tool.id;

    const icon = buildToolIcon(tool);
    icon.classList.add('pn-menu-card__icon');
    card.appendChild(icon);

    const idx = document.createElement('span');
    idx.className = 'pn-menu-card__index';
    idx.textContent = tool.kind === 'popup' ? 'Web' : 'In-app';
    card.appendChild(idx);

    const title = document.createElement('h3');
    title.className = 'pn-menu-card__title';
    title.textContent = tool.label;
    card.appendChild(title);

    if (tool.url) {
      const hint = document.createElement('p');
      hint.className = 'pn-menu-card__hint';
      hint.textContent = tool.url;
      card.appendChild(hint);
    }

    card.addEventListener('click', () => onLaunch(tool));
    grid.appendChild(card);
  }
  return grid;
}

function buildPanelGrid(runtime, onJump) {
  const grid = document.createElement('div');
  grid.className = 'pn-menu-grid';
  const manifest = runtime.manifest;
  if (!manifest || !Array.isArray(manifest.panels)) return grid;
  manifest.panels.forEach((entry, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pn-menu-card';
    if (i === runtime.currentIndex) card.classList.add('is-active');
    card.dataset.panelIndex = String(i);

    const idx = document.createElement('span');
    idx.className = 'pn-menu-card__index';
    idx.textContent = (i + 1) + ' / ' + manifest.panels.length;
    card.appendChild(idx);

    const title = document.createElement('h3');
    title.className = 'pn-menu-card__title';
    title.textContent = (entry && entry.title) || (entry && entry.id) || (typeof entry === 'string' ? entry : 'Panel ' + (i + 1));
    card.appendChild(title);

    card.addEventListener('click', () => onJump(i));
    grid.appendChild(card);
  });
  return grid;
}

export function attachSidebar(runtime, options = {}) {
  const manifestTools = runtime?.manifest?.sidebar?.tools;
  const tools = Array.isArray(options.tools) && options.tools.length > 0
    ? options.tools
    : (Array.isArray(manifestTools) && manifestTools.length > 0 ? manifestTools : DEFAULT_TOOLS);
  const topbar = options.topbar || null;

  const slug = (runtime.manifest && runtime.manifest.id) || 'default';
  const TOOLS_OPEN_KEY = 'bs_pn_sidebar_' + slug + '_tools_open';
  const PANELS_OPEN_KEY = 'bs_pn_sidebar_' + slug + '_panels_open';

  const zone = document.createElement('div');
  zone.className = 'pn-sidebar-zone';

  const sidebar = document.createElement('aside');
  sidebar.className = 'pn-sidebar';
  sidebar.setAttribute('aria-label', 'Barra lateral de ferramentas e painéis');

  // ----- body (groups in collapsed mode, full menu in menu mode) -----
  const body = document.createElement('div');
  body.className = 'pn-sidebar__body';
  sidebar.appendChild(body);

  // ----- bottom bar (replaces the old footer button + sidebar header) -----
  // The bottom bar lives at the bottom of the sidebar so it never collides
  // with the topbar's top-edge reveal zone. It carries the deck title, an
  // editable N/total counter, and a menu-toggle button (hamburger glyph).
  const bottomBar = document.createElement('div');
  bottomBar.className = 'pn-sidebar__bottom-bar';

  const menuToggle = document.createElement('button');
  menuToggle.type = 'button';
  menuToggle.className = 'pn-sidebar__menu-toggle';
  menuToggle.setAttribute('aria-label', 'Abrir menu de painéis');
  menuToggle.innerHTML = LOCAL_ICONS.menu;
  bottomBar.appendChild(menuToggle);

  const bottomTitle = document.createElement('button');
  bottomTitle.type = 'button';
  bottomTitle.className = 'pn-sidebar__bottom-title';
  bottomTitle.textContent = (runtime.manifest && runtime.manifest.title) || 'ClassForge';
  bottomBar.appendChild(bottomTitle);

  const counter = document.createElement('div');
  counter.className = 'pn-sidebar__counter';
  const counterInput = document.createElement('input');
  counterInput.type = 'number';
  counterInput.className = 'pn-sidebar__counter-input';
  counterInput.min = '1';
  counterInput.setAttribute('aria-label', 'Número do painel atual');
  counter.appendChild(counterInput);
  const counterTotal = document.createElement('span');
  counterTotal.className = 'pn-sidebar__counter-total';
  counter.appendChild(counterTotal);
  bottomBar.appendChild(counter);

  sidebar.appendChild(bottomBar);

  document.body.appendChild(zone);
  document.body.appendChild(sidebar);

  function commitCounter() {
    const v = parseInt(counterInput.value, 10);
    if (Number.isInteger(v) && v >= 1 && v <= runtime.panelCount && v - 1 !== runtime.currentIndex) {
      runtime.goto(v - 1);
    } else {
      counterInput.value = String(runtime.currentIndex + 1);
    }
  }
  counterInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCounter();
      counterInput.blur();
    } else if (e.key === 'Escape') {
      counterInput.value = String(runtime.currentIndex + 1);
      counterInput.blur();
    }
  });
  counterInput.addEventListener('blur', commitCounter);

  function refreshCounter() {
    counterInput.max = String(runtime.panelCount);
    counterInput.value = String(runtime.currentIndex + 1);
    counterTotal.textContent = ' / ' + runtime.panelCount;
  }

  function toggleMenu() {
    if (menuOpen) { exitMenu(); hide(); } else { enterMenu(); }
  }
  menuToggle.addEventListener('click', toggleMenu);
  bottomTitle.addEventListener('click', toggleMenu);

  function launchTool(tool) {
    if (tool.kind === 'modal' && tool.tool) {
      exitMenu();
      hide();
      openModal(tool, tool.label2 || tool.label);
    } else if (tool.url) {
      const popup = openPopup(tool.url);
      if (!popup) {
        alert('O navegador bloqueou o popup. Permita popups para este site e tente novamente.');
      }
    }
  }

  function jumpToPanel(idx) {
    runtime.goto(idx);
    exitMenu();
    hide();
  }

  function makeGroup({ title, openKey, defaultOpen, children }) {
    const det = document.createElement('details');
    det.className = 'pn-sidebar__group';
    const stored = localStorage.getItem(openKey);
    const isOpen = stored === null ? defaultOpen : stored === 'true';
    if (isOpen) det.open = true;

    const sum = document.createElement('summary');
    sum.className = 'pn-sidebar__group-summary';
    sum.textContent = title;
    det.appendChild(sum);
    det.appendChild(children);

    det.addEventListener('toggle', () => {
      try { localStorage.setItem(openKey, det.open ? 'true' : 'false'); } catch (_) {}
    });
    return det;
  }

  function renderCollapsed() {
    body.innerHTML = '';
    body.appendChild(makeGroup({
      title: 'Ferramentas',
      openKey: TOOLS_OPEN_KEY,
      defaultOpen: true,
      children: buildToolList(tools, launchTool),
    }));
    body.appendChild(makeGroup({
      title: 'Painéis',
      openKey: PANELS_OPEN_KEY,
      defaultOpen: false,
      children: buildPanelList(runtime, jumpToPanel),
    }));
  }

  function renderMenu() {
    body.innerHTML = '';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'pn-menu-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Buscar painel...';
    searchInput.className = 'pn-menu-search__input';
    searchInput.setAttribute('aria-label', 'Buscar painel por título');
    searchWrap.appendChild(searchInput);
    body.appendChild(searchWrap);

    const toolsSection = document.createElement('section');
    toolsSection.className = 'pn-menu-section';
    const toolsTitle = document.createElement('h2');
    toolsTitle.className = 'pn-menu-section__title';
    toolsTitle.textContent = 'Ferramentas';
    toolsSection.appendChild(toolsTitle);
    const toolsGrid = buildToolGrid(tools, launchTool);
    toolsSection.appendChild(toolsGrid);
    body.appendChild(toolsSection);

    const panelsSection = document.createElement('section');
    panelsSection.className = 'pn-menu-section';
    const panelsTitle = document.createElement('h2');
    panelsTitle.className = 'pn-menu-section__title';
    panelsTitle.textContent = 'Painéis da apresentação';
    panelsSection.appendChild(panelsTitle);
    const panelGrid = buildPanelGrid(runtime, jumpToPanel);
    panelsSection.appendChild(panelGrid);
    body.appendChild(panelsSection);

    const empty = document.createElement('p');
    empty.className = 'pn-menu-empty';
    empty.textContent = 'Nenhum item corresponde';
    empty.hidden = true;
    body.appendChild(empty);

    function filterGrid(grid, q) {
      let visible = 0;
      grid.querySelectorAll('.pn-menu-card').forEach(card => {
        const title = (card.querySelector('.pn-menu-card__title')?.textContent || '').toLowerCase();
        const match = q === '' || title.includes(q);
        card.hidden = !match;
        if (match) visible++;
      });
      return visible;
    }

    function applyFilter(query) {
      const q = query.trim().toLowerCase();
      const toolsVisible = filterGrid(toolsGrid, q);
      const panelsVisible = filterGrid(panelGrid, q);
      toolsSection.hidden = toolsVisible === 0 && q !== '';
      panelsSection.hidden = panelsVisible === 0 && q !== '';
      empty.hidden = (toolsVisible + panelsVisible) !== 0 || q === '';
    }

    searchInput.addEventListener('input', e => applyFilter(e.target.value));
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstVisible = panelGrid.querySelector('.pn-menu-card:not([hidden])');
        if (firstVisible) {
          const idx = parseInt(firstVisible.dataset.panelIndex, 10);
          if (Number.isInteger(idx)) jumpToPanel(idx);
        }
      }
    });

    requestAnimationFrame(() => searchInput.focus());
  }

  let menuOpen = false;
  let hideTimer = null;

  function getTopbarEl() {
    return document.querySelector('.bs-topbar');
  }

  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    sidebar.classList.add('is-open');
    // While sidebar is open in collapsed mode, suppress the topbar's
    // top-edge auto-reveal so it does not cover sidebar/menu content.
    // Menu mode pins the topbar visible (handled by topbar.setMenuMode),
    // so we do not suppress in that case.
    if (!menuOpen) {
      const tb = getTopbarEl();
      if (tb) tb.classList.add('pn-sidebar-suppressed');
    }
  }

  function hide() {
    if (menuOpen) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      sidebar.classList.remove('is-open');
      const tb = getTopbarEl();
      if (tb) tb.classList.remove('pn-sidebar-suppressed');
      hideTimer = null;
    }, 600);
  }

  function enterMenu() {
    menuOpen = true;
    sidebar.classList.add('is-menu', 'is-open');
    // Pinning the topbar (via setMenuMode) takes precedence over the
    // sidebar suppression class, so we drop the suppression here.
    const tb = getTopbarEl();
    if (tb) tb.classList.remove('pn-sidebar-suppressed');
    if (topbar && typeof topbar.setMenuMode === 'function') topbar.setMenuMode(true);
    renderMenu();
  }

  function exitMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    sidebar.classList.remove('is-menu');
    if (topbar && typeof topbar.setMenuMode === 'function') topbar.setMenuMode(false);
    // If the sidebar is still open after the menu closes, re-apply suppression.
    if (sidebar.classList.contains('is-open')) {
      const tb = getTopbarEl();
      if (tb) tb.classList.add('pn-sidebar-suppressed');
    }
    renderCollapsed();
  }

  // Wire the topbar's "Fechar menu" button once. This needs the runtime sidebar
  // to be fully constructed (so exitMenu/hide are in scope), so it cannot be
  // done inside attachTopbar.
  if (topbar && typeof topbar.registerCloseMenuButton === 'function') {
    topbar.registerCloseMenuButton(() => { exitMenu(); hide(); });
  }

  zone.addEventListener('mouseenter', show);
  sidebar.addEventListener('mouseenter', () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  sidebar.addEventListener('mouseleave', () => {
    if (!menuOpen) hide();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (activeModal) { closeModal(); return; }
      if (menuOpen) { exitMenu(); hide(); }
    }
  });

  runtime.eventBus.addEventListener('panel-entered', () => {
    refreshCounter();
    if (menuOpen) {
      // Re-render the full menu so the active card highlight updates.
      renderMenu();
    } else {
      // Surgical update for the collapsed-mode panel list.
      const list = body.querySelector('.pn-sidebar__panel-list');
      if (list) {
        list.querySelectorAll('.pn-sidebar__panel').forEach(btn => {
          const idx = parseInt(btn.dataset.panelIndex, 10);
          btn.classList.toggle('is-active', idx === runtime.currentIndex);
        });
      }
    }
  });

  renderCollapsed();
  refreshCounter();

  return {
    show, hide, enterMenu, exitMenu,
    destroy() {
      closeModal();
      if (zone.parentNode) zone.remove();
      if (sidebar.parentNode) sidebar.remove();
    },
  };
}
