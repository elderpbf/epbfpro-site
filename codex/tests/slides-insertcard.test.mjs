// slides-insertcard.test.mjs — "+Inserir -> Card": the free-placed CARD stack, the
// twin of the Lista stack. It drops a stack asset (variant:"cards") whose items are
// CARDS living in slide.slots[listKey], rendered through the SAME card machinery as
// the Cards layout (composable parts, add/remove/reorder), so no bespoke selection
// code. Élder's ask: insert one card, then "add more" grows it into a stack like the
// others. Pure render + menu + descriptor contracts; DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { insertMenu } from '../content/slides/js/edit/menus.js';
import * as player from '../content/slides/js/render/player.js';
import * as kinds from '../content/slides/js/select/kinds.js';
import { cardList, cardItem } from '../content/slides/js/render/cardparts.js';
import { strategies } from '../content/slides/js/select/geometry.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/* ---------- the +Inserir menu offers a card object ---------- */
test('insertMenu offers a "card" stack object next to the list one', () => {
  const m = insertMenu();
  const entry = m.find((c) => c.id === 'ins-card');
  assert.ok(entry, 'has a Card entry');
  assert.equal(entry.labelKey, 'slides.ed_card');
  let inserted = null;
  entry.run({ insertElement: (kind) => { inserted = kind; } });
  assert.equal(inserted, 'card', 'runs app.insertElement("card")');
});

/* ---------- cardList: the card analog of topicList, bound to a listKey ---------- */
test('cardList renders a .cardrow bound to its listKey, each card path-prefixed by it', () => {
  const html = cardList([{ id: 'c1', parts: { title: true, body: true }, title: 'T', text: 'B' }], 'ins7');
  assert.match(html, /class="cardrow[^"]*" data-list="ins7"/, 'a cardrow carrying its list key');
  assert.match(html, /data-fkey="ins7\.c1"/, 'card identity is keyed by the listKey (survives reorder)');
  assert.match(html, /data-path="ins7\.0\.title"/, 'title edits through the listKey path');
  assert.match(html, /data-path="ins7\.0\.text"/, 'body edits through the listKey path');
});

test('cardItem defaults to the "cards" list (the Cards layout is unchanged)', () => {
  const html = cardItem({ id: 'c1', parts: { body: true }, text: 'x' }, 0, 1);
  assert.match(html, /data-fkey="cards\.c1"/, 'default list name stays "cards"');
  assert.match(html, /data-path="cards\.0\.text"/);
});

/* ---------- render: a cards-variant stack renders cards, not bullets ---------- */
test('slideHTML renders a stack variant:"cards" as a positioned cardrow of cards', () => {
  const deck = {
    assets: [{ id: 'A', type: 'stack', variant: 'cards', listKey: 'ins7', x: 100, y: 80, w: 320, rot: 0, scope: 'slide', slideId: 's1' }],
    logo: null,
  };
  const slide = { id: 's1', layout: 'statement', slots: { text: 'x', ins7: [{ id: 'c1', parts: { body: true }, text: 'Um' }] } };
  const html = player.slideHTML(deck, slide);
  assert.match(html, /class="asset a-stack" data-asset="A"/, 'rendered as a stack asset box');
  assert.match(html, /left:100px;top:80px;width:320px/, 'positioned from the asset geometry');
  assert.match(html, /class="cardrow[^"]*" data-list="ins7"/, 'its items are CARDS, keyed by the listKey');
  assert.match(html, /class="card"[^>]*data-fkey="ins7\.c1"/, 'a card (not a bullet)');
  assert.ok(!/<ul class="topiclist" data-list="ins7"/.test(html), 'NOT rendered as a topic list');
});

/* ---------- adding: the stack grows with CARD-shaped items ---------- */
test('the container kind adds a CARD (not a bullet) to a cards-variant stack', () => {
  const slide = { id: 's1', slots: { ins7: [{ id: 'c1', parts: { body: true }, text: 'A' }] } };
  const deck = { assets: [{ id: 'A', type: 'stack', variant: 'cards', listKey: 'ins7', slideId: 's1' }] };
  const app = { cur: () => slide, deck: () => deck, record() {}, refresh() {}, maxStep: () => 0 };
  const d = kinds.get('container');
  // a card stack's row carries data-list, so the container resolves to that key
  assert.deepEqual(
    d.match({ closest: (s) => (s === '.cardrow' ? { dataset: { list: 'ins7' } } : null) }),
    { kind: 'container', ref: 'ins7' },
  );
  const add = d.controls(app, { kind: 'container', ref: 'ins7' }).find((c) => c.id === 'add');
  add.run(app, { kind: 'container', ref: 'ins7' });
  assert.equal(slide.slots.ins7.length, 2, 'a second item was added');
  assert.ok(slide.slots.ins7[1].parts, 'the new item is a CARD (carries parts), not a bullet');
});

test('a SELECTED stack offers an add control on its own bar (so it grows in one click)', () => {
  const slide = { id: 's1', slots: { ins7: [{ id: 'c1', parts: { body: true }, text: 'A' }] } };
  const a = { id: 'A', type: 'stack', variant: 'cards', listKey: 'ins7', slideId: 's1' };
  const deck = { assets: [a] };
  const app = { cur: () => slide, deck: () => deck, record() {}, refresh() {}, maxStep: () => 0, selectClear() {} };
  const add = kinds.get('asset').controls(app, { kind: 'asset', ref: 'A' }, a).find((c) => c.id === 'add');
  assert.ok(add, 'the selected stack bar has an add button');
  add.run(app, { kind: 'asset', ref: 'A' });
  assert.equal(slide.slots.ins7.length, 2, 'clicking add grew the stack');
});

/* ---------- resize isolation: a free-placed card never corrupts the layout rowW ---------- */
test('flowCard.write skips slots.rowW for a free-placed card (no collision with the Cards layout)', () => {
  const free = { slots: {} };
  const appFree = { cur: () => free, deck: () => ({ assets: [] }) };
  strategies.flowCard.write(appFree, { ref: 'ins7.c1' }, { w: 200, h: 100 });
  assert.equal(free.slots.rowW, undefined, 'a free-placed card stack sizes via its box, not slots.rowW');

  const layout = { slots: { cards: [{ id: 'c1' }] } };
  const appLayout = { cur: () => layout };
  strategies.flowCard.write(appLayout, { ref: 'cards.c1' }, { w: 240, h: 100 });
  assert.equal(layout.slots.rowW[0], 240, 'a Cards-layout card still sizes its row');
});

/* ---------- source contracts ---------- */
test('app.insertElement handles the card stack (free-placed, cards in slots)', () => {
  const src = read('../content/slides/js/app.js');
  assert.match(src, /type === "card"|"cards"/, 'insertElement has a card branch');
  assert.match(src, /variant/, 'a card stack records its variant');
});

test('player renders a cards-variant stack via the shared cardList', () => {
  const src = read('../content/slides/js/render/player.js');
  assert.match(src, /cardList/, 'reuses the shared cardList renderer');
  assert.match(src, /variant === "cards"|"cards"/, 'branches on the stack variant');
});
