// Phase 7.1 reveal-plan helpers: the identity keys the selection bar and the step engine
// share, and the "immediate" decision that a per-slide build map drives. Pure, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animKey, keyForSel, isImmediate } from '../content/slides/js/render/animsteps.js';

test('animKey: a free asset keys by id, any fkey block by fkey, else null', () => {
  assert.equal(animKey({ asset: 'a1' }), 'a:a1');
  assert.equal(animKey({ fkey: 'topics.t3' }), 'f:topics.t3');
  assert.equal(animKey({ asset: 'a1', fkey: 'x' }), 'a:a1'); // asset wins (it is the selected unit)
  assert.equal(animKey({}), null);
  assert.equal(animKey(null), null);
});

test('keyForSel mirrors animKey: asset -> a:, every other reveal kind -> f:', () => {
  assert.equal(keyForSel('asset', 'a1'), 'a:a1');
  assert.equal(keyForSel('card', 'cards.c2'), 'f:cards.c2');
  assert.equal(keyForSel('topic', 'topics.t3'), 'f:topics.t3');
  assert.equal(keyForSel('imageSlot', 'img'), 'f:img');
  // The bar's key must equal what animKey derives from that block's dataset.
  assert.equal(keyForSel('asset', 'a1'), animKey({ asset: 'a1' }));
  assert.equal(keyForSel('topic', 'topics.t3'), animKey({ fkey: 'topics.t3' }));
});

test('isImmediate: only an explicit false opts a block out; absent build/key animates', () => {
  const build = { 'a:a1': false };
  assert.equal(isImmediate('a:a1', build), true);   // opted out -> immediate
  assert.equal(isImmediate('f:topics.t3', build), false); // no entry -> animates
  assert.equal(isImmediate('a:a1', undefined), false); // no build at all -> animates
  assert.equal(isImmediate(null, build), false);     // no stable key -> animates
  assert.equal(isImmediate('a:a1', { 'a:a1': true }), false); // any non-false value animates
});
