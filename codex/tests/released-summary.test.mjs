// "What is released in this lesson?", answered before the sections (Élder 2026-08-17:
// *"uma coisa que falta na lista de releases é uma lista do que está liberado antes da lista de
// seções"*).
//
// The composer is a single-open accordion: one group starts open, the rest sit collapsed behind
// a "liberados/total" count. So the one question a teacher asks that screen could only be
// answered by opening every section in turn.
//
// The block reads the LIVE ticks, not the saved state, and that is the property worth pinning:
// the ticks are what Save is about to write, so a block showing anything else would be a second
// source of truth on the screen that decides what students can see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { summarize, summaryHtml } from '../js/released-summary.js';
import { pickerGroupsHtml } from '../js/item-picker.js';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const relSrc = read('../content/releases.js');
const sumSrc = read('../js/released-summary.js');

const row = (id, o = {}) => Object.assign({ id, title: 'Item ' + id, section: 'type-prompt', saved: false, checked: false }, o);


test('the section name this block reads carries NO markup (guards the 2026-08-18 header bug)', () => {
  // rowsFromPicker names each row's section from `.cdx-picker-group-name`'s textContent, so
  // whatever the painter leaves inside that span IS this block's section label. From 2026-08-16
  // to 2026-08-18 Liberacoes handed the type glyph over inside the `label`, the painter escaped
  // it, and the summary's section name was the whole <svg> as text. The contract, pinned at the
  // seam: the glyph sits OUTSIDE the name span, the name span holds text only.
  const html = pickerGroupsHtml([{
    key: 'type-prompt', label: 'Prompt para IA', count: 18, subCount: 0,
    glyphHtml: '<svg id="g"></svg>', rowsHtml: '',
  }], {});
  const name = /<span class="cdx-picker-group-name">([\s\S]*?)<\/span>/.exec(html);
  assert.ok(name, 'the span the summary reads exists');
  assert.equal(name[1], 'Prompt para IA (0/18)');
  assert.ok(!name[1].includes('<') && !name[1].includes('&lt;'), 'no markup, raw OR escaped, inside the name the summary borrows');
  assert.ok(html.indexOf('<svg id="g">') < html.indexOf('cdx-picker-group-name'), 'the glyph is its own span, before the name');
});

test('an untouched lesson lists exactly what is stored', () => {
  const s = summarize([row(1, { saved: true, checked: true }), row(2), row(3, { saved: true, checked: true })]);
  assert.equal(s.total, 2);
  assert.equal(s.added, 0);
  assert.equal(s.removed, 0);
  assert.deepEqual(s.items.map((i) => i.state), ['kept', 'kept']);
});

test('an item never released and not ticked is not mentioned at all', () => {
  // Most of the library is in this state on any given lesson. Listing it would drown the answer.
  assert.deepEqual(summarize([row(1), row(2), row(3)]).items, []);
});

test('a fresh tick counts, and is marked as pending', () => {
  const s = summarize([row(1, { saved: true, checked: true }), row(2, { checked: true })]);
  assert.equal(s.total, 2, 'the count is what Save will write');
  assert.equal(s.added, 1);
  assert.equal(s.items[1].state, 'added');
});

test('an untick still shows, struck through, and leaves the count', () => {
  // The value of the block at this moment is that it says what you are about to take away.
  const s = summarize([row(1, { saved: true, checked: false }), row(2, { saved: true, checked: true })]);
  assert.equal(s.total, 1);
  assert.equal(s.removed, 1);
  assert.equal(s.items[0].state, 'removed');
});

test('order is the section order of the list below it', () => {
  const s = summarize([
    row(7, { section: 'apostila', saved: true, checked: true }),
    row(8, { section: 'type-lab', checked: true }),
    row(9, { section: 'drive', saved: true, checked: true }),
  ]);
  assert.deepEqual(s.items.map((i) => i.section), ['apostila', 'type-lab', 'drive']);
});

test('nothing at all still renders the block, with the empty line', () => {
  const html = summaryHtml(summarize([]), { title: (n) => 'Liberado (' + n + ')', empty: 'Nada liberado ainda.' });
  assert.match(html, /Liberado \(0\)/);
  assert.match(html, /Nada liberado ainda\./);
  assert.ok(!/cdx-rel-sum-row/.test(html));
});

test('every line can send you to its own tick', () => {
  const html = summaryHtml(
    summarize([row(4, { section: 'type-prompt', saved: true, checked: true })]),
    { title: (n) => 'X (' + n + ')', empty: '', added: 'novo', removed: 'sai' }
  );
  assert.match(html, /data-sum-id="4"/);
  assert.match(html, /data-sum-section="type-prompt"/);
});

test('a title is escaped, because item titles are user input', () => {
  const html = summaryHtml(
    summarize([row(1, { title: '<img src=x onerror=1>', saved: true, checked: true })]),
    { title: () => 'x', empty: '' }
  );
  assert.ok(!/<img/.test(html));
});

// ── how it is wired ─────────────────────────────────────────────────────────

test('the block is fed by the checkboxes, and re-read on every tick', () => {
  assert.match(sumSrc, /defaultChecked/, 'the saved baseline is the rendered checked attribute');
  assert.match(relSrc, /rowsFromPicker\(list\)/);
  assert.match(relSrc, /addEventListener\('change'/, 'one listener on the list, not one per row');
});

test('both composers get it, and the Outros one is not called a lesson', () => {
  assert.match(relSrc, /releases\.summary_title_outros/);
  for (const k of ['releases.summary_title', 'releases.summary_title_outros', 'releases.summary_empty',
                   'releases.summary_added', 'releases.summary_removed']) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

test('the summary module owns no strings of its own', () => {
  // It takes labels as an argument, so it never imports i18n and stays testable with no DOM.
  assert.ok(!/i18n\.js/.test(sumSrc), 'no i18n import');
  assert.ok(!/—/.test(sumSrc), 'no em dashes');
});
