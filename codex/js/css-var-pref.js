// codex/js/css-var-pref.js
// Factory for a "pick a value, persist it, apply it as a CSS variable on <html>"
// preference. Shared by the dark-mode text-tone and teal-tone settings pickers
// (js/text-tone.js, js/teal-tone.js) so the persist/apply logic lives once.
//
// At the default value the override is REMOVED, so the stylesheet's own fallback
// wins — keeps the var clean and avoids a default-state flash. Any caught storage
// error still reaches the debug pill (Codex rule), never swallowed.

'use strict';

export function createCssVarPref({ storageKey, cssVar, defaultValue }) {
  function _log(msg) { try { if (window.bsLog) window.bsLog(msg, 'error'); } catch (_) {} }

  function get() {
    try { return localStorage.getItem(storageKey) || defaultValue; }
    catch (e) { _log('css-var-pref ' + storageKey + ': leitura falhou — ' + e); return defaultValue; }
  }

  function apply(value) {
    const v = value || defaultValue;
    if (v === defaultValue) document.documentElement.style.removeProperty(cssVar);
    else document.documentElement.style.setProperty(cssVar, v);
  }

  function set(value) {
    try { localStorage.setItem(storageKey, value); }
    catch (e) { _log('css-var-pref ' + storageKey + ': gravação falhou — ' + e); }
    apply(value);
  }

  function init() { apply(get()); }

  return { get, set, apply, init, storageKey, defaultValue };
}
