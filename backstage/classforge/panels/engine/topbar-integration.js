// engine/topbar-integration.js
//
// Shared helper that wires the Backstage Topbar to a Panels v2 runtime in
// presentation mode. Subscribes to `panel-entered` on `runtime.eventBus` and
// updates the Topbar subtitle with the active panel's title (or id) plus the
// 1-based position over total panel count.
//
// Returns a handle so callers (notably attachSidebar) can swap the topbar
// into "menu mode" -- subtitle becomes "Menu" and a "Fechar menu" button
// appears in the topbar action area, replacing the previous in-body X close.
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

  let closeMenuBtn = null;
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
    if (active) {
      priorSubtitleText = computeSubtitle();
      window.Topbar.setSubtitle('Menu');
      if (closeMenuBtn) closeMenuBtn.style.display = '';
    } else {
      if (closeMenuBtn) closeMenuBtn.style.display = 'none';
      if (priorSubtitleText !== null) {
        window.Topbar.setSubtitle(priorSubtitleText);
        priorSubtitleText = null;
      }
    }
  }

  function registerCloseMenuButton(onClick) {
    if (closeMenuBtn) return;
    if (typeof window.Topbar.addItem !== 'function') return;
    closeMenuBtn = window.Topbar.addItem({
      id: 'pn-close-menu',
      label: 'Fechar menu',
      onClick,
    });
    if (closeMenuBtn) closeMenuBtn.style.display = 'none';
  }

  runtime.eventBus.addEventListener('panel-entered', refreshSubtitle);

  return { setMenuMode, registerCloseMenuButton };
}
