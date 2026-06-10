// slides-cardresize.test.mjs — Step 2: a card stack resizes as a UNIT. Card size
// is a per-row property (slots.rowW keyed by row), surfaced as a --cardw CSS var on
// each .cardrow, so resizing one card sizes the whole row and add/remove stays
// uniform. The old per-card flow override + symResize mirror are retired; a v5
// migration folds any existing per-card card widths into slots.rowW. Pure render +
// migration logic, plus source-text contracts. DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cards from '../content/slides/js/layouts/cards.js';
import { migrateDeck, SCHEMA_VERSION } from '../content/slides/js/core/schema.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/* ---------- render: per-row size surfaces as a CSS var ---------- */
test('cards render puts the row size on the .cardrow as a --cardw var (drives every card in it)', () => {
  const html = cards.render({ title: '', cards: [{ id: 'a', parts: { body: true }, row: 0 }], rowW: { 0: 280 } });
  assert.match(html, /<div class="cardrow" data-row="0" style="--cardw:280px">/, 'row 0 carries its width as a var');
});

test('cards render omits --cardw on a row with no stored size (cards keep the equal-flex default)', () => {
  const html = cards.render({ title: '', cards: [{ id: 'a', parts: { body: true }, row: 0 }] });
  assert.match(html, /<div class="cardrow" data-row="0">/, 'no inline size when the row was never resized');
  assert.ok(!/--cardw/.test(html), 'no width var at all');
});

test('cards render sizes each row independently from rowW', () => {
  const html = cards.render({
    title: '',
    cards: [{ id: 'a', parts: { body: true }, row: 0 }, { id: 'b', parts: { body: true }, row: 1 }],
    rowW: { 1: 200 },
  });
  assert.match(html, /data-row="0">/, 'row 0 has no size');
  assert.match(html, /data-row="1" style="--cardw:200px">/, 'row 1 sized on its own');
});

/* ---------- migration: per-card card widths fold into slots.rowW (v5) ---------- */
test('SCHEMA_VERSION is at least 5 (the per-row card size migration)', () => {
  assert.ok(SCHEMA_VERSION >= 5);
});

test('migrateDeck folds a legacy per-card card width into slots.rowW for that row, then drops it', () => {
  const deck = {
    schemaVersion: 4,
    slides: [{
      id: 's', layout: 'cards',
      slots: { cards: [{ id: 'a', parts: { body: true }, row: 0 }, { id: 'b', parts: { body: true }, row: 1 }] },
      overrides: { 'cards.a': { w: 300, flow: true }, 'cards.b': { w: 220, flow: true }, title: { x: 1, y: 2, w: 3, h: 4 } },
    }],
  };
  migrateDeck(deck);
  const s = deck.slides[0];
  assert.deepEqual(s.slots.rowW, { 0: 300, 1: 220 }, 'each card width moved to its row');
  assert.ok(!('cards.a' in s.overrides) && !('cards.b' in s.overrides), 'per-card width overrides dropped');
  assert.deepEqual(s.overrides.title, { x: 1, y: 2, w: 3, h: 4 }, 'a non-card (freeform) override is untouched');
  assert.equal(deck.schemaVersion, SCHEMA_VERSION, 'version stamped current');
});

test('migrateDeck is idempotent for the card-size fold (a v5 deck is left alone)', () => {
  const deck = {
    schemaVersion: SCHEMA_VERSION,
    slides: [{ id: 's', layout: 'cards', slots: { cards: [{ id: 'a', parts: { body: true }, row: 0 }], rowW: { 0: 260 } }, overrides: {} }],
  };
  migrateDeck(deck);
  assert.deepEqual(deck.slides[0].slots.rowW, { 0: 260 }, 'existing row sizes survive a re-migrate unchanged');
});

/* ---------- source contracts ---------- */
test('geometry.flowCard writes the per-row size and no longer mirrors single cards', () => {
  const src = read('../content/slides/js/select/geometry.js');
  assert.match(src, /rowW/, 'flowCard stores the basis under slots.rowW');
  assert.ok(!/cardMirrorRef/.test(src), 'the symResize mirror helper is gone');
});

test('cards layout reads slots.rowW to size each row', () => {
  const src = read('../content/slides/js/layouts/cards.js');
  assert.match(src, /rowW/, 'render consults slots.rowW');
  assert.match(src, /--cardw/, 'and emits the width var');
});

test('slide.css drives card width from the row var', () => {
  const css = read('../content/slides/css/slide.css');
  assert.match(css, /--cardw/, 'a rule consumes the --cardw var');
});
