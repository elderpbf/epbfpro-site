// slides-layouts.test.mjs — the new layout primitives (4b). Each is a plugin that
// emits CONTENT ONLY and reuses the shared text/image/topic helpers, so it edits
// through the existing descriptors with no selection-model change. Pure, DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../content/slides/js/layouts/registry.js';
import statement from '../content/slides/js/layouts/statement.js';
import quote from '../content/slides/js/layouts/quote.js';
import imagebox from '../content/slides/js/layouts/imagebox.js';

const NO_CONTROL = /cardctl|data-cardmode|data-cardmove|data-carddel|data-del=|data-add=|<button/;

test('the new layouts are registered (so the +slide picker lists them)', () => {
  const ids = registry.list().map((L) => L.id);
  for (const id of ['statement', 'quote', 'imagebox']) {
    assert.ok(ids.includes(id), `${id} is registered`);
    assert.equal(typeof registry.get(id).render, 'function', `${id}.render`);
    assert.ok(registry.get(id).label, `${id} carries a picker label`);
  }
});

test('every layout satisfies the plugin contract { id, label, defaults, render, reveals }', () => {
  for (const L of [statement, quote, imagebox]) {
    assert.equal(typeof L.id, 'string');
    assert.equal(typeof L.label, 'string');
    assert.equal(typeof L.defaults, 'function');
    assert.equal(typeof L.render, 'function');
    assert.equal(typeof L.reveals, 'function');
  }
});

test('statement: a single free text slot, reveals 0, no control markup', () => {
  const html = statement.render(statement.defaults());
  assert.match(html, /class="L-statement"/);
  assert.match(html, /data-path="text"/, 'text is a free slot (editable + freeform)');
  assert.match(html, /data-fkey="text"/);
  assert.equal(statement.reveals(), 0);
  assert.ok(!NO_CONTROL.test(html), 'content only');
});

test('quote: quote + author + role free slots, reveals 0', () => {
  const html = quote.render(quote.defaults());
  for (const slot of ['quote', 'author', 'role']) {
    assert.match(html, new RegExp(`data-path="${slot}"`), `${slot} is editable`);
    assert.match(html, new RegExp(`data-fkey="${slot}"`), `${slot} is freeform`);
  }
  assert.equal(quote.reveals(), 0);
  assert.ok(!NO_CONTROL.test(html), 'content only');
});

test('imagebox: a contained image slot + a topic list + title; reveals = topic count', () => {
  const d = imagebox.defaults();
  const html = imagebox.render(d);
  assert.match(html, /class="ib-pic"/);
  assert.match(html, /class="imgslot[^"]*"[^>]*data-fkey="image"/, 'image is the shared selectable box');
  assert.match(html, /class="topiclist"/, 'reuses the shared topic list (edits like topics)');
  assert.match(html, /data-path="title"/, 'title is editable');
  assert.equal(imagebox.reveals(d), 3, 'three seeded topics -> reveals 3');
  assert.ok(!NO_CONTROL.test(html), 'content only');
});

test('imagebox topics are id-bearing {id,text} (so they edit + reorder like split/topics)', () => {
  assert.ok(imagebox.defaults().topics.every((t) => t && typeof t.id === 'string' && typeof t.text === 'string'));
});
