// N-level grouping (track-41, Élder 2026-07-17: "vai que outra sessão depois precisa ter 3
// níveis ou mais de colapso. temos que poder aceitar, senão depois acontece o que acontece
// hoje e cada um faz do seu jeito").
//
// `sections`/`bands` are sugar over `levels`; those paths are frozen byte-for-byte by
// list-rail-snapshot.test.mjs. THIS file tests what only `levels` can express, and the two
// things Lessons actually needs:
//   - depth >= 3, with collapse at EVERY level (a band is depth-2 sugar and never collapsed);
//   - MIXED depth: some groups hold sub-groups, their siblings hold rows directly.
// Without a depth-3 case, "accepts N levels" is an untested claim — a renderer accidentally
// hard-coded to two passes would still pass every other test in the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEl } from './list-rail-shapes.mjs';

const { mountRail } = await import('../js/list-rail.js');

// Lessons-shaped: section > subsection > row, where only SOME sections have a subsection.
//   llm      -> rows directly            (2 levels)
//   items    -> type:pdf, type:doc       (3 levels)
//   drive    -> folder:aula1             (3 levels)
const ITEMS = [
  { id: 'i1', sec: 'llm', sub: null, t: 'ChatGPT' },
  { id: 'i2', sec: 'items', sub: 'type:pdf', t: 'Apostila.pdf' },
  { id: 'i3', sec: 'items', sub: 'type:pdf', t: 'Guia.pdf' },
  { id: 'i4', sec: 'items', sub: 'type:doc', t: 'Roteiro.doc' },
  { id: 'i5', sec: 'drive', sub: 'folder:aula1', t: 'Slide.key' },
];
const SECS = [{ id: 'llm', title: 'LLMs' }, { id: 'items', title: 'Items' }, { id: 'drive', title: 'Drive' }];
const SUBS = [
  { id: 'type:pdf', title: 'PDF', parent: 'items' },
  { id: 'type:doc', title: 'Documento', parent: 'items' },
  { id: 'folder:aula1', title: 'Aula 1', parent: 'drive' },
];

function build(over = {}) {
  const el = makeEl();
  const rail = mountRail(el, Object.assign({
    items: () => ITEMS,
    getId: (it) => it.id,
    renderRow: (it) => ({ main: it.t }),
    levels: [
      { of: (it) => it.sec, list: () => SECS, collapsible: true },
      { of: (it) => it.sub, list: () => SUBS, collapsible: true },
    ],
  }, over));
  rail.render();
  return el.innerHTML;
}

test('3 levels: section > subsection > row, both levels collapsible', () => {
  const html = build();
  // The subsection is a real collapsible group, not a divider.
  assert.match(html, /data-sec="items"/, 'the section renders');
  assert.match(html, /data-sec="type:pdf"/, 'the SUBsection renders as a group too');
  assert.match(html, /data-sec-toggle="type:pdf"/, 'and it has its own toggle (a band would not)');
  // Nesting: the subsection sits INSIDE its section.
  const items = html.slice(html.indexOf('data-sec="items"'), html.indexOf('data-sec="drive"'));
  assert.match(items, /data-sec="type:pdf"/, 'type:pdf is inside items');
  assert.match(items, /data-sec="type:doc"/, 'type:doc is inside items');
  assert.ok(!items.includes('folder:aula1'), 'drive folders are NOT inside items');
});

// The mismatch that stopped Lessons from adopting the rail at all: `items`/`drive` are 3-level,
// the other sections go straight to rows. A fixed-depth grid needs a phantom sub-group for the
// 2-level ones, which paints an extra caret — and Lessons' look may not change.
test('MIXED depth: a section with rows directly, beside sections with sub-groups', () => {
  const html = build();
  const llm = html.slice(html.indexOf('data-sec="llm"'), html.indexOf('data-sec="items"'));
  assert.match(llm, /data-seclist="llm"[^>]*>.*ChatGPT/, 'llm holds its row directly');
  assert.ok(!/cdx-rail-sec" data-sec="type:|data-sec-toggle="llm:/.test(llm), 'no phantom sub-group is invented for it');
  // ...and the deep one still nests.
  assert.match(html, /data-seclist="type:pdf"[^>]*>.*Apostila\.pdf/);
});

test('an item lands in its DEEPEST named group, never twice', () => {
  const html = build();
  assert.equal((html.match(/data-id="i2"/g) || []).length, 1, 'i2 renders once');
  // i2 names sec=items AND sub=type:pdf; it belongs to the sub, not to items' own row list.
  const itemsList = /data-seclist="items"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(itemsList && !itemsList[1].includes('data-id="i2"'), 'i2 is not in items own row list');
  assert.match(html, /data-seclist="type:pdf"[^>]*>[\s\S]*?data-id="i2"/, 'i2 is in type:pdf');
});

test('4 levels: the recursion is not secretly capped at two passes', () => {
  const el = makeEl();
  mountRail(el, {
    items: () => [{ id: 'x', a: 'A1', b: 'B1', c: 'C1', d: 'D1' }],
    getId: (it) => it.id,
    renderRow: (it) => ({ main: it.id }),
    levels: [
      { of: (it) => it.a, list: () => [{ id: 'A1', title: 'A' }], collapsible: true },
      { of: (it) => it.b, list: () => [{ id: 'B1', title: 'B', parent: 'A1' }], collapsible: true },
      { of: (it) => it.c, list: () => [{ id: 'C1', title: 'C', parent: 'B1' }], collapsible: true },
      { of: (it) => it.d, list: () => [{ id: 'D1', title: 'D', parent: 'C1' }], collapsible: true },
    ],
  }).render();
  const h = el.innerHTML;
  for (const id of ['A1', 'B1', 'C1', 'D1']) assert.match(h, new RegExp('data-sec="' + id + '"'), id + ' renders');
  // Strictly nested, in order.
  assert.ok(h.indexOf('data-sec="A1"') < h.indexOf('data-sec="B1"'), 'B inside A');
  assert.ok(h.indexOf('data-sec="B1"') < h.indexOf('data-sec="C1"'), 'C inside B');
  assert.ok(h.indexOf('data-sec="C1"') < h.indexOf('data-sec="D1"'), 'D inside C');
  assert.match(h, /data-seclist="D1"[^>]*>[\s\S]*?data-id="x"/, 'the row lands at the deepest level');
});

test('hideWhenEmpty drops a group with nothing under it; without it the group stays', () => {
  const LIST = () => [{ id: 'cheio', title: 'Cheio' }, { id: 'vazio', title: 'Vazio' }];
  const cfgFor = (hide) => ({
    items: () => [{ id: 'r', g: 'cheio' }],
    getId: (it) => it.id,
    renderRow: (it) => ({ main: it.id }),
    levels: [{ of: (it) => it.g, list: LIST, collapsible: true, hideWhenEmpty: hide }],
  });
  const a = makeEl(); mountRail(a, cfgFor(true)).render();
  assert.ok(!a.innerHTML.includes('data-sec="vazio"'), 'hideWhenEmpty drops the empty group');
  assert.match(a.innerHTML, /data-sec="cheio"/);

  const b = makeEl(); mountRail(b, cfgFor(false)).render();
  assert.match(b.innerHTML, /data-sec="vazio"/, 'without it, the empty group still renders (Clientes needs this)');
});

// The drag contract must survive the nesting: only collapsible levels are drop targets.
test('a non-collapsible level is a band: no toggle, and NOT a drop target', () => {
  const el = makeEl();
  mountRail(el, {
    items: () => ITEMS,
    getId: (it) => it.id,
    renderRow: (it) => ({ main: it.t }),
    levels: [
      { of: () => null, list: () => [{ id: 'faixa', title: 'Faixa' }], collapsible: false, hideWhenEmpty: true },
      { of: (it) => it.sec, list: () => SECS.map((s) => Object.assign({}, s, { parent: 'faixa' })), collapsible: true },
    ],
  }).render();
  const h = el.innerHTML;
  assert.match(h, /<div class="cdx-rail-band" data-band="faixa">/, 'renders as a band');
  assert.ok(!/data-band="faixa"[^>]*data-seclist/.test(h), 'a band is never a drop container');
  assert.ok(!h.includes('data-sec-toggle="faixa"'), 'a band has no toggle');
  assert.match(h, /data-seclist="llm"/, 'its child sections still are drop containers');
});
