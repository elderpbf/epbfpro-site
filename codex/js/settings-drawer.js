// codex/js/settings-drawer.js
// Codex-owned Settings drawer SHELL — OWNED BY THE APP.
//
// This is pure drawer mechanics: build the accordion sections, inject the
// overlay + aside, open/close, and bind the topbar settings button. It knows
// NOTHING about auth. The auth bits (Google connect, password change) are an
// INJECTED component (js/settings-auth.js) handed in via opts.sections, exactly
// like any other section; dev tooling (the debug-pill toggle) is likewise
// composed by the consumer (codex-topbar). The drawer never owns those concerns.
//
// init({ sections }): sections render in the EXACT order given. Each section is
//   { id, title, content, expanded?, onInit?, onOpen? }.
//   onInit() runs once after the drawer is injected (wire the section's buttons);
//   onOpen() runs every time the drawer opens (refresh live state).
// open() / close(): slide the drawer in / out.
//
// ES module: imported by codex-topbar.js (replaces the legacy window.SettingsDrawer).
import { t } from './i18n.js';

import { esc as _esc } from './dom.js';

// ── Section HTML builder ─────────────────────────────────────────────────────
function _buildSection(id, title, bodyHtml, expanded) {
  var openClass = expanded ? ' sd-section-open' : '';
  var hiddenAttr = expanded ? '' : ' hidden';
  return (
    '<div class="sd-section' + openClass + '" data-sd-section="' + _esc(id) + '">' +
      '<button class="sd-section-header" type="button">' +
        '<span>' + _esc(title) + '</span>' +
        '<span class="sd-chevron">&#9662;</span>' +
      '</button>' +
      '<div class="sd-section-body"' + hiddenAttr + '>' +
        bodyHtml +
      '</div>' +
    '</div>'
  );
}

// ── Drawer shell ─────────────────────────────────────────────────────────────
var _overlay, _drawer;
var _onOpenCallbacks = [];

function _injectDrawer(sectionsHtml, footerHtml) {
  _overlay = document.createElement('div');
  _overlay.id = 'settings-overlay';
  _overlay.className = 'bs-overlay';
  _overlay.hidden = true;
  document.body.appendChild(_overlay);

  _drawer = document.createElement('aside');
  _drawer.id = 'settings-drawer';
  _drawer.className = 'bs-drawer';
  _drawer.hidden = true;
  _drawer.setAttribute('aria-label', t('settings.title'));
  _drawer.innerHTML =
    '<h2>' +
      '<span>' + t('settings.title') + '</span>' +
      '<button class="bs-drawer-close" id="sd-close" aria-label="Fechar">&times;</button>' +
    '</h2>' +
    '<div class="sd-scroll">' + sectionsHtml + '</div>' +
    (footerHtml ? '<div class="sd-footer">' + footerHtml + '</div>' : '');
  document.body.appendChild(_drawer);

  document.getElementById('sd-close').addEventListener('click', close);
  _overlay.addEventListener('click', close);

  _drawer.querySelectorAll('.sd-section-header').forEach(function (header) {
    header.addEventListener('click', function () {
      var section = header.closest('.sd-section');
      var body = section.querySelector('.sd-section-body');
      var isOpen = !body.hidden;
      body.hidden = isOpen;
      section.classList.toggle('sd-section-open', !isOpen);
    });
  });
}

export function open() {
  _onOpenCallbacks.forEach(function (fn) { fn(); });
  _overlay.hidden = false;
  _drawer.hidden = false;
  requestAnimationFrame(function () {
    _overlay.classList.add('open');
    _drawer.classList.add('open');
  });
}

export function close() {
  _overlay.classList.remove('open');
  _drawer.classList.remove('open');
  setTimeout(function () {
    _overlay.hidden = true;
    _drawer.hidden = true;
  }, 300);
}

// ── CSS (the .sd-* accordion rules; injected once) ───────────────────────────
// The drawer chrome (.bs-drawer / .bs-overlay / .bs-toggle-btn / .bs-field ...)
// is in css/settings-drawer.css; only the accordion-section rules live inline.
function _injectStyles() {
  if (document.getElementById('sd-styles')) return;
  var style = document.createElement('style');
  style.id = 'sd-styles';
  style.textContent =
    '.sd-section { border-bottom: 1px solid var(--border); }' +
    '.sd-section:last-child { border-bottom: none; }' +
    '.sd-section-header {' +
      'display: flex; align-items: center; justify-content: space-between;' +
      'width: 100%; background: none; border: none; padding: 0.85rem 0;' +
      'font-family: inherit; font-size: 0.82rem; font-weight: 700;' +
      'text-transform: uppercase; letter-spacing: 0.06em;' +
      'color: var(--text-secondary); cursor: pointer;' +
    '}' +
    '.sd-section-header:hover { color: var(--text-primary); }' +
    '.sd-chevron {' +
      'transition: transform 0.2s; font-size: 0.7rem;' +
    '}' +
    '.sd-section-open .sd-chevron { transform: rotate(180deg); }' +
    '.sd-section-body { padding: 0 0 1rem; }';
  document.head.appendChild(style);
}

// ── Public: init ─────────────────────────────────────────────────────────────
export function init(opts) {
  opts = opts || {};
  var sections = opts.sections || [];
  var footer = opts.footer || null; // { content, onInit? } pinned below the scroll (e.g. logout)

  _injectStyles();

  var html = '';
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    html += _buildSection(s.id, s.title, s.content || '', s.expanded === true);
  }

  _injectDrawer(html, footer && footer.content ? footer.content : '');

  // Wire each section: onInit once now, onOpen on every open.
  for (var j = 0; j < sections.length; j++) {
    if (typeof sections[j].onInit === 'function') sections[j].onInit();
    if (typeof sections[j].onOpen === 'function') _onOpenCallbacks.push(sections[j].onOpen);
  }

  // Footer (e.g. logout) is pinned below the scrolling sections; wire it once.
  if (footer && typeof footer.onInit === 'function') footer.onInit();

  var settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) settingsBtn.addEventListener('click', open);
}
