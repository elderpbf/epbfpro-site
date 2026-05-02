// engine/side-menu-integration.js
//
// Left-edge auto-hide side menu for Panels v2. Two modes:
//   collapsed -- 280px wide. Header carries the deck title + an editable
//                "N / total" panel counter. Body splits into collapsible
//                groups (Ferramentas open by default, Paineis collapsed)
//                whose state persists in localStorage per manifest.id.
//   menu      -- expands to 100vw. Renders a full-page panel grid plus the
//                tools section (separated). Click a panel card to jump to it.
//                Closed via the in-body hamburger toggle.
//
// Reveal: hovering the 12px reveal zone on the left edge slides the
// side menu in. Pointer-leaving the side menu (with a 600ms grace) slides it
// back out. The full-page menu stays open until explicitly dismissed.
//
// Tool kinds (entries in DEFAULT_TOOLS or runtime.manifest.sidebar.tools):
//   'popup'  -- opens entry.url in a new browser tab (window.open '_blank').
//   'panel'  -- mounts registered tool entry.tool as a transient overlay via
//               runtime.pushTransientPanel(), using entry.layout (default
//               'tool-fullbleed'; use 'embed-fullbleed' for full-viewport
//               media without padding). Esc dismisses, restoring the
//               underlying deck panel. The tool runs the same code as when
//               it's declared in a deck panel's panel-meta -- side menu and
//               deck panel are equivalent invocations of the same tool. See
//               manifest/ARCHITECTURE.md "Concepts" section.
//   'action' -- runs a built-in side-menu action (currently 'presenter-view').
//               Treated like a popup for the external-link affordance.
//
// Reactive entries: any popup/panel entry may declare a 'liveState' source
// (e.g. 'classpulse-session') and supply url/config/hidden/badge as either
// scalars or (state) => scalar callbacks. The launcher subscribes to the
// declared sources and re-applies tile state on each transition. See
// engine/classpulse-discovery.js for the only state source today.
//
// Theme: chrome reads Backstage tokens (--surface, --text-primary, --border)
// so it tracks the topbar's data-theme switch. The side menu does not own a
// theme of its own.
//
// Usage:
//   const topbar = attachTopbar(runtime, { ... });
//   attachSideMenu(runtime, { topbar });        // tools optional; defaults below

import { registry } from './registry.js';
import { subscribeHostedSession } from './classpulse-discovery.js';

// Inline single-color SVG glyphs that follow currentColor for theme switching.
// Inlined (not fetched) so the side menu stays self-contained and theme changes
// reflect instantly without a stylesheet swap.
const LOCAL_ICONS = {
  tokenizer:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14M12 5v14"/></svg>',
  menu:             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  'presenter-view': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="16" cy="8" r="2"/><path d="M2 12h8"/></svg>',
  'ai-chat':        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  // Panel-card icons (resolved by panel-meta layout/tool, see resolvePanelIcon).
  'slides':         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 10h18M9 14h6"/></svg>',
  'video':          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  'gif':            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><text x="12" y="16" text-anchor="middle" fill="currentColor" stroke="none" font-size="8" font-weight="700">GIF</text></svg>',
  'js-anim':        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2 5 5 1-3.5 3.5L17 18l-5-2.5L7 18l1.5-5.5L5 9l5-1z"/></svg>',
  'classpulse':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity="0.5"/><circle cx="12" cy="12" r="11" opacity="0.25"/></svg>',
  'terminal':       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7l4 5-4 5M13 17h6"/></svg>',
  'content':        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14M5 9h14M5 14h10M5 19h6"/></svg>',
  'cover':          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>',
  'checkpoint':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12 9 17 20 6"/></svg>',
  'comparison':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg>',
  'panel':          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
};

const DEFAULT_TOOLS = [
  { id: 'claude',         label: 'Claude',         kind: 'popup', url: 'https://claude.ai' },
  { id: 'chatgpt',        label: 'ChatGPT',        kind: 'popup', url: 'https://chatgpt.com' },
  { id: 'gemini',         label: 'Gemini',         kind: 'popup', url: 'https://gemini.google.com' },
  { id: 'tokenizer',      label: 'Tiktokenizer',   kind: 'panel', tool: 'tokenizer-embed', icon: 'tokenizer' },
  { id: 'ai-chat',        label: 'Chat IA',        kind: 'panel', tool: 'ai-chat',         icon: 'ai-chat' },
  { id: 'presenter-view', label: 'Apresentador',   kind: 'action', icon: 'presenter-view' },
  {
    id: 'classpulse', label: 'ClassPulse', kind: 'popup', icon: 'classpulse',
    liveState: 'classpulse-session',
    url:   (s) => s ? '/go/host.html?code=' + encodeURIComponent(s.code) : '/backstage/classpulse/index.html',
    badge: (s) => s ? 'dot' : null,
  },
  {
    id: 'classpulse-display', label: 'Display ao vivo', kind: 'panel',
    tool: 'classpulse-display-embed', layout: 'embed-fullbleed', icon: 'classpulse',
    liveState: 'classpulse-session',
    hidden: (s) => !s,
    config: (s) => ({ slug: s ? s.presentation_slug : null }),
  },
];

function buildToolIcon(tool) {
  const span = document.createElement('span');
  span.className = 'pn-side-menu__tool-icon';
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

// Resolve a panel-card icon. The manifest entry alone doesn't carry layout/tool
// info, so callers normally pass a hydrated `{ meta }` after fetching the panel
// HTML. Falls back to a generic 'panel' glyph when meta is missing.
function resolvePanelIcon(panel) {
  const layout = panel.layout || (panel.meta && panel.meta.layout);
  const toolId = panel.toolId || (panel.meta && panel.meta.tools && panel.meta.tools[0] && panel.meta.tools[0].id);

  // Tool-based mapping takes priority (more specific).
  if (toolId === 'slides-embed')             return { kind: 'svg', svg: LOCAL_ICONS.slides };
  if (toolId === 'video-embed')              return { kind: 'svg', svg: LOCAL_ICONS.video };
  if (toolId === 'gif-embed')                return { kind: 'svg', svg: LOCAL_ICONS.gif };
  if (toolId === 'js-anim-embed')            return { kind: 'svg', svg: LOCAL_ICONS['js-anim'] };
  if (toolId === 'tokenizer-embed')          return { kind: 'svg', svg: LOCAL_ICONS.tokenizer };
  if (toolId === 'classpulse-display-embed') return { kind: 'svg', svg: LOCAL_ICONS.classpulse };
  if (toolId === 'terminal-embed')           return { kind: 'svg', svg: LOCAL_ICONS.terminal };
  if (toolId === 'ai-chat')                  return { kind: 'svg', svg: LOCAL_ICONS['ai-chat'] };
  if (toolId === 'popup-launcher') {
    const url = panel.popupUrl || (panel.meta && panel.meta.tools && panel.meta.tools[0] && panel.meta.tools[0].config && panel.meta.tools[0].config.url);
    if (url) {
      try { return { kind: 'favicon', url: 'https://www.google.com/s2/favicons?domain=' + new URL(url).hostname + '&sz=64' }; } catch(_) {}
    }
    return { kind: 'svg', svg: LOCAL_ICONS.panel };
  }

  // Layout fallback.
  if (layout === 'content')           return { kind: 'svg', svg: LOCAL_ICONS.content };
  if (layout === 'cover')             return { kind: 'svg', svg: LOCAL_ICONS.cover };
  if (layout === 'checkpoint')        return { kind: 'svg', svg: LOCAL_ICONS.checkpoint };
  if (layout === 'comparison-split')  return { kind: 'svg', svg: LOCAL_ICONS.comparison };
  return { kind: 'svg', svg: LOCAL_ICONS.panel };
}

function buildMenuData(runtime, tools) {
  const manifest = runtime.manifest;
  const slug = (manifest && manifest.id) || 'default';
  const panelList = (manifest && Array.isArray(manifest.panels)) ? manifest.panels : [];
  return {
    slug,
    tools,  // existing tool objects unchanged
    panels: panelList.map((entry, i) => ({
      index: i,
      id: (entry && entry.id) ? entry.id
         : ('panel-' + String(i + 1).padStart(2, '0')),
      title: (entry && entry.title) || (entry && entry.id)
             || (typeof entry === 'string' ? entry : 'Panel ' + (i + 1)),
      // src is needed to lazy-load panel meta for icon resolution.
      src: (entry && typeof entry === 'object') ? (entry.src || entry.url || entry.path) : (typeof entry === 'string' ? entry : null),
      isActive: i === runtime.currentIndex,
    })),
  };
}

function openPopup(url) {
  const popup = window.open(url, '_blank');
  if (popup && typeof popup.focus === 'function') popup.focus();
  return popup;
}

async function openPresenterView(slug, panelIndex) {
  const idx = Number.isInteger(panelIndex) && panelIndex >= 0 ? panelIndex : 0;
  const url = '/backstage/classforge/panels/presenter-view.html?slug=' + encodeURIComponent(slug)
    + '&panel=' + idx;
  window.open(url, '_blank');
}


export function attachSideMenu(runtime, options = {}) {
  const manifestTools = runtime?.manifest?.sidebar?.tools;
  const rawTools = Array.isArray(options.tools) && options.tools.length > 0
    ? options.tools
    : (Array.isArray(manifestTools) && manifestTools.length > 0 ? manifestTools : DEFAULT_TOOLS);
  // In presenter (mirror) mode, hide the 'presenter-view' action -- opening
  // another presenter view from inside one cascades and is never desired.
  const tools = options.presenterMode
    ? rawTools.filter(t => !(t.kind === 'action' && t.id === 'presenter-view'))
    : rawTools;
  const topbar = options.topbar || null;

  const slug = (runtime.manifest && runtime.manifest.id) || 'default';
  const TOOLS_OPEN_KEY = 'bs_pn_side_menu_' + slug + '_tools_open';
  const PANELS_OPEN_KEY = 'bs_pn_side_menu_' + slug + '_panels_open';

  const liveStates = {};
  const _unsubscribers = [];

  const zone = document.createElement('div');
  zone.className = 'pn-side-menu-zone';

  const sidebar = document.createElement('aside');
  sidebar.className = 'pn-side-menu';
  sidebar.setAttribute('aria-label', 'Menu lateral de ferramentas e painéis');

  // ----- body (groups in collapsed mode, full menu in menu mode) -----
  const body = document.createElement('div');
  body.className = 'pn-side-menu__body';
  sidebar.appendChild(body);

  // ----- bottom bar (replaces the old footer button + side menu header) -----
  // The bottom bar lives at the bottom of the side menu so it never collides
  // with the topbar's top-edge reveal zone. It carries the deck title, an
  // editable N/total counter, and a menu-toggle button (hamburger glyph).
  const bottomBar = document.createElement('div');
  bottomBar.className = 'pn-side-menu__bottom-bar';

  const menuToggle = document.createElement('button');
  menuToggle.type = 'button';
  menuToggle.className = 'pn-side-menu__menu-toggle';
  menuToggle.setAttribute('aria-label', 'Abrir menu de painéis');
  menuToggle.innerHTML = LOCAL_ICONS.menu;
  bottomBar.appendChild(menuToggle);

  const bottomTitle = document.createElement('span');
  bottomTitle.className = 'pn-side-menu__bottom-title';
  bottomTitle.textContent = (runtime.manifest && runtime.manifest.title) || 'ClassForge';
  bottomBar.appendChild(bottomTitle);

  const counter = document.createElement('div');
  counter.className = 'pn-side-menu__counter';
  const counterInput = document.createElement('input');
  counterInput.type = 'number';
  counterInput.className = 'pn-side-menu__counter-input';
  counterInput.min = '1';
  counterInput.setAttribute('aria-label', 'Número do painel atual');
  counter.appendChild(counterInput);
  const counterTotal = document.createElement('span');
  counterTotal.className = 'pn-side-menu__counter-total';
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
    if (tool.kind === 'action' && tool.id === 'presenter-view') {
      const pvSlug = (runtime.manifest && runtime.manifest.id) || 'unknown';
      openPresenterView(pvSlug, runtime.currentIndex);
      return;
    }
    if (tool.kind === 'panel' && tool.tool) {
      exitMenu();
      hide();
      const config = tool.__resolvedConfig !== undefined ? tool.__resolvedConfig : (tool.config || {});
      const spec = {
        layout: tool.layout || 'tool-fullbleed',
        tools: [{ id: tool.tool, slot: 'tool', config }],
        meta: { title: tool.label || tool.tool },
      };
      if (typeof options.onPanelLaunch === 'function') {
        try { options.onPanelLaunch(spec); } catch (_) {}
      }
      runtime.pushTransientPanel(spec);
    } else if (tool.kind === 'popup') {
      const url = tool.__resolvedUrl !== undefined ? tool.__resolvedUrl : tool.url;
      if (url) {
        const popup = openPopup(url);
        if (!popup) {
          alert('O navegador bloqueou o popup. Permita popups para este site e tente novamente.');
        }
      }
    } else if (tool.url) {
      // Fallback: any tool with a URL opens as a popup.
      const popup = openPopup(tool.url);
      if (!popup) {
        alert('O navegador bloqueou o popup. Permita popups para este site e tente novamente.');
      }
    }
  }

  function applyTileState() {
    for (const tool of tools) {
      if (!tool.liveState) continue;
      const state = liveStates[tool.liveState] !== undefined ? liveStates[tool.liveState] : null;

      tool.__resolvedUrl    = typeof tool.url    === 'function' ? tool.url(state)    : tool.url;
      tool.__resolvedConfig = typeof tool.config === 'function' ? tool.config(state) : tool.config;

      const hidden = typeof tool.hidden === 'function' ? tool.hidden(state) : tool.hidden;
      const badge  = typeof tool.badge  === 'function' ? tool.badge(state)  : tool.badge;

      // Collapsed-mode: tool button lives in a <li> inside .pn-side-menu__tools
      const collapsedBtn = body.querySelector(`.pn-side-menu__tool[data-tool-id="${CSS.escape(tool.id)}"]`);
      if (collapsedBtn) {
        const li = collapsedBtn.parentElement;
        if (li) { li.hidden = !!hidden; li.dataset.stateHidden = hidden ? 'true' : 'false'; }
        // Dot lives on the icon so the ↗ affordance stays in its fixed position.
        const iconSpan = collapsedBtn.querySelector('.pn-side-menu__tool-icon');
        const dotHost = iconSpan || collapsedBtn;
        let dot = dotHost.querySelector('.pn-side-menu__tool-dot');
        if (badge === 'dot') {
          if (!dot) { dot = document.createElement('span'); dot.className = 'pn-side-menu__tool-dot'; dotHost.appendChild(dot); }
        } else if (dot) { dot.remove(); }
      }

      // Menu-mode: tool is a .pn-menu-card[data-tool-id]
      const menuCard = body.querySelector(`.pn-menu-card[data-tool-id="${CSS.escape(tool.id)}"]`);
      if (menuCard) {
        menuCard.hidden = !!hidden;
        menuCard.dataset.stateHidden = hidden ? 'true' : 'false';
        // Dot lives on the icon so it doesn't obscure the ↗ affordance.
        const iconSpan = menuCard.querySelector('.pn-menu-card__icon');
        const dotHost = iconSpan || menuCard;
        let dot = dotHost.querySelector('.pn-menu-card__dot');
        if (badge === 'dot') {
          if (!dot) { dot = document.createElement('span'); dot.className = 'pn-menu-card__dot'; dotHost.appendChild(dot); }
        } else if (dot) { dot.remove(); }
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
    det.className = 'pn-side-menu__group';
    const stored = localStorage.getItem(openKey);
    const isOpen = stored === null ? defaultOpen : stored === 'true';
    if (isOpen) det.open = true;

    const sum = document.createElement('summary');
    sum.className = 'pn-side-menu__group-summary';
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
    toolsList.className = 'pn-side-menu__tools';
    for (const tool of data.tools) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pn-side-menu__tool';
      btn.dataset.toolId = tool.id;
      btn.appendChild(buildToolIcon(tool));
      const lab = document.createElement('span');
      lab.className = 'pn-side-menu__tool-label';
      lab.textContent = tool.label;
      btn.appendChild(lab);
      // External-link affordance for tools that open in a new tab/window.
      if (tool.kind === 'popup' || tool.kind === 'action') {
        const ext = document.createElement('span');
        ext.className = 'pn-side-menu__tool-ext';
        ext.textContent = '↗';
        ext.setAttribute('aria-hidden', 'true');
        btn.appendChild(ext);
        btn.title = 'Abre em nova aba';
      }
      btn.addEventListener('click', () => launchTool(tool));
      li.appendChild(btn);
      toolsList.appendChild(li);
    }
    const toolsGroup = makeGroup({ title: 'Ferramentas', openKey: TOOLS_OPEN_KEY, defaultOpen: true, children: toolsList });
    body.appendChild(toolsGroup);

    // --- Panels group ---
    const panelsList = document.createElement('ul');
    panelsList.className = 'pn-side-menu__panel-list';
    for (const panel of data.panels) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pn-side-menu__panel';
      btn.dataset.panelIndex = String(panel.index);
      if (panel.isActive) btn.classList.add('is-active');
      const idx = document.createElement('span');
      idx.className = 'pn-side-menu__panel-index';
      idx.textContent = String(panel.index + 1);
      btn.appendChild(idx);
      const lab = document.createElement('span');
      lab.className = 'pn-side-menu__panel-label';
      lab.textContent = panel.title;
      btn.appendChild(lab);
      btn.addEventListener('click', () => jumpToPanel(panel.index));
      li.appendChild(btn);
      panelsList.appendChild(li);
    }
    const panelsGroup = makeGroup({ title: 'Painéis', openKey: PANELS_OPEN_KEY, defaultOpen: false, children: panelsList });
    body.appendChild(panelsGroup);

    // --- Search filter (applies to tools group + panels group) ---
    function applyCollapsedFilter(query) {
      const q = query.trim().toLowerCase();
      toolsList.querySelectorAll('.pn-side-menu__tool').forEach(btn => {
        if (btn.parentElement.dataset.stateHidden === 'true') return;
        const text = (btn.querySelector('.pn-side-menu__tool-label')?.textContent || '').toLowerCase();
        btn.parentElement.hidden = q !== '' && !text.includes(q);
      });
      panelsList.querySelectorAll('.pn-side-menu__panel').forEach(btn => {
        const text = (btn.querySelector('.pn-side-menu__panel-label')?.textContent || '').toLowerCase();
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

    // Tools section
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
      if (tool.kind === 'popup')      badge.textContent = 'Web';
      else if (tool.kind === 'action') badge.textContent = 'Vista';
      else                             badge.textContent = 'In-app';
      card.appendChild(badge);
      const title = document.createElement('h3');
      title.className = 'pn-menu-card__title';
      title.textContent = tool.label;
      card.appendChild(title);
      // Hint text only for static URLs. Reactive (function) URLs change with
      // state and aren't useful as a fixed hint -- showing one would render
      // the function's source as text.
      if (typeof tool.url === 'string') {
        const hint = document.createElement('p');
        hint.className = 'pn-menu-card__hint';
        hint.textContent = tool.url;
        card.appendChild(hint);
      }
      // External-link affordance for tools that open in a new tab/window.
      if (tool.kind === 'popup' || tool.kind === 'action') {
        card.title = 'Abre em nova aba';
        const ext = document.createElement('span');
        ext.className = 'pn-menu-card__ext';
        ext.textContent = '↗';
        ext.setAttribute('aria-hidden', 'true');
        card.appendChild(ext);
      }
      card.addEventListener('click', () => launchTool(tool));
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

    // Resolve a panel src to an absolute URL relative to this document.
    // Manifest entries use deck-relative paths like "panel-01.html".
    function resolvePanelUrl(src) {
      if (!src) return null;
      try {
        return new URL(src, window.location.href).toString();
      } catch (_) {
        return null;
      }
    }

    for (const panel of data.panels) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pn-menu-card';
      if (panel.isActive) card.classList.add('is-active');
      card.dataset.panelIndex = String(panel.index);

      // Generic placeholder icon while panel meta loads.
      const iconSpan = document.createElement('span');
      iconSpan.className = 'pn-menu-card__icon';
      iconSpan.innerHTML = LOCAL_ICONS.panel;
      card.appendChild(iconSpan);

      const badge = document.createElement('span');
      badge.className = 'pn-menu-card__index';
      badge.textContent = (panel.index + 1) + ' / ' + data.panels.length;
      card.appendChild(badge);

      const title = document.createElement('h3');
      title.className = 'pn-menu-card__title';
      title.textContent = panel.title;
      card.appendChild(title);

      // Lazily fetch panel HTML, parse panel-meta, and update the icon based
      // on the layout/tool. Failures fall back to the generic placeholder.
      const panelUrl = resolvePanelUrl(panel.src);
      if (panelUrl) {
        fetch(panelUrl).then(r => r.text()).then(html => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const metaScript = doc.getElementById('panel-meta');
          if (!metaScript) return;
          let meta;
          try { meta = JSON.parse(metaScript.textContent); }
          catch (_) { return; }
          const icon = resolvePanelIcon({ meta });
          if (icon.kind === 'svg') {
            iconSpan.innerHTML = icon.svg;
          } else if (icon.kind === 'favicon') {
            iconSpan.innerHTML = '';
            const img = document.createElement('img');
            img.src = icon.url;
            img.alt = '';
            iconSpan.appendChild(img);
          }
        }).catch(() => {});
      }

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
        if (card.dataset.stateHidden === 'true') return;
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
      if (tb) tb.classList.add('pn-side-menu-suppressed');
    }
  }

  function hide() {
    if (menuOpen) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      sidebar.classList.remove('is-open');
      const tb = getTopbarEl();
      if (tb) tb.classList.remove('pn-side-menu-suppressed');
      hideTimer = null;
    }, 600);
  }

  function enterMenu() {
    menuOpen = true;
    sidebar.classList.add('is-menu', 'is-open');
    // Pinning the topbar (via setMenuMode) takes precedence over the
    // side menu suppression class, so we drop the suppression here.
    const tb = getTopbarEl();
    if (tb) tb.classList.remove('pn-side-menu-suppressed');
    if (topbar && typeof topbar.setMenuMode === 'function') topbar.setMenuMode(true);
    renderMenu();
    applyTileState();
  }

  function exitMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    sidebar.classList.remove('is-menu');
    if (topbar && typeof topbar.setMenuMode === 'function') topbar.setMenuMode(false);
    // If the side menu is still open after the menu closes, re-apply suppression.
    if (sidebar.classList.contains('is-open')) {
      const tb = getTopbarEl();
      if (tb) tb.classList.add('pn-side-menu-suppressed');
    }
    renderCollapsed();
    applyTileState();
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

  let firstPanelEntered = true;
  runtime.eventBus.addEventListener('panel-entered', (e) => {
    // Skip transient panels (tool overlays) so the underlying panel's
    // active highlight + counter stay correct while the tool is open.
    if (e.detail && e.detail.transient) return;

    // First non-transient panel-entered: do a full re-render so the panel
    // list (which was empty when renderCollapsed first ran -- runtime.start
    // hadn't loaded the manifest yet) gets populated.
    if (firstPanelEntered) {
      firstPanelEntered = false;
      if (!menuOpen) {
        renderCollapsed();
        refreshCounter();
        applyTileState();
        return;
      }
    }

    refreshCounter();
    if (menuOpen) {
      // Re-render the full menu so the active card highlight updates.
      renderMenu();
      applyTileState();
    } else {
      // Surgical update for the collapsed-mode panel list.
      const list = body.querySelector('.pn-side-menu__panel-list');
      if (list) {
        list.querySelectorAll('.pn-side-menu__panel').forEach(btn => {
          const idx = parseInt(btn.dataset.panelIndex, 10);
          btn.classList.toggle('is-active', idx === runtime.currentIndex);
        });
      }
    }
  });

  // Subscribe to each unique liveState source declared by tools. Callbacks fire
  // immediately with the current cached state, then on each state transition.
  const _liveStateKeys = [...new Set(tools.filter(t => t.liveState).map(t => t.liveState))];
  for (const key of _liveStateKeys) {
    _unsubscribers.push(subscribeHostedSession(slug, (session) => {
      liveStates[key] = session;
      applyTileState();
    }));
  }

  renderCollapsed();
  refreshCounter();
  applyTileState();

  return {
    show, hide, enterMenu, exitMenu,
    destroy() {
      _unsubscribers.forEach(fn => fn());
      if (zone.parentNode) zone.remove();
      if (sidebar.parentNode) sidebar.remove();
    },
  };
}
