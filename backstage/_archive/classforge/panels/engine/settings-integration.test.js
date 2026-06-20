// engine/settings-integration.test.js
//
// Phase 2C: validates attachSettings builds the Panels v2 theme section,
// wires onThemeChange correctly, restores persisted theme via the runtime,
// and degrades to an empty array when ThemeRegistry is unavailable.
//
// Run: node Site/backstage/classforge/panels/engine/settings-integration.test.js

import { strict as assert } from 'node:assert';

// ── DOM + storage stubs ─────────────────────────────────────────────────

function makeStyle() {
  return { _props: {}, setProperty(k, v) { this._props[k] = v; } };
}

function makeLocalStorage() {
  return {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
}

function makeElement() {
  return { hidden: false, _attrs: {}, setAttribute(k, v) { this._attrs[k] = v; }, appendChild() {}, remove() {} };
}

function installEnv({ themes = {}, gridCalls = [], creatorCalls = [] } = {}) {
  globalThis.window = globalThis;
  globalThis.localStorage = makeLocalStorage();

  const gridEl = makeElement();
  const creatorEl = makeElement();
  globalThis.document = {
    _gridEl: gridEl,
    _creatorEl: creatorEl,
    documentElement: { style: makeStyle() },
    getElementById(id) {
      if (id === 'pn-theme-grid') return gridEl;
      if (id === 'pn-theme-creator') return creatorEl;
      return null;
    },
  };

  globalThis.window.ThemeRegistry = {
    FONT_LIST: [
      { name: 'Inter',     category: 'sans-serif' },
      { name: 'Roboto',    category: 'sans-serif' },
      { name: 'Fira Code', category: 'monospace' },
    ],
    getThemeByName(name) { return themes[name] || null; },
    renderThemeGrid(container, opts) { gridCalls.push({ container, opts }); },
    renderCreator(container, opts) { creatorCalls.push({ container, opts }); },
  };

  return { gridEl, creatorEl, gridCalls, creatorCalls };
}

function resetEnv() {
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
};
const BLACK = {
  colors:  { bg: '#191919', text: '#ffffff', heading: '#ffffff', accent: '#42affa' },
  fonts:   { heading: 'Inter', body: 'Inter', code: 'Fira Code' },
};

function makeRuntime() {
  const calls = [];
  return {
    setActiveTheme(id) { calls.push(id); },
    _calls: calls,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

// Test 1: returns array of length 1 (theme section only)
{
  installEnv({ themes: { 'IA Blue': IA_BLUE } });
  const { attachSettings } = await import('./settings-integration.js');
  const runtime = makeRuntime();
  const sections = attachSettings(runtime, { slug: 'foo' });
  assert.equal(Array.isArray(sections), true);
  assert.equal(sections.length, 1);
  console.log('PASS  test 1: attachSettings returns 1 section');
  resetEnv();
}

// Test 2: section has id=pn-theme and title=Tema
{
  installEnv({ themes: { 'IA Blue': IA_BLUE } });
  const { attachSettings } = await import('./settings-integration.js');
  const sections = attachSettings(makeRuntime(), { slug: 'foo' });
  assert.equal(sections[0].id, 'pn-theme');
  assert.equal(sections[0].title, 'Tema');
  console.log('PASS  test 2: section shape is pn-theme / Tema');
  resetEnv();
}

// Test 3: section.content contains grid + creator placeholders
{
  installEnv({ themes: { 'IA Blue': IA_BLUE } });
  const { attachSettings } = await import('./settings-integration.js');
  const sections = attachSettings(makeRuntime(), { slug: 'foo' });
  assert.match(sections[0].content, /id="pn-theme-grid"/);
  assert.match(sections[0].content, /id="pn-theme-creator"/);
  assert.match(sections[0].content, /cf-theme-grid/);
  console.log('PASS  test 3: content has grid + creator placeholders');
  resetEnv();
}

// Test 4: onOpen triggers ThemeRegistry.renderThemeGrid with onSelect/onEdit/onCreate
{
  const env = installEnv({ themes: { 'IA Blue': IA_BLUE } });
  const { attachSettings } = await import('./settings-integration.js');
  const sections = attachSettings(makeRuntime(), { slug: 'foo' });
  sections[0].onOpen();
  assert.equal(env.gridCalls.length, 1, 'renderThemeGrid called once');
  assert.equal(env.gridCalls[0].container, env.gridEl);
  assert.equal(typeof env.gridCalls[0].opts.onSelect, 'function');
  assert.equal(typeof env.gridCalls[0].opts.onEdit, 'function');
  assert.equal(typeof env.gridCalls[0].opts.onCreate, 'function');
  assert.equal(env.creatorEl.hidden, true, 'creator hidden after onOpen');
  console.log('PASS  test 4: onOpen wires renderThemeGrid');
  resetEnv();
}

// Test 5: with saved theme, attachSettings calls runtime.setActiveTheme once
{
  installEnv({ themes: { 'IA Blue': IA_BLUE, black: BLACK } });
  localStorage.setItem('bs_pn_theme_foo', 'black');
  const { attachSettings } = await import('./settings-integration.js');
  const runtime = makeRuntime();
  attachSettings(runtime, { slug: 'foo' });
  assert.deepEqual(runtime._calls, ['black'], 'setActiveTheme called once with restored name');
  assert.equal(document.documentElement.style._props['--pn-bg'], '#191919', 'tokens applied');
  console.log('PASS  test 5: persisted theme restored via setActiveTheme');
  resetEnv();
}

// Test 6: without saved theme, attachSettings does NOT call setActiveTheme
{
  installEnv({ themes: { 'IA Blue': IA_BLUE } });
  const { attachSettings } = await import('./settings-integration.js');
  const runtime = makeRuntime();
  attachSettings(runtime, { slug: 'fresh' });
  assert.deepEqual(runtime._calls, [], 'no setActiveTheme calls');
  assert.equal(Object.keys(document.documentElement.style._props).length, 0, 'no style writes');
  console.log('PASS  test 6: no restore when nothing is saved');
  resetEnv();
}

// Test 7: with ThemeRegistry undefined, returns [] and warns
{
  globalThis.window = globalThis;
  globalThis.document = { documentElement: { style: makeStyle() }, getElementById: () => null };
  globalThis.localStorage = makeLocalStorage();
  globalThis.window.ThemeRegistry = undefined;
  const { attachSettings } = await import('./settings-integration.js');
  let result;
  const warns = captureWarnings(() => {
    result = attachSettings(makeRuntime(), { slug: 'foo' });
  });
  assert.deepEqual(result, []);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /ThemeRegistry unavailable/);
  console.log('PASS  test 7: empty array + warning when ThemeRegistry missing');
  resetEnv();
}

// Test 8: default slug uses key bs_pn_theme_default
{
  installEnv({ themes: { 'IA Blue': IA_BLUE, black: BLACK } });
  localStorage.setItem('bs_pn_theme_default', 'black');
  const { attachSettings } = await import('./settings-integration.js');
  const runtime = makeRuntime();
  attachSettings(runtime, {});
  assert.deepEqual(runtime._calls, ['black'], 'default slug reads bs_pn_theme_default');
  console.log('PASS  test 8: default slug is "default"');
  resetEnv();
}

console.log('\nAll settings-integration tests passed.');
