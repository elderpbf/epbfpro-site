// slides-drivepicker.test.mjs — the Google Drive image importer (adapters/drivePicker.js).
// The Picker/gapi/fetch flow is browser-only (verified manually on staging), so this covers
// the node-testable seams: the availability switch and the early-return guards that keep the
// option inert until an API key is configured and a Google token is in hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDrivePicker } from '../content/slides/adapters/drivePicker.js';

test('available() reflects whether the Picker key has arrived (read live)', () => {
  assert.equal(createDrivePicker({ getApiKey: () => '' }).available(), false);
  assert.equal(createDrivePicker({}).available(), false);
  assert.equal(createDrivePicker({ getApiKey: () => 'AIzaKEY' }).available(), true);
});
test('available() flips on once the background key fetch resolves', () => {
  let key = '';
  const dp = createDrivePicker({ getApiKey: () => key });
  assert.equal(dp.available(), false);
  key = 'AIzaKEY'; // the fetch landed
  assert.equal(dp.available(), true);
});
test('pick() is inert without a key (does not even request a token)', async () => {
  let asked = false;
  const dp = createDrivePicker({ getApiKey: () => '', getToken: () => { asked = true; return 't'; } });
  assert.equal(await dp.pick(), null);
  assert.equal(asked, false);
});
test('pick() resolves null when there is no Google token (no picker is loaded)', async () => {
  const dp = createDrivePicker({ getApiKey: () => 'AIzaKEY', getToken: async () => null });
  assert.equal(await dp.pick(), null);
});
