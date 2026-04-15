'use strict';

// ============================================================
// Backstage Topbar (shared module)
// Generates topbar DOM, wires theme toggle, logout, settings.
// Portal mode assumes globals: ThemeManager, SettingsDrawer, BS_AUTH
// Presentation mode assumes globals: ThemeManager, SettingsDrawer (no BS_AUTH)
// Usage: Topbar.init({ title?, subtitle?, backLink?, sections?, container?, mode? })
// ============================================================

window.Topbar = (function() {

  var BACK_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

  var GEAR_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  var _inner = null;
  var _itemsAnchor = null;

  // ── Auto-hide (presentation mode only) ────────────────────

  var TRIGGER_ZONE = 80;
  var HIDE_DELAY = 2000;
  var _header = null;
  var _hideTimer = null;
  var _visible = false;
  var _mouseOverBar = false;

  function _show() {
    if (!_header) return;
    clearTimeout(_hideTimer);
    _header.classList.add('bs-topbar--visible');
    _visible = true;
  }

  function _hide() {
    if (!_header || _mouseOverBar) return;
    _header.classList.remove('bs-topbar--visible');
    _visible = false;
  }

  function _scheduleHide() {
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(_hide, HIDE_DELAY);
  }

  function _onMouseMove(e) {
    if (_mouseOverBar) return;
    if (e.clientY <= TRIGGER_ZONE) {
      _show();
      _scheduleHide();
    }
  }

  function _onKeyDown(e) {
    if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (_visible) { _hide(); } else { _show(); _scheduleHide(); }
    }
  }

  // ── Init ──────────────────────────────────────────────────

  function init(opts) {
    opts = opts || {};
    var mode = opts.mode || 'portal';
    var isPresentation = mode === 'presentation';
    var title = opts.title || 'Backstage';
    var subtitle = opts.subtitle || '';
    var backLink = opts.backLink || '';
    var sections = opts.sections || [];
    var container = opts.container || document.querySelector('.bs-app') || document.body;

    // Build header
    var header = document.createElement('header');
    header.className = 'bs-topbar';
    if (isPresentation) header.classList.add('bs-topbar--presentation');

    _inner = document.createElement('div');
    _inner.className = 'bs-topbar-inner';

    // Back arrow (portal sub-pages only)
    if (backLink && !isPresentation) {
      var back = document.createElement('a');
      back.href = backLink;
      back.className = 'bs-topbar-back';
      back.setAttribute('aria-label', 'Voltar');
      back.innerHTML = BACK_SVG;
      _inner.appendChild(back);
    }

    // Logo (always present)
    var logo = document.createElement('a');
    logo.href = backLink || 'https://pensoia.com';
    logo.className = 'bs-topbar-logo';
    logo.setAttribute('aria-label', 'PensoIA');

    var img = document.createElement('img');
    img.src = '/images/logo.png';
    img.alt = 'PensoIA';
    logo.appendChild(img);

    // Wordmark
    var wordmark = document.createElement('div');
    wordmark.className = 'bs-topbar-wordmark';
    var brand = document.createElement('span');
    brand.className = 'bs-topbar-brand';
    brand.textContent = subtitle ? title : 'PensoIA';
    wordmark.appendChild(brand);
    var name = document.createElement('span');
    name.className = 'bs-topbar-name';
    name.textContent = subtitle || title;
    wordmark.appendChild(name);
    logo.appendChild(wordmark);
    _inner.appendChild(logo);

    // Spacer
    var spacer = document.createElement('div');
    spacer.className = 'bs-topbar-spacer';
    _inner.appendChild(spacer);

    // Theme toggle
    var themeBtn = document.createElement('button');
    themeBtn.className = 'bs-icon-btn theme-toggle';
    themeBtn.id = 'themeToggle';
    themeBtn.setAttribute('aria-label', 'Alternar tema');
    themeBtn.setAttribute('aria-pressed', 'false');
    var themeIcon = document.createElement('span');
    themeIcon.id = 'themeIcon';
    themeBtn.appendChild(themeIcon);
    _inner.appendChild(themeBtn);

    // Custom items insert before theme toggle
    _itemsAnchor = themeBtn;

    // Settings gear
    var settingsBtn = document.createElement('button');
    settingsBtn.className = 'bs-icon-btn';
    settingsBtn.id = 'settings-btn';
    settingsBtn.setAttribute('aria-label', 'Configurações');
    settingsBtn.title = 'Configurações';
    settingsBtn.innerHTML = GEAR_SVG;
    _inner.appendChild(settingsBtn);

    // Logout (portal only)
    if (!isPresentation) {
      var logoutBtn = document.createElement('button');
      logoutBtn.className = 'bs-logout-btn';
      logoutBtn.id = 'logout-btn';
      logoutBtn.textContent = 'Sair';
      logoutBtn.addEventListener('click', BS_AUTH.logout);
      _inner.appendChild(logoutBtn);
    }

    header.appendChild(_inner);

    // Insert into DOM
    container.insertBefore(header, container.firstChild);

    // Prevent click-through to presentation engines
    if (isPresentation) {
      header.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // Wire theme
    ThemeManager.init({ storageKey: 'bs_theme' });
    ThemeManager.applyTheme(localStorage.getItem('bs_theme') || 'dark');

    // Wire settings drawer
    SettingsDrawer.init({ sections: sections });

    // Prevent click-through on drawer/overlay in presentation mode
    if (isPresentation) {
      var overlay = document.getElementById('settings-overlay');
      var drawer = document.getElementById('settings-drawer');
      if (overlay) overlay.addEventListener('click', function(e) { e.stopPropagation(); });
      if (drawer) drawer.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // Presentation auto-hide
    if (isPresentation) {
      _header = header;
      _hide();
      document.addEventListener('mousemove', _onMouseMove);
      document.addEventListener('keydown', _onKeyDown);
      header.addEventListener('mouseenter', function() {
        _mouseOverBar = true;
        clearTimeout(_hideTimer);
      });
      header.addEventListener('mouseleave', function() {
        _mouseOverBar = false;
        _scheduleHide();
      });
    }
  }

  // ── addItem ───────────────────────────────────────────────

  function addItem(item) {
    if (!_inner || !_itemsAnchor) return;
    var el;
    if (item.href) {
      el = document.createElement('a');
      el.href = item.href;
      if (item.href.startsWith('http')) {
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
      }
    } else {
      el = document.createElement('button');
    }
    el.className = item.icon ? 'bs-icon-btn' : 'bs-topbar-item';
    if (item.id) el.id = item.id;
    if (item.title) el.title = item.title;
    if (item.icon) el.innerHTML = item.icon;
    if (item.label && !item.icon) el.textContent = item.label;
    if (item.onClick) el.addEventListener('click', item.onClick);
    _inner.insertBefore(el, _itemsAnchor);
    return el;
  }

  function setSubtitle(text) {
    var el = document.querySelector('.bs-topbar-name');
    if (el) el.textContent = text;
  }

  return { init: init, addItem: addItem, setSubtitle: setSubtitle };

})();
