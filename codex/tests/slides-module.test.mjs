// Slides sub-module: the tab contract (mount/unmount) plus the pure deck-model
// rules (mapDecks / deckHref / canOpen). Also asserts the Codex-owned html-slides
// engine is a valid ES module exporting the navigation API — the Cut-2 ownership
// boundary. Importing the modules must NOT touch the DOM or window globals at top
// level (only inside mount/handlers/init).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const slides = await import('../content/slides.js');
const engineMod = await import('../slides/engine/engine.js');

test('slides module satisfies the tab contract', () => {
  assert.equal(typeof slides.mount, 'function', 'exports mount(viewEl, ctx)');
  assert.equal(typeof slides.unmount, 'function', 'exports unmount()');
});

test('mapDecks normalizes the list_presentations payload', () => {
  const raw = {
    presentations: [
      { slug: 'a', engine: 'html-slides', title: 'Deck A', updated_at: '2026-05-20T10:00:00Z', thumbnail: 'x.png' },
      { slug: 'b', engine: 'panels-legacy', title: 'Deck B', updated_at: '2026-04-01T00:00:00Z' }, // legacy engine folded
      { slug: 'c', title: 'Deck C' },                                                              // engine defaults
    ],
  };
  const out = slides.mapDecks(raw);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { slug: 'a', engine: 'html-slides', title: 'Deck A', thumbnail: 'x.png', modified: '2026-05-20' });
  assert.equal(out[1].engine, 'html-slides', "'panels-legacy' folds to 'html-slides'");
  assert.equal(out[1].modified, '2026-04-01', 'updated_at sliced to date');
  assert.equal(out[2].engine, 'html-slides', 'missing engine defaults to html-slides');
  assert.equal(out[2].thumbnail, '', 'missing thumbnail -> empty string');
});

test('mapDecks accepts a bare array and tolerates empty/missing input', () => {
  assert.deepEqual(slides.mapDecks([]), []);
  assert.deepEqual(slides.mapDecks(null), []);
  assert.deepEqual(slides.mapDecks({}), []);
  const out = slides.mapDecks([{ slug: 'z', engine: 'reveal', title: 'Z' }]);
  assert.equal(out[0].engine, 'reveal');
});

test('deckHref points at the Codex-owned route for supported engines only', () => {
  assert.equal(slides.deckHref({ slug: 'a', engine: 'html-slides' }), 'slides/decks/a/');
  assert.equal(slides.deckHref({ slug: 'b', engine: 'reveal' }), null, 'legacy engine unsupported');
  assert.equal(slides.deckHref({ slug: 'c', engine: 'panels' }), null, 'panels engine dropped');
  assert.equal(slides.deckHref({ slug: '', engine: 'html-slides' }), null, 'no slug -> null');
  assert.equal(slides.deckHref(null), null);
});

test('canOpen requires a supported engine AND a migrated instance', () => {
  const deck = { slug: 'a', engine: 'html-slides' };
  assert.equal(slides.canOpen(deck, new Set()), false, 'not migrated -> not openable');
  assert.equal(slides.canOpen(deck, new Set(['a'])), true, 'migrated + supported -> openable');
  assert.equal(slides.canOpen({ slug: 'a', engine: 'reveal' }, new Set(['a'])), false, 'unsupported engine never opens');
});

test('the Codex-owned html-slides engine exports the navigation API', () => {
  const Panels = engineMod.default;
  assert.equal(typeof Panels, 'object', 'default export is the engine object');
  for (const fn of ['init', 'goTo', 'next', 'prev']) {
    assert.equal(typeof Panels[fn], 'function', `engine exposes ${fn}()`);
  }
});
