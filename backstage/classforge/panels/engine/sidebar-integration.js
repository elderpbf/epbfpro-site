// engine/sidebar-integration.js
//
// Left-edge auto-hide sidebar for Panels v2. Two modes:
//   collapsed -- 280px wide. Lists tool launchers (Claude, ChatGPT, Gemini,
//                Tokenizer, Terminal) plus a "Ir para o menu" button.
//   menu      -- expands to 100vw. Renders a full-page panel grid plus the
//                tools section (separated). Click a panel card to jump to it.
//
// Reveal: hovering the 12px reveal zone on the left edge slides the
// sidebar in. Pointer-leaving the sidebar (with a 600ms grace) slides it
// back out. The full-page menu stays open until the close button is hit.
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
//   import { attachSidebar } from '../../engine/sidebar-integration.js';
//   attachSidebar(runtime, { tools: [...] });   // tools optional; defaults below

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
      const img = document.createElement('img');
      img.src = u.origin + '/favicon.ico';
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

  const zone = document.createElement('div');
  zone.className = 'pn-sidebar-zone';

  const sidebar = document.createElement('aside');
  sidebar.className = 'pn-sidebar';
  sidebar.setAttribute('aria-label', 'Barra lateral de ferramentas');

  const header = document.createElement('div');
  header.className = 'pn-sidebar__header';
  const headTitle = document.createElement('h2');
  headTitle.className = 'pn-sidebar__title';
  headTitle.textContent = 'Ferramentas';
  header.appendChild(headTitle);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pn-sidebar__close';
  close.setAttribute('aria-label', 'Fechar menu');
  close.textContent = 'X';
  close.addEventListener('click', () => exitMenu());
  header.appendChild(close);

  sidebar.appendChild(header);

  const body = document.createElement('div');
  body.className = 'pn-sidebar__body';
  sidebar.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'pn-sidebar__footer';
  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'pn-sidebar__menu-btn';
  const menuBtnIcon = document.createElement('span');
  menuBtnIcon.className = 'pn-sidebar__menu-btn-icon';
  menuBtnIcon.innerHTML = LOCAL_ICONS.menu;
  menuBtn.appendChild(menuBtnIcon);
  const menuBtnLabel = document.createElement('span');
  menuBtnLabel.textContent = 'Ir para o menu';
  menuBtn.appendChild(menuBtnLabel);
  menuBtn.addEventListener('click', () => enterMenu());
  footer.appendChild(menuBtn);
  sidebar.appendChild(footer);

  document.body.appendChild(zone);
  document.body.appendChild(sidebar);

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

  function renderCollapsed() {
    body.innerHTML = '';
    const label = document.createElement('p');
    label.className = 'pn-sidebar__section-label';
    label.textContent = 'Ferramentas';
    body.appendChild(label);
    body.appendChild(buildToolList(tools, launchTool));
  }

  function renderMenu() {
    body.innerHTML = '';

    const toolsSection = document.createElement('section');
    toolsSection.className = 'pn-menu-section';
    const toolsTitle = document.createElement('h2');
    toolsTitle.className = 'pn-menu-section__title';
    toolsTitle.textContent = 'Ferramentas';
    toolsSection.appendChild(toolsTitle);
    toolsSection.appendChild(buildToolGrid(tools, launchTool));
    body.appendChild(toolsSection);

    const panelsSection = document.createElement('section');
    panelsSection.className = 'pn-menu-section';
    const panelsTitle = document.createElement('h2');
    panelsTitle.className = 'pn-menu-section__title';
    panelsTitle.textContent = 'Paineis da apresentacao';
    panelsSection.appendChild(panelsTitle);
    panelsSection.appendChild(buildPanelGrid(runtime, jumpToPanel));
    body.appendChild(panelsSection);
  }

  let menuOpen = false;
  let hideTimer = null;

  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    sidebar.classList.add('is-open');
  }

  function hide() {
    if (menuOpen) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      sidebar.classList.remove('is-open');
      hideTimer = null;
    }, 600);
  }

  function enterMenu() {
    menuOpen = true;
    sidebar.classList.add('is-menu', 'is-open');
    renderMenu();
  }

  function exitMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    sidebar.classList.remove('is-menu');
    renderCollapsed();
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
    if (menuOpen) renderMenu();
  });

  renderCollapsed();

  return {
    show, hide, enterMenu, exitMenu,
    destroy() {
      closeModal();
      if (zone.parentNode) zone.remove();
      if (sidebar.parentNode) sidebar.remove();
    },
  };
}
