// list-sync.test.mjs — unit tests for js/list-sync.js (track-26 item 2.b).
// Zero-dependency; DOM bits use small hand-rolled fakes, no jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPreservingScroll, replaceById, removeById, upsertById, patchCard } from '../js/list-sync.js';

// ── renderPreservingScroll ──────────────────────────────────────────────────

test('renderPreservingScroll restores scrollTop after a sync renderFn', async () => {
  const el = { scrollTop: 240 };
  await renderPreservingScroll(el, () => { el.scrollTop = 0; });
  assert.equal(el.scrollTop, 240);
});

test('renderPreservingScroll restores scrollTop after an async renderFn (loading-state dip included)', async () => {
  const el = { scrollTop: 500 };
  await renderPreservingScroll(el, async () => {
    el.scrollTop = 0; // simulates a transient "loading..." placeholder collapsing height
    await Promise.resolve();
    el.scrollTop = 0; // simulates the real content re-render, still at 0
  });
  assert.equal(el.scrollTop, 500);
});

test('renderPreservingScroll awaits renderFn before restoring', async () => {
  const el = { scrollTop: 10 };
  const order = [];
  await renderPreservingScroll(el, async () => {
    order.push('render-start');
    await new Promise((r) => setTimeout(r, 0));
    order.push('render-end');
  });
  order.push('after');
  assert.deepEqual(order, ['render-start', 'render-end', 'after']);
});

test('renderPreservingScroll is a no-op guard when scrollEl is null', async () => {
  let ran = false;
  await renderPreservingScroll(null, () => { ran = true; });
  assert.equal(ran, true);
});

// ── replaceById ──────────────────────────────────────────────────────────────

test('replaceById merges a partial patch onto the matching row', () => {
  const arr = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
  const out = replaceById(arr, 2, { name: 'b2' });
  assert.deepEqual(out, [{ id: 1, name: 'a' }, { id: 2, name: 'b2' }]);
});

test('replaceById matches ids across string/number types', () => {
  const arr = [{ id: '7', name: 'x' }];
  const out = replaceById(arr, 7, { name: 'y' });
  assert.equal(out[0].name, 'y');
});

test('replaceById returns an equivalent array unchanged when id has no match', () => {
  const arr = [{ id: 1, name: 'a' }];
  const out = replaceById(arr, 99, { name: 'z' });
  assert.deepEqual(out, arr);
  assert.notEqual(out, arr, 'still a new array reference');
});

test('replaceById does not mutate the input array or its rows', () => {
  const row = { id: 1, name: 'a' };
  const arr = [row];
  replaceById(arr, 1, { name: 'changed' });
  assert.equal(row.name, 'a');
});

test('replaceById treats a non-array input as empty', () => {
  assert.deepEqual(replaceById(null, 1, { name: 'x' }), []);
  assert.deepEqual(replaceById(undefined, 1, { name: 'x' }), []);
});

// ── removeById ───────────────────────────────────────────────────────────────

test('removeById drops the matching row', () => {
  const arr = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(removeById(arr, 2), [{ id: 1 }, { id: 3 }]);
});

test('removeById matches ids across string/number types', () => {
  const arr = [{ id: 5 }, { id: 6 }];
  assert.deepEqual(removeById(arr, '5'), [{ id: 6 }]);
});

test('removeById returns an equivalent array unchanged when id has no match', () => {
  const arr = [{ id: 1 }];
  assert.deepEqual(removeById(arr, 99), arr);
});

test('removeById on an empty array stays empty', () => {
  assert.deepEqual(removeById([], 1), []);
});

// ── upsertById ───────────────────────────────────────────────────────────────

test('upsertById replaces the matching row in place (same index)', () => {
  const arr = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
  const out = upsertById(arr, 1, { name: 'a2' });
  assert.deepEqual(out, [{ id: 1, name: 'a2' }, { id: 2, name: 'b' }]);
});

test('upsertById appends when no row matches (add case)', () => {
  const arr = [{ id: 1, name: 'a' }];
  const out = upsertById(arr, 2, { id: 2, name: 'b' });
  assert.deepEqual(out, [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
});

test('upsertById does not mutate the input array', () => {
  const arr = [{ id: 1, name: 'a' }];
  upsertById(arr, 1, { name: 'a2' });
  assert.equal(arr[0].name, 'a');
});

// ── patchCard ────────────────────────────────────────────────────────────────

function fakeRow(id) {
  return { id, _outer: '<div data-id="' + id + '">old</div>', set outerHTML(v) { this._outer = v; }, get outerHTML() { return this._outer; } };
}

test('patchCard swaps the matched row\'s outerHTML and reports success', () => {
  const row = fakeRow('9');
  const listEl = { querySelector: (sel) => (sel === '[data-id="9"]' ? row : null) };
  const ok = patchCard(listEl, '9', '<div data-id="9">new</div>');
  assert.equal(ok, true);
  assert.equal(row.outerHTML, '<div data-id="9">new</div>');
});

test('patchCard honors a custom selector', () => {
  const row = fakeRow('x');
  const listEl = { querySelector: (sel) => (sel === '.cdx-q[data-qid="x"]' ? row : null) };
  const ok = patchCard(listEl, 'x', '<div>new</div>', { selector: '.cdx-q[data-qid="x"]' });
  assert.equal(ok, true);
});

test('patchCard returns false and does not throw when the row is not found', () => {
  const listEl = { querySelector: () => null };
  assert.equal(patchCard(listEl, '404', '<div>new</div>'), false);
});

test('patchCard returns false when listEl is null', () => {
  assert.equal(patchCard(null, '1', '<div>new</div>'), false);
});
