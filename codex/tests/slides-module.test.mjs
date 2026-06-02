// slides-module.test.mjs — behavioral unit tests for the Slides sub-tab.
// Pure exported rules + the codexStore round-trip over a STUBBED facade.
// Zero-dependency. Run: node --test tests/slides-module.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const slides = await import('../content/slides.js');
const { createCodexStore } = await import('../content/slides/adapters/codexStore.js');

test('slides module satisfies the tab contract', () => {
  assert.equal(typeof slides.mount, 'function', 'exports mount(viewEl, ctx)');
  assert.equal(typeof slides.unmount, 'function', 'exports unmount()');
});

test('resolveDeckSelection keeps valid current, else first, else null', () => {
  assert.equal(typeof slides.resolveDeckSelection, 'function', 'exports resolveDeckSelection');
  const list = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }];
  assert.equal(slides.resolveDeckSelection(list, 'b'), 'b');   // keep valid current
  assert.equal(slides.resolveDeckSelection(list, 'zzz'), 'a'); // fall back to first
  assert.equal(slides.resolveDeckSelection([], 'a'), null);    // empty -> nothing
});

test('codexStore round-trips a deck through the facade (save then load)', async () => {
  // Stub the slides facade with an in-memory R2 keyed by slug.
  const r2 = new Map();
  const facade = {
    getDeck:  async ({ slug }) => ({ data: r2.has(slug) ? r2.get(slug) : null }),
    saveDeck: async ({ slug, data }) => { r2.set(slug, data); return { ok: true }; },
  };
  const deck = { title: 'Aula 1', slides: [{ id: 's1' }, { id: 's2' }] };

  const writer = createCodexStore({ slug: 'aula-1', facade });
  writer.setDeck(deck);
  await writer.save();

  const reader = createCodexStore({ slug: 'aula-1', facade });
  const loaded = await reader.load();
  assert.deepEqual(loaded, deck, 'load() returns the saved deck');
  assert.deepEqual(reader.getDeck(), deck, 'getDeck() reflects the loaded deck');
});

test('codexStore.touch + on announce a change (editor autosave seam)', () => {
  const facade = { getDeck: async () => ({ data: null }), saveDeck: async () => ({}) };
  const store = createCodexStore({ slug: 'x', facade });
  let fired = 0;
  store.on('change', () => { fired++; });
  store.setDeck({ title: 'T' }); // emits change
  store.touch();                 // emits change
  assert.equal(fired, 2, 'change fires on setDeck and touch');
});

test('content.sub_slides exists in BOTH dictionaries', async () => {
  const PT = (await import('../i18n/pt.js')).default;
  const EN = (await import('../i18n/en.js')).default;
  assert.ok('content.sub_slides' in PT, 'pt.js missing content.sub_slides');
  assert.ok('content.sub_slides' in EN, 'en.js missing content.sub_slides');
});
