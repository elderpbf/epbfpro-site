// slides-cardparts.test.mjs — the card PART registry (composable cards). Locks the
// extensibility guarantee: a card is composed of independent parts whose flags live
// in an OPEN `card.parts` map (absent = off), and a part REGISTERED LATER renders on
// a card only once its flag is on, so existing cards are never reshaped. Pure, DOM-
// free. Run: node --test tests/slides-cardparts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cardparts from '../content/slides/js/render/cardparts.js';

test('the registry lists the seed parts in render order (image, title, body)', () => {
  const seed = cardparts.list().map((p) => p.id).filter((id) => ['image', 'title', 'body'].includes(id));
  assert.deepEqual(seed, ['image', 'title', 'body'], 'seed parts present, in order');
  for (const p of cardparts.list()) {
    assert.equal(typeof p.render, 'function', `${p.id}.render`);
    assert.equal(typeof p.labelKey, 'string', `${p.id} names its toggle i18n key`);
  }
});

test('cardItem renders ONLY the parts whose flag is on (absent = off, content kept)', () => {
  // body on; title + image present as CONTENT but OFF -> not rendered.
  const bodyOnly = cardparts.cardItem(
    { id: 'c1', parts: { body: true }, text: 'Olá', title: 'T', image: { src: 'x' } }, 0, 1);
  assert.match(bodyOnly, /data-path="cards\.0\.text"/, 'body renders');
  assert.ok(!/c-title|cards\.0\.title/.test(bodyOnly), 'title off -> not rendered though content exists');
  assert.ok(!/c-img|cards\.0\.image/.test(bodyOnly), 'image off -> not rendered though content exists');

  // image + body compose freely (the pricing-style image-over-text card).
  const composed = cardparts.cardItem(
    { id: 'c2', parts: { image: true, body: true }, text: 'B', image: { src: 'y' } }, 1, 2);
  assert.match(composed, /c-img/, 'image part on');
  assert.match(composed, /cards\.1\.text/, 'body part on');
});

test('a card with NO parts renders an empty but valid card (never throws)', () => {
  const empty = cardparts.cardItem({ id: 'c3' }, 0, 1);
  assert.match(empty, /data-fkey="cards\.c3"/, 'still a keyed card');
  assert.ok(!/c-img|c-text|c-title/.test(empty), 'absent parts map -> nothing rendered');
});

test('cardItem keeps the stable-id fkey + reveal class semantics regardless of parts', () => {
  const html = cardparts.cardItem({ id: 'k9', parts: { body: true }, text: 'x', step: 3 }, 2, 4);
  assert.match(html, /class="card reveal"/, 'n>1 + step>0 -> reveal');
  assert.match(html, /data-fkey="cards\.k9"/, 'fkey is the stable id');
  assert.match(html, /data-step="3"/, 'explicit step honored');
});

test('EXTENSIBILITY: a part registered LATER renders when toggled, without reshaping existing cards', () => {
  // Register a brand-new part at runtime (the "add anything later" path).
  cardparts.register({
    id: 'badge', order: 5, labelKey: 'slides.ed_badge',
    render: (c) => `<div class="c-badge">${c.badge || ''}</div>`,
  });
  assert.ok(cardparts.list().some((p) => p.id === 'badge'), 'the new part joins the registry');

  // A card that opts in renders it…
  const withBadge = cardparts.cardItem({ id: 'n1', parts: { badge: true, body: true }, badge: 'C', text: 'x' }, 0, 1);
  assert.match(withBadge, /c-badge/, 'new part renders when its flag is on');

  // …and a pre-existing card that never heard of it is byte-for-byte unchanged
  // (absent key = off), proving NO migration / reshape is needed.
  const legacy = cardparts.cardItem({ id: 'old', parts: { body: true }, text: 'x' }, 0, 1);
  assert.ok(!/c-badge/.test(legacy), 'existing card is not reshaped by the new part');
});
