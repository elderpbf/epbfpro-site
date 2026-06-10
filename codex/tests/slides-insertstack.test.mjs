// slides-insertstack.test.mjs — Step 3a: "+Inserir -> Lista" drops a free-placed
// STACK (a list that starts with one item and grows), not a single floating box.
// The stack's items live in slide.slots under a generated key, so the WHOLE topic
// machinery (select/edit/add/remove/reorder) drives them with no new selection code;
// a "stack" asset only carries the geometry + which slots list it shows. Pure render
// + menu + source contracts; DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { insertMenu } from '../content/slides/js/edit/menus.js';
import * as player from '../content/slides/js/render/player.js';
import * as kinds from '../content/slides/js/select/kinds.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/* ---------- the +Inserir menu offers a list object ---------- */
test('insertMenu offers a "list" stack object alongside the free elements', () => {
  const m = insertMenu();
  const entry = m.find((c) => c.id === 'ins-list');
  assert.ok(entry, 'has a Lista entry');
  assert.equal(entry.type, 'button');
  assert.equal(entry.labelKey, 'slides.ed_list');
  let inserted = null;
  entry.run({ insertElement: (kind) => { inserted = kind; } });
  assert.equal(inserted, 'list', 'runs app.insertElement("list")');
});

/* ---------- render: a stack asset renders its slots list, positioned ---------- */
test('slideHTML renders a stack asset as a positioned topiclist bound to its listKey', () => {
  const deck = {
    assets: [{ id: 'A', type: 'stack', variant: 'list', listKey: 'ins7', x: 100, y: 80, w: 400, rot: 0, scope: 'slide', slideId: 's1' }],
    logo: null,
  };
  const slide = { id: 's1', layout: 'statement', slots: { text: 'x', ins7: [{ id: 'i1', text: 'Um' }, { id: 'i2', text: 'Dois' }] } };
  const html = player.slideHTML(deck, slide);
  assert.match(html, /class="asset a-stack" data-asset="A"/, 'rendered as a stack asset box');
  assert.match(html, /left:100px;top:80px;width:400px/, 'positioned from the asset geometry');
  assert.match(html, /<ul class="topiclist" data-list="ins7">/, 'its items are a named list keyed by the listKey');
  assert.match(html, /data-fkey="ins7\.i1"/, 'each item is selectable as a topic (id-keyed by the listKey)');
  assert.match(html, /data-path="ins7\.0\.text"/, 'and editable through the listKey path');
  assert.match(html, />Um</);
});

test('an empty/unknown stack list renders an empty topiclist (no crash)', () => {
  const deck = { assets: [{ id: 'A', type: 'stack', variant: 'list', listKey: 'gone', x: 0, y: 0, w: 300, rot: 0, scope: 'slide', slideId: 's1' }], logo: null };
  const slide = { id: 's1', layout: 'statement', slots: { text: 'x' } };
  const html = player.slideHTML(deck, slide);
  assert.match(html, /<ul class="topiclist" data-list="gone">/);
});

/* ---------- the stack's items drive through the existing container/topic kinds ---------- */
test('the container kind adds an item to the stack list by its key (reuses addItem)', () => {
  const slide = { slots: { ins7: [{ id: 'i1', text: 'Um' }] } };
  let refreshed = 0;
  const app = { cur: () => slide, record: () => {}, refresh: () => { refreshed++; }, maxStep: () => 0 };
  const d = kinds.get('container');
  // a free list ul carries data-list="ins7", so the container resolves to that key
  assert.deepEqual(d.match({ closest: (s) => (s === '.cardrow' ? null : s === '.topiclist' ? { dataset: { list: 'ins7' } } : null) }), { kind: 'container', ref: 'ins7' });
  d.controls(app, { kind: 'container', ref: 'ins7' }).find((c) => c.id === 'add').run(app, { kind: 'container', ref: 'ins7' });
  assert.equal(slide.slots.ins7.length, 2, 'a second item was added to the free list');
  assert.equal(typeof slide.slots.ins7[1].id, 'string');
});

/* ---------- source contracts ---------- */
test('app.insertElement handles the stack/list insert (free-placed, items in slots)', () => {
  const src = read('../content/slides/js/app.js');
  assert.match(src, /type === "list"|type === "stack"|"stack"/, 'insertElement has a stack/list branch');
  assert.match(src, /listKey/, 'a stack asset records which slots list it shows');
});

test('player renders the stack via the shared topicList (no bespoke list markup)', () => {
  const src = read('../content/slides/js/render/player.js');
  assert.match(src, /topicList/, 'reuses the shared topicList renderer');
  assert.match(src, /"stack"|=== .stack./, 'has a stack asset branch');
});
