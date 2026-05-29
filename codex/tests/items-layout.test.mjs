// Lista + Prévia (master-detail) for the Items sub-tab.
// The list selects an item; the preview pane renders it with inline actions.
// Pure selection rules are DOM-free and unit-tested here; the layout itself is
// asserted by source/CSS contract (zero-dependency, no jsdom in this repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const items = await import('../content/items.js');
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── resolveSelection: which item the preview should show on every re-render ──
test('resolveSelection keeps the current id when still present', () => {
  assert.equal(items.resolveSelection([{ id: 1 }, { id: 2 }, { id: 3 }], 2), 2);
});

test('resolveSelection falls back to the first item when current is gone', () => {
  assert.equal(items.resolveSelection([{ id: 5 }, { id: 6 }], 99), 5);
});

test('resolveSelection picks the first item when nothing is selected', () => {
  assert.equal(items.resolveSelection([{ id: 7 }, { id: 8 }], null), 7);
});

test('resolveSelection returns null for an empty or missing list', () => {
  assert.equal(items.resolveSelection([], 1), null);
  assert.equal(items.resolveSelection(null, 1), null);
});

test('resolveSelection compares ids loosely (string vs number)', () => {
  assert.equal(items.resolveSelection([{ id: 10 }, { id: 11 }], '11'), 11);
});

// ── selectionAfterRemoval: which neighbour to select after a delete ─────────
test('selectionAfterRemoval picks the item that shifts into the freed slot', () => {
  assert.equal(items.selectionAfterRemoval([{ id: 1 }, { id: 2 }, { id: 3 }], 2), 3);
});

test('selectionAfterRemoval clamps to the last item when removing the last', () => {
  assert.equal(items.selectionAfterRemoval([{ id: 1 }, { id: 2 }, { id: 3 }], 3), 2);
});

test('selectionAfterRemoval returns null when the list empties', () => {
  assert.equal(items.selectionAfterRemoval([{ id: 9 }], 9), null);
});

// ── layout contract (source + CSS) ─────────────────────────────────────────
test('Items uses a master-detail split (list + preview) wired to the renderer', () => {
  const src = read('../content/items.js');
  assert.match(src, /cdx-items-split/, 'authors the split container');
  assert.match(src, /cdx-item-preview/, 'authors the preview pane');
  assert.match(src, /window\.CTRenderer/, 'renders the preview through the shared renderer');
  assert.ok(!/—/.test(src), 'no em dashes');
});

test('content.css styles the split layout', () => {
  const css = read('../content/content.css');
  assert.match(css, /\.cdx-items-split/, 'split layout styled');
  assert.match(css, /\.cdx-item-preview/, 'preview pane styled');
});

// ── i18n: preview strings exist in both dictionaries ────────────────────────
test('preview i18n keys exist in both dictionaries', () => {
  for (const k of ['content.preview_empty', 'content.edit']) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
