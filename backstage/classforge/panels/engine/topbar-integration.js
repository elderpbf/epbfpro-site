// engine/topbar-integration.js
//
// Shared helper that wires the Backstage Topbar to a Panels v2 runtime in
// presentation mode. Subscribes to `panel-entered` on `runtime.eventBus` and
// updates the Topbar subtitle with the active panel's title (or id) plus the
// 1-based position over total panel count.
//
// Returns a handle so callers (notably attachSidebar) can swap the topbar
// into "menu mode" -- subtitle becomes "Menu". The "Fechar menu" topbar
// button was removed in P8: the side menu's hamburger toggle is the single
// way to dismiss the full menu.
//
// Dependencies (globals, loaded via classic <script> tags):
//   window.Topbar          (from /backstage/js/backstage-topbar.js)
//   window.ThemeManager    (from /backstage/js/theme-manager.js)
//   window.SettingsDrawer  (from /backstage/js/settings-drawer.js)
//
// Example usage (inside a presentation's module script):
//
//   const topbar = attachTopbar(runtime, { title: 'ClassForge', backLink: '/backstage/classforge/' });
//   attachSidebar(runtime, { topbar });

export function attachTopbar(runtime, options = {}) {
  const title = options.title ?? 'ClassForge';
  const backLink = options.backLink ?? '/backstage/classforge/';
  const sections = options.sections ?? [];

  window.Topbar.init({ mode: 'presentation', title, backLink, sections });

  let priorSubtitleText = null;

  function computeSubtitle() {
    const meta = runtime.currentMeta;
    const label = (meta && meta.title) || (meta && meta.id) || 'Panel';
    const pos = (runtime.currentIndex + 1) + ' / ' + runtime.panelCount;
    return label + ' · ' + pos;
  }

  function refreshSubtitle() {
    const text = computeSubtitle();
    if (priorSubtitleText !== null) {
      // Menu mode is active -- keep the stored prior subtitle in sync so the
      // restore on setMenuMode(false) lands on the current panel, not a stale one.
      priorSubtitleText = text;
      return;
    }
    window.Topbar.setSubtitle(text);
  }

  function setMenuMode(active) {
    const tb = (typeof document !== 'undefined') ? document.querySelector('.bs-topbar') : null;
    if (active) {
      priorSubtitleText = computeSubtitle();
      window.Topbar.setSubtitle('Menu');
      if (tb) tb.classList.add('pn-menu-pinned');
    } else {
      if (priorSubtitleText !== null) {
        window.Topbar.setSubtitle(priorSubtitleText);
        priorSubtitleText = null;
      }
      if (tb) tb.classList.remove('pn-menu-pinned');
    }
  }

  // Kept as a no-op so any caller still wired up doesn't error. The "Fechar
  // menu" button was removed in P8 -- the hamburger toggle owns dismissal now.
  function registerCloseMenuButton(_onClick) { /* no-op */ }

  runtime.eventBus.addEventListener('panel-entered', refreshSubtitle);

  return { setMenuMode, registerCloseMenuButton };
}
