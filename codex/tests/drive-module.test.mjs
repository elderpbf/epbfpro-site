// Drive sub-module (deferred-global wrapper): tab contract only. The panel is
// the legacy CVDriveSyncUI global; importing must not touch DOM/globals at the
// top level (window.CVDriveSyncUI is read only inside mount).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const drive = await import('../content/drive.js');

test('drive module satisfies the tab contract', () => {
  assert.equal(typeof drive.mount, 'function', 'exports mount');
  assert.equal(typeof drive.unmount, 'function', 'exports unmount');
});
