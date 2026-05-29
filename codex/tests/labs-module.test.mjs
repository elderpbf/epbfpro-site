// Labs sub-module (deferred-global wrapper): tab contract only. The grid itself
// is the legacy CTLabsPanel global; importing must not touch DOM/globals at the
// top level (window.CTLabsPanel is read only inside mount).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const labs = await import('../content/labs.js');

test('labs module satisfies the tab contract', () => {
  assert.equal(typeof labs.mount, 'function', 'exports mount');
  assert.equal(typeof labs.unmount, 'function', 'exports unmount');
});
