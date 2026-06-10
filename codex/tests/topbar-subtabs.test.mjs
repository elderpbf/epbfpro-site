// topbar-subtabs.test.mjs — 5c: the Codex topbar sub-tabs, two display modes
// (hover pill / persistent bar) selected by a persisted global pref, positioned
// by the lifted js/anchored.js. Pure logic + source-contract guards; the
// hover/DOM behaviour is staging-verified (matches the project test philosophy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { anchorLeft, placePill } from '../js/anchored.js';
import { resolveSubtabMode, pruneInactiveHighlights, botNavItems, TABS } from '../js/codex-topbar.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/* ---------- lifted positioner ---------- */
test('codex/js/anchored.js was lifted with the positioner contract', () => {
  assert.equal(typeof anchorLeft, 'function', 'exports anchorLeft');
  assert.equal(typeof placePill, 'function', 'exports placePill');
  assert.equal(anchorLeft({ containerW: 1000, contentW: 200, anchorCenter: 500, mode: 'under' }), 400);
  assert.equal(anchorLeft({ containerW: 1000, contentW: 200, mode: 'center' }), 400);
  assert.equal(anchorLeft({ containerW: 1000, contentW: 200, anchorCenter: 50, mode: 'under', pad: 8 }), 8);
  assert.equal(anchorLeft({ containerW: 100, contentW: 200, mode: 'center', pad: 8 }), 8);
});

/* ---------- subtab-mode pref (default pill, bar opt-in) ---------- */
test('resolveSubtabMode defaults to pill and honours a stored bar', () => {
  assert.equal(resolveSubtabMode(null), 'pill');
  assert.equal(resolveSubtabMode(undefined), 'pill');
  assert.equal(resolveSubtabMode('pill'), 'pill');
  assert.equal(resolveSubtabMode('bar'), 'bar');
  assert.equal(resolveSubtabMode('whatever'), 'pill', 'unknown -> pill');
});

/* ---------- source contract ---------- */
test('codex-topbar wires the lifted positioner, the mode pref, the chrome, and the settings toggle', () => {
  const src = read('../js/codex-topbar.js');
  assert.match(src, /from ['"]\.\/anchored\.js['"]/, 'imports the lifted codex/js/anchored.js');
  assert.match(src, /codex_subtab_mode/, 'reads/writes the persisted subtab-mode pref');
  assert.match(src, /cdx-subpill/, 'renders the hover-pill chrome');
  assert.match(src, /cdx-subrow|cdx-substrip/, 'renders the persistent-bar chrome');
  assert.match(src, /sd-subtab-mode/, 'offers the pill/bar toggle in the settings drawer');
  assert.ok(!/bs-topbar-subrow/.test(src), 'the legacy left-aligned subrow is gone');
});

test('only the active tab keeps a highlighted sub-tab; previews of other tabs show none', () => {
  // A non-active tab's subtabs() resolved an undefined sub to its first entry,
  // so its first item arrives active:true. Pruning must clear it.
  const map = {
    content:   [{ label: 'Items', active: true }, { label: 'Apostila', active: false }],
    questions: [{ label: 'Bank', active: true },  { label: 'Live', active: false }],
  };
  const out = pruneInactiveHighlights(map, 'content');
  assert.equal(out, map, 'returns the same map (mutates in place)');
  assert.deepEqual(map.content.map((s) => s.active), [true, false], 'active tab keeps its current-page highlight');
  assert.deepEqual(map.questions.map((s) => s.active), [false, false], 'previewed (non-active) tab shows no highlight');
  // tolerates an empty/missing map without throwing
  assert.doesNotThrow(() => pruneInactiveHighlights(undefined, 'content'));
  assert.doesNotThrow(() => pruneInactiveHighlights({ lessons: undefined }, 'content'));
});

/* ---------- mobile bottom nav (advradar-style) + mobile sub-strip ---------- */
test('botNavItems returns the four functional tabs in order, only active flagged', () => {
  const items = botNavItems('questions');
  assert.deepEqual(items.map((i) => i.key), ['lessons', 'content', 'cohorts', 'questions'], 'same order as TABS');
  assert.deepEqual(items.map((i) => i.active), [false, false, false, true], 'only the active tab is flagged');
  assert.equal(items.length, TABS.length, 'one item per functional tab');
  assert.ok(items.every((i) => i.href && i.glyph && i.labelKey), 'each item carries href + glyph + labelKey');
  assert.ok(botNavItems('nope').every((i) => !i.active), 'unknown active -> none flagged');
});

test('codex-topbar renders the mobile bottom nav + a mobile sub-strip', () => {
  const src = read('../js/codex-topbar.js');
  assert.match(src, /botNavItems\s*\(/, 'init builds the bottom nav from botNavItems');
  assert.match(src, /cdx-botnav/, 'renders the bottom nav element');
  assert.match(src, /cdx-botnav-item/, 'renders a bottom-nav item per tab');
  assert.match(src, /cdx-subrow--mobile/, 'renders the mobile scrollable sub-strip');
  assert.ok(!/onclick\s*=/.test(src), 'no inline onclick');
});

test('codex.css gives the bottom nav + sub-strip a mobile-only layer', () => {
  const css = read('../css/codex.css');
  assert.match(css, /\.cdx-botnav\b/, 'styles the bottom nav');
  assert.match(css, /\.cdx-botnav-item\b/, 'styles the bottom-nav items');
  assert.match(css, /\.cdx-subrow--mobile\b/, 'styles the mobile sub-strip');
  assert.match(css, /@media\s*\(\s*max-width/, 'has a mobile max-width media query');
  assert.match(css, /\.cdx-tabs\s*\{[^}]*display:\s*none/, 'hides the top tab strip on mobile');
});

/* ---------- mobile hamburger drawer (sidebars off-canvas) ---------- */
test('codex-topbar renders the mobile hamburger + shared drawer mechanism', () => {
  const src = read('../js/codex-topbar.js');
  assert.match(src, /cdx-hamburger/, 'renders the hamburger button');
  assert.match(src, /cdx-drawer-backdrop/, 'creates the drawer backdrop');
  assert.match(src, /cdx-bank-sets/, 'drawer toggle targets the Banco sidebar');
  assert.match(src, /cdx-items-list/, 'drawer toggle targets the Content list');
  assert.match(src, /cdx-lessons-sidebar/, 'drawer toggle targets the Lessons sidebar');
  assert.match(src, /is-open/, 'toggles an is-open state');
  assert.ok(!/onclick\s*=/.test(src), 'no inline onclick');
});

test('codex.css gives the hamburger drawer a mobile-only layer', () => {
  const css = read('../css/codex.css');
  assert.match(css, /\.cdx-hamburger\b/, 'styles the hamburger');
  assert.match(css, /\.cdx-drawer-backdrop\b/, 'styles the drawer backdrop');
  assert.match(css, /transform:\s*translateX\(-100%\)/, 'sidebar drawer is off-canvas by default');
  assert.match(css, /\.is-open/, 'has an is-open reveal state');
  assert.match(css, /\.cdx-bank\s*\{[^}]*grid-template-columns:\s*1fr/, 'Banco grid collapses to one column on mobile');
});

test('pill mode reveals ANY tab\'s sub-tabs on hover (per-tab map = one-less-click)', () => {
  const src = read('../js/codex-topbar.js');
  assert.match(src, /subTabsByTab/, 'topbar consumes a per-tab sub-tab map');
  assert.match(src, /querySelectorAll\(\s*['"]\.cdx-tab['"]\s*\)/, 'pill hover binds to EVERY main tab');
  assert.match(src, /dataset\.tab/, 'each tab carries its key for the per-tab lookup');
  const idx = read('../index.html');
  assert.match(idx, /subTabsByTab/, 'index.html builds + passes the per-tab map');
  assert.match(idx, /\.subtabs\(/, "index.html calls each tab module's subtabs registry");
});
