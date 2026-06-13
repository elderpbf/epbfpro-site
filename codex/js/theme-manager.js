'use strict';

// codex/js/theme-manager.js
// Codex-owned theme manager. Verbatim port of the shared backstage/js/theme-manager.js
// (light/dark toggle, the animated reveal overlay, and the public pre-paint
// initPublic). Kept as a CLASSIC script (not an ES module) on purpose: the public
// Trail loads it synchronously in <head> and calls ThemeManager.initPublic() before
// paint to avoid a theme flash, which a deferred ES module would reintroduce. It
// sets window.ThemeManager so the admin topbar (codex-topbar.js) and the Trail
// header (pensoia-header.js) reach it as before. The backstage copy stays live for
// the legacy family until quarantine.

var ThemeManager = (function() {
  var SVG_MOON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var SVG_SUN  = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  var config = {
    storageKey: 'bs_theme',
    iconEl: null,
    toggleEl: null,
    overlayEl: null
  };

  function applyTheme(theme, options) {
    options = options || {};
    var animate = options.animate;

    if (animate && config.overlayEl) {
      config.overlayEl.style.setProperty('--tx', (options.ox || 0) + 'px');
      config.overlayEl.style.setProperty('--ty', (options.oy || 0) + 'px');
      document.documentElement.setAttribute('data-theme', theme);
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
      document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark');
      config.overlayEl.style.backgroundColor = bg;
      config.overlayEl.offsetHeight; // force reflow
      config.overlayEl.classList.add('active');

      setTimeout(function() {
        document.documentElement.setAttribute('data-theme', theme);
        if (config.iconEl) config.iconEl.innerHTML = theme === 'dark' ? SVG_SUN : SVG_MOON;
        if (config.toggleEl) config.toggleEl.setAttribute('aria-pressed', theme === 'dark');
        localStorage.setItem(config.storageKey, theme);
        setTimeout(function() { config.overlayEl.classList.remove('active'); }, 100);
      }, 500);
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      if (config.iconEl) config.iconEl.innerHTML = theme === 'dark' ? SVG_SUN : SVG_MOON;
      if (config.toggleEl) config.toggleEl.setAttribute('aria-pressed', theme === 'dark');
      localStorage.setItem(config.storageKey, theme);
    }
  }

  function toggleTheme(e) {
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    var nextTheme = cur === 'dark' ? 'light' : 'dark';
    var options = { animate: false };

    if (e && e.currentTarget && config.overlayEl) {
      var rect = e.currentTarget.getBoundingClientRect();
      options.animate = true;
      options.ox = rect.left + rect.width / 2;
      options.oy = rect.top + rect.height / 2;
    }
    applyTheme(nextTheme, options);
  }

  function init(opts) {
    opts = opts || {};
    if (opts.storageKey) config.storageKey = opts.storageKey;
    config.iconEl = opts.iconEl || document.getElementById('themeIcon') || document.getElementById('theme-icon');
    config.toggleEl = opts.toggleEl || document.getElementById('themeToggle') || document.getElementById('theme-btn');
    config.overlayEl = opts.overlayEl || document.getElementById('themeTransition');

    if (config.toggleEl) {
      config.toggleEl.removeAttribute('onclick');
      config.toggleEl.removeEventListener('click', toggleTheme);
      config.toggleEl.addEventListener('click', toggleTheme);
    }

    // Render the icon now that iconEl is wired. initPublic may have run
    // before init() (in <head>), so applyTheme had no iconEl reference
    // and the toggle would render empty until the first click.
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    if (config.iconEl) config.iconEl.innerHTML = current === 'dark' ? SVG_SUN : SVG_MOON;
    if (config.toggleEl) config.toggleEl.setAttribute('aria-pressed', current === 'dark');
  }

  function initPublic(opts) {
    opts = opts || {};
    var key      = opts.storageKey   || 'bs_theme_public';
    var def      = opts.defaultTheme || 'light';
    var urlTheme = new URLSearchParams(window.location.search).get('theme');
    var stored   = localStorage.getItem(key);
    var theme    = def;
    if (urlTheme === 'dark' || urlTheme === 'light') theme = urlTheme;
    else if (stored === 'dark' || stored === 'light') theme = stored;
    applyTheme(theme);
  }

  return {
    init: init,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    initPublic: initPublic,
    SVG_SUN: SVG_SUN,
    SVG_MOON: SVG_MOON
  };
})();

// Codex seam: expose the manager as a window global, exactly like the legacy
// classic script did (a bare top-level `var` is already global, but set it
// explicitly so the contract is visible and the file is sandbox-testable).
if (typeof window !== 'undefined') window.ThemeManager = ThemeManager;
