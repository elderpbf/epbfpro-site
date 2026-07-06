// Contract test for the shared left-panel rail (js/list-rail.js). Full contract:
// manifest/architecture/list-rail.md. Source-regex + one import smoke, the house style
// (no DOM in node --test). The grip + Pointer Events decision (Élder 2026-07-05) is the
// load-bearing part, so it is asserted explicitly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('list-rail exports mountRail', async () => {
  const mod = await import('../js/list-rail.js');
  assert.equal(typeof mod.mountRail, 'function');
});

test('list-rail: reorder uses Pointer Events (mobile-capable), never HTML5 DnD', () => {
  const src = read('js/list-rail.js');
  assert.match(src, /pointerdown/, 'binds pointerdown');
  assert.match(src, /pointermove/, 'binds pointermove');
  assert.match(src, /pointerup/, 'binds pointerup');
  assert.ok(!/addEventListener\(\s*['"]dragstart['"]/.test(src), 'no HTML5 dragstart (would be desktop-only)');
});

test('list-rail: only the grip starts a drag, and reorder can be gated', () => {
  const src = read('js/list-rail.js');
  assert.match(src, /closest\('\.cdx-rail-grip'\)/, 'drag starts only from the grip handle');
  assert.match(src, /reorder\.gated/, 'reorder.gated flag supported');
});

test('list-rail CSS: only the body scrolls (head/foot fixed) + grip is touch-draggable', () => {
  const css = read('css/list-rail.css');
  assert.match(css, /\.cdx-rail-body[^}]*overflow-y:\s*auto/, 'body scrolls');
  assert.match(css, /\.cdx-rail-head[^}]*flex-shrink:\s*0/, 'head is fixed');
  assert.match(css, /\.cdx-rail-grip[^}]*touch-action:\s*none/, 'grip has touch-action:none (pointer drag on touch)');
  assert.match(css, /@media \(max-width:700px\)/, 'has a mobile rule (grip stays visible)');
});

test('list-rail is consumed by a real tab (cursos) — not an orphan module', () => {
  assert.match(read('cohorts/courses.js'), /import \{ mountRail \} from '\.\.\/js\/list-rail\.js'/, 'cursos adopts the rail');
});
