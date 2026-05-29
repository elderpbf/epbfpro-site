// Presets facade group: each method maps to the correct FROZEN cv_*_preset
// Worker action (read from cv-presets-api.js) and passes params through. The
// stubbed callWorker echoes the final payload so we can read back the action.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

globalThis.callWorker = (payload) => payload;

test('codex-api exposes a `presets` group with the CRUD methods', () => {
  assert.ok(api.presets, 'codex-api exports a `presets` group');
  for (const m of ['list', 'get', 'create', 'update', 'remove']) {
    assert.equal(typeof api.presets[m], 'function', `presets.${m} is a function`);
  }
});

test('presets facade maps methods to the frozen action strings', () => {
  const p = api.presets;
  const cases = [
    [() => p.list(),                         'cv_list_presets'],
    [() => p.get({ id: 1 }),                 'cv_get_preset'],
    [() => p.create({ name: 'x', item_ids: [] }), 'cv_create_preset'],
    [() => p.update({ id: 1, name: 'y' }),   'cv_update_preset'],
    [() => p.remove({ id: 1 }),              'cv_delete_preset'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
});

test('presets facade passes params through unchanged', () => {
  const out = api.presets.create({ name: 'Aula 1', item_ids: [3, 4, 5] });
  assert.equal(out.action, 'cv_create_preset');
  assert.equal(out.name, 'Aula 1');
  assert.deepEqual(out.item_ids, [3, 4, 5], 'item_ids preserved');
});
