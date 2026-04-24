// engine/topbar-integration.js
//
// Shared helper that wires the Backstage Topbar to a Panels v2 runtime in
// presentation mode. Subscribes to `panel-entered` on `runtime.eventBus` and
// updates the Topbar subtitle with the active panel's title (or id) plus the
// 1-based position over total panel count.
//
// Dependencies (globals, loaded via classic <script> tags):
//   window.Topbar          (from /backstage/js/backstage-topbar.js)
//   window.ThemeManager    (from /backstage/js/theme-manager.js)
//   window.SettingsDrawer  (from /backstage/js/settings-drawer.js)
//
// The helper assumes these globals exist at call time. If any are missing the
// native TypeError surfaces to the caller; no custom fallback is provided.
//
// Example usage (inside a presentation's module script):
//
//   import { createRuntime, defaultLoadPanel } from '../../engine/runtime.js';
//   import { registry } from '../../engine/registry.js';
//   import { attachTopbar } from '../../engine/topbar-integration.js';
//
//   const runtime = createRuntime({ manifest: 'manifest.json', host, registry, loadPanel: defaultLoadPanel });
//   attachTopbar(runtime, { title: 'ClassForge', backLink: '/backstage/classforge/' });
//   runtime.start();

export function attachTopbar(runtime, options = {}) {
  const title = options.title ?? 'ClassForge';
  const backLink = options.backLink ?? '/backstage/classforge/';
  const sections = options.sections ?? [];

  window.Topbar.init({ mode: 'presentation', title, backLink, sections });

  runtime.eventBus.addEventListener('panel-entered', () => updateSubtitle(runtime));
}

function updateSubtitle(runtime) {
  const meta = runtime.currentMeta;
  const label = (meta && meta.title) || (meta && meta.id) || 'Panel';
  const pos = (runtime.currentIndex + 1) + ' / ' + runtime.panelCount;
  window.Topbar.setSubtitle(label + ' · ' + pos);
}
