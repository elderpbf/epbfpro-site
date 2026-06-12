// slides-drivepicker.test.mjs — the Google Drive image importer (adapters/drivePicker.js).
// The Picker/gapi/fetch flow is browser-only (verified manually on staging), so this covers
// the node-testable seams: the availability switch and the early-return guards that keep the
// option inert until an API key is configured and a Google token is in hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDrivePicker } from '../content/slides/adapters/drivePicker.js';

test('available() reflects whether a Picker API key is configured', () => {
  assert.equal(createDrivePicker({ apiKey: '' }).available(), false);
  assert.equal(createDrivePicker({}).available(), false);
  assert.equal(createDrivePicker({ apiKey: 'AIzaKEY' }).available(), true);
});
test('pick() is inert without an API key (does not even request a token)', async () => {
  let asked = false;
  const dp = createDrivePicker({ apiKey: '', getToken: () => { asked = true; return 't'; } });
  assert.equal(await dp.pick(), null);
  assert.equal(asked, false);
});
test('pick() resolves null when there is no Google token (no picker is loaded)', async () => {
  const dp = createDrivePicker({ apiKey: 'AIzaKEY', getToken: async () => null });
  assert.equal(await dp.pick(), null);
});
