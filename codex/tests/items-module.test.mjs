// Items sub-module: exports the tab contract (mount/unmount) and a pure,
// tested library-filter rule. Importing the module must NOT touch the DOM or
// window globals at top level (only inside mount/handlers).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const items = await import('../content/items.js');

test('items module satisfies the tab contract', () => {
  assert.equal(typeof items.mount, 'function', 'exports mount(viewEl, ctx)');
  assert.equal(typeof items.unmount, 'function', 'exports unmount()');
});

test('filterLibraryItems hides set_id / tarefa / conteudo / drive_file', () => {
  assert.equal(typeof items.filterLibraryItems, 'function', 'exports filterLibraryItems');
  const input = [
    { id: 1, type: 'prompt' },                 // keep
    { id: 2, type: 'material' },               // keep
    { id: 3, type: 'tarefa' },                 // drop (tarefa)
    { id: 4, type: 'conteudo' },               // drop (conteudo)
    { id: 5, type: 'drive_file' },             // drop (drive)
    { id: 6, type: 'prompt', set_id: 9 },      // drop (apostila set)
    { id: 7, type: 'slide' },                  // keep
  ];
  const out = items.filterLibraryItems(input).map((it) => it.id);
  assert.deepEqual(out, [1, 2, 7], 'only true library items survive');
});

test('filterLibraryItems is pure (does not mutate input)', () => {
  const input = [{ id: 1, type: 'prompt' }, { id: 2, type: 'tarefa' }];
  const copy = JSON.parse(JSON.stringify(input));
  items.filterLibraryItems(input);
  assert.deepEqual(input, copy, 'input array unchanged');
});
