// Presets sub-module: exports the tab contract (mount/unmount) and a pure,
// tested picker-grouping rule. Importing the module must NOT touch the DOM or
// window globals at top level (only inside mount/handlers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const presets = await import('../content/presets.js');
const src = fs.readFileSync(fileURLToPath(new URL('../content/presets.js', import.meta.url)), 'utf8');

test('presets module satisfies the tab contract', () => {
  assert.equal(typeof presets.mount, 'function', 'exports mount(viewEl, ctx)');
  assert.equal(typeof presets.unmount, 'function', 'exports unmount()');
});

test('groupPickerItems places each item in its first matching group', () => {
  assert.equal(typeof presets.groupPickerItems, 'function', 'exports groupPickerItems');
  const input = [
    { id: 1, type: 'prompt', set_id: 9 },  // apostila (set_id wins over type)
    { id: 2, type: 'tarefa' },             // tarefa
    { id: 3, type: 'llm' },                // llm
    { id: 4, type: 'popup_url' },          // external
    { id: 'lab:demo', type: 'lab' },       // lab
    { id: 5, type: 'drive_file' },         // drive
    { id: 6, type: 'prompt' },             // outros
  ];
  const groups = presets.groupPickerItems(input);
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g.items.map((i) => i.id)]));
  assert.deepEqual(byKey.apostila, [1], 'set_id -> apostila');
  assert.deepEqual(byKey.tarefa, [2], 'type tarefa -> tarefa');
  assert.deepEqual(byKey.llm, [3], 'type llm -> llm');
  assert.deepEqual(byKey.external, [4], 'popup_url -> external');
  assert.deepEqual(byKey.lab, ['lab:demo'], 'lab -> lab');
  assert.deepEqual(byKey.drive, [5], 'drive_file -> drive');
  assert.deepEqual(byKey.outros, [6], 'fallback -> outros');
});

test('track-34: a lab item\'s picker icon comes from its own type_icon (per-lab emoji), not a fixed flask glyph', () => {
  assert.ok(!/glyphSvg\('flask'/.test(src), 'no more hardcoded flask glyph for every lab');
  assert.match(src, /item\.type === 'lab'\) return typeIconHtml\(item\.type_icon/, 'lab items resolve icon from their own type_icon');
});

test('groupPickerItems returns only non-empty groups, in display order', () => {
  const groups = presets.groupPickerItems([
    { id: 1, type: 'prompt' },   // outros
    { id: 2, type: 'tarefa' },   // tarefa
  ]);
  assert.deepEqual(groups.map((g) => g.key), ['tarefa', 'outros'], 'tarefa precedes outros, empties dropped');
});

test('groupPickerItems is pure (does not mutate input)', () => {
  const input = [{ id: 1, type: 'prompt' }, { id: 2, type: 'tarefa' }];
  const copy = JSON.parse(JSON.stringify(input));
  presets.groupPickerItems(input);
  assert.deepEqual(input, copy, 'input array unchanged');
});
