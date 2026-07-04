// Content facade group: each method maps to the correct FROZEN Worker action
// string and passes params straight through. callWorker is stubbed to echo the
// final payload so we can read back the action.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

// Stub the window global the facade calls. The facade references `callWorker`
// as a bare global, so it resolves to globalThis.callWorker at call time.
globalThis.callWorker = (payload) => payload;

test('content facade exposes the Items methods', () => {
  assert.ok(api.content, 'codex-api exports a `content` group');
  const expected = [
    'listItems', 'getItem', 'createItem', 'updateItem', 'deleteItem',
    'duplicateItem', 'bulkDeleteItems',
    'listTypes', 'createType',
    'listTags', 'createTag', 'renameTag', 'deleteTag',
  ];
  for (const m of expected) {
    assert.equal(typeof api.content[m], 'function', `content.${m} is a function`);
  }
});

test('content facade maps methods to the frozen action strings', () => {
  const c = api.content;
  const cases = [
    [() => c.listItems(),              'ct_list_items'],
    [() => c.getItem({ id: 1 }),       'ct_get_item'],
    [() => c.createItem({}),           'ct_create_item'],
    [() => c.updateItem({ id: 1 }),    'ct_update_item'],
    [() => c.deleteItem({ id: 1 }),    'ct_delete_item'],
    [() => c.duplicateItem({ id: 1 }), 'ct_duplicate_item'],
    [() => c.bulkDeleteItems({ ids: [1, 2] }), 'ct_delete_items_bulk'],
    [() => c.listTypes(),              'ct_list_types'],
    [() => c.createType({ slug: 's', label: 'L' }), 'ct_create_type'],
    [() => c.listTags(),               'ct_list_tags'],
    [() => c.createTag({ label: 'x' }), 'ct_create_tag'],
    [() => c.renameTag({ id: 1, label: 'y' }), 'ct_rename_tag'],
    [() => c.deleteTag({ id: 1 }),     'ct_delete_tag'],
  ];
  for (const [fn, action] of cases) {
    const out = fn();
    assert.equal(out.action, action, `maps to ${action}`);
  }
});

test('content facade passes params through unchanged', () => {
  const out = api.content.bulkDeleteItems({ ids: [3, 4, 5] });
  assert.deepEqual(out.ids, [3, 4, 5], 'ids preserved');
  assert.equal(out.action, 'ct_delete_items_bulk');
});

test('content facade maps the apostila redesign actions', () => {
  const c = api.content;
  const cases = [
    [() => c.createSet({ name: 'A' }),                    'ct_create_set'],
    [() => c.updateSet({ id: 1, name: 'B' }),             'ct_update_set'],
    [() => c.reorderSetItems({ set_id: 1, ordered_ids: [2, 1] }), 'ct_reorder_set_items'],
    [() => c.startDraft({ set_id: 1 }),                   'ct_start_apostila_draft'],
    [() => c.getDraft({ set_id: 1 }),                     'ct_get_apostila_draft'],
    [() => c.saveDraftSection({ set_id: 1, title: 't' }), 'ct_save_draft_section'],
    [() => c.deleteDraftSection({ id: 1 }),               'ct_delete_draft_section'],
    [() => c.reorderDraft({ set_id: 1, ordered_ids: [1] }), 'ct_reorder_draft'],
    [() => c.discardDraft({ set_id: 1 }),                 'ct_discard_apostila_draft'],
    [() => c.convergeApostila({ set_id: 1, force: true }), 'ct_converge_apostila'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
  // force flag passes through for the guarded converge
  assert.equal(c.convergeApostila({ set_id: 1, force: true }).force, true);
});
