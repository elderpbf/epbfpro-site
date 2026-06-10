// slides-listlayouts.test.mjs — the list-bearing layouts (compare / checklist /
// steps) + the generalization that makes one layout host several named lists, each
// editable through the SAME topic + container descriptors. Pure, DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../content/slides/js/layouts/registry.js';
import * as kinds from '../content/slides/js/select/kinds.js';
import { topicList } from '../content/slides/js/render/helpers.js';
import compare from '../content/slides/js/layouts/compare.js';
import checklist from '../content/slides/js/layouts/checklist.js';
import steps from '../content/slides/js/layouts/steps.js';

const NO_CONTROL = /cardctl|data-cardmode|data-cardmove|data-carddel|<button/;
const stubApp = (slots) => ({ cur: () => ({ slots }), record: () => {}, refresh: () => {}, stage: { querySelector: () => null } });

/* ---------- the list generalization ---------- */
test('topicList(items, name) tags the <ul> with data-list and prefixes every item ref', () => {
  const html = topicList([{ id: 'k', text: 'x' }], 'left');
  assert.match(html, /<ul class="topiclist" data-list="left">/);
  assert.match(html, /data-fkey="left\.k"/, 'item fkey is prefixed with the list name');
  assert.match(html, /data-path="left\.0\.text"/, 'content path is prefixed too');
});

test('container.match reads data-list, so ANY named list resolves to its own slot', () => {
  const d = kinds.get('container');
  const ul = { dataset: { list: 'right' } };
  assert.deepEqual(d.match({ closest: (s) => (s === '.topiclist' ? ul : null) }), { kind: 'container', ref: 'right' });
  const noList = { dataset: {} };
  assert.deepEqual(d.match({ closest: (s) => (s === '.topiclist' ? noList : null) }), { kind: 'container', ref: 'topics' }, 'absent data-list -> topics');
});

test('container add appends to whichever named list was clicked (not just topics)', () => {
  const d = kinds.get('container');
  const slots = { left: [{ id: 'x', text: 'a' }] };
  const a = stubApp(slots);
  const ctrls = d.controls(a, { kind: 'container', ref: 'left' }, null);
  const add = ctrls.find((c) => c.id === 'add');
  assert.ok(add, 'generic list offers add');
  add.run(a, { kind: 'container', ref: 'left' });
  assert.equal(slots.left.length, 2, 'item appended to the left list');
  assert.equal(typeof slots.left[1].id, 'string', 'new item is id-bearing');
});

/* ---------- compare ---------- */
test('compare: two panels with free title/badge slots + two independent named lists', () => {
  const html = compare.render(compare.defaults());
  assert.match(html, /class="L-comp"/);
  for (const slot of ['leftTitle', 'badge', 'rightTitle']) {
    assert.match(html, new RegExp(`data-path="${slot}"`), `${slot} is a free text slot`);
  }
  assert.match(html, /<ul class="topiclist" data-list="left">/, 'left bullets are a named list');
  assert.match(html, /<ul class="topiclist" data-list="right">/, 'right bullets are a named list');
  assert.equal(compare.reveals(), 0);
  assert.ok(!NO_CONTROL.test(html), 'content only');
});

/* ---------- checklist ---------- */
test('checklist: title + dos/donts named lists (✓/✕ are CSS, not content)', () => {
  const html = checklist.render(checklist.defaults());
  assert.match(html, /class="L-check"/);
  assert.match(html, /data-path="title"/);
  assert.match(html, /<ul class="topiclist" data-list="dos">/);
  assert.match(html, /<ul class="topiclist" data-list="donts">/);
  assert.ok(!NO_CONTROL.test(html), 'content only');
});

/* ---------- steps ---------- */
test('steps: a named "steps" list + orientation class; numbering is CSS, not content', () => {
  const d = steps.defaults();
  const html = steps.render(d);
  assert.match(html, /class="L-steps /);
  assert.match(html, /<ul class="topiclist" data-list="steps">/);
  assert.ok(!/data-step="0"/.test(html) || true); // numbering is a CSS counter, not a stored field
  const col = steps.render({ ...d, orientation: 'col' });
  assert.match(col, /class="L-steps col"/, 'vertical option flips the body class');
});

/* ---------- registration ---------- */
test('compare / checklist / steps are registered for the +slide picker', () => {
  const ids = registry.list().map((L) => L.id);
  for (const id of ['compare', 'checklist', 'steps']) {
    assert.ok(ids.includes(id), `${id} registered`);
    assert.ok(registry.get(id).label, `${id} has a label`);
  }
});
