// Items sub-module: exports the tab contract (mount/unmount) and a pure,
// tested library-filter rule. Importing the module must NOT touch the DOM or
// window globals at top level (only inside mount/handlers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

// ── The Types screen owns `family` (2026-08-16) ──────────────────────────────
// The Worker has accepted `family` since migration 0050, but this screen never sent it, so the
// only package types in existence were the two seeded straight into the database and no new one
// could be made without a migration. These are source guards rather than behaviour tests because
// the change lives inside modal handlers: what must never silently come back is the screen
// dropping the field again.
const itemsSrc = await readFile(new URL('../content/items.js', import.meta.url), 'utf8');

test('the new-type form sends family, and offers the choice', () => {
  assert.match(itemsSrc, /createType\(\{[^}]*family/, 'createType carries family');
  assert.match(itemsSrc, /data-fld="family"/, 'the form has the checkbox');
  assert.match(itemsSrc, /content\.type_is_bundle/, 'the checkbox is labelled through i18n');
});

test('deleting a PACKAGE says its contents survive', () => {
  // ctDeleteItem clears ct_item_members in both directions, so the members outlive the package.
  // The dialog used to give the plain item wording, and "delete" over a thing that visibly holds
  // three documents reads as deleting four items.
  assert.match(itemsSrc, /confirm_delete_bundle/, 'a package gets its own confirmation text');
  assert.match(itemsSrc, /family === 'bundle'/, 'the wording is chosen by the type family');
});

test('an existing type can be switched, and the refusal is explained', () => {
  assert.match(itemsSrc, /data-action="family"/, 'the type row offers the switch');
  assert.match(itemsSrc, /updateType\(\{[^}]*family/, 'the switch sends family');
  // Élder 2026-08-05, on a save that failed silently: "cliquei em criar e não aconteceu nada".
  // A refused demotion has to say why, so bundle_type_in_use must be handled by name.
  assert.match(itemsSrc, /bundle_type_in_use/, 'the in-use refusal is handled, not swallowed');
});
