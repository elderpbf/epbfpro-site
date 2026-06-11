// slides-multifield.test.mjs — the layouts that need more than a single-text list:
// roadmap (a node + an "active" toggle), define / agenda (two-field {term/time,text}
// items). Covers the multi-field list helper, the derive-from-seed newItem, and the
// roadnode selection kind. Pure, DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../content/slides/js/layouts/registry.js';
import * as kinds from '../content/slides/js/select/kinds.js';
import { topicList } from '../content/slides/js/render/helpers.js';
import roadmap from '../content/slides/js/layouts/roadmap.js';
import define from '../content/slides/js/layouts/define.js';
import agenda from '../content/slides/js/layouts/agenda.js';

const stubApp = (slots, layout) => ({ cur: () => ({ slots, layout }), record: () => {}, refresh: () => {}, stage: { querySelector: () => null } });
const NO_CONTROL = /cardctl|data-cardmode|<button/;

/* ---------- multi-field list helper ---------- */
test('topicList with fields renders one editable span per field, each path-prefixed', () => {
  const html = topicList([{ id: 'k', term: 'LLM', text: 'def' }], 'terms', [{ key: 'term', cls: 'd-term' }, { key: 'text', cls: 'd-def' }]);
  assert.match(html, /data-path="terms\.0\.term"/, 'term field path');
  assert.match(html, /data-path="terms\.0\.text"/, 'text field path');
  assert.match(html, /class="editable d-term"/, 'field css class applied');
  assert.match(html, /data-fkey="terms\.k"/, 'one li, id-keyed');
});

/* ---------- derive-from-seed newItem ---------- */
test('container add on a multi-field list derives the full item shape from the layout seed', () => {
  const d = kinds.get('container');
  const slots = { terms: [{ id: 't1', term: 'A', text: 'a' }] };
  const a = stubApp(slots, 'define'); // real "define" layout seeds {id,term,text}
  d.controls(a, { kind: 'container', ref: 'terms' }, null).find((c) => c.id === 'add').run(a, { kind: 'container', ref: 'terms' });
  assert.equal(slots.terms.length, 2);
  const added = slots.terms[1];
  assert.ok('term' in added && 'text' in added, 'new item carries BOTH fields, not just text');
  assert.equal(added.term, '', 'text fields start empty');
  assert.equal(added.text, '');
  assert.equal(typeof added.id, 'string');
});

/* ---------- roadnode kind ---------- */
test('roadnode matches a node inside .roadnodes and wins over the generic topic kind', () => {
  const inRoad = { closest: (s) => (s === '.roadnodes' ? {} : s === 'li[data-fkey]' ? { dataset: { fkey: 'nodes.n1' } } : null) };
  assert.deepEqual(kinds.matchKind(inRoad), { kind: 'roadnode', ref: 'nodes.n1' }, 'roadnode wins inside .roadnodes');
  const plainLi = { closest: (s) => (s === 'li[data-fkey]' ? { dataset: { fkey: 'topics.t1' } } : null) };
  assert.deepEqual(kinds.matchKind(plainLi), { kind: 'topic', ref: 'topics.t1' }, 'a normal bullet is still a topic');
});

test('roadnode controls carry an "active" toggle that sets slots.active to the node index', () => {
  const slots = { nodes: [{ id: 'n1', text: 'a' }, { id: 'n2', text: 'b' }], active: 0 };
  const a = stubApp(slots);
  const ctrls = kinds.get('roadnode').controls(a, { kind: 'roadnode', ref: 'nodes.n2' });
  const active = ctrls.find((c) => c.id === 'active');
  assert.ok(active && active.type === 'toggle', 'has an active toggle');
  assert.equal(active.on, false, 'n2 is not active yet (active=0)');
  active.write(a, { kind: 'roadnode', ref: 'nodes.n2' }, true);
  assert.equal(slots.active, 1, 'toggling makes n2 (index 1) the active node');
  assert.ok(ctrls.some((c) => c.id === 'delete' && c.danger), 'still a full item bar (move/add/delete)');
});

/* ---------- renders ---------- */
test('roadmap: exactly one node is marked active, eyebrow is a free slot', () => {
  const html = roadmap.render(roadmap.defaults()); // active = 3 (Tokens)
  assert.match(html, /class="topiclist roadnodes" data-list="nodes"/);
  assert.equal((html.match(/class="on"/g) || []).length, 1, 'exactly one active node');
  assert.match(html, /class="on"[^>]*><span[^>]*>Tokens</, 'the 4th node (Tokens) is active');
  assert.match(html, /data-path="eyebrow"/, 'eyebrow editable');
  assert.ok(!NO_CONTROL.test(html), 'content only');
});

test('roadmap clamps an out-of-range active index (never highlights nothing)', () => {
  const d = roadmap.defaults();
  const html = roadmap.render({ ...d, active: 99 });
  assert.equal((html.match(/class="on"/g) || []).length, 1, 'still exactly one node highlighted');
});

test('define: two-field term/def grid; new items derive {term,text}', () => {
  const html = define.render(define.defaults());
  assert.match(html, /class="L-def"/);
  assert.match(html, /class="editable d-term"/);
  assert.match(html, /class="editable d-def"/);
  assert.match(html, /<ul class="topiclist" data-list="terms">/);
  assert.ok(define.defaults().terms.every((t) => typeof t.term === 'string' && typeof t.text === 'string'));
});

test('agenda: time + label rows', () => {
  const html = agenda.render(agenda.defaults());
  assert.match(html, /class="L-agenda"/);
  assert.match(html, /class="editable ag-time"/);
  assert.match(html, /class="editable ag-label"/);
  assert.match(html, /<ul class="topiclist" data-list="rows">/);
});

/* ---------- registration ---------- */
test('roadmap / define / agenda are registered for the +slide picker', () => {
  const ids = registry.list().map((L) => L.id);
  for (const id of ['roadmap', 'define', 'agenda']) {
    assert.ok(ids.includes(id), `${id} registered`);
    assert.ok(registry.get(id).label, `${id} has a label`);
  }
});
