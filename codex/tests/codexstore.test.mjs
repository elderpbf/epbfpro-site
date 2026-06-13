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
