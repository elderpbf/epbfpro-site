// slides-ui.test.mjs — pure-logic tests for the reusable context-bar foundation:
//   ui/anchored.js   the pill-positioning math (also reused by the topbar later)
//   edit/menus.js    the editor menus expressed as control-primitive DATA
//   edit/textstyle.js the persist side of text styling (model writers + capture)
// DOM-free, node:test. Bar rendering + drag behaviour stay staging-verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorLeft } from '../content/slides/js/ui/anchored.js';
import { insertMenu, addSlideMenu, appearanceMenu, animMenu } from '../content/slides/js/edit/menus.js';
import { writeAssetStyle, writeSlotStyle, captureStyle } from '../content/slides/js/edit/textstyle.js';

/* ---------- anchored: position a content-width pill ---------- */
test('anchorLeft: under-mode centers the content under the trigger', () => {
  assert.equal(anchorLeft({ containerW: 1000, contentW: 200, anchorCenter: 500, mode: 'under' }), 400);
});
test('anchorLeft: center-mode centers the content in the container', () => {
  assert.equal(anchorLeft({ containerW: 1000, contentW: 200, mode: 'center' }), 400);
});
test('anchorLeft clamps within [pad, containerW - contentW - pad]', () => {
  assert.equal(anchorLeft({ containerW: 1000, contentW: 200, anchorCenter: 50, mode: 'under', pad: 8 }), 8);
  assert.equal(anchorLeft({ containerW: 1000, contentW: 200, anchorCenter: 990, mode: 'under', pad: 8 }), 792);
});
test('anchorLeft pins to pad when the content overflows the container', () => {
  assert.equal(anchorLeft({ containerW: 100, contentW: 200, mode: 'center', pad: 8 }), 8);
});

/* ---------- menus as data (no dropdowns; every choice is items) ---------- */
test('insertMenu returns five button primitives in order', () => {
  const m = insertMenu();
  assert.equal(m.length, 5);
  assert.ok(m.every((c) => c.type === 'button'));
  assert.deepEqual(m.map((c) => c.id), ['ins-text', 'ins-title', 'ins-image', 'ins-photo', 'ins-video']);
});
test('addSlideMenu makes one button per registered layout', () => {
  const m = addSlideMenu([{ id: 'cover', label: 'Capa' }, { id: 'cards', label: 'Cards' }]);
  assert.deepEqual(m.map((c) => c.id), ['add-cover', 'add-cards']);
  assert.ok(m.every((c) => c.type === 'button' && typeof c.run === 'function'));
});
test('appearanceMenu seeds current theme values and uses NO dropdown', () => {
  const m = appearanceMenu({ fontScale: 1, accent: '#14b8a6', ink: '#134e4a', motif: '#14b8a6' }, 'all');
  const types = m.map((c) => c.type);
  assert.ok(types.includes('range'), 'font is a range');
  assert.ok(!types.includes('choice') && !types.includes('select'), 'no dropdown in appearance');
  assert.equal(m.find((c) => c.id === 'accent').value, '#14b8a6');
});
test('animMenu is a single choice with three options seeded with the current value', () => {
  const m = animMenu('fade');
  assert.equal(m.length, 1);
  assert.equal(m[0].type, 'choice');
  assert.equal(m[0].value, 'fade');
  assert.equal(m[0].options.length, 3);
});

/* ---------- textstyle: the persist side ---------- */
test('writeSlotStyle creates slide.textStyle and stores the style under the path', () => {
  const slide = {};
  writeSlotStyle(slide, 'title', { fs: 32, fw: '900' });
  assert.deepEqual(slide.textStyle.title, { fs: 32, fw: '900' });
});
test('writeAssetStyle sets asset.style', () => {
  const a = { id: 'x' };
  writeAssetStyle(a, { color: '#abc' });
  assert.deepEqual(a.style, { color: '#abc' });
});
test('captureStyle reads fontSize / weight / color off an element, dropping empties', () => {
  assert.deepEqual(captureStyle({ style: { fontSize: '30px', fontWeight: '900', color: 'rgb(1,2,3)' } }),
    { fs: 30, fw: '900', color: 'rgb(1,2,3)' });
  assert.deepEqual(captureStyle({ style: { fontSize: '', fontWeight: '', color: '' } }),
    { fs: undefined, fw: undefined, color: undefined });
});
