// slides-rows.test.mjs — multi-row card stacks (Élder's "two stacks of cards").
// A card carries an optional `row` (absent = row 0), and slots.cards stays FLAT so
// the id-keyed override/style/reorder machinery is untouched. The layout groups by
// row; add / move / reorder are row-aware. Pure logic, DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kinds from '../content/slides/js/select/kinds.js';
import cardsLayout from '../content/slides/js/layouts/cards.js';

// A stub app: cur() returns a slide wrapping the given slots; stage is a no-op
// querySelector so descriptor.controls() (which calls editEl) never throws.
const app = (slots) => ({
  cur: () => ({ slots }),
  record: () => {},
  refresh: () => {},
  stage: { querySelector: () => null },
});

test('cards layout groups cards into one .cardrow per row, tagged data-row, in row order', () => {
  const html = cardsLayout.render({
    title: 'T',
    cards: [
      { id: 'a', parts: { image: true }, row: 0, image: { src: 'x' } },
      { id: 'b', parts: { image: true }, row: 0, image: { src: 'y' } },
      { id: 'c', parts: { body: true }, row: 1, text: 'A' },
      { id: 'd', parts: { body: true }, row: 1, text: 'B' },
    ],
  });
  const rows = [...html.matchAll(/class="cardrow[^"]*" data-row="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(rows, [0, 1], 'two cardrows, row 0 then row 1');
  assert.match(html, /data-fkey="cards\.a"/);
  assert.match(html, /data-fkey="cards\.d"/);
  assert.match(html, /cards\.2\.text/, 'card c keeps its FLAT index (2) for content paths');
});

test('cards with no row render as a single implicit row 0 (back-compat)', () => {
  const html = cardsLayout.render({ title: '', cards: [{ id: 'a', parts: { body: true }, text: 'x' }] });
  const rows = [...html.matchAll(/data-row="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(rows, [0], 'single implicit row 0');
});

test('an empty cards slide still emits a selectable row-0 container', () => {
  const html = cardsLayout.render({ title: '', cards: [] });
  assert.match(html, /class="cardrow" data-row="0"/, 'empty deck keeps a row to add into');
});

test('container.match reads the clicked row; row 0 omits the key (absent = default)', () => {
  const d = kinds.get('container');
  const row1 = { dataset: { row: '1' } };
  assert.deepEqual(
    d.match({ closest: (s) => (s === '.cardrow' ? row1 : null) }),
    { kind: 'container', ref: 'cards', row: 1 });
  const row0 = { dataset: { row: '0' } };
  assert.deepEqual(
    d.match({ closest: (s) => (s === '.cardrow' ? row0 : null) }),
    { kind: 'container', ref: 'cards' });
});

test('container add inserts into the CLICKED row; add-row starts a new stack', () => {
  const d = kinds.get('container');
  const slots = { cards: [{ id: 'a', parts: { body: true } }, { id: 'b', parts: { body: true } }] };
  const a = app(slots);
  const ctrls = d.controls(a, { kind: 'container', ref: 'cards', row: 0 }, null);
  const add = ctrls.find((c) => c.id === 'add');
  const addRow = ctrls.find((c) => c.id === 'add-row');
  assert.ok(add && addRow, 'both add + add-row present');

  add.run(a, { kind: 'container', ref: 'cards', row: 0 });
  assert.equal(slots.cards.length, 3, 'a card was added');
  assert.ok(slots.cards.every((c) => !c.row), 'added into row 0 (no row field)');

  addRow.run(a);
  assert.equal(slots.cards.length, 4);
  assert.equal(slots.cards[slots.cards.length - 1].row, 1, 'add-row puts the new card in row 1');
});

test('moveItem stays within the card row (swaps same-row neighbours only)', () => {
  // flat: [a(r0), b(r0), c(r1), d(r1)]; moving b left swaps with a, never crosses to c.
  const slots = { cards: [{ id: 'a', row: 0 }, { id: 'b', row: 0 }, { id: 'c', row: 1 }, { id: 'd', row: 1 }] };
  const a = app(slots);
  const card = kinds.get('card');
  const ctrls = card.controls(a, { kind: 'card', ref: 'cards.b' }, slots.cards[1]);
  ctrls.find((c) => c.id === 'move-l').run(a, { kind: 'card', ref: 'cards.b' });
  assert.deepEqual(slots.cards.map((c) => c.id), ['b', 'a', 'c', 'd'], 'b moved left within row 0');
});

test('reorderItem dragged across stacks adopts the target row', () => {
  const slots = { cards: [{ id: 'a', row: 0 }, { id: 'b', row: 0 }, { id: 'c', row: 1 }, { id: 'd', row: 1 }] };
  const a = app(slots);
  kinds.reorderItem(a, 'cards.a', 'cards.d'); // drag a (row 0) onto d (row 1)
  assert.equal(slots.cards.find((c) => c.id === 'a').row, 1, 'a adopts row 1');
});

test('reorderItem within a single row leaves row absent (no spurious row:0)', () => {
  const slots = { cards: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const a = app(slots);
  kinds.reorderItem(a, 'cards.a', 'cards.c');
  assert.deepEqual(slots.cards.map((c) => c.id), ['b', 'c', 'a'], 'order changed');
  assert.ok(slots.cards.every((c) => !('row' in c)), 'no row field introduced for a single-stack deck');
});
