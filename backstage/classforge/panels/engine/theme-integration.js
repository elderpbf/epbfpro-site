// engine/theme-integration.js
//
// Maps a Backstage theme-registry theme to the seven content-relevant Panels v2
// tokens and writes inline overrides on `document.documentElement.style`.
// Panel body only: the portal taskbar theme is independent and goes through
// `window.ThemeManager` with its own storage key `bs_theme`. Per-slug panel-theme
// persistence uses localStorage key `bs_pn_theme_<slug>`.
//
// Dependency (global, loaded via classic <script>):
//   window.ThemeRegistry (from /backstage/js/theme-registry.js)
//
// Engine-only tokens (surface, shape, effect, motion) stay at tokens.css
// defaults; themes cannot override them in Phase 2.
//
// Example usage (inside a presentation module script):
//
//   import { applyTheme, restorePersistedTheme } from '../../engine/theme-integration.js';
//   restorePersistedTheme('smoke-test');           // on attach, before start
//   applyTheme('black', { slug: 'smoke-test' });   // on user theme selection

function fontFamily(name) {
  const list = (typeof window !== 'undefined' && window.ThemeRegistry && window.ThemeRegistry.FONT_LIST) || [];
  for (const f of list) {
    if (f.name === name) return `'${name}', ${f.category}`;
  }
  return `'${name}', sans-serif`;
}

export function themeToPanelsV2Vars(theme) {
  const c = (theme && theme.colors) || {};
  const f = (theme && theme.fonts) || {};
  return {
    '--pn-bg':           c.bg || '#ffffff',
    '--pn-text':         c.text || '#333333',
    '--pn-heading':      c.heading || '#5271FE',
    '--pn-accent':       c.accent || '#5271FE',
    '--pn-font-body':    fontFamily(f.body || 'Roboto'),
    '--pn-font-heading': fontFamily(f.heading || 'Roboto'),
    '--pn-font-mono':    fontFamily(f.code || 'Fira Code'),
  };
}

export function applyTheme(themeName, options = {}) {
  const slug = options.slug;
  if (typeof window === 'undefined' || !window.ThemeRegistry || typeof window.ThemeRegistry.getThemeByName !== 'function') {
    console.warn('[panels-theme-integration] ThemeRegistry unavailable; noop');
    return;
  }
  const theme = window.ThemeRegistry.getThemeByName(themeName);
  if (!theme) {
    console.warn('[panels-theme-integration] unknown theme: ' + themeName);
    return;
  }
  const vars = themeToPanelsV2Vars(theme);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  if (slug) {
    try { localStorage.setItem('bs_pn_theme_' + slug, themeName); } catch (_) {}
  }
}

export function restorePersistedTheme(slug) {
  if (!slug || typeof localStorage === 'undefined') return null;
  let saved = null;
  try { saved = localStorage.getItem('bs_pn_theme_' + slug); } catch (_) {}
  if (saved) applyTheme(saved, { slug });
  return saved;
}
