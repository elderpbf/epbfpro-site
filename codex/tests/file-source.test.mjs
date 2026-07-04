// file-source.test.mjs — the shared Codex file-access backend (codex/js/file-source.js).
// A menu of sources that each return a native File; consumers (Slides gallery, Content
// item editor) pick which to expose. The browser-only Picker/DOM flow is verified manually;
// this covers the node-testable seams of the Drive source: the availability switch and the
// inert guards that keep it silent until a Picker key + Google token are both in hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDriveSource, pickLocalFile } from '../js/file-source.js';

test('the module exports both sources (local + drive)', () => {
  assert.equal(typeof createDriveSource, 'function');
  assert.equal(typeof pickLocalFile, 'function');
});

test('createDriveSource.available() reflects the Picker key, read live', () => {
  assert.equal(createDriveSource({ getApiKey: () => '' }).available(), false);
  assert.equal(createDriveSource({}).available(), false);
  assert.equal(createDriveSource({ getApiKey: () => 'AIzaKEY' }).available(), true);
  let key = '';
  const src = createDriveSource({ getApiKey: () => key });
  assert.equal(src.available(), false);
  key = 'AIzaKEY'; // the background fetch landed
  assert.equal(src.available(), true);
});

test('createDriveSource.pick() is inert without a key (never requests a token)', async () => {
  let asked = false;
  const src = createDriveSource({ getApiKey: () => '', getToken: () => { asked = true; return 't'; } });
  assert.equal(await src.pick(), null);
  assert.equal(await src.pick({ view: 'any' }), null);
  assert.equal(asked, false);
});

test('createDriveSource.pick() resolves null when there is no Google token', async () => {
  const src = createDriveSource({ getApiKey: () => 'AIzaKEY', getToken: async () => null });
  assert.equal(await src.pick({ view: 'any' }), null);
});
