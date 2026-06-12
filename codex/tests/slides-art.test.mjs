// slides-art.test.mjs — the decorative-art KIT registry (theme/art.js): swappable
// background motifs the theme selects, recoloured by the swatch. DOM-free, node:test.
// (node runs each test file in its own process, so the module-global active kit set
// here cannot leak into the layout-render tests; we still restore it for in-file order.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTKITS, getArtKit, setArtKit, coverMotifs, contentMotifs, cardMotifs, circuit,
} from '../content/slides/js/theme/art.js';

test('ARTKITS has circuito (default) + nenhum (Sem arte), each a full kit', () => {
  for (const id of ['circuito', 'nenhum']) assert.equal(getArtKit(id).id, id);
  for (const k of ARTKITS) {
    assert.equal(typeof k.cover, 'function');
    assert.equal(typeof k.content, 'function');
    assert.equal(typeof k.cards, 'function');
    assert.ok(k.labelKey && k.labelKey.startsWith('slides.art_'));
  }
});
test('the default circuito kit reproduces today’s exact motifs (no render change)', () => {
  setArtKit('circuito');
  assert.equal(coverMotifs(), circuit('tr') + circuit('bl') + circuit('br'));
  assert.match(contentMotifs(), /motif neural/);
  assert.match(cardMotifs(), /motif circuit br/);
});
test('Sem arte (nenhum) emits no motifs', () => {
  setArtKit('nenhum');
  assert.equal(coverMotifs(), '');
  assert.equal(contentMotifs(), '');
  assert.equal(cardMotifs(), '');
  setArtKit('circuito');
});
test('getArtKit falls back to circuito for an unknown id; setArtKit ignores unknown', () => {
  assert.equal(getArtKit('nope').id, 'circuito');
  setArtKit('nope');
  assert.equal(coverMotifs(), circuit('tr') + circuit('bl') + circuit('br')); // unchanged
});
test('motifs are currentColor-driven, so the swatch (--motif) recolours them', () => {
  setArtKit('circuito');
  assert.match(coverMotifs(), /currentColor/);
});
