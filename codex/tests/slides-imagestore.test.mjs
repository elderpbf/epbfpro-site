// slides-imagestore.test.mjs — the gallery STORAGE adapter (adapters/imageStore.js): the
// one swap point for "where the bytes go". Asserts the branch logic — upload to R2 via the
// facade when there's a slug, and ALWAYS fall back to an embedded data URL (no slug yet, or
// any failure) so adding an image never hard-fails. Browser leaves (FileReader, window) are
// stubbed minimally; the upload call itself is a fake facade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageStore } from '../content/slides/adapters/imageStore.js';

// minimal browser stubs the adapter's leaf helpers touch (assetUrl reads window.WORKER_URL;
// the data-URL fallback uses FileReader). Set before any put() runs.
global.window = global.window || { WORKER_URL: 'http://w' };
global.FileReader = class {
  readAsDataURL(file) {
    this.result = 'data:' + ((file && file.type) || 'image/png') + ';base64,QUJD';
    queueMicrotask(() => this.onload && this.onload());
  }
};
const fakeFile = (name = 'pic.png', type = 'image/png') => ({ name, type });

test('R2 path: with a facade + slug, it uploads and returns the served URL', async () => {
  const calls = [];
  const facade = { uploadImage: async (p) => { calls.push(p); return { ok: true }; } };
  const store = createImageStore({ facade, getSlug: () => 'deck-123' });
  const res = await store.put(fakeFile('logo.png'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].slug, 'deck-123');
  assert.match(calls[0].filename, /^gallery-.+\.png$/);
  assert.equal(calls[0].data_base64, 'QUJD');
  assert.match(res.url, /^http:\/\/w\/r2\/classforge\/deck-123\/gallery-.+\.png$/);
  assert.equal(res.name, 'logo.png');
});
test('no slug yet -> embeds a data URL instead (never hard-fails)', async () => {
  const facade = { uploadImage: async () => ({ ok: true }) };
  const store = createImageStore({ facade, getSlug: () => null });
  const res = await store.put(fakeFile());
  assert.match(res.url, /^data:image\/png;base64,/);
});
test('an upload that throws falls back to a data URL', async () => {
  const facade = { uploadImage: async () => { throw new Error('boom'); } };
  const store = createImageStore({ facade, getSlug: () => 'deck-9' });
  const res = await store.put(fakeFile());
  assert.match(res.url, /^data:/);
});
test('a non-ok upload response also falls back', async () => {
  const facade = { uploadImage: async () => ({ ok: false, error: 'nope' }) };
  const store = createImageStore({ facade, getSlug: () => 'deck-9' });
  const res = await store.put(fakeFile());
  assert.match(res.url, /^data:/);
});
test('derives the extension from the MIME type when the name has none', async () => {
  const calls = [];
  const facade = { uploadImage: async (p) => { calls.push(p); return { ok: true }; } };
  const store = createImageStore({ facade, getSlug: () => 's' });
  await store.put({ name: 'noext', type: 'image/jpeg' });
  assert.match(calls[0].filename, /\.jpeg$/);
});
