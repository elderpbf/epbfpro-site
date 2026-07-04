// Apostila sub-module (redesign): tab contract + the library rule (multi-apostila).
// Importing must not touch DOM/globals at top level.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const apostila = await import('../content/apostila.js');

test('apostila module satisfies the tab contract', () => {
  assert.equal(typeof apostila.mount, 'function', 'exports mount');
  assert.equal(typeof apostila.unmount, 'function', 'exports unmount');
});

test('librarySets keeps every apostila (no "current set" heuristic)', () => {
  // The redesign shows a LIBRARY of N apostilas; the old newest-non-empty pick is gone.
  const sets = [
    { id: 1, item_count: 3 },
    { id: 2, item_count: 0 },
    { id: 3, item_count: 5 },
  ];
  const out = apostila.librarySets(sets);
  assert.equal(out.length, 3, 'all apostilas kept, empty ones included');
  assert.deepEqual(out.map((s) => s.id), [1, 2, 3]);
  assert.deepEqual(apostila.librarySets(undefined), []);
});
