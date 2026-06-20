// engine/probe-integration.js
//
// Opt-in helper that forwards Panels v2 runtime lifecycle events to the
// Backstage shared debug panel. Subscribes to `panel-entered`, `panel-exited`,
// and `navigation` on `runtime.eventBus` and pushes readable one-line strings
// to `window.bsProbe()`.
//
// Dependency (global, loaded via classic <script> tag):
//   window.bsProbe  (from /backstage/js/debug.js)
//
// The Backstage debug panel is gated by `localStorage.bs_debug === '1'`. When
// that flag is unset, debug.js still defines `bsProbe` but the panel stays
// hidden. When debug.js is not loaded at all (node tests, pages that choose
// not to include it), `attachProbe` no-ops instead of throwing.
//
// Example usage (inside a presentation's module script):
//
//   import { createRuntime, defaultLoadPanel } from '../../engine/runtime.js';
//   import { registry } from '../../engine/registry.js';
//   import { attachProbe } from '../../engine/probe-integration.js';
//
//   const runtime = createRuntime({ manifest: 'manifest.json', host, registry, loadPanel: defaultLoadPanel });
//   attachProbe(runtime);
//   runtime.start();

export function attachProbe(runtime) {
  if (typeof window === 'undefined' || typeof window.bsProbe !== 'function') {
    return;
  }

  runtime.eventBus.addEventListener('panel-entered', (e) => {
    const d = e.detail || {};
    window.bsProbe(`[panels] panel-entered id=${d.panelId} layout=${d.layout}`);
  });

  runtime.eventBus.addEventListener('panel-exited', (e) => {
    const d = e.detail || {};
    window.bsProbe(`[panels] panel-exited id=${d.panelId}`);
  });

  runtime.eventBus.addEventListener('navigation', (e) => {
    const d = e.detail || {};
    window.bsProbe(`[panels] navigation from=${d.from} to=${d.to} direction=${d.direction}`);
  });
}
