// Apostila sub-module: tab contract + the pure current-set selection rule.
// Importing must not touch DOM/globals at top level.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const apostila = await import('../content/apostila.js');

test('apostila module satisfies the tab contract', () => {
  assert.equal(typeof apostila.mount, 'function', 'exports mount');
  assert.equal(typeof apostila.unmount, 'function', 'exports unmount');
});

test('pickCurrentSet picks the newest set that has items', () => {
  assert.equal(typeof apostila.pickCurrentSet, 'function', 'exports pickCurrentSet');
  const sets = [
    { id: 1, item_count: 3 },
    { id: 2, item_count: 0 },   // skipped, empty
    { id: 3, item_count: 5 },   // newest non-empty -> chosen
    { id: 4, item_count: 0 },   // skipped, empty
  ];
  assert.equal(apostila.pickCurrentSet(sets).id, 3, 'newest non-empty set chosen');
});

test('pickCurrentSet returns null when no set has items', () => {
  assert.equal(apostila.pickCurrentSet([{ id: 1, item_count: 0 }]), null);
  assert.equal(apostila.pickCurrentSet([]), null);
  assert.equal(apostila.pickCurrentSet(undefined), null);
});
