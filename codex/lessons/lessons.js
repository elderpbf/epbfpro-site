// lessons/lessons.js
// Codex Lessons (Aula) tab. Strangler wrapper: the real ClassVault UI is reused
// verbatim via the de-booted window.AulaEngine global (aula-engine.js) + the
// linked classvault.css, the same deferred-global pattern as the Labs/Drive
// sub-tabs. The cdx- contract is waived for this tab (the engine renders the
// legacy cv- markup). Editing/presets/focus parity ride along with the engine.
//
// Aula's whole layout (full-window, immersive, focus mode) hangs off the
// `bs-app--classvault` class on #screen-app, which the standalone page sets in
// its markup. Codex's container is plain `bs-app`, so the wrapper adds that
// class on mount (and the height-chain bridge lives in lessons.css) and removes
// it on unmount so the other Codex tabs keep their normal layout.
//
// Globals (loaded before the module boot): window.AulaEngine (aula-engine.js)
import { t } from '../js/i18n.js';

const APP_CLASS = 'bs-app--classvault';
// Focus-mode body classes globally hide the shared .bs-topbar; strip them on
// unmount so leaving Lessons in focus mode does not blank other tabs' chrome.
const FOCUS_BODY_CLASSES = ['cv-focus', 'cv-focus--side', 'cv-focus--top'];

export function mount(viewEl) {
  const app = document.getElementById('screen-app');
  if (app) app.classList.add(APP_CLASS);
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
  const app = document.getElementById('screen-app');
  if (app) app.classList.remove(APP_CLASS);
  document.body.classList.remove(FOCUS_BODY_CLASSES[0], FOCUS_BODY_CLASSES[1], FOCUS_BODY_CLASSES[2]);
}
