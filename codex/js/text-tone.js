// codex/js/text-tone.js
// Dark-mode light-text tone: the single grey used for primary text AND for
// text-on-accent (the old #fff spots) in dark mode. Drives the CSS variable
// --cdx-text-dark, which css/theme.css reads for --text-primary and
// --text-on-accent (default #e5e7eb, byte-identical to the prior hardcoded
// value, so nothing changes until a tone is picked). Light mode is unaffected.
//
// Admin tuning surface: surfaced as a Settings-drawer section in Codex only
// (the public Trail has no drawer, so it always renders the default tone).
// Choice persists in localStorage and is applied to <html> on load.

'use strict';

export const TONE_KEY = 'cdx_text_tone';
export const DEFAULT_TONE = '#e5e7eb';

// White -> progressively greyer; this array IS the picker's display order.
export const TONE_OPTIONS = [
  { value: '#ffffff', label: 'Branco puro' },
  { value: '#eef2f1', label: 'Quase branco' },
  { value: '#e5e7eb', label: 'Padrão' },
  { value: '#d8efe9', label: 'Tom teal' },
  { value: '#d1d5db', label: 'Cinza' },
  { value: '#c2cdd6', label: 'Cinza fechado' },
];

// Any caught error still reaches the debug pill (Codex rule), never swallowed.
function _log(msg) {
  try { if (window.bsLog) window.bsLog(msg, 'error'); } catch (_) {}
}

export function getTone() {
  try {
    return localStorage.getItem(TONE_KEY) || DEFAULT_TONE;
  } catch (e) {
    _log('text-tone: leitura do localStorage falhou — ' + e);
    return DEFAULT_TONE;
  }
}

export function applyTone(value) {
  const v = value || DEFAULT_TONE;
  // At the default we REMOVE the override so theme.css keeps its own #e5e7eb
  // fallback — keeps the var clean and avoids any default-state flash.
  if (v === DEFAULT_TONE) document.documentElement.style.removeProperty('--cdx-text-dark');
  else document.documentElement.style.setProperty('--cdx-text-dark', v);
}

export function setTone(value) {
  try { localStorage.setItem(TONE_KEY, value); }
  catch (e) { _log('text-tone: gravação no localStorage falhou — ' + e); }
  applyTone(value);
}

// Apply the stored choice on load. Call early (the topbar bootstrap does).
export function init() { applyTone(getTone()); }
