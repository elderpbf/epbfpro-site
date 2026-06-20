// codex/js/teal-tone.js
// Dark-mode teal tone: how deep the brand turquoise is in dark mode. Drives the
// CSS variable --cdx-teal-dark, which css/theme.css reads for --primary and
// css/tokens.css for --cdx-btn-primary-bg (default #0d9488 = the shipped dark
// teal). So picking a tone moves the solid teal everywhere — button fills,
// accents, active underlines/borders — at once. Light mode is unaffected.
//
// Admin tuning surface (Codex settings drawer only). Persist/apply mechanics
// come from the shared js/css-var-pref.js factory. The translucent card/chip
// tints stay on their own (subtle, literal rgba); this drives the solid teal.

'use strict';

import { createCssVarPref } from './css-var-pref.js';

export const TEAL_KEY = 'cdx_teal_tone';
export const DEFAULT_TEAL = '#0d9488';

// Current (lightest) first, then progressively darker.
export const TEAL_OPTIONS = [
  { value: '#0d9488', label: 'Atual (mais claro)' },
  { value: '#0b8278', label: 'Escuro' },
  { value: '#0a6f66', label: 'Mais escuro' },
  { value: '#085c54', label: 'Bem escuro' },
];

const _pref = createCssVarPref({ storageKey: TEAL_KEY, cssVar: '--cdx-teal-dark', defaultValue: DEFAULT_TEAL });

export const getTeal = _pref.get;
export const setTeal = _pref.set;
export const init = _pref.init;
