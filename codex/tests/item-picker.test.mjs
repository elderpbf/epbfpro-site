// js/item-picker.js — the ONE painter for "pick items from the library".
//
// Track-61 §22.3 found the same widget painted three times (presets, releases, item-members).
// These tests pin the shared painter AND assert the three screens actually use it, because a
// fourth hand-rolled copy is exactly how the duplication came back last time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickerRowHtml, pickerGroupsHtml, pickerToolbarHtml } from '../js/item-picker.js';

test('a row carries its id on both the label and the checkbox', () => {
  // Releases reads the value off the checkbox at save time; the member editor reads data-id
  // off the label. Both have to be there or one screen silently stops selecting.
  const h = pickerRowHtml({ id: 42, title: 'X', rowClass: 'cdx-comp-item', checkClass: 'cdx-comp-cb' });
  assert.match(h, /data-id="42"/);
  assert.match(h, /value="42"/);
});

test('the row escapes its title (a title is author input)', () => {
  const h = pickerRowHtml({ id: 1, title: '<img src=x onerror=alert(1)>' });
  assert.ok(!h.includes('<img'), 'no raw tag survives');
});

test('checked renders the tick and the selected class only when asked', () => {
  assert.match(pickerRowHtml({ id: 1, title: 'a', checked: true, selectedClass: 'is-selected' }), /is-selected/);
  assert.ok(!pickerRowHtml({ id: 1, title: 'a', checked: true }).includes('is-selected'),
    'a screen that does not mark the row does not get the class');
  assert.match(pickerRowHtml({ id: 1, title: 'a', checked: true }), /checked/);
});

test('muted greys the row only while it is NOT selected', () => {
  // Releases: an item bound to another lesson reads as a borrow candidate, but the moment you
  // tick it for THIS lesson it stops being one.
  assert.match(pickerRowHtml({ id: 1, title: 'a', muted: true }), /is-already-released/);
  assert.ok(!pickerRowHtml({ id: 1, title: 'a', muted: true, checked: true }).includes('is-already-released'));
});

test('the note is the one shared remark slot', () => {
  const h = pickerRowHtml({ id: 1, title: 'a', note: 'já nas aulas 1, 3' });
  assert.match(h, /cdx-comp-elsewhere/);
  assert.match(h, /já nas aulas 1, 3/);
  assert.ok(!pickerRowHtml({ id: 1, title: 'a' }).includes('cdx-comp-elsewhere'), 'no empty span without a note');
});

test('groups: the first is open by default, and the open one can be named', () => {
  const S = [{ key: 'a', label: 'A', count: 1, rowsHtml: 'x' }, { key: 'b', label: 'B', count: 2, rowsHtml: 'y' }];
  const first = pickerGroupsHtml(S, {});
  assert.match(first, /data-acc="a"[\s\S]*aria-expanded="true"/);
  assert.match(first, /data-acc="b"[\s\S]*is-collapsed/);
  const second = pickerGroupsHtml(S, { openKey: 'b' });
  assert.match(second, /data-acc="b"[\s\S]*aria-expanded="true"/);
});

test('allOpen expands everything, so a search never hides a hit in a collapsed group', () => {
  const h = pickerGroupsHtml([{ key: 'a', label: 'A', count: 1, rowsHtml: 'x' }, { key: 'b', label: 'B', count: 1, rowsHtml: 'y' }], { allOpen: true });
  assert.ok(!h.includes('is-collapsed'), 'nothing stays collapsed during a search');
});

test('forceOpen also disables the toggles (a read-only preview)', () => {
  const h = pickerGroupsHtml([{ key: 'a', label: 'A', count: 1, rowsHtml: 'x' }], { forceOpen: true });
  assert.match(h, /disabled/);
});

test('subCount renders as sub/total, absent renders the plain total', () => {
  assert.match(pickerGroupsHtml([{ key: 'a', label: 'A', count: 5, subCount: 2, rowsHtml: '' }], {}), /A \(2\/5\)/);
  assert.match(pickerGroupsHtml([{ key: 'a', label: 'A', count: 5, rowsHtml: '' }], {}), /A \(5\)/);
});

test('the toggle attribute is a parameter (presets wires a different one)', () => {
  assert.match(pickerGroupsHtml([{ key: 'a', label: 'A', count: 1, rowsHtml: '' }], { toggleAttr: 'data-group-toggle' }), /data-group-toggle="a"/);
});

test('the toolbar takes a right-hand slot', () => {
  assert.match(pickerToolbarHtml({ placeholder: 'buscar', rightHtml: '<b>x</b>' }), /<b>x<\/b>/);
  assert.match(pickerToolbarHtml({ placeholder: 'buscar' }), /placeholder="buscar"/);
});

// ── and the three screens actually use it ────────────────────────────────────
const SCREENS = ['../content/releases.js', '../content/presets.js', '../content/item-members.js'];

test('all three pickers paint through the shared module', () => {
  for (const rel of SCREENS) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.match(src, /from '\.\.\/js\/item-picker\.js'/, rel + ' imports the shared painter');
    assert.match(src, /pickerRowHtml\(|pickerGroupsHtml\(/, rel + ' uses it');
  }
});

test('no screen hand-rolls the group markup any more', () => {
  // The literal that used to exist in all three. If it comes back, so has the duplication.
  for (const rel of SCREENS) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(!src.includes("'<div class=\"cdx-picker-group"), rel + ' no longer builds the group div by hand');
  }
});
