// engine/sidebar-integration.js
// TODO: rename file (sidebar-integration.js -> side-menu-integration.js) and CSS classes
//       (pn-sidebar__* -> pn-side-menu__*) -- deferred to avoid import churn during active phase work.
//
// Left-edge auto-hide side menu for Panels v2. Two modes:
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
// side menu in. Pointer-leaving the side menu (with a 600ms grace) slides it
// back out. The full-page menu stays open until explicitly dismissed.
//
// Tool kinds:
//   'popup'  -- opens config.url in a popup window that mirrors the deck's
//               exact screen footprint (window.innerWidth x window.innerHeight
//               at screenLeft, screenTop).
//   'panel'  -- mounts a registered tool (config.tool) as a transient overlay
//               panel via runtime.pushTransientPanel(). A "Voltar" button and
//               Esc key dismiss the tool and restore the underlying panel.
//
// Theme: chrome reads Backstage tokens (--surface, --text-primary, --border)
// so it tracks the topbar's data-theme switch. The side menu does not own a
// theme of its own.
//
// Usage:
//   const topbar = attachTopbar(runtime, { ... });
//   attachSidebar(runtime, { topbar });        // tools optional; defaults below

import { registry } from './registry.js';
import { findHostedSession } from './classpulse-discovery.js';
import { getThumbnailUrl } from './thumbnail-integration.js';

// Inline single-color SVG glyphs that follow currentColor for theme switching.
// Inlined (not fetched) so the side menu stays self-contained and theme changes
// reflect instantly without a stylesheet swap.
const LOCAL_ICONS = {
  tokenizer:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14M12 5v14"/></svg>',
  menu:           '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  'presenter-view': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="16" cy="8" r="2"/><path d="M2 12h8"/></svg>',
};

const DEFAULT_TOOLS = [
  { id: 'claude',    label: 'Claude',    kind: 'popup', url: 'https://claude.ai' },
  { id: 'chatgpt',   label: 'ChatGPT',   kind: 'popup', url: 'https://chatgpt.com' },
  { id: 'gemini',    label: 'Gemini',    kind: 'popup', url: 'https://gemini.google.com' },
  { id: 'tokenizer', label: 'Tokenizer', kind: 'panel', tool: 'tokenizer-embed', icon: 'tokenizer' },
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

function buildMenuData(runtime, tools) {
  const manifest = runtime.manifest;
  const slug = (manifest && manifest.id) || 'default';
  const panelList = (manifest && Array.isArray(manifest.panels)) ? manifest.panels : [];
  return {
    slug,
    tools,  // existing tool objects unchanged
    actions: [
      { id: 'presenter-view', label: 'Vista do apresentador', icon: 'presenter-view' },
    ],
    panels: panelList.map((entry, i) => ({
      index: i,
      id: (entry && entry.id) ? entry.id
         : ('panel-' + String(i + 1).padStart(2, '0')),
      title: (entry && entry.title) || (entry && entry.id)
             || (typeof entry === 'string' ? entry : 'Panel ' + (i + 1)),
      isActive: i === runtime.currentIndex,
    })),
  };
}

function openPopup(url) {
  // Mirror the deck window's exact footprint: same size, same screen position.
  const w    = window.innerWidth;
  const h    = window.innerHeight;
  const left = window.screenLeft;
  const top  = window.screenTop;
  const features = [
    'popup=yes',
    'width=' + w, 'height=' + h, 'left=' + left, 'top=' + top,
    'toolbar=no', 'menubar=no', 'location=yes', 'resizable=yes', 'scrollbars=yes',
  ].join(',');
  const popup = window.open(url, '_blank', features);
  if (popup && typeof popup.focus === 'function') popup.focus();
  return popup;
}


async function openPresenterView(slug) {
  const url = '/backstage/classforge/panels/presenter-view.html?slug=' + encodeURIComponent(slug);
  const fallbackOpen = () => window.open(url, '_blank', 'width=1200,height=800,resizable=yes');

  // Try Window Management API for multi-monitor placement.
  if (window.screen && window.screen.isExtended && typeof window.getScreenDetails === 'function') {
    try {
      const details = await window.getScreenDetails();
      const secondary = details.screens.find(s => !s.isPrimary) || null;
      if (secondary) {
        const features = [
          'left='   + secondary.availLeft,
          'top='    + secondary.availTop,
          'width='  + secondary.availWidth,
          'height=' + secondary.availHeight,
          'resizable=yes',
        ].join(',');
        const w = window.open(url, '_blank', features);
        if (w) { w.focus(); return; }
      }
    } catch (_) {
      // API threw (permission denied or unsupported) -- fall through.
    }
  }

  fallbackOpen();
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
  sidebar.setAttribute('aria-label', 'Menu lateral de ferramentas e painéis');

  // ----- body (groups in collapsed mode, full menu in menu mode) -----
  const body = document.createElement('div');
  body.className = 'pn-sidebar__body';
  sidebar.appendChild(body);

  // ----- bottom bar (replaces the old footer button + side menu header) -----
  // The bottom bar lives at the bottom of the side menu so it never collides
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

  const bottomTitle = document.createElement('span');
  bottomTitle.className = 'pn-sidebar__bottom-title';
  bottomTitle.textContent = (runtime.manifest && runtime.manifest.title) || 'ClassForge';
  bottomBar.appendChild(bottomTitle);

  const cpBadge = document.createElement('button');
  cpBadge.type = 'button';
  cpBadge.className = 'pn-sidebar__cp-badge';
  cpBadge.setAttribute('aria-label', 'Abrir ClassPulse Host');
  cpBadge.hidden = true;
  const cpName = document.createElement('span');
  cpName.className = 'pn-sidebar__cp-badge-name';
  cpBadge.appendChild(cpName);
  const cpDot = document.createElement('span');
  cpDot.className = 'pn-sidebar__cp-badge-dot';
  cpBadge.appendChild(cpDot);
  const cpLiveLabel = document.createElement('span');
  cpLiveLabel.className = 'pn-sidebar__cp-badge-label';
  cpLiveLabel.textContent = 'Live';
  cpBadge.appendChild(cpLiveLabel);
  bottomBar.appendChild(cpBadge);

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

  function launchTool(tool) {
    if (tool.kind === 'panel' && tool.tool) {
      exitMenu();
      hide();
      runtime.pushTransientPanel({
        layout: 'full',
        tools: [{ id: tool.tool, slot: 'default', config: tool.config || {} }],
        meta: { title: tool.label || tool.tool },
      });
    } else if (tool.kind === 'popup' && tool.url) {
      const popup = openPopup(tool.url);
      if (!popup) {
        alert('O navegador bloqueou o popup. Permita popups para este site e tente novamente.');
      }
    } else if (tool.url) {
      // Fallback: any tool with a URL opens as a popup.
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

  function handleAction(action) {
    if (action.id === 'presenter-view') {
      const pvSlug = (runtime.manifest && runtime.manifest.id) || 'unknown';
      openPresenterView(pvSlug);
    }
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
    const data = buildMenuData(runtime, tools);

    // --- Search ---
    const searchWrap = document.createElement('div');
    searchWrap.className = 'pn-menu-search pn-menu-search--side';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Buscar...';
    searchInput.className = 'pn-menu-search__input';
    searchInput.setAttribute('aria-label', 'Buscar item por título');
    searchWrap.appendChild(searchInput);
    body.appendChild(searchWrap);

    // --- Tools group ---
    const toolsList = document.createElement('ul');
    toolsList.className = 'pn-sidebar__tools';
    for (const tool of data.tools) {
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
      btn.addEventListener('click', () => launchTool(tool));
      li.appendChild(btn);
      toolsList.appendChild(li);
    }
    const toolsGroup = makeGroup({ title: 'Ferramentas', openKey: TOOLS_OPEN_KEY, defaultOpen: true, children: toolsList });
    body.appendChild(toolsGroup);

    // --- Panels group ---
    const panelsList = document.createElement('ul');
    panelsList.className = 'pn-sidebar__panel-list';
    for (const panel of data.panels) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pn-sidebar__panel';
      btn.dataset.panelIndex = String(panel.index);
      if (panel.isActive) btn.classList.add('is-active');
      const idx = document.createElement('span');
      idx.className = 'pn-sidebar__panel-index';
      idx.textContent = String(panel.index + 1);
      btn.appendChild(idx);
      const lab = document.createElement('span');
      lab.className = 'pn-sidebar__panel-label';
      lab.textContent = panel.title;
      btn.appendChild(lab);
      btn.addEventListener('click', () => jumpToPanel(panel.index));
      li.appendChild(btn);
      panelsList.appendChild(li);
    }
    const panelsGroup = makeGroup({ title: 'Painéis', openKey: PANELS_OPEN_KEY, defaultOpen: false, children: panelsList });
    body.appendChild(panelsGroup);

    // --- Actions (presenter view + any future actions) ---
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'pn-sidebar__presenter-action';
    for (const action of data.actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pn-sidebar__tool pn-sidebar__tool--action';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'pn-sidebar__tool-icon';
      if (LOCAL_ICONS[action.icon]) iconSpan.innerHTML = LOCAL_ICONS[action.icon];
      btn.appendChild(iconSpan);
      const labSpan = document.createElement('span');
      labSpan.className = 'pn-sidebar__tool-label';
      labSpan.textContent = action.label;
      btn.appendChild(labSpan);
      btn.addEventListener('click', () => handleAction(action));
      actionsWrap.appendChild(btn);
    }
    body.appendChild(actionsWrap);

    // --- Search filter (applies to tools group + panels group) ---
    function applyCollapsedFilter(query) {
      const q = query.trim().toLowerCase();
      toolsList.querySelectorAll('.pn-sidebar__tool').forEach(btn => {
        const text = (btn.querySelector('.pn-sidebar__tool-label')?.textContent || '').toLowerCase();
        btn.parentElement.hidden = q !== '' && !text.includes(q);
      });
      panelsList.querySelectorAll('.pn-sidebar__panel').forEach(btn => {
        const text = (btn.querySelector('.pn-sidebar__panel-label')?.textContent || '').toLowerCase();
        btn.parentElement.hidden = q !== '' && !text.includes(q);
      });
    }
    searchInput.addEventListener('input', e => applyCollapsedFilter(e.target.value));
  }

  function renderMenu() {
    body.innerHTML = '';
    const data = buildMenuData(runtime, tools);

    // Search
    const searchWrap = document.createElement('div');
    searchWrap.className = 'pn-menu-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Buscar...';
    searchInput.className = 'pn-menu-search__input';
    searchInput.setAttribute('aria-label', 'Buscar item por título');
    searchWrap.appendChild(searchInput);
    body.appendChild(searchWrap);

    // Tools section (tools + actions combined)
    const toolsSection = document.createElement('section');
    toolsSection.className = 'pn-menu-section';
    const toolsTitle = document.createElement('h2');
    toolsTitle.className = 'pn-menu-section__title';
    toolsTitle.textContent = 'Ferramentas';
    toolsSection.appendChild(toolsTitle);
    const toolsGrid = document.createElement('div');
    toolsGrid.className = 'pn-menu-grid';

    for (const tool of data.tools) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pn-menu-card';
      card.dataset.toolId = tool.id;
      const icon = buildToolIcon(tool);
      icon.classList.add('pn-menu-card__icon');
      card.appendChild(icon);
      const badge = document.createElement('span');
      badge.className = 'pn-menu-card__index';
      badge.textContent = tool.kind === 'popup' ? 'Web' : 'In-app';
      card.appendChild(badge);
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
      card.addEventListener('click', () => launchTool(tool));
      toolsGrid.appendChild(card);
    }

    // Actions cards (presenter-view etc.)
    for (const action of data.actions) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pn-menu-card';
      card.dataset.actionId = action.id;
      const iconSpan = document.createElement('span');
      iconSpan.className = 'pn-sidebar__tool-icon pn-menu-card__icon';
      if (LOCAL_ICONS[action.icon]) iconSpan.innerHTML = LOCAL_ICONS[action.icon];
      card.appendChild(iconSpan);
      const badge = document.createElement('span');
      badge.className = 'pn-menu-card__index';
      badge.textContent = 'Vista';
      card.appendChild(badge);
      const title = document.createElement('h3');
      title.className = 'pn-menu-card__title';
      title.textContent = action.label;
      card.appendChild(title);
      card.addEventListener('click', () => handleAction(action));
      toolsGrid.appendChild(card);
    }

    toolsSection.appendChild(toolsGrid);
    body.appendChild(toolsSection);

    // Panels section
    const panelsSection = document.createElement('section');
    panelsSection.className = 'pn-menu-section';
    const panelsTitle = document.createElement('h2');
    panelsTitle.className = 'pn-menu-section__title';
    panelsTitle.textContent = 'Painéis da apresentação';
    panelsSection.appendChild(panelsTitle);
    const panelGrid = document.createElement('div');
    panelGrid.className = 'pn-menu-grid';

    for (const panel of data.panels) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pn-menu-card';
      if (panel.isActive) card.classList.add('is-active');
      card.dataset.panelIndex = String(panel.index);

      const thumb = document.createElement('img');
      thumb.className = 'pn-menu-card__thumb';
      thumb.loading = 'lazy';
      thumb.alt = '';
      thumb.hidden = true;
      card.appendChild(thumb);

      const badge = document.createElement('span');
      badge.className = 'pn-menu-card__index';
      badge.textContent = (panel.index + 1) + ' / ' + data.panels.length;
      card.appendChild(badge);

      const title = document.createElement('h3');
      title.className = 'pn-menu-card__title';
      title.textContent = panel.title;
      card.appendChild(title);

      const panelSlug = data.slug + '--' + panel.id;
      getThumbnailUrl(panelSlug, panel.id).then(url => {
        if (url) { thumb.src = url; thumb.hidden = false; }
      }).catch(() => {});

      card.addEventListener('click', () => jumpToPanel(panel.index));
      panelGrid.appendChild(card);
    }

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
        const titleEl = card.querySelector('.pn-menu-card__title');
        const text = (titleEl?.textContent || '').toLowerCase();
        const match = q === '' || text.includes(q);
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
    // While the side menu is open in collapsed mode, suppress the topbar's
    // top-edge auto-reveal so it does not cover side menu/menu content.
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
    // side menu suppression class, so we drop the suppression here.
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
    // If the side menu is still open after the menu closes, re-apply suppression.
    if (sidebar.classList.contains('is-open')) {
      const tb = getTopbarEl();
      if (tb) tb.classList.add('pn-sidebar-suppressed');
    }
    renderCollapsed();
  }

  // Wire the topbar's "Fechar menu" button once. This needs the runtime side menu
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

  // ClassPulse live-session badge polling
  let cpSession = null;
  let cpPollTimer = null;
  const cpSlug = (runtime.manifest && runtime.manifest.id) || null;

  function updateCpBadge(session) {
    cpSession = session;
    cpBadge.hidden = !session;
    if (session) {
      cpName.textContent = 'Sessão ' + (session.title || session.code);
      cpBadge.title = 'Sessão ClassPulse ativa: ' + session.code
        + (session.title ? ' – ' + session.title : '')
        + '\nClique para abrir o host';
    } else {
      cpName.textContent = '';
    }
  }

  function scheduleCpPoll(delay) {
    if (cpPollTimer) clearTimeout(cpPollTimer);
    cpPollTimer = setTimeout(() => {
      findHostedSession(cpSlug).then(session => {
        updateCpBadge(session);
        scheduleCpPoll(session ? 10000 : 30000);
      }).catch(() => { scheduleCpPoll(30000); });
    }, delay);
  }

  findHostedSession(cpSlug).then(session => {
    updateCpBadge(session);
    scheduleCpPoll(session ? 10000 : 30000);
  }).catch(() => { scheduleCpPoll(30000); });

  cpBadge.addEventListener('click', () => {
    if (!cpSession) return;
    window.open('/go/host.html?code=' + encodeURIComponent(cpSession.code), '_blank');
  });

  return {
    show, hide, enterMenu, exitMenu,
    destroy() {
      if (cpPollTimer) clearTimeout(cpPollTimer);
      if (zone.parentNode) zone.remove();
      if (sidebar.parentNode) sidebar.remove();
    },
  };
}
