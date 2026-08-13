// tests/roteiro-view.test.mjs
// track-46 fatia 1 — RED contract (by source) for the two-panel view + wiring.
// Source-based on purpose: the view is DOM code; we assert its shape, its injected-store
// seam, and its plug into the aula sub-tab without importing/executing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

test('roteiro-view.js exports mount and unmount', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.match(src, /export\s+function\s+mount\b|export\s*\{[^}]*\bmount\b/);
  assert.match(src, /export\s+function\s+unmount\b|export\s*\{[^}]*\bunmount\b/);
});

test('roteiro-view.js uses the INJECTED store, knows nothing about persistence', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.ok(!/localStorage/.test(src), 'the view must not reference localStorage');
  assert.ok(!/roteiro-store-stub/.test(src), 'the view must not import the stub (swappable seam in fatia 2)');
});

test('roteiro-view.js consumes the logic from roteiro-model.js', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.match(src, /from\s+['"]\.\.\/js\/roteiro-model\.js['"]/);
});

// Fatia 2.5: the `bs_debug` gate FELL in both places (Élder is the only admin and wants
// to use the thing; the gate only existed to keep it dormant while it was half-built).
// This flips the fatia 1 test: it used to require the gate, now it requires its absence.
test('the roteiro sub-tab is plugged into cohorts.js and is NO LONGER gated', () => {
  const src = readSrc('../cohorts/cohorts.js');
  assert.match(src, /data-aulatab=["']roteiro["']/, 'roteiro sub-tab button');
  assert.match(src, /roteiro-view\.js/, 'mounts the view in the aula pane');
  const railBlock = src.slice(Math.max(0, src.indexOf('data-aulatab="roteiro"') - 800),
    src.indexOf('data-aulatab="roteiro"') + 400);
  assert.ok(!/cdx-dev-only/.test(railBlock), 'the roteiro sub-tab no longer carries the dev-only marker');
});

test('the Cursos base editor also came out of the bs_debug gate', () => {
  const src = readSrc('../cohorts/courses.js');
  assert.match(src, /roteiro-view\.js/, 'Cursos reuses the SAME view');
  assert.ok(!/bs_debug/.test(src), 'no debug gate is left over in courses.js');
});

test('the sub-tab\'s i18n key exists in pt.js AND en.js', () => {
  const pt = readSrc('../i18n/pt.js');
  const en = readSrc('../i18n/en.js');
  assert.match(pt, /['"]cohorts\.aula_tab_roteiro['"]\s*:/);
  assert.match(en, /['"]cohorts\.aula_tab_roteiro['"]\s*:/);
});
