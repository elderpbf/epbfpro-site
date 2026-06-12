// slides-apply-all.test.mjs — the pure override-clear (core/schema.clearTextOverrides),
// the engine of the Tema box "aplicar a tudo": drop every MANUAL per-item text style so
// the deck conforms to the theme. DOM-free, node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearTextOverrides } from '../content/slides/js/core/schema.js';

test('clears slide.textStyle, list-item .style, and asset .style', () => {
  const deck = {
    slides: [{
      textStyle: { title: { fs: 40 } },
      slots: {
        topics: [{ id: 'a', text: 'x', style: { color: '#f00' } }, { id: 'b', text: 'y' }],
        cards: [{ id: 'c', style: { fw: '900' } }],
      },
    }],
    assets: [{ id: 'z', style: { color: '#0f0' } }, { id: 'w' }],
  };
  clearTextOverrides(deck);
  assert.equal(deck.slides[0].textStyle, undefined);
  assert.equal(deck.slides[0].slots.topics[0].style, undefined);
  assert.equal(deck.slides[0].slots.cards[0].style, undefined);
  assert.equal(deck.assets[0].style, undefined);
  // content is untouched, only the style is dropped
  assert.equal(deck.slides[0].slots.topics[0].text, 'x');
});
test('leaves geometry overrides (slide.overrides) untouched, those are position not style', () => {
  const deck = { slides: [{ overrides: { 'topics.a': { x: 10, y: 20 } }, slots: {} }], assets: [] };
  clearTextOverrides(deck);
  assert.deepEqual(deck.slides[0].overrides, { 'topics.a': { x: 10, y: 20 } });
});
test('is safe on a null / empty deck', () => {
  assert.doesNotThrow(() => clearTextOverrides(null));
  assert.doesNotThrow(() => clearTextOverrides({}));
  assert.doesNotThrow(() => clearTextOverrides({ slides: [{}], assets: [{}] }));
});
