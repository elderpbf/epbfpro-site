// codex/js/text-tone.js
// Dark-mode light-text tone: the single grey used for primary text AND for
// text-on-accent (the old #fff spots) in dark mode. Drives the CSS variable
// --cdx-text-dark, which css/theme.css reads for --text-primary and
// --text-on-accent (default #e5e7eb, byte-identical to the prior hardcoded
// value, so nothing changes until a tone is picked). Light mode is unaffected.
//
// Admin tuning surface: surfaced as a Settings-drawer control in Codex only
// (the public Trail has no drawer, so it always renders the default tone).
// Persist/apply mechanics come from the shared js/css-var-pref.js factory.

'use strict';

import { createCssVarPref } from './css-var-pref.js';

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

const _pref = createCssVarPref({ storageKey: TONE_KEY, cssVar: '--cdx-text-dark', defaultValue: DEFAULT_TONE });

export const getTone = _pref.get;
export const setTone = _pref.set;
export const init = _pref.init;
