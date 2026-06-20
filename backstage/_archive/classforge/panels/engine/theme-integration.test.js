// engine/theme-integration.test.js
//
// Phase 2C: validates themeToPanelsV2Vars mapping, applyTheme DOM writes +
// persistence, restorePersistedTheme read path, and graceful no-ops when
// dependencies are missing.
//
// Run: node Site/backstage/classforge/panels/engine/theme-integration.test.js

import { strict as assert } from 'node:assert';

// ── DOM + storage stubs ─────────────────────────────────────────────────

function makeStyle() {
  return {
    _props: {},
    setProperty(k, v) { this._props[k] = v; },
  };
}

function makeLocalStorage() {
  return {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
}

function installWindow(themes) {
  globalThis.window = globalThis;
  globalThis.document = { documentElement: { style: makeStyle() } };
  globalThis.localStorage = makeLocalStorage();
  globalThis.window.ThemeRegistry = {
    FONT_LIST: [
      { name: 'Inter',     category: 'sans-serif' },
      { name: 'Roboto',    category: 'sans-serif' },
      { name: 'Fira Code', category: 'monospace' },
    ],
    getThemeByName(name) { return themes[name] || null; },
  };
}

function resetWindow() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
}

function captureWarnings(fn) {
  const warns = [];
  const orig = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try { fn(warns); } finally { console.warn = orig; }
  return warns;
}

const IA_BLUE = {
  colors:  { bg: '#ffffff', text: '#333333', heading: '#5271FE', accent: '#5271FE' },
  fonts:   { heading: 'Roboto', body: 'Roboto', code: 'Fira Code' },
  sizes:   { scale: 'normal' },
};
const BLACK = {
  colors:  { bg: '#191919', text: '#ffffff', heading: '#ffffff', accent: '#42affa' },
  fonts:   { heading: 'Inter', body: 'Inter', code: 'Fira Code' },
  sizes:   { scale: 'normal' },
};

// ── Tests ───────────────────────────────────────────────────────────────

// Test 1: themeToPanelsV2Vars maps IA Blue to the 7 expected tokens
{
  installWindow({ 'IA Blue': IA_BLUE });
  const { themeToPanelsV2Vars } = await import('./theme-integration.js');
  const vars = themeToPanelsV2Vars(IA_BLUE);
  assert.equal(Object.keys(vars).length, 7, 'exactly 7 tokens emitted');
  assert.equal(vars['--pn-bg'], '#ffffff');
  assert.equal(vars['--pn-text'], '#333333');
  assert.equal(vars['--pn-heading'], '#5271FE');
  assert.equal(vars['--pn-accent'], '#5271FE');
  assert.equal(vars['--pn-font-body'], "'Roboto', sans-serif");
  assert.equal(vars['--pn-font-heading'], "'Roboto', sans-serif");
  assert.equal(vars['--pn-font-mono'], "'Fira Code', monospace");
  console.log('PASS  test 1: themeToPanelsV2Vars maps IA Blue');
  resetWindow();
}

// Test 2: themeToPanelsV2Vars maps black theme (Inter body)
{
  installWindow({ black: BLACK });
  const { themeToPanelsV2Vars } = await import('./theme-integration.js');
  const vars = themeToPanelsV2Vars(BLACK);
  assert.equal(vars['--pn-bg'], '#191919');
  assert.equal(vars['--pn-text'], '#ffffff');
  assert.equal(vars['--pn-font-body'], "'Inter', sans-serif");
  assert.equal(vars['--pn-font-mono'], "'Fira Code', monospace");
  console.log('PASS  test 2: themeToPanelsV2Vars maps black theme');
  resetWindow();
}

// Test 3: themeToPanelsV2Vars falls back to IA Blue defaults for empty theme
{
  installWindow({});
  const { themeToPanelsV2Vars } = await import('./theme-integration.js');
  const vars = themeToPanelsV2Vars({});
  assert.equal(vars['--pn-bg'], '#ffffff');
  assert.equal(vars['--pn-text'], '#333333');
  assert.equal(vars['--pn-heading'], '#5271FE');
  assert.equal(vars['--pn-accent'], '#5271FE');
  console.log('PASS  test 3: themeToPanelsV2Vars falls back to defaults');
  resetWindow();
}

// Test 4: applyTheme writes 7 style props and persists per-slug
{
  installWindow({ 'IA Blue': IA_BLUE });
  const { applyTheme } = await import('./theme-integration.js');
  applyTheme('IA Blue', { slug: 'smoke-test' });
  const props = document.documentElement.style._props;
  assert.equal(Object.keys(props).length, 7, 'exactly 7 props written');
  assert.equal(props['--pn-bg'], '#ffffff');
  assert.equal(props['--pn-heading'], '#5271FE');
  assert.equal(props['--pn-font-mono'], "'Fira Code', monospace");
  assert.equal(localStorage.getItem('bs_pn_theme_smoke-test'), 'IA Blue');
  console.log('PASS  test 4: applyTheme writes props and persists');
  resetWindow();
}

// Test 5: applyTheme switches the persisted theme name on subsequent calls
{
  installWindow({ 'IA Blue': IA_BLUE, black: BLACK });
  const { applyTheme } = await import('./theme-integration.js');
  applyTheme('IA Blue', { slug: 'smoke-test' });
  applyTheme('black',   { slug: 'smoke-test' });
  const props = document.documentElement.style._props;
  assert.equal(props['--pn-bg'], '#191919', 'bg overridden by black theme');
  assert.equal(props['--pn-font-body'], "'Inter', sans-serif", 'font overridden');
  assert.equal(localStorage.getItem('bs_pn_theme_smoke-test'), 'black', 'persistence replaced');
  console.log('PASS  test 5: applyTheme overrides on subsequent calls');
  resetWindow();
}

// Test 6: applyTheme warns and does not persist for unknown theme
{
  installWindow({ 'IA Blue': IA_BLUE });
  const { applyTheme } = await import('./theme-integration.js');
  const warns = captureWarnings(() => {
    applyTheme('nonexistent', { slug: 'smoke-test' });
  });
  const props = document.documentElement.style._props;
  assert.equal(Object.keys(props).length, 0, 'no style props written');
  assert.equal(localStorage.getItem('bs_pn_theme_smoke-test'), null, 'not persisted');
  assert.equal(warns.length, 1, 'one warning emitted');
  assert.match(warns[0], /unknown theme: nonexistent/);
  console.log('PASS  test 6: applyTheme warns on unknown theme');
  resetWindow();
}

// Test 7: applyTheme no-ops when ThemeRegistry is unavailable
{
  globalThis.window = globalThis;
  globalThis.document = { documentElement: { style: makeStyle() } };
  globalThis.localStorage = makeLocalStorage();
  globalThis.window.ThemeRegistry = undefined;
  const { applyTheme } = await import('./theme-integration.js');
  const warns = captureWarnings(() => {
    applyTheme('IA Blue', { slug: 'smoke-test' });
  });
  assert.equal(Object.keys(document.documentElement.style._props).length, 0);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /ThemeRegistry unavailable/);
  console.log('PASS  test 7: applyTheme no-ops without ThemeRegistry');
  resetWindow();
}

// Test 8: restorePersistedTheme applies the saved theme and returns its name
{
  installWindow({ 'IA Blue': IA_BLUE, black: BLACK });
  localStorage.setItem('bs_pn_theme_smoke-test', 'black');
  const { restorePersistedTheme } = await import('./theme-integration.js');
  const name = restorePersistedTheme('smoke-test');
  assert.equal(name, 'black');
  assert.equal(document.documentElement.style._props['--pn-bg'], '#191919');
  console.log('PASS  test 8: restorePersistedTheme applies saved theme');
  resetWindow();
}

// Test 9: restorePersistedTheme returns null when nothing is saved
{
  installWindow({ 'IA Blue': IA_BLUE });
  const { restorePersistedTheme } = await import('./theme-integration.js');
  const name = restorePersistedTheme('fresh-slug');
  assert.equal(name, null);
  assert.equal(Object.keys(document.documentElement.style._props).length, 0);
  console.log('PASS  test 9: restorePersistedTheme returns null when empty');
  resetWindow();
}

console.log('\nAll theme-integration tests passed.');
