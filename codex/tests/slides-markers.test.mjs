// slides-markers.test.mjs — item 3 rough edges, made DATA-DRIVEN (no layout-id
// branches): a steps layout carrying slots.orientation gets a row/col toggle on its
// list bar, and an agenda layout carrying slots.active gets a per-row "ativo" toggle
// that the renderer highlights. Both keyed off a slots field, so any future layout
// opts in just by declaring it. Pure logic + render; DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kinds from '../content/slides/js/select/kinds.js';
import { topicList } from '../content/slides/js/render/helpers.js';
import steps from '../content/slides/js/layouts/steps.js';
import agenda from '../content/slides/js/layouts/agenda.js';

/* ---------- steps orientation toggle (data-driven on the list container) ---------- */
test('a layout with slots.orientation gets a row/col toggle on its list container bar', () => {
  const slide = { layout: 'steps', slots: { orientation: 'row', steps: [{ id: 's1', text: 'A' }] } };
  let refreshed = 0;
  const app = { cur: () => slide, record() {}, refresh() { refreshed++; }, deck: () => ({ assets: [] }) };
  const ctrls = kinds.get('container').controls(app, { kind: 'container', ref: 'steps' });
  const o = ctrls.find((c) => c.id === 'orientation');
  assert.ok(o && o.type === 'toggle', 'orientation toggle present');
  assert.equal(o.on, false, 'off while orientation is "row"');
  o.write(app, { ref: 'steps' }, true);
  assert.equal(slide.slots.orientation, 'col', 'toggling on flips to col');
  o.write(app, { ref: 'steps' }, false);
  assert.equal(slide.slots.orientation, 'row', 'toggling off flips back to row');
});

test('a list WITHOUT slots.orientation shows no orientation toggle (topics layout untouched)', () => {
  const slide = { layout: 'topics', slots: { topics: [{ id: 't1', text: 'A' }] } };
  const app = { cur: () => slide, deck: () => ({ assets: [] }) };
  const ctrls = kinds.get('container').controls(app, { kind: 'container', ref: 'topics' });
  assert.ok(!ctrls.some((c) => c.id === 'orientation'), 'no orientation control without the slots field');
});

/* ---------- agenda active/now marker (data-driven on the topic bar + renderer) ---------- */
test('topicList marks the active row "on" and leaves the rest', () => {
  const rows = [{ id: 'r0', text: 'A' }, { id: 'r1', text: 'B' }, { id: 'r2', text: 'C' }];
  const html = topicList(rows, 'rows', null, 1);
  const lis = html.match(/<li class="([^"]*)"/g);
  assert.ok(/li class="on"/.test(html) || / on"/.test(html), 'one row carries the on class');
  assert.equal((html.match(/\bon\b/g) || []).length, 1, 'exactly one active row');
  assert.ok(/data-fkey="rows\.r1"[^]*?/.test(html.replace(/\n/g, '')), 'the second row is the active one');
});

test('topicList with no active index marks nothing (back-compat for plain lists)', () => {
  const html = topicList([{ id: 't1', text: 'A' }], 'topics');
  assert.ok(!/ on"/.test(html), 'no active marker without the index');
});

test('a layout with slots.active gets a per-row "ativo" toggle that sets slots.active', () => {
  const slide = { layout: 'agenda', slots: { active: null, rows: [{ id: 'r0', text: 'A' }, { id: 'r1', text: 'B' }] }, overrides: {} };
  const app = { cur: () => slide, record() {}, refresh() {}, deck: () => ({ assets: [] }) };
  const ctrls = kinds.get('topic').controls(app, { kind: 'topic', ref: 'rows.r1' });
  const a = ctrls.find((c) => c.id === 'active');
  assert.ok(a && a.type === 'toggle', '"ativo" toggle present for the agenda row');
  assert.equal(a.on, false, 'off while nothing is active');
  a.write(app, { ref: 'rows.r1' }, true);
  assert.equal(slide.slots.active, 1, 'marks THIS row (index 1) as active');
  a.write(app, { ref: 'rows.r1' }, false);
  assert.equal(slide.slots.active, null, 'un-marking clears the active row');
});

test('a plain topics list has no "ativo" toggle (no slots.active)', () => {
  const slide = { layout: 'topics', slots: { topics: [{ id: 't1', text: 'A' }] }, overrides: {} };
  const app = { cur: () => slide, deck: () => ({ assets: [] }) };
  const ctrls = kinds.get('topic').controls(app, { kind: 'topic', ref: 'topics.t1' });
  assert.ok(!ctrls.some((c) => c.id === 'active'), 'no active marker without the slots field');
});

/* ---------- the layouts declare the opt-in fields ---------- */
test('steps declares orientation, agenda declares active (the opt-in)', () => {
  assert.equal(steps.defaults().orientation, 'row', 'steps seeds an orientation');
  assert.ok('active' in agenda.defaults(), 'agenda seeds an active marker (null = none)');
  assert.match(agenda.render(agenda.defaults()), /class="topiclist" data-list="rows"/, 'agenda still renders its rows list');
});
