// Lessons view module: the tab contract. The pure vault/render logic it consumes
// is tested separately in lesson-model.test.mjs. Importing must not touch
// DOM/globals at top level.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const lessons = await import('../lessons/lessons.js');

test('lessons module satisfies the tab contract', () => {
  assert.equal(typeof lessons.mount, 'function', 'exports mount');
  assert.equal(typeof lessons.unmount, 'function', 'exports unmount');
});
