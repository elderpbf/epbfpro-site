// codex/js/theme-manager.js — the Codex-owned theme manager. It is a CLASSIC
// script (the Trail pre-paints synchronously in <head>), so it can't be imported
// as an ES module; instead the source is evaluated in a sandbox with stubbed DOM,
// and window.ThemeManager is captured and exercised: initPublic resolution,
// applyTheme, toggleTheme, the toggle wiring, and the window seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(fileURLToPath(new URL('../js/theme-manager.js', import.meta.url)), 'utf8');

function makeEl() {
  const L = {};
  return {
    innerHTML: '', attrs: {}, style: { setProperty() {}, backgroundColor: '' },
    classList: { add() {}, remove() {} }, offsetHeight: 0,
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    addEventListener(t, fn) { (L[t] = L[t] || []).push(fn); },
    removeEventListener(t, fn) { L[t] = (L[t] || []).filter((f) => f !== fn); },
    dispatch(t, ev) { (L[t] || []).slice().forEach((fn) => fn(ev || {})); },
  };
}

// Evaluate the classic script in a sandbox; return the captured ThemeManager + the
// stub document/localStorage so tests can inspect side effects.
function load({ search = '', els = {} } = {}) {
  const docAttrs = {};
  const documentElement = {
    setAttribute(k, v) { docAttrs[k] = v; },
    getAttribute(k) { return k in docAttrs ? docAttrs[k] : null; },
  };
  const document = { documentElement, getElementById: (id) => els[id] || null };
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  const window = { location: { search }, ThemeManager: null };
  const getComputedStyle = () => ({ getPropertyValue: () => '#000' });
  const run = new Function('document', 'localStorage', 'window', 'getComputedStyle', 'setTimeout',
    src + '\n;return window.ThemeManager;');
  const TM = run(document, localStorage, window, getComputedStyle, (fn) => { fn(); return 0; });
  return { TM, docAttrs, store, window };
}

test('the module sets the window.ThemeManager seam with the full API', () => {
  const { TM } = load();
  assert.equal(typeof TM, 'object', 'window.ThemeManager set');
  for (const m of ['init', 'applyTheme', 'toggleTheme', 'initPublic']) {
    assert.equal(typeof TM[m], 'function', `exposes ${m}`);
  }
  assert.match(TM.SVG_SUN, /<svg/);
  assert.match(TM.SVG_MOON, /<svg/);
});

test('applyTheme sets data-theme and persists to the configured key', () => {
  const { TM, docAttrs, store } = load();
  TM.init({ storageKey: 'bs_theme' });
  TM.applyTheme('dark');
  assert.equal(docAttrs['data-theme'], 'dark');
  assert.equal(store.get('bs_theme'), 'dark');
  TM.applyTheme('light');
  assert.equal(docAttrs['data-theme'], 'light');
  assert.equal(store.get('bs_theme'), 'light');
});

test('toggleTheme flips the current theme', () => {
  const { TM, docAttrs } = load();
  TM.init({ storageKey: 'bs_theme' });
  TM.applyTheme('light');
  TM.toggleTheme();
  assert.equal(docAttrs['data-theme'], 'dark');
  TM.toggleTheme();
  assert.equal(docAttrs['data-theme'], 'light');
});

test('initPublic uses the default when nothing is stored or in the URL', () => {
  const { TM, docAttrs } = load({ search: '' });
  TM.initPublic({ storageKey: 'trilha_theme', defaultTheme: 'light' });
  assert.equal(docAttrs['data-theme'], 'light');
});

test('initPublic honors a valid ?theme= URL override', () => {
  const { TM, docAttrs } = load({ search: '?theme=dark' });
  TM.initPublic({ storageKey: 'trilha_theme', defaultTheme: 'light' });
  assert.equal(docAttrs['data-theme'], 'dark');
});

test('initPublic falls back to the stored value (no URL), ignores invalid URL', () => {
  // stored dark, no url -> dark
  const a = load({ search: '' });
  a.store.set('trilha_theme', 'dark');
  a.TM.initPublic({ storageKey: 'trilha_theme', defaultTheme: 'light' });
  assert.equal(a.docAttrs['data-theme'], 'dark', 'stored value used');
  // invalid url, stored light -> light (invalid ignored)
  const b = load({ search: '?theme=rainbow' });
  b.store.set('trilha_theme', 'light');
  b.TM.initPublic({ storageKey: 'trilha_theme', defaultTheme: 'dark' });
  assert.equal(b.docAttrs['data-theme'], 'light', 'invalid URL ignored, stored used');
});

test('init wires the toggle button and renders the icon', () => {
  const btn = makeEl();
  const icon = makeEl();
  const { TM, docAttrs } = load({ els: { themeToggle: btn, themeIcon: icon } });
  TM.init({ storageKey: 'bs_theme', toggleEl: btn, iconEl: icon });
  // No data-theme yet -> treated as light -> moon icon, aria-pressed false.
  assert.match(icon.innerHTML, /<svg/);
  assert.equal(btn.attrs['aria-pressed'], false);
  // Establish a known light state, then a click flips it to dark.
  TM.applyTheme('light');
  btn.dispatch('click', {});
  assert.equal(docAttrs['data-theme'], 'dark');
});
