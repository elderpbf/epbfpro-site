// tests/codexstore.test.mjs
// Regression: createCodexStore.load() must honor its documented "null if none"
// contract. The frozen get_presentation_json action REJECTS with "not found"
// for a presentation row that has no saved deck JSON yet (a brand-new
// certificate template hits this on its first open). load() must resolve to
// null in that case so callers can seed a fresh deck — never become an
// unhandled rejection — and must still re-throw genuine failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodexStore } from '../content/slides/adapters/codexStore.js';

test('load() resolves to null when getDeck rejects with "not found"', async () => {
  const facade = { getDeck: async () => { throw new Error('presentation data not found'); } };
  const store = createCodexStore({ slug: 'x', facade });
  const deck = await store.load(); // must NOT throw
  assert.equal(deck, null);
  assert.equal(store.getDeck(), null);
});

test('load() re-throws genuine (non-not-found) failures', async () => {
  const facade = { getDeck: async () => { throw new Error('network down'); } };
  const store = createCodexStore({ slug: 'x', facade });
  await assert.rejects(() => store.load(), /network down/);
});

test('load() returns and stores the deck data when present', async () => {
  const deck = { slides: [{ id: 'a' }] };
  const facade = { getDeck: async () => ({ data: deck }) };
  const store = createCodexStore({ slug: 'x', facade });
  const out = await store.load();
  assert.deepEqual(out, deck);
  assert.deepEqual(store.getDeck(), deck);
});

// --- R2 image-URL normalization (Stage 2: decks must be Worker-independent) ---
// assetUrl() reads window.WORKER_URL; stub the "current" Worker for these.
globalThis.window = globalThis.window || {};
globalThis.window.WORKER_URL = 'https://codex-api.test';

test('load() absolutizes origin-less /r2/ paths against the current Worker', async () => {
  const stored = {
    slides: [{ id: 's1', slots: { bg: { src: '/r2/classforge/deck1/a.png' } } }],
    assets: [{ id: 'x', src: '/r2/classforge/deck1/b.png' }],
    gallery: [{ url: '/r2/classforge/deck1/a.png' }],
  };
  const facade = { getDeck: async () => ({ data: stored }) };
  const out = await createCodexStore({ slug: 'deck1', facade }).load();
  assert.equal(out.slides[0].slots.bg.src, 'https://codex-api.test/r2/classforge/deck1/a.png');
  assert.equal(out.assets[0].src, 'https://codex-api.test/r2/classforge/deck1/b.png');
  assert.equal(out.gallery[0].url, 'https://codex-api.test/r2/classforge/deck1/a.png');
});

test('load() re-points a stale absolute (pre-cutover) Worker /r2/ URL to the current Worker', async () => {
  const stored = { assets: [{ src: 'https://backstage-api.pensoia.workers.dev/r2/classforge/d/c.png' }] };
  const facade = { getDeck: async () => ({ data: stored }) };
  const out = await createCodexStore({ slug: 'd', facade }).load();
  assert.equal(out.assets[0].src, 'https://codex-api.test/r2/classforge/d/c.png');
});

test('save() persists /r2/ origin-less while the in-memory deck stays absolute', async () => {
  let persisted;
  const facade = {
    getDeck: async () => ({ data: { assets: [{ src: '/r2/classforge/d/e.png' }] } }),
    saveDeck: async ({ data }) => { persisted = data; return { ok: true }; },
  };
  const store = createCodexStore({ slug: 'd', facade });
  await store.load();
  await store.save();
  assert.equal(persisted.assets[0].src, '/r2/classforge/d/e.png');
  assert.equal(store.getDeck().assets[0].src, 'https://codex-api.test/r2/classforge/d/e.png');
});

test('non-/r2/ URLs (data: and external) are left untouched', async () => {
  const stored = { assets: [{ src: 'data:image/png;base64,AAA' }, { src: 'https://cdn.example.com/x.png' }] };
  const facade = { getDeck: async () => ({ data: stored }) };
  const out = await createCodexStore({ slug: 'd', facade }).load();
  assert.equal(out.assets[0].src, 'data:image/png;base64,AAA');
  assert.equal(out.assets[1].src, 'https://cdn.example.com/x.png');
});
