// menu.test.mjs, the shared action-menu popover (js/menu.js). The open/close DOM
// glue is browser-only (document.body, getBoundingClientRect; verified manually on
// staging), so this covers the pure, headless seam: menuPosition(), the placement
// math that drops the menu under its trigger, right-aligns it, clamps it into the
// viewport, and flips it above the trigger when it would overflow the bottom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuPosition } from '../js/menu.js';

const VP = { w: 1000, h: 800 };

test('drops below the trigger, right-aligned to it', () => {
  const p = menuPosition({ right: 200, top: 100, bottom: 120 }, { w: 140, h: 80 }, VP);
  assert.deepEqual(p, { left: 60, top: 124 }); // left = 200-140, top = bottom+4
});

test('clamps to the right viewport edge (pad)', () => {
  const p = menuPosition({ right: 995, top: 100, bottom: 120 }, { w: 140, h: 80 }, VP);
  assert.equal(p.left, 1000 - 140 - 8); // 852, not 855
});

test('clamps to the left viewport edge (pad)', () => {
  const p = menuPosition({ right: 100, top: 100, bottom: 120 }, { w: 140, h: 80 }, VP);
  assert.equal(p.left, 8);
});

test('flips above the trigger when it would overflow the bottom', () => {
  const p = menuPosition({ right: 200, top: 740, bottom: 780 }, { w: 140, h: 80 }, VP);
  assert.equal(p.top, 740 - 80 - 4); // 656: placed above the trigger
});

test('falls back to a clamped top when neither below nor above fits', () => {
  const p = menuPosition({ right: 200, top: 10, bottom: 790 }, { w: 140, h: 80 }, VP);
  assert.equal(p.top, 800 - 80 - 8); // 712: clamped, no flip (no room above either)
});
