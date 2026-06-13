// slides-gallery.test.mjs — the central image GALLERY registry (core/gallery.js): the
// per-deck list of { id, name, url } the picker shows first. PURE + DOM-free, node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listImages, getImage, addImage, removeImage } from '../content/slides/js/core/gallery.js';

test('listImages is defensive: an absent gallery reads as empty (no migration needed)', () => {
  assert.deepEqual(listImages(null), []);
  assert.deepEqual(listImages({}), []);
  assert.equal(listImages({ gallery: [{ id: 'a', url: 'u' }] }).length, 1);
});
test('addImage registers an entry with a fresh id and returns it', () => {
  const deck = {};
  const e = addImage(deck, { name: 'logo', url: 'http://x/a.png' });
  assert.ok(e.id);
  assert.equal(e.name, 'logo');
  assert.equal(e.url, 'http://x/a.png');
  assert.equal(deck.gallery.length, 1);
});
test('addImage de-dupes by url (picking the same upload twice returns the same entry)', () => {
  const deck = {};
  const a = addImage(deck, { url: 'u1', name: 'one' });
  const b = addImage(deck, { url: 'u1', name: 'again' });
  assert.equal(a.id, b.id);
  assert.equal(deck.gallery.length, 1);
});
test('addImage rejects an empty/url-less add and a null deck', () => {
  const deck = {};
  assert.equal(addImage(deck, {}), null);
  assert.equal(addImage(null, { url: 'u' }), null);
  assert.ok(!deck.gallery || !deck.gallery.length);
});
test('getImage finds by id, null for an unknown id', () => {
  const deck = {};
  const e = addImage(deck, { url: 'u' });
  assert.equal(getImage(deck, e.id), e);
  assert.equal(getImage(deck, 'nope'), null);
});
test('removeImage drops by id and reports whether one was removed', () => {
  const deck = {};
  const e = addImage(deck, { url: 'u' });
  assert.equal(removeImage(deck, e.id), true);
  assert.equal(deck.gallery.length, 0);
  assert.equal(removeImage(deck, e.id), false); // already gone
});
