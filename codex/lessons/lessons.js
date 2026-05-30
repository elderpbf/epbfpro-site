// lessons/lessons.js
// Codex Lessons (Aula) tab. Strangler wrapper: the real ClassVault UI is reused
// verbatim via the de-booted window.AulaEngine global (aula-engine.js) + the
// linked classvault.css, the same deferred-global pattern as the Labs/Drive
// sub-tabs. The cdx- contract is waived for this tab (the engine renders the
// legacy cv- markup). Editing/presets/focus parity ride along with the engine.
//
// Globals (loaded before the module boot): window.AulaEngine (aula-engine.js)
import { t } from '../js/i18n.js';

export function mount(viewEl) {
  viewEl.innerHTML = '<div class="cdx-lessons-aula"></div>';
  const host = viewEl.querySelector('.cdx-lessons-aula');
  if (window.AulaEngine && typeof window.AulaEngine.mount === 'function') {
    window.AulaEngine.mount(host);
  } else {
    host.innerHTML = '<div class="cdx-empty">' + t('lessons.error_items') + '</div>';
  }
}
export function unmount() {
  if (window.AulaEngine && typeof window.AulaEngine.unmount === 'function') {
    try { window.AulaEngine.unmount(); } catch (_) { /* ignore */ }
  }
}
