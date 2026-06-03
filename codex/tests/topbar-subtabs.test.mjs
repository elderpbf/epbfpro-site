// topbar-subtabs.test.mjs — 5c: the Codex topbar sub-tabs, two display modes
// (hover pill / persistent bar) selected by a persisted global pref, positioned
// by the lifted js/anchored.js. Pure logic + source-contract guards; the
// hover/DOM behaviour is staging-verified (matches the project test philosophy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { anchorLeft, placePill } from '../js/anchored.js';
import { resolveSubtabMode } from '../js/codex-topbar.js';

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
