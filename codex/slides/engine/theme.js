'use strict';

// ============================================================
// slides/engine/theme.js — Codex-owned Panels theme manager.
// Moved from classforge/html-slides/theme.js. One concern: runtime theme
// switching for html-slides decks (the `--pn-*` brand vars). Loaded by a deck
// page as a regular script; exposes window.PanelsTheme. Separate from the Codex
// ThemeManager (which owns data-theme / theme.css for the admin shell).
//
// Assumed globals: none
// ============================================================

window.PanelsTheme = (function() {

  var _slug = '';

  var PRESETS = [
    {
      name: 'brand',
      label: 'Original',
      vars: null  // null = remove overrides, revert to stylesheet defaults
    },
    {
      name: 'light',
      label: 'Claro',
      vars: {
        '--pn-primary':  '#3b82f6',
        '--pn-bg':       '#f8fafc',
        '--pn-text':     '#1e293b',
        '--pn-accent':   '#f59e0b',
        '--pn-heading':  '#0f172a',
        '--pn-font':     "'Inter', system-ui, sans-serif"
      }
    },
    {
      name: 'ocean',
      label: 'Oceano',
      vars: {
        '--pn-primary':  '#0e7490',
        '--pn-bg':       '#0c1a2e',
        '--pn-text':     '#e0f2fe',
        '--pn-accent':   '#22d3ee',
        '--pn-heading':  '#ffffff',
        '--pn-font':     "'Inter', system-ui, sans-serif"
      }
    },
    {
      name: 'neutral',
      label: 'Neutro',
      vars: {
        '--pn-primary':  '#475569',
        '--pn-bg':       '#1e1e1e',
        '--pn-text':     '#d4d4d8',
        '--pn-accent':   '#a1a1aa',
        '--pn-heading':  '#fafafa',
        '--pn-font':     "'Inter', system-ui, sans-serif"
      }
    }
  ];

  function _storageKey() {
    return 'bs_pn_theme_' + _slug;
  }

  function apply(name) {
    var preset = null;
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].name === name) { preset = PRESETS[i]; break; }
    }
    if (!preset) return;

    var root = document.documentElement;

    if (!preset.vars) {
      // "brand" — remove inline overrides so stylesheet :root takes over
      var allVars = ['--pn-primary','--pn-bg','--pn-text','--pn-accent','--pn-heading','--pn-font'];
      for (var j = 0; j < allVars.length; j++) {
        root.style.removeProperty(allVars[j]);
      }
    } else {
      var keys = Object.keys(preset.vars);
      for (var k = 0; k < keys.length; k++) {
        root.style.setProperty(keys[k], preset.vars[keys[k]]);
      }
    }

    try {
      localStorage.setItem(_storageKey(), name);
    } catch (e) { /* private browsing */ }
  }

  function getPresets() {
    return PRESETS;
  }

  function getCurrent() {
    try {
      return localStorage.getItem(_storageKey()) || 'brand';
    } catch (e) { return 'brand'; }
  }

  function init(opts) {
    opts = opts || {};
    _slug = opts.slug || '';

    var saved = getCurrent();
    if (saved && saved !== 'brand') {
      apply(saved);
    }
  }

  function applyVars(varsObj) {
    var root = document.documentElement;
    var keys = Object.keys(varsObj);
    for (var i = 0; i < keys.length; i++) {
      root.style.setProperty(keys[i], varsObj[keys[i]]);
    }
  }

  return {
    init: init,
    apply: apply,
    applyVars: applyVars,
    getPresets: getPresets,
    getCurrent: getCurrent
  };

})();
