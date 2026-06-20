// Item library search + sort (Batch A). The pure core (applyItemSearchSort) is
// unit-tested here; a source-contract check pins the toolbar controls + wiring so
// the search box can't drift back into the re-rendered region (focus-loss bug).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyItemSearchSort } from '../content/items.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ITEMS = [
  { id: 1, title: 'Zebra prompt', summary: 'about stripes', type: 'prompt', updated_at: 30 },
  { id: 2, title: 'apple guide', summary: 'fruit', type: 'guia', updated_at: 10 },
  { id: 3, title: 'Mango note', summary: 'tropical zebra', type: 'prompt', updated_at: 20 },
];
const typeLabel = (t) => ({ prompt: 'Prompt', guia: 'Guia' }[t] || t);

test('recent sort orders by updated_at desc (default)', () => {
  const out = applyItemSearchSort(ITEMS, '', 'recent', typeLabel);
  assert.deepEqual(out.map((i) => i.id), [1, 3, 2]);
});

test('alpha sort is case-insensitive A-Z by title', () => {
  const out = applyItemSearchSort(ITEMS, '', 'alpha', typeLabel);
  assert.deepEqual(out.map((i) => i.title), ['apple guide', 'Mango note', 'Zebra prompt']);
});

test('type sort groups by type label, then title', () => {
  const out = applyItemSearchSort(ITEMS, '', 'type', typeLabel);
  // Guia (apple) first, then the two Prompts alpha by title (Mango, Zebra)
  assert.deepEqual(out.map((i) => i.id), [2, 3, 1]);
});

test('search matches title OR summary, case-insensitive', () => {
  const byTitle = applyItemSearchSort(ITEMS, 'mango', 'recent', typeLabel);
  assert.deepEqual(byTitle.map((i) => i.id), [3]);
  // "zebra" hits item 1 title and item 3 summary
  const bySummary = applyItemSearchSort(ITEMS, 'ZEBRA', 'alpha', typeLabel);
  assert.deepEqual(bySummary.map((i) => i.id).sort(), [1, 3]);
});

test('is pure: does not mutate the input array', () => {
  const input = ITEMS.slice();
  const snapshot = input.map((i) => i.id);
  applyItemSearchSort(input, 'a', 'alpha', typeLabel);
  assert.deepEqual(input.map((i) => i.id), snapshot);
});

test('search + sort sit at the top of the left list panel, wired outside the grid', () => {
  const src = read('../content/items.js');
  // both live in the list-column header (rendered once, not in the re-rendered grid)
  assert.match(src, /cdx-items-listhead[\s\S]*?id="cdx-items-search"[\s\S]*?id="cdx-items-sort"/);
  // sort is a click-to-cycle BUTTON, not a dropdown
  assert.match(src, /button[^>]*id="cdx-items-sort" class="cdx-items-sortbtn"/);
  assert.ok(!/<select[^>]*id="cdx-items-sort"/.test(src), 'no sort <select> dropdown');
  // search feeds _renderItems; sort cycles recent -> alpha -> type
  assert.match(src, /_itemSearch = searchEl\.value; _renderItems\(\)/);
  assert.match(src, /\['recent', 'alpha', 'type'\]/);
});

test('search/sort i18n keys exist in both dictionaries', () => {
  const pt = read('../i18n/pt.js'), en = read('../i18n/en.js');
  for (const key of ['content.search_ph', 'content.sort_label', 'content.sort_recent',
    'content.sort_alpha', 'content.sort_type', 'content.empty_search']) {
    assert.ok(pt.includes(`'${key}'`), `pt.js has ${key}`);
    assert.ok(en.includes(`'${key}'`), `en.js has ${key}`);
  }
});
